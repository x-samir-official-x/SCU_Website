import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';

type Sent = { to: string; subject: string; text: string; html: string };

async function boot(t: test.TestContext, withMailer: boolean) {
  const sent: Sent[] = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-reset-'));
  process.env.APP_ORIGIN = 'https://athar.example.test';
  const { app, db, flushMail } = createApp({
    dataDir: dir,
    demo: true,
    registrationOpen: true,
    mailer: withMailer
      ? {
          from: 'أَثَر <no-reply@example.test>',
          transport: {
            sendMail: async (m: Sent & { from: string; attachments?: unknown[] }) => {
              assert.ok(!m.html.includes('cid:athar-logos@scu') || m.attachments?.length === 1);
              sent.push(m);
            },
          },
        }
      : undefined,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  t.after(async () => {
    delete process.env.APP_ORIGIN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const call = (url: string, cookie?: string, method = 'GET', body?: unknown, csrf?: string) =>
    fetch(base + url, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { sent, db, flushMail, call };
}

test('forgot password is unavailable when email is not configured', async (t) => {
  const { call } = await boot(t, false);
  assert.equal(
    (await call('/forgot-password', undefined, 'POST', { email: 'a@b.test' })).status,
    404,
  );
});

test('forgot / reset password flow', async (t) => {
  const { sent, db, flushMail, call } = await boot(t, true);
  const reg = await call('/register', undefined, 'POST', {
    name: 'منى إبراهيم',
    email: 'mona@example.test',
    password: 'OldPassword1',
    year: 'الفرقة الثانية',
    student_id: '20261111',
    accepted_terms: true,
  });
  assert.equal(reg.status, 201);
  const cookie = reg.headers.get('set-cookie')!.split(';')[0];
  const csrf = (await (await call('/session', cookie)).json()).csrfToken as string;
  await flushMail();
  sent.length = 0; // نتجاهل رسالة التأكيد
  const tokenOf = (m: Sent) => m.text.match(/reset-password\?token=([a-f0-9]{64})/)![1];

  // نفس الرد لبريد موجود ولغير موجود، ولا يصل بريد لغير الموجود
  const unknown = await call('/forgot-password', undefined, 'POST', {
    email: 'nobody@example.test',
  });
  const known = await call('/forgot-password', undefined, 'POST', { email: 'MONA@example.test' });
  assert.equal(unknown.status, 200);
  assert.equal(known.status, 200);
  assert.deepEqual(await unknown.json(), await known.json());
  await flushMail();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'mona@example.test');
  assert.ok(sent[0].html.includes('cid:athar-logos@scu'));
  assert.ok(
    !db.prepare('SELECT 1 FROM password_resets WHERE token_hash=?').get(tokenOf(sent[0])),
    'token is stored hashed',
  );

  // طلب ثانٍ خلال دقيقتين لا يرسل رابطًا جديدًا
  await call('/forgot-password', undefined, 'POST', { email: 'mona@example.test' });
  await flushMail();
  assert.equal(sent.length, 1);

  const token = tokenOf(sent[0]);
  // رفض: كلمة قصيرة، رمز خاطئ، رمز منتهٍ
  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token, password: 'short' })).status,
    400,
  );
  assert.equal(
    (
      await call('/reset-password', undefined, 'POST', {
        token: 'a'.repeat(64),
        password: 'NewPassword1',
      })
    ).status,
    400,
  );
  db.prepare('UPDATE password_resets SET expires_at=1').run();
  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token, password: 'NewPassword1' })).status,
    400,
  );
  // طلب جديد بعد انقضاء فترة التهدئة
  db.prepare('UPDATE password_resets SET created_at=1').run();
  await call('/forgot-password', undefined, 'POST', { email: 'mona@example.test' });
  await flushMail();
  assert.equal(sent.length, 2);
  const token2 = tokenOf(sent[1]);
  assert.notEqual(token2, token);
  // الرابط القديم أُلغي
  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token, password: 'NewPassword1' })).status,
    400,
  );

  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token: token2, password: 'NewPassword1' }))
      .status,
    200,
  );
  // مرة واحدة فقط
  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token: token2, password: 'Another12345' }))
      .status,
    400,
  );
  // الجلسة القديمة أُغلقت، والدخول يعمل بالجديدة فقط
  assert.equal((await (await call('/session', cookie)).json()).user, null);
  assert.equal(
    (
      await call('/login', undefined, 'POST', {
        email: 'mona@example.test',
        password: 'OldPassword1',
      })
    ).status,
    401,
  );
  const login = await call('/login', undefined, 'POST', {
    email: 'mona@example.test',
    password: 'NewPassword1',
  });
  assert.equal(login.status, 200);
  // تأكّد البريد ضمنيًا، ووصل تنبيه أمني
  await flushMail();
  const alert = sent.find((m) => m.subject.includes('تم تغيير كلمة مرور'));
  assert.ok(alert && alert.to === 'mona@example.test');
  assert.ok(!alert.text.includes('NewPassword1'));
  assert.ok(
    db
      .prepare("SELECT email_verified_at FROM users WHERE email='mona@example.test'")
      .get() as object,
  );

  // تغيير كلمة المرور من الملف الشخصي يرسل تنبيهًا أيضًا (البريد مؤكَّد الآن)
  const cookie2 = login.headers.get('set-cookie')!.split(';')[0];
  const csrf2 = (await (await call('/session', cookie2)).json()).csrfToken as string;
  const before = sent.length;
  assert.equal(
    (
      await call(
        '/profile/password',
        cookie2,
        'PUT',
        { current: 'NewPassword1', password: 'ThirdPass123' },
        csrf2,
      )
    ).status,
    200,
  );
  await flushMail();
  assert.equal(sent.length, before + 1);
  void csrf;
});

test('reset is refused for deactivated accounts', async (t) => {
  const { sent, db, flushMail, call } = await boot(t, true);
  await call('/register', undefined, 'POST', {
    name: 'سارة علي',
    email: 'sara@example.test',
    password: 'OldPassword1',
    year: 'الفرقة الثانية',
    student_id: '20262222',
    accepted_terms: true,
  });
  await flushMail();
  sent.length = 0;
  await call('/forgot-password', undefined, 'POST', { email: 'sara@example.test' });
  await flushMail();
  const token = sent[0].text.match(/token=([a-f0-9]{64})/)![1];
  db.prepare("UPDATE users SET active=0 WHERE email='sara@example.test'").run();
  assert.equal(
    (await call('/reset-password', undefined, 'POST', { token, password: 'NewPassword1' })).status,
    400,
  );
  sent.length = 0;
  await call('/forgot-password', undefined, 'POST', { email: 'sara@example.test' });
  await flushMail();
  assert.equal(sent.length, 0);
});
