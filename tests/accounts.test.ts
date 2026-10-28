import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { validateRegistration } from '../src/registration';
import { normalizeDigits } from '../src/terms';

const base = {
  name: 'منى إبراهيم',
  email: 'mona@example.test',
  password: 'StrongPass1',
  year: 'الفرقة الثانية',
  accepted_terms: true,
};

test('registration rules: university ID or national ID (one is enough) and terms', () => {
  assert.equal(validateRegistration({ ...base, student_id: '20261234' }).ok, true);
  assert.equal(validateRegistration({ ...base, national_id: '29901011234567' }).ok, true);
  assert.equal(
    validateRegistration({ ...base, student_id: '20261234', national_id: '29901011234567' }).ok,
    true,
  );
  // لا هذا ولا ذاك
  const none = validateRegistration({ ...base });
  assert.equal(none.ok, false);
  assert.equal(validateRegistration({ ...base, student_id: '', national_id: '' }).ok, false);
  // أرقام هندية تُقبل وتُطبَّع
  const arabic = validateRegistration({ ...base, national_id: '٢٩٩٠١٠١١٢٣٤٥٦٧' });
  assert.ok(arabic.ok && arabic.value.national_id === '29901011234567');
  // أطوال غير صحيحة
  assert.equal(validateRegistration({ ...base, national_id: '123' }).ok, false);
  assert.equal(validateRegistration({ ...base, student_id: '12' }).ok, false);
  // الشروط إلزامية
  assert.equal(
    validateRegistration({ ...base, student_id: '20261234', accepted_terms: false }).ok,
    false,
  );
  assert.equal(
    validateRegistration({ ...base, student_id: '20261234', accepted_terms: undefined }).ok,
    false,
  );
  assert.equal(normalizeDigits(' ٢٠٢٦-١٢٣٤ '), '20261234');
});

for (const open of [false, true]) {
  test(`server registration endpoint (registrationOpen=${open})`, async (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-accounts-'));
    const { app, db } = createApp({ dataDir: dir, demo: false, registrationOpen: open });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const post = (body: unknown) =>
      fetch(`${url}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (!open) {
      assert.equal((await post({ ...base, student_id: '20261234' })).status, 403);
      assert.equal((await (await fetch(`${url}/session`)).json()).registration, false);
      return;
    }
    assert.equal((await (await fetch(`${url}/session`)).json()).registration, true);
    assert.equal((await post({ ...base })).status, 400);
    assert.equal(
      (await post({ ...base, student_id: '20261234', accepted_terms: false })).status,
      400,
    );
    const ok = await post({ ...base, national_id: '29901011234567' });
    assert.equal(ok.status, 201);
    const cookie = ok.headers.get('set-cookie')!.split(';')[0];
    const session = await (await fetch(`${url}/session`, { headers: { Cookie: cookie } })).json();
    assert.equal(session.user.role, 'student');
    // الرقم القومي لا يخرج كاملًا، يظهر آخر ٤ أرقام فقط
    assert.equal(session.user.student_id, 'ق.م ••••4567');
    assert.ok(!JSON.stringify(session).includes('29901011234567'));
    const row = db
      .prepare(
        'SELECT terms_version,terms_accepted_at,student_id,national_id FROM users WHERE email=?',
      )
      .get(base.email) as Record<string, string | null>;
    assert.ok(row.terms_version && row.terms_accepted_at);
    assert.equal(row.student_id, null);
    // لا يمكن إنشاء حساب موظف أو مسؤول من التسجيل العام حتى بإرسال role مباشرة
    for (const role of ['admin', 'moderator']) {
      const sneaky = await post({
        ...base,
        email: `${role}-try@example.test`,
        student_id: `2026${role.length}999`,
        role,
      });
      assert.equal(sneaky.status, 201);
      const created = db
        .prepare('SELECT role FROM users WHERE email=?')
        .get(`${role}-try@example.test`) as { role: string };
      assert.equal(created.role, 'student');
    }
    // تكرار نفس البيانات مرفوض
    assert.equal(
      (await post({ ...base, email: 'other@example.test', national_id: '29901011234567' })).status,
      409,
    );
    assert.equal((await post({ ...base })).status, 400);
    assert.equal((await post({ ...base, student_id: '20261234' })).status, 409);
    // الدخول يعمل بالحساب الجديد
    const login = await fetch(`${url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: base.email, password: base.password }),
    });
    assert.equal(login.status, 200);
  });
}

test('registration errors name the offending field, in page order', () => {
  const field = (extra: Record<string, unknown>) => {
    const r = validateRegistration({ ...base, student_id: '20261234', ...extra });
    return r.ok ? null : r.field;
  };
  assert.equal(field({ name: 'ا' }), 'name');
  assert.equal(field({ student_id: '', national_id: '' }), 'student_id');
  assert.equal(field({ national_id: '123' }), 'national_id');
  assert.equal(field({ email: 'bad' }), 'email');
  assert.equal(field({ phone: '123' }), 'phone');
  assert.equal(field({ password: '12345678' }), 'password');
  assert.equal(field({ year: 'x' }), 'year');
  assert.equal(field({ accepted_terms: false }), 'accepted_terms');
});
