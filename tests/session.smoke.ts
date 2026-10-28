import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { browserExecutable } from '../server/browser';

/** انتهاء الجلسة أثناء الاستخدام يعيد المستخدم للدخول برسالة، وانقطاع الشبكة يظهر برسالة عربية مقروءة. */
const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-session-'));
const { app, db } = createApp({ dataDir: dir, demo: true });
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const ctx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'تعبئة بيانات الحساب التجريبي' }).click();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('main.main-content').waitFor();
  await page.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  await page.locator('#activity-title').fill('حملة تنظيف الشاطئ');
  await page.getByLabel('نوع النشاط').selectOption('نشاط بيئي');
  await page.getByLabel('تاريخ المشاركة').fill('2026-10-20');
  await page.getByLabel('الجهة المنظمة').fill('فريق أصدقاء البيئة');
  await page
    .getByLabel('وصف مشاركتك')
    .fill('شاركت في تنظيف الشاطئ وجمع المخلفات وتوعية الزوار بأهمية الحفاظ على البيئة.');
  await page.locator('input[type=file]').setInputFiles({
    name: 'cert.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('link', { name: 'cert.png', exact: true }).waitFor();
  await page.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await page.locator('.modal').getByRole('checkbox').check();

  // انقطاع الشبكة: رسالة عربية، لا "Failed to fetch"
  await ctx.setOffline(true);
  await page.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await page.getByText('تعذر الاتصال').first().waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('Failed to fetch').count(), 0);
  await ctx.setOffline(false);

  // انتهاء الجلسة: العودة للدخول مع رسالة
  db.prepare('DELETE FROM sessions').run();
  await page.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await page.waitForURL('**/login');
  await page.getByText('انتهت جلستك').waitFor();
  console.log('Session expiry browser smoke passed');
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
