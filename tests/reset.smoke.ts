import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { browserExecutable } from '../server/browser';

/** يجرّب مسار «نسيت كلمة المرور» من الواجهة بالكامل مع بريد ملتقَط محليًا. */
const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-reset-ui-'));
const sent: { to: string; subject: string; text: string }[] = [];
const { app, db, flushMail } = createApp({
  dataDir: dir,
  demo: true,
  mailer: {
    from: 'أَثَر <no-reply@example.test>',
    transport: { sendMail: async (m) => void sent.push(m) },
  },
});
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await (await browser.newContext({ locale: 'ar-EG' })).newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('student@demo.local');
  await page.getByRole('button', { name: 'إرسال الرابط' }).click();
  await page.getByRole('heading', { name: 'راجع بريدك' }).waitFor();
  await flushMail();
  assert.equal(sent.length, 1);
  const link = sent[0].text.match(/https?:\/\/\S+reset-password\?token=[a-f0-9]{64}/)![0];
  await page.goto(`${base}${new URL(link).pathname}${new URL(link).search}`, {
    waitUntil: 'networkidle',
  });
  await page.getByLabel('كلمة المرور الجديدة').fill('BrandNew2026!');
  await page.getByLabel('أعد كتابتها').fill('Different123');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await page.getByText('كلمتا المرور غير متطابقتين').waitFor();
  await page.getByLabel('أعد كتابتها').fill('BrandNew2026!');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await page.getByRole('heading', { name: 'تم تغيير كلمة المرور' }).waitFor();
  await page.getByRole('link', { name: 'تسجيل الدخول' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('student@demo.local');
  await page.getByLabel('كلمة المرور').fill('BrandNew2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  // الرابط لا يعمل مرة ثانية
  await page.goto(`${base}${new URL(link).pathname}${new URL(link).search}`, {
    waitUntil: 'networkidle',
  });
  await page.getByLabel('كلمة المرور الجديدة').fill('Another2026!');
  await page.getByLabel('أعد كتابتها').fill('Another2026!');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await page.getByText('غير صالح').first().waitFor();
  console.log('Reset-password browser smoke passed');
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
