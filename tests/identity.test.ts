import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';

const MONA = { national_id: '30401011200141', student_id: '20269001' };
const NO_ID = '30507201200215'; // بلا رقم جامعي في السجل
const TEMP_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

async function boot(t: test.TestContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-identity-'));
  const { app, db } = createApp({ dataDir: dir, demo: true });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  type Acc = { cookie: string; csrf: string };
  const call = (url: string, a?: Acc, method = 'GET', body?: unknown) =>
    fetch(base + url, {
      method,
      headers: {
        ...(a ? { Cookie: a.cookie, 'X-CSRF-Token': a.csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const acc = async (r: Response): Promise<Acc> => {
    assert.equal(r.status, 200, await r.clone().text());
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  };
  const login = (email: string, password: string) =>
    call('/login', undefined, 'POST', { email, password });
  const claim = (body: Record<string, unknown>) =>
    call('/claim', undefined, 'POST', { accepted_terms: true, ...body });
  const expire = (nid: string) =>
    db
      .prepare('UPDATE users SET temp_expires_at=? WHERE national_id=?')
      .run(Date.now() - 1000, nid);
  const row = (nid: string) =>
    db.prepare('SELECT * FROM users WHERE national_id=?').get(nid) as Record<string, unknown>;
  return { call, acc, login, claim, expire, row, db };
}

test('claim: only people in the college roster get an account', async (t) => {
  const { claim, row, login, db } = await boot(t);
  const unknown = await claim({ national_id: '29901011234567' });
  assert.equal(unknown.status, 404);
  const msg = (await unknown.json()).error as string;
  // رقم جامعي مخالف لما في السجل: نفس الرسالة تمامًا (لا نكشف أي شيء)
  const wrongId = await claim({ national_id: MONA.national_id, student_id: '99999999' });
  assert.equal(wrongId.status, 404);
  assert.equal((await wrongId.json()).error, msg);
  assert.equal(row(MONA.national_id), undefined);
  // الشروط إلزامية
  assert.equal((await claim({ national_id: MONA.national_id, accepted_terms: false })).status, 400);
  assert.equal((await claim({ national_id: '123' })).status, 400);
  // الرقم القومي وحده يكفي (الجامعي اختياري)
  const ok = await claim({ national_id: MONA.national_id });
  assert.equal(ok.status, 201);
  const body = await ok.json();
  assert.match(body.temporaryPassword, TEMP_RE);
  assert.equal(body.hours, 72);
  assert.equal(body.firstName, 'منى');
  assert.equal(ok.headers.get('set-cookie'), null, 'no session is opened by claiming');
  const u = row(MONA.national_id);
  assert.equal(u.role, 'student');
  assert.equal(u.must_change_password, 1);
  assert.equal(u.student_id, MONA.student_id);
  assert.ok(u.terms_version && u.terms_accepted_at);
  // كلمة المرور لا تُحفظ نصًّا
  assert.ok(!String(u.password_hash).includes(body.temporaryPassword));
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role!='student'").get()!.n, 2);
  // الأرقام الهندية والجامعي الصحيح مقبولان لمن في السجل
  const hindi = await claim({ national_id: '٣٠٣١١١٢١٢٠٠١٧٢', student_id: '٢٠٢٦٩٠٠٢' });
  assert.equal(hindi.status, 201);
  // الدخول الآن يعمل بالباسورد المؤقت فقط
  assert.equal((await login(MONA.national_id, 'wrong-password')).status, 401);
  assert.equal((await login(MONA.national_id, body.temporaryPassword)).status, 200);
});

test('temporary password: forced change before anything else, then it is replaced', async (t) => {
  const { claim, login, call, acc, row } = await boot(t);
  const temp = (await (await claim(MONA)).json()).temporaryPassword as string;
  // تُقبل بأي حالة أحرف وبدون الشرطات
  const loose = await login(MONA.national_id, temp.toLowerCase().replaceAll('-', ''));
  assert.equal(loose.status, 200);
  assert.equal((await loose.clone().json()).mustChange, true);
  const me = await acc(loose);
  const session = await (await call('/session', me)).json();
  assert.equal(session.user.must_change, true);
  assert.equal(session.user.email, '', 'placeholder email is never shown');
  assert.ok(session.user.temp_expires_at > Date.now());
  // لا شيء يعمل قبل تغيير كلمة المرور
  for (const [url, method, body] of [
    ['/requests/mine', 'GET', undefined],
    ['/profile', 'GET', undefined],
    ['/requests', 'POST', {}],
    ['/notifications', 'GET', undefined],
  ] as const)
    assert.equal((await call(url, me, method, body)).status, 403, url);
  // كلمات مرور مرفوضة
  const first = (password: string) => call('/profile/first-password', me, 'PUT', { password });
  assert.equal((await first('short')).status, 400);
  assert.equal((await first(temp)).status, 400, 'same as the temporary one');
  assert.equal((await first('12345678')).status, 400, 'common');
  assert.equal((await first(MONA.national_id)).status, 400, 'contains national id');
  assert.equal((await first('Strong-Pass-2026')).status, 200);
  const after = row(MONA.national_id);
  assert.equal(after.must_change_password, 0);
  assert.equal(after.temp_expires_at, null);
  assert.equal((await call('/requests/mine', me)).status, 200);
  assert.equal(
    (await call('/profile/first-password', me, 'PUT', { password: 'Another-Pass-2027' })).status,
    409,
  );
  // القديمة لم تعد تعمل، والجديدة تعمل بالرقم القومي
  assert.equal((await login(MONA.national_id, temp)).status, 401);
  const again = await login(MONA.national_id, 'Strong-Pass-2026');
  assert.equal(again.status, 200);
  assert.equal((await again.json()).mustChange, false);
});

test('claim is refused while a temporary password is alive or after activation', async (t) => {
  const { claim, login, acc, call, row } = await boot(t);
  const temp = (await (await claim(MONA)).json()).temporaryPassword as string;
  const again = await claim(MONA);
  assert.equal(again.status, 409, 'someone who only knows the IDs cannot reissue');
  assert.equal(row(MONA.national_id).must_change_password, 1);
  const me = await acc(await login(MONA.national_id, temp));
  await call('/profile/first-password', me, 'PUT', { password: 'Strong-Pass-2026' });
  const done = await claim(MONA);
  assert.equal(done.status, 409);
  assert.match((await done.json()).error, /مفعّل/);
  assert.equal((await login(MONA.national_id, 'Strong-Pass-2026')).status, 200);
});

test('expiry locks the account; two re-activations, third needs staff', async (t) => {
  const { claim, login, expire, row, call, acc } = await boot(t);
  const nid = MONA.national_id;
  let temp = (await (await claim(MONA)).json()).temporaryPassword as string;
  // انتهاء المدة مع جلسة مفتوحة: تسقط الجلسة فورًا
  const open = await acc(await login(nid, temp));
  expire(nid);
  assert.equal((await (await call('/session', open)).json()).user, null);
  assert.equal(row(nid).locked_reason, 'expired');
  assert.equal(row(nid).temp_expiries, 1);
  // لا دخول بها بعد الانتهاء
  const late = await login(nid, temp);
  assert.equal(late.status, 403);
  assert.match((await late.json()).error, /انتهت/);
  // التفعيل من جديد (المرة ١)
  const second = await claim(MONA);
  assert.equal(second.status, 201);
  temp = (await second.json()).temporaryPassword;
  assert.equal(row(nid).locked_reason, null);
  assert.equal((await login(nid, temp)).status, 200);
  expire(nid);
  assert.equal((await login(nid, temp)).status, 403);
  assert.equal(row(nid).temp_expiries, 2);
  // التفعيل من جديد (المرة ٢)
  const third = await claim(MONA);
  assert.equal(third.status, 201);
  temp = (await third.json()).temporaryPassword;
  expire(nid);
  assert.equal((await login(nid, temp)).status, 403);
  // الانتهاء الثالث: يلزم الموظف
  assert.equal(row(nid).locked_reason, 'staff');
  const blocked = await claim(MONA);
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /مكتب النشاط/);
  assert.equal((await login(nid, temp)).status, 403);
});

test('staff: search the roster, reissue a temporary password, audit trail', async (t) => {
  const { claim, login, acc, call, row, db } = await boot(t);
  const nid = MONA.national_id;
  const moderator = await acc(await login('moderator@demo.local', 'Demo2026!'));
  const student = await acc(await login('student@demo.local', 'Demo2026!'));
  assert.equal((await call('/staff/roster', student)).status, 403);
  assert.equal((await call('/staff/roster', undefined)).status, 401);
  // بحث بالاسم والرقم القومي كاملًا والجامعي
  const byName = await (
    await call('/staff/roster?q=' + encodeURIComponent('منى'), moderator)
  ).json();
  assert.equal(byName.students.length, 1);
  assert.equal(byName.students[0].state, 'none');
  assert.equal(byName.students[0].nationalLast4, '0141');
  const byNid = await (await call('/staff/roster?q=' + nid, moderator)).json();
  assert.equal(byNid.students[0].name, 'منى إبراهيم السيد');
  const byUni = await (await call('/staff/roster?q=20269001', moderator)).json();
  assert.equal(byUni.students.length, 1);
  // لا بحث بجزء من الرقم القومي، ولا يظهر الرقم كاملًا أبدًا
  assert.equal((await (await call('/staff/roster?q=0141', moderator)).json()).students.length, 0);
  assert.ok(!JSON.stringify(byNid).includes(nid));
  assert.equal(byNid.tempHours, 72);
  const id = byName.students[0].id as number;
  // موظف يفعّل طالبًا حضوريًا
  const issued = await call(`/staff/roster/${id}/temp-password`, moderator, 'POST', {});
  assert.equal(issued.status, 201);
  const body = await issued.json();
  assert.match(body.temporaryPassword, TEMP_RE);
  assert.equal((await login(nid, body.temporaryPassword)).status, 200);
  assert.equal(
    (await (await call('/staff/roster?q=' + nid, moderator)).json()).students[0].state,
    'temp',
  );
  assert.ok(db.prepare("SELECT 1 FROM events WHERE action='temp_password_issued'").get());
  // يتجاوز القفل بعد ٣ انتهاءات
  db.prepare('UPDATE users SET locked_reason=?,temp_expiries=3 WHERE national_id=?').run(
    'staff',
    nid,
  );
  assert.equal(
    (await (await call('/staff/roster?q=' + nid, moderator)).json()).students[0].state,
    'staff',
  );
  const reissue = await call(`/staff/roster/${id}/temp-password`, moderator, 'POST', {});
  assert.equal(reissue.status, 201);
  const fresh = (await reissue.json()).temporaryPassword as string;
  assert.equal(row(nid).locked_reason, null);
  assert.equal(row(nid).temp_expiries, 0);
  assert.equal((await login(nid, fresh)).status, 200);
  // طالب مفعّل نسي كلمته: الموظف يصدر مؤقتة جديدة وتُبطل القديمة
  const me = await acc(await login(nid, fresh));
  await call('/profile/first-password', me, 'PUT', { password: 'Strong-Pass-2026' });
  const forgot = await call(`/staff/roster/${id}/temp-password`, moderator, 'POST', {});
  assert.equal(forgot.status, 201);
  assert.equal((await login(nid, 'Strong-Pass-2026')).status, 401);
  assert.equal((await claim(MONA)).status, 409);
  assert.equal(
    (await call('/staff/roster/99999/temp-password', moderator, 'POST', {})).status,
    404,
  );
});

test('roster import is admin-only, validates rows and never deletes', async (t) => {
  const { login, acc, call, db } = await boot(t);
  const moderator = await acc(await login('moderator@demo.local', 'Demo2026!'));
  const admin = await acc(await login('admin@demo.local', 'Demo2026!'));
  const rows = [
    { name: 'آية محمود سالم', national_id: '30601011200555', student_id: '20268001', year: '1' },
    { name: 'بلا رقم', national_id: '123' },
    { name: 'منى إبراهيم السيد', national_id: MONA.national_id, year: 'الفرقة الثالثة' },
  ];
  assert.equal((await call('/admin/roster/import', moderator, 'POST', { rows })).status, 403);
  const before = (db.prepare('SELECT count(*) AS n FROM roster').get() as { n: number }).n;
  const res = await call('/admin/roster/import', admin, 'POST', { rows });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.added, 1);
  assert.equal(out.updated, 1);
  assert.equal(out.rejected.length, 1);
  assert.equal(out.rejected[0].index, 1);
  assert.equal(
    (db.prepare('SELECT count(*) AS n FROM roster').get() as { n: number }).n,
    before + 1,
  );
  const updated = db
    .prepare('SELECT year,student_id FROM roster WHERE national_id=?')
    .get(MONA.national_id) as {
    year: string;
    student_id: string;
  };
  assert.equal(updated.year, 'الفرقة الثالثة');
  assert.equal(updated.student_id, MONA.student_id, 'missing columns never erase existing data');
  assert.equal((await call('/admin/roster/import', admin, 'POST', { rows: [] })).status, 400);
  assert.equal(
    (await call('/admin/roster/import', admin, 'POST', { rows: Array(301).fill(rows[0]) })).status,
    400,
  );
});

test('claim attempts are rate limited per national ID and the optional ID is not required', async (t) => {
  const { claim } = await boot(t);
  assert.equal(
    (await claim({ national_id: NO_ID })).status,
    201,
    'roster entry without university ID',
  );
  for (let i = 0; i < 8; i++)
    assert.equal((await claim({ national_id: '29901011234567' })).status, 404);
  assert.equal((await claim({ national_id: '29901011234567' })).status, 429);
});

test('email features stay quiet for accounts without an email', async (t) => {
  const { claim, login, acc, call } = await boot(t);
  const temp = (await (await claim(MONA)).json()).temporaryPassword as string;
  const me = await acc(await login(MONA.national_id, temp));
  await call('/profile/first-password', me, 'PUT', { password: 'Strong-Pass-2026' });
  const profile = await (await call('/profile', me)).json();
  assert.equal(profile.profile.email, '');
  assert.ok(!JSON.stringify(profile).includes('no-email.invalid'));
  // الاستعادة بالبريد لا تكشف شيئًا عن الأرقام القومية
  const forgot = await call('/forgot-password', undefined, 'POST', { email: MONA.national_id });
  assert.ok([200, 404].includes(forgot.status));
});
