// تشغيل كامل في الوضع الحقيقي: قاعدة فارغة، مسؤول من المتغيرات، تسجيل مفتوح، بلا أي بيانات تجريبية.
import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

process.env.ADMIN_EMAIL = 'admin@scu.local';
process.env.ADMIN_PASSWORD = 'ShowAdmin2026!x';
process.env.ADMIN_NAME = 'سمير الإدارة';
const { createApp } = await import('../server/index');
const { browserExecutable } = await import('../server/browser');
const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-real-'));
const { app, db } = createApp({ dataDir: dir, demo: false, registrationOpen: true });
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
const newPage = async (width = 1366) => {
  const page = await (
    await browser.newContext({ viewport: { width, height: 900 }, locale: 'ar-EG', reducedMotion: 'reduce' })
  ).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return page;
};
async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForLoadState('networkidle');
}
try {
  assert.equal((await fetch(`${base}/api/demo-accounts`)).status, 404, 'no demo accounts in real mode');
  const publicCount = (db.prepare('SELECT count(*) c FROM users').get() as { c: number }).c;
  assert.equal(publicCount, 1, 'only the admin exists');
  assert.equal((db.prepare('SELECT name FROM users').get() as { name: string }).name, 'سمير الإدارة');

  // الإدارة على قاعدة فارغة
  const admin = await newPage();
  await admin.goto(`${base}/login`, { waitUntil: 'networkidle' });
  assert.equal(await admin.getByRole('button', { name: 'تعبئة بيانات الحساب التجريبي' }).count(), 0);
  await signIn(admin, 'admin@scu.local', 'ShowAdmin2026!x');
  for (const route of ['/dashboard', '/requests', '/staff', '/community', '/guide']) {
    await admin.goto(base + route, { waitUntil: 'networkidle' });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, route);
  }
  await admin.goto(`${base}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
  await admin.getByLabel('الاسم الكامل').fill('موظفة المراجعة');
  await admin.getByLabel('البريد الإلكتروني').fill('staff@scu.local');
  await admin.getByLabel('كلمة المرور').fill('StaffPass2026!x');
  await admin.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await admin.getByText('staff@scu.local', { exact: true }).waitFor();

  // تسجيل طالب جديد من الواجهة
  const student = await newPage(390);
  await student.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await student.locator('input[name=name]').fill('منى إبراهيم السيد');
  await student.locator('input[name=student_id]').fill('20269999');
  await student.locator('input[name=email]').fill('mona@example.com');
  await student.locator('input[name=phone]').fill('01012345678');
  await student.locator('input[name=password]').fill('Zx-Plum-2026!x');
  await student.locator('select[name=year]').selectOption({ index: 1 });
  await student.locator('input[name=accepted_terms]').check();
  await student.getByRole('button', { name: /إنشاء/ }).last().click();
  await student.locator('.sidebar, .mobile-institution').first().waitFor({ state: 'attached' });
  await student.waitForURL((u) => !u.pathname.includes('register'));
  await student.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  await student.locator('#activity-title').fill('حملة تنظيف الشاطئ');
  await student.getByLabel('نوع النشاط').selectOption('نشاط بيئي');
  await student.getByLabel('تاريخ المشاركة').fill('2026-10-20');
  await student.getByLabel('الجهة المنظمة').fill('أصدقاء البيئة');
  await student.getByLabel('وصف مشاركتك').fill('شاركت في تنظيف الشاطئ وتوزيع الأكياس على المتطوعين طوال اليوم.');
  await student.locator('input[type=file]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await student.getByRole('link', { name: 'proof.png', exact: true }).waitFor();
  await student.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await student.locator('.modal').getByRole('checkbox').check();
  await student.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await student.getByRole('heading', { name: 'تم استلام طلبك بنجاح' }).waitFor();
  const download = student.waitForEvent('download');
  await student.getByRole('link', { name: 'تنزيل الاستمارة', exact: true }).click();
  const file = path.join(dir, 'form.pdf');
  await (await download).saveAs(file);
  const text = execFileSync('pdftotext', [file, '-']).toString();
  assert.ok(text.includes('حملة تنظيف الشاطئ'), 'form carries the activity');
  assert.ok(!text.includes('نسخة تجريبية'), 'no demo wording on the real form');

  // اعتماد الموظفة
  const staff = await newPage();
  await signIn(staff, 'staff@scu.local', 'StaffPass2026!x');
  const rid = (db.prepare('SELECT id FROM requests').get() as { id: number }).id;
  await staff.goto(`${base}/requests/${rid}`, { waitUntil: 'networkidle' });
  await staff.getByRole('checkbox').check();
  await staff.getByRole('button', { name: 'اعتماد النشاط وإضافة ٤٠ درجة' }).click();
  await staff.getByRole('button', { name: 'تأكيد القرار', exact: true }).click();
  await staff.getByRole('heading', { name: 'تمت مراجعة الطلب', exact: true }).waitFor();
  await student.reload({ waitUntil: 'networkidle' });
  await student.getByRole('heading', { name: 'تم اعتماد نشاطك — ٤٠ / ٤٠ درجة', exact: true }).waitFor();

  assert.deepEqual(errors, []);
  writeFileSync(path.join(dir, 'ok'), 'ok');
  console.log('Real-mode workflow passed (empty DB → register → submit → approve).');
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
