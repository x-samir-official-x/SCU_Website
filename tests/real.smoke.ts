// تشغيل كامل في الوضع الحقيقي: قاعدة فارغة، مسؤول من المتغيرات، رفع السجل ثم تفعيل الطالبة، بلا أي بيانات تجريبية.
import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { claimAndActivate } from './demo-login';

process.env.ADMIN_EMAIL = 'admin@scu.local';
process.env.ADMIN_PASSWORD = 'ShowAdmin2026!x';
process.env.ADMIN_NAME = 'سمير الإدارة';
const { createApp } = await import('../server/index');
const { browserExecutable } = await import('../server/browser');
const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-real-'));
const { app, db } = createApp({ dataDir: dir, demo: false });
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
    await browser.newContext({
      viewport: { width, height: 900 },
      locale: 'ar-EG',
      reducedMotion: 'reduce',
    })
  ).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return page;
};
async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForLoadState('networkidle');
}
try {
  assert.equal(
    (await fetch(`${base}/api/demo-accounts`)).status,
    404,
    'no demo accounts in real mode',
  );
  const publicCount = (db.prepare('SELECT count(*) c FROM users').get() as { c: number }).c;
  assert.equal(publicCount, 1, 'only the admin exists');
  assert.equal(
    (db.prepare('SELECT name FROM users').get() as { name: string }).name,
    'سمير الإدارة',
  );

  // الإدارة على قاعدة فارغة
  const admin = await newPage();
  await admin.goto(`${base}/login`, { waitUntil: 'networkidle' });
  assert.equal(
    await admin.getByRole('button', { name: 'تعبئة بيانات الحساب التجريبي' }).count(),
    0,
  );
  await signIn(admin, 'admin@scu.local', 'ShowAdmin2026!x');
  for (const route of ['/dashboard', '/requests', '/staff', '/roster', '/community', '/guide']) {
    await admin.goto(base + route, { waitUntil: 'networkidle' });
    assert.equal(
      await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      route,
    );
  }
  await admin.goto(`${base}/staff`, { waitUntil: 'networkidle' });
  await admin.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
  await admin.getByLabel('الاسم الكامل').fill('موظفة المراجعة');
  await admin.getByLabel('البريد الإلكتروني').fill('staff@scu.local');
  await admin.getByLabel('كلمة المرور').fill('StaffPass2026!x');
  await admin.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await admin.getByText('staff@scu.local', { exact: true }).waitFor();

  // رفع سجل الكلية من الواجهة (ملف CSV بأعمدة عربية)، ثم تفعيل الطالبة بنفسها
  await admin.goto(`${base}/roster`, { waitUntil: 'networkidle' });
  await admin.getByText('السجل فارغ').waitFor();
  await admin.locator('input[type=file]').setInputFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '\uFEFFالاسم,الرقم القومي,الرقم الجامعي,الفرقة\nمنى إبراهيم السيد,30401011200141,20269999,الفرقة الثانية\nسلمى أحمد حسن,٣٠٣٠٥٠٥١٢٠٠٢٢٢,,3\nبلا رقم,123,,1\n',
    ),
  });
  await admin.getByText('تعذّر', { exact: false }).waitFor();
  await admin.getByText('السطر ٤', { exact: false }).waitFor();
  assert.equal((db.prepare('SELECT count(*) c FROM roster').get() as { c: number }).c, 2);
  await admin.getByPlaceholder(/الاسم، أو الرقم الجامعي/).fill('منى');
  await admin.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await admin.getByText('لم يُفعَّل').waitFor();
  // طالبة جديدة من الواجهة (جوال)، والرقم الجامعي اختياري
  const student = await newPage(390);
  await claimAndActivate(student, base, { national: '30401011200141', password: 'Zx-Plum-2026!x' });
  assert.equal(
    (
      db.prepare('SELECT student_id FROM users WHERE national_id=?').get('30401011200141') as {
        student_id: string;
      }
    ).student_id,
    '20269999',
  );
  assert.ok(
    !(await student.locator('body').innerText()).includes('no-email.invalid'),
    'placeholder email never leaks',
  );
  await student.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  await student.locator('#activity-title').fill('حملة تنظيف الشاطئ');
  await student.getByLabel('نوع النشاط').selectOption('نشاط بيئي');
  await student.getByLabel('تاريخ المشاركة').fill('2026-10-20');
  await student.getByLabel('الجهة المنظمة').fill('أصدقاء البيئة');
  await student
    .getByLabel('وصف مشاركتك')
    .fill('شاركت في تنظيف الشاطئ وتوزيع الأكياس على المتطوعين طوال اليوم.');
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
  await student
    .getByRole('heading', { name: 'تم اعتماد نشاطك — ٤٠ / ٤٠ درجة', exact: true })
    .waitFor();

  // الموظفة تصدر كلمة مؤقتة جديدة لطالبة نسيت كلمتها: القديمة تتوقف فورًا
  await staff.goto(`${base}/roster`, { waitUntil: 'networkidle' });
  await staff.getByPlaceholder(/الاسم، أو الرقم الجامعي/).fill('منى');
  await staff.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await staff.getByText('مفعّل', { exact: true }).waitFor();
  assert.equal(await staff.getByText('إدارة الموظفين').count(), 0, 'moderator has no admin menu');
  assert.equal(await staff.getByText('رفع سجل الكلية').count(), 0, 'import is admin-only');
  await staff.getByRole('button', { name: 'كلمة مؤقتة جديدة' }).click();
  await staff.getByRole('button', { name: 'إصدار الكلمة' }).click();
  const reissued = (await staff.locator('.lp-temp-code code').innerText()).trim();
  assert.match(reissued, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const attempt = (password: string) =>
    fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '30401011200141', password }),
    });
  assert.equal((await attempt('Zx-Plum-2026!x')).status, 401, 'old password stops working');
  assert.equal((await attempt(reissued)).status, 200);

  assert.deepEqual(errors, []);
  writeFileSync(path.join(dir, 'ok'), 'ok');
  console.log(
    'Real-mode workflow passed (empty DB → roster import → claim → submit → approve → staff reissue).',
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
