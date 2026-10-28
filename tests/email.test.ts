import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import path2 from 'node:path';
import { mailerFromEnv, renderEmail, inlineAttachments } from '../server/mailer';

test('mailer is off unless SMTP_HOST and MAIL_FROM are set; templates escape HTML', () => {
  assert.equal(mailerFromEnv({}), null);
  assert.equal(mailerFromEnv({ SMTP_HOST: 'smtp.example.test' }), null);
  assert.ok(mailerFromEnv({ SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'a@example.test' }));
  const m = renderEmail({
    platform: 'أَثَر',
    heading: '<b>x</b>',
    lines: ['a & b'],
    button: { label: 'فتح', url: 'https://example.test/?a=1&b="2"' },
  });
  assert.ok(!m.html.includes('<b>x</b>'));
  assert.ok(m.html.includes('&#60;b&#62;x'));
  assert.ok(m.text.includes('https://example.test/?a=1&b="2"'));
});

test('email verification and notification emails', async (t) => {
  type Sent = { to: string; subject: string; text: string; html: string };
  const sent: Sent[] = [];
  let failNext = false;
  const mailer = {
    from: 'أَثَر <no-reply@example.test>',
    transport: {
      sendMail: async (m: Sent & { from: string }) => {
        if (failNext) {
          failNext = false;
          throw new Error('smtp down');
        }
        sent.push(m);
      },
    },
  };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-mail-'));
  process.env.APP_ORIGIN = 'https://athar.example.test';
  const { app, db, flushMail } = createApp({
    dataDir: dir,
    demo: true,
    registrationOpen: true,
    mailer,
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
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  };
  const tokenFrom = (m: Sent) => m.text.match(/token=([a-f0-9]{64})/)![1];
  const session = async (a: Acc) => await (await call('/session', a)).json();

  const mona = await acc(
    await call('/register', undefined, 'POST', {
      name: 'منى إبراهيم',
      email: 'mona@example.test',
      password: 'StrongPass1',
      year: 'الفرقة الثانية',
      student_id: '20261111',
      accepted_terms: true,
    }),
  );
  const moderator = await acc(
    await call('/login', undefined, 'POST', {
      email: 'moderator@demo.local',
      password: 'Demo2026!',
    }),
  );
  const admin = await acc(
    await call('/login', undefined, 'POST', { email: 'admin@demo.local', password: 'Demo2026!' }),
  );

  await t.test('registration sends one verification email with a working link', async () => {
    await flushMail();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'mona@example.test');
    assert.match(sent[0].text, /^.*\n/);
    assert.ok(sent[0].text.includes('https://athar.example.test/verify-email?token='));
    const s = await session(mona);
    assert.equal(s.emailEnabled, true);
    assert.equal(s.user.email_verified, 0);
  });

  await t.test('invalid and expired tokens are rejected', async () => {
    assert.equal((await call('/verify-email', undefined, 'POST', { token: 'x' })).status, 400);
    assert.equal(
      (await call('/verify-email', undefined, 'POST', { token: 'a'.repeat(64) })).status,
      400,
    );
    const token = tokenFrom(sent[0]);
    db.prepare('UPDATE email_tokens SET expires_at=1').run();
    assert.equal((await call('/verify-email', undefined, 'POST', { token })).status, 400);
    db.prepare('UPDATE email_tokens SET expires_at=?').run(Date.now() + 60_000);
  });

  await t.test('resend is throttled', async () => {
    assert.equal((await call('/profile/resend-verification', mona, 'POST', {})).status, 429);
    db.prepare('UPDATE email_tokens SET created_at=1').run();
    assert.equal((await call('/profile/resend-verification', mona, 'POST', {})).status, 200);
    await flushMail();
    assert.equal(sent.length, 2);
    // الرابط القديم لم يعد صالحًا
    assert.equal(
      (await call('/verify-email', undefined, 'POST', { token: tokenFrom(sent[0]) })).status,
      400,
    );
  });

  // طلب يقدَّم ثم يُراجع، لتوليد إشعارات
  const created = await (await call('/requests', mona, 'POST', {})).json();
  const id = created.request.id as number;
  await call(`/requests/${id}`, mona, 'PUT', {
    title: 'حملة تنظيف الشاطئ',
    category: 'نشاط بيئي',
    organization: 'فريق البيئة',
    activity_date: '2026-10-01',
    description: 'شاركنا في تنظيف الشاطئ وتوزيع أكياس القمامة على الزوار.',
  });
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(Buffer.from('%PDF-1.4\n%t\n'))], 'a.pdf', { type: 'application/pdf' }),
  );
  await fetch(base + `/requests/${id}/attachments`, {
    method: 'POST',
    headers: { Cookie: mona.cookie, 'X-CSRF-Token': mona.csrf },
    body: form,
  });
  await call(`/requests/${id}/submit`, mona, 'POST', {});
  const review = (action: string, who: Acc, note = 'ملاحظة سرية للمراجعة') =>
    call(`/staff/requests/${id}/review`, who, 'POST', { action, note });

  await t.test('no notification email before the address is verified', async () => {
    await review('revision', moderator);
    await flushMail();
    assert.equal(sent.length, 2); // لا شيء جديد (الموظف غير مؤكد أيضًا)
  });

  await t.test('verifying works, then notification emails are generic and throttled', async () => {
    assert.equal(
      (await call('/verify-email', undefined, 'POST', { token: tokenFrom(sent[1]) })).status,
      200,
    );
    assert.equal((await session(mona)).user.email_verified, 1);
    // الرابط يستعمل مرة واحدة
    assert.equal(
      (await call('/verify-email', undefined, 'POST', { token: tokenFrom(sent[1]) })).status,
      400,
    );
    assert.equal((await call('/profile/resend-verification', mona, 'POST', {})).status, 409);

    await call(`/requests/${id}/submit`, mona, 'POST', {});
    await review('reject', moderator, 'سبب سري لا يجب أن يظهر في البريد');
    await flushMail();
    const mails = sent.filter(
      (m) => m.subject.startsWith('إشعار جديد') && m.to === 'mona@example.test',
    );
    assert.equal(mails.length, 1);
    assert.ok(!mails[0].text.includes('سري') && !mails[0].html.includes('سري'));
    assert.ok(mails[0].text.includes('https://athar.example.test/dashboard'));
    // إشعار ثانٍ خلال ٥ دقائق لا يرسل بريدًا ثانيًا
    await review('reopen', admin, 'إعادة فتح للتجربة');
    await flushMail();
    assert.equal(
      sent.filter((m) => m.subject.startsWith('إشعار جديد') && m.to === 'mona@example.test').length,
      1,
    );
    // لكن الإشعار داخل الموقع موجود
    const inSite = await (await call('/notifications', mona)).json();
    assert.ok(inSite.notifications.length >= 3);
  });

  await t.test('opt-out stops notification emails', async () => {
    assert.equal(
      (await call('/profile/email-notifications', mona, 'PUT', { enabled: false })).status,
      200,
    );
    db.prepare("UPDATE email_outbox SET created_at=1 WHERE kind='notification'").run();
    const before = sent.length;
    await call(`/requests/${id}/submit`, mona, 'POST', {});
    await review('cancel', moderator, 'سبب إلغاء للتجربة');
    await flushMail();
    assert.equal(sent.length, before);
    await call('/profile/email-notifications', mona, 'PUT', { enabled: true });
  });

  await t.test('changing the email resets verification and invalidates old links', async () => {
    const r = await call('/profile/email', mona, 'PUT', {
      email: 'mona2@example.test',
      password: 'StrongPass1',
    });
    assert.equal(r.status, 200);
    await flushMail();
    const last = sent[sent.length - 1];
    assert.equal(last.to, 'mona2@example.test');
    assert.ok(last.text.includes('verify-email?token='));
    assert.equal((await session(mona)).user.email_verified, 0);
    assert.equal(
      (await call('/verify-email', undefined, 'POST', { token: tokenFrom(last) })).status,
      200,
    );
    assert.equal((await session(mona)).user.email_verified, 1);
  });

  await t.test('failed sends are retried from the outbox', async () => {
    await call('/profile/email-notifications', mona, 'PUT', { enabled: true });
    db.prepare("UPDATE email_outbox SET created_at=1 WHERE kind='notification'").run();
    const before = sent.length;
    failNext = true;
    await call('/profile/university-id', mona, 'PUT', { studentId: '20269999' }).catch(
      () => undefined,
    );
    // نولّد إشعارًا جديدًا: الموظف يخفي المنشور ← لا يوجد؛ نستخدم إعادة فتح من المسؤول
    await review('reopen', admin, 'إعادة فتح ثانية');
    await flushMail();
    const row = db
      .prepare(
        "SELECT attempts,sent_at FROM email_outbox WHERE kind='notification' ORDER BY id DESC LIMIT 1",
      )
      .get() as { attempts: number; sent_at: number | null };
    assert.equal(row.attempts, 1);
    assert.equal(row.sent_at, null);
    assert.equal(sent.length, before);
    db.prepare('UPDATE email_outbox SET next_at=0').run();
    await flushMail();
    assert.equal(sent.length, before + 1);
  });

  await t.test('staff emails: only when verified, and generic', async () => {
    db.prepare(
      "UPDATE users SET email_verified_at='2026-01-01' WHERE email='moderator@demo.local'",
    ).run();
    const before = sent.length;
    // الطالب يعيد الإرسال ليصل الموظف إشعار
    await call(`/requests/${id}/submit`, mona, 'POST', {});
    await flushMail();
    const toStaff = sent.slice(before).filter((m) => m.to === 'moderator@demo.local');
    assert.equal(toStaff.length, 1);
    assert.ok(!toStaff[0].text.includes('منى'));
  });
});

test('real SMTP delivery through nodemailer (local test server)', async (t) => {
  const { SMTPServer } = await import('smtp-server');
  const { simpleParser } = await import('mailparser');
  const received: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    cids: string[];
  }[] = [];
  const smtp = new SMTPServer({
    authOptional: false,
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth(auth, _session, cb) {
      if (auth.username === 'user' && auth.password === 'secret') cb(null, { user: 'u' });
      else cb(new Error('bad credentials'));
    },
    async onData(stream, _session, cb) {
      const mail = await simpleParser(stream);
      received.push({
        from: mail.from?.text ?? '',
        to: (Array.isArray(mail.to) ? mail.to[0] : mail.to)?.text ?? '',
        subject: mail.subject ?? '',
        text: mail.text ?? '',
        html: String(mail.html || ''),
        cids: mail.attachments.map((a) => `${a.cid}|${a.contentType}|${a.size}`),
      });
      cb();
    },
  });
  await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', () => r()));
  const port = (smtp.server.address() as { port: number }).port;
  t.after(() => new Promise<void>((r) => smtp.close(() => r())));
  const mailer = mailerFromEnv({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_SECURE: 'false',
    SMTP_USER: 'user',
    SMTP_PASS: 'secret',
    MAIL_FROM: 'أَثَر <no-reply@example.test>',
  })!;
  const body = renderEmail({
    platform: 'أَثَر',
    heading: 'أهلًا',
    tagline: 'بوابة النشاط الطلابي',
    faculty: 'كلية التجارة',
    university: 'جامعة قناة السويس',
    lines: ['مرحبًا بك'],
    button: { label: 'فتح', url: 'https://example.test/x' },
  });
  await mailer.transport.sendMail({
    from: mailer.from,
    to: 'student@example.test',
    subject: 'تأكيد بريدك',
    ...body,
    attachments: inlineAttachments(body.html, path2.resolve(import.meta.dirname, '..')),
  });
  // شعارا الكلية والجامعة مضمّنان كصورة CID داخل الرسالة نفسها
  assert.equal(received[0].cids.length, 1);
  assert.match(received[0].cids[0], /^athar-logos@scu\|image\/png\|\d{5,}$/);
  assert.ok(received[0].html.includes('بوابة النشاط الطلابي'));
  assert.equal(received.length, 1);
  assert.equal(received[0].subject, 'تأكيد بريدك');
  assert.ok(received[0].text.includes('https://example.test/x'));
  assert.ok(received[0].html.includes('dir="rtl"'));
  assert.ok(received[0].from.includes('no-reply@example.test'));
  // بيانات اعتماد خاطئة تفشل (لا يُبتلع الخطأ)
  const bad = mailerFromEnv({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: 'user',
    SMTP_PASS: 'wrong',
    MAIL_FROM: 'a@example.test',
  })!;
  await assert.rejects(
    bad.transport.sendMail({
      from: bad.from,
      to: 'x@example.test',
      subject: 's',
      text: 't',
      html: 'h',
    }),
  );
});
