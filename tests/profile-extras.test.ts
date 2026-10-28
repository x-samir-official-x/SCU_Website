import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { validatePhone, validateRegistration } from '../src/registration';

function jpeg() {
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude-SECRET')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), exif]);
  app1.writeUInt16BE(exif.length + 2, 2);
  const sos = Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sos]);
}

test('phone validation: Egyptian mobile only, normalized, optional', () => {
  const ok = (v: string) => {
    const r = validatePhone(v);
    return r.ok ? r.value : 'ERR';
  };
  assert.equal(ok('01012345678'), '01012345678');
  assert.equal(ok('+20 101 234 5678'), '01012345678');
  assert.equal(ok('00201112345678'), '01112345678');
  assert.equal(ok('٠١٢٢٣٤٥٦٧٨٩'), '01223456789');
  assert.equal(ok('1512345678'), '01512345678');
  assert.equal(ok(''), null);
  assert.equal(ok(undefined as never), null);
  for (const bad of ['0101234567', '01312345678', '02123456789', 'abc', '010123456789'])
    assert.equal(ok(bad), 'ERR', bad);
  const base = {
    name: 'منى إبراهيم',
    email: 'm@example.test',
    password: 'StrongPass1',
    year: 'الفرقة الثانية',
    student_id: '20261234',
    accepted_terms: true,
  };
  assert.equal(validateRegistration({ ...base, phone: '123' }).ok, false);
  const withPhone = validateRegistration({ ...base, phone: '01012345678' });
  assert.ok(withPhone.ok && withPhone.value.phone === '01012345678');
});

test('notifications, avatar, phone and email', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-extras-'));
  const { app, db } = createApp({ dataDir: dir, demo: true, registrationOpen: true });
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
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  const acc = async (r: Response): Promise<Acc> => {
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  };
  const login = async (email: string) =>
    acc(await call('/login', undefined, 'POST', { email, password: 'Demo2026!' }));
  const student = await login('student@demo.local');
  const moderator = await login('moderator@demo.local');
  const mona = await acc(
    await call('/register', undefined, 'POST', {
      name: 'منى إبراهيم',
      email: 'mona@example.test',
      password: 'StrongPass1',
      year: 'الفرقة الثانية',
      student_id: '20261111',
      phone: '+201012345678',
      accepted_terms: true,
    }),
  );
  const file = (bytes: Buffer, type: string) => {
    const f = new FormData();
    f.set('file', new File([new Uint8Array(bytes)], 'x', { type }));
    return f;
  };

  await t.test(
    'phone is saved at registration, editable, validated, and seen by staff',
    async () => {
      assert.equal((await (await call('/profile', mona)).json()).profile.phone, '01012345678');
      assert.equal((await call('/profile/phone', mona, 'PUT', { phone: '123' })).status, 400);
      assert.equal((await call('/profile/phone', mona, 'PUT', { phone: '' })).status, 200);
      assert.equal((await (await call('/profile', mona)).json()).profile.phone, null);
      await call('/profile/phone', mona, 'PUT', { phone: '٠١١١٢٣٤٥٦٧٨' });
      assert.equal((await (await call('/profile', mona)).json()).profile.phone, '01112345678');
    },
  );

  await t.test('email change needs the password and a free address', async () => {
    assert.equal(
      (await call('/profile/email', mona, 'PUT', { email: 'new@example.test', password: 'bad' }))
        .status,
      403,
    );
    assert.equal(
      (
        await call('/profile/email', mona, 'PUT', {
          email: 'student@demo.local',
          password: 'StrongPass1',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call('/profile/email', mona, 'PUT', {
          email: 'not-an-email',
          password: 'StrongPass1',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('/profile/email', mona, 'PUT', {
          email: 'New@Example.test',
          password: 'StrongPass1',
        })
      ).status,
      200,
    );
    assert.equal((await (await call('/profile', mona)).json()).profile.email, 'new@example.test');
    assert.equal(
      (
        await call('/login', undefined, 'POST', {
          email: 'new@example.test',
          password: 'StrongPass1',
        })
      ).status,
      200,
    );
  });

  await t.test('avatar: optional, stripped, owner/staff only, removable', async () => {
    assert.equal((await (await call('/session', mona)).json()).user.avatar_v, 0);
    assert.equal(
      (await call('/avatar/' + (await (await call('/session', mona)).json()).user.id, mona)).status,
      404,
    );
    assert.equal(
      (
        await call(
          '/profile/avatar',
          mona,
          'POST',
          file(Buffer.from('%PDF-1.4'), 'application/pdf'),
        )
      ).status,
      400,
    );
    assert.equal(
      (await call('/profile/avatar', mona, 'POST', file(jpeg(), 'image/jpeg'))).status,
      201,
    );
    const me = (await (await call('/session', mona)).json()).user;
    assert.ok(me.avatar_v > 0);
    const img = await call('/avatar/' + me.id, mona);
    assert.equal(img.status, 200);
    assert.ok(!Buffer.from(await img.arrayBuffer()).includes('SECRET'));
    assert.equal((await call('/avatar/' + me.id, moderator)).status, 200);
    assert.equal((await call('/avatar/' + me.id, student)).status, 403);
    assert.equal((await call('/avatar/' + me.id)).status, 401);
    assert.equal((await call('/profile/avatar', mona, 'DELETE', {})).status, 200);
    assert.equal((await call('/avatar/' + me.id, mona)).status, 404);
    assert.equal((await (await call('/session', mona)).json()).user.avatar_v, 0);
  });

  await t.test('notifications: staff on submit, student on decision, read state', async () => {
    const created = await (await call('/requests', student, 'POST', {})).json();
    const id = created.request.id as number;
    await call(`/requests/${id}`, student, 'PUT', {
      title: 'حملة تنظيف الشاطئ',
      category: 'نشاط بيئي',
      organization: 'فريق البيئة',
      activity_date: '2026-10-01',
      description: 'شاركنا في تنظيف الشاطئ وتوزيع أكياس القمامة على الزوار.',
    });
    await call(
      `/requests/${id}/attachments`,
      student,
      'POST',
      file(Buffer.from('%PDF-1.4\n%t\n'), 'application/pdf'),
    );
    assert.equal((await call(`/requests/${id}/submit`, student, 'POST', {})).status, 200);

    const staffList = await (await call('/notifications', moderator)).json();
    assert.equal(staffList.unread, 1);
    assert.equal(staffList.notifications[0].title, 'طلب جديد للمراجعة');
    assert.equal(staffList.notifications[0].link, `/requests/${id}`);
    // الطالب لا يرى إشعارات الموظف
    assert.equal((await (await call('/notifications', student)).json()).unread, 0);

    await call('/notifications/read', moderator, 'POST', { id: staffList.notifications[0].id });
    assert.equal((await (await call('/notifications', moderator)).json()).unread, 0);

    const review = await call(`/staff/requests/${id}/review`, moderator, 'POST', {
      action: 'revision',
      note: 'أرفق شهادة أوضح من فضلك.',
    });
    assert.equal(review.status, 200);
    const mine = await (await call('/notifications', student)).json();
    assert.equal(mine.unread, 1);
    assert.equal(mine.notifications[0].title, 'مطلوب استكمال طلبك');
    assert.equal(mine.notifications[0].body, 'أرفق شهادة أوضح من فضلك.');
    // إشعار شخص آخر لا يُعلَّم مقروءًا بمعرّف غيره
    await call('/notifications/read', mona, 'POST', { id: mine.notifications[0].id });
    assert.equal((await (await call('/notifications', student)).json()).unread, 1);
    await call('/notifications/read', student, 'POST', {});
    assert.equal((await (await call('/notifications', student)).json()).unread, 0);
    // الموظف يرى رقم موبايل الطالب في الطلب إن وجد
    const detail = await (await call(`/requests/${id}`, moderator)).json();
    assert.ok('student_phone' in detail.request);
  });
});
