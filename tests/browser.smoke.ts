import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { browserExecutable } from '../server/browser';

const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-browser-'));
const output = path.resolve(
  'test-results',
  `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
mkdirSync(output, { recursive: true });
const { app, db } = createApp({ dataDir: dir, demo: true });
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
const context = () =>
  browser.newContext({
    viewport: { width: 1440, height: 1080 },
    locale: 'ar-EG',
    reducedMotion: 'reduce',
  });
async function login(page: Page, role = 'طالب') {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'تعبئة بيانات الحساب التجريبي' }).click();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForLoadState('networkidle');
}
async function screenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}
try {
  const student = await (await context()).newPage();
  await student.goto(base, { waitUntil: 'networkidle' });
  await screenshot(student, 'login.png');
  await login(student);
  await screenshot(student, 'student-desktop.png');
  assert.equal(await student.getByRole('link', { name: 'إدارة الموظفين', exact: true }).count(), 0);
  await student.getByRole('link', { name: 'سجّل نشاطك الآن' }).click();
  await student.locator('#activity-title').fill('المشاركة في حملة التوعية المجتمعية');
  await student.getByLabel('نوع النشاط').selectOption('خدمة مجتمعية');
  await student.getByLabel('تاريخ المشاركة').fill('2026-10-20');
  await student.getByLabel('الجهة المنظمة').fill('فريق طلاب كلية التجارة');
  await student
    .getByLabel('وصف مشاركتك')
    .fill('شاركت في تنظيم الحملة وتجهيز المواد ومساعدة فريق المتطوعين في استقبال المشاركين.');
  await student.locator('input[type=file]').setInputFiles({
    name: 'participation.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await student.getByRole('link', { name: 'participation.png', exact: true }).waitFor();
  await student.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await student.locator('.modal').getByRole('checkbox').check();
  await student.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await student.getByRole('heading', { name: 'تم استلام طلبك بنجاح' }).waitFor();
  assert.equal(await student.locator('#activity-title').isDisabled(), true);
  const rid = Number(
    (db.prepare('SELECT id FROM requests WHERE user_id=1').get() as { id: number }).id,
  );

  const moderator = await (await context()).newPage();
  await login(moderator, 'موظف');
  await screenshot(moderator, 'moderator-desktop.png');
  assert.equal(
    await moderator.getByRole('link', { name: 'إدارة الموظفين', exact: true }).count(),
    0,
  );
  await moderator.goto(`${base}/requests`, { waitUntil: 'networkidle' });
  await moderator.getByRole('textbox', { name: 'البحث عن طالب أو نشاط' }).fill('20260001');
  await moderator.getByRole('link', { name: 'مراجعة طلب يوسف أحمد', exact: true }).waitFor();
  await moderator.getByRole('link', { name: 'مراجعة طلب يوسف أحمد', exact: true }).click();
  assert.equal(
    await moderator.getByRole('button', { name: 'اعتماد النشاط وإضافة ٤٠ درجة' }).isDisabled(),
    true,
  );
  await moderator.getByLabel('طلب استكمال', { exact: true }).check();
  await moderator.getByLabel('ملاحظات المراجعة').fill('يرجى توضيح دورك في استقبال المشاركين.');
  await moderator.getByRole('button', { name: 'إعادة الطلب للاستكمال', exact: true }).click();
  await moderator.getByRole('button', { name: 'تأكيد القرار', exact: true }).click();
  await moderator.getByText('مطلوب استكمال', { exact: true }).first().waitFor();

  await student.reload({ waitUntil: 'networkidle' });
  assert.equal(await student.locator('#activity-title').isDisabled(), false);
  await student
    .getByLabel('وصف مشاركتك')
    .fill(
      'توليت استقبال المشاركين وتسجيل بيانات الحضور وتوزيع المواد التوعوية وتوجيههم إلى فريق التنظيم.',
    );
  await student.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await student.locator('.modal').getByRole('checkbox').check();
  await student.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await student.getByRole('heading', { name: 'تم استلام طلبك بنجاح' }).waitFor();
  const downloadPromise = student.waitForEvent('download');
  await student.getByRole('link', { name: 'تنزيل الاستمارة', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(await download.failure(), null);
  await download.saveAs(path.join(output, 'student-form.pdf'));
  await moderator.goto(`${base}/requests/${rid}`, { waitUntil: 'networkidle' });
  await moderator.getByRole('checkbox').check();
  await moderator.getByRole('button', { name: 'اعتماد النشاط وإضافة ٤٠ درجة' }).click();
  await moderator.getByRole('button', { name: 'تأكيد القرار', exact: true }).click();
  await moderator.getByRole('heading', { name: 'تمت مراجعة الطلب', exact: true }).waitFor();
  await student.reload({ waitUntil: 'networkidle' });
  await student
    .getByRole('heading', { name: 'تم اعتماد نشاطك — ٤٠ / ٤٠ درجة', exact: true })
    .waitFor();
  await screenshot(student, 'student-approved.png');

  const admin = await (await context()).newPage();
  await login(admin, 'مسؤول رئيسي');
  await admin.getByRole('link', { name: 'إدارة الموظفين', exact: true }).click();
  await admin.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
  await admin.getByLabel('الاسم الكامل').fill('موظف تجربة المتصفح');
  await admin.getByLabel('البريد الإلكتروني').fill('browser-staff@demo.local');
  await admin.getByLabel('كلمة المرور').fill('BrowserTest2026!');
  await admin.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await admin.getByText('browser-staff@demo.local', { exact: true }).waitFor();
  const row = admin.getByRole('row').filter({ hasText: 'browser-staff@demo.local' });
  await row.getByRole('button', { name: 'تعطيل الحساب', exact: true }).click();
  await admin.getByRole('button', { name: 'تأكيد', exact: true }).click();
  await row.getByText('معطّل', { exact: true }).waitFor();
  await screenshot(admin, 'staff-management.png');

  for (const width of [375, 390, 768, 1024, 1440]) {
    await student.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/dashboard', '/activity', '/documents', '/guide']) {
      await student.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(
        await student.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Horizontal overflow at ${width} ${route}`,
      );
      if (width === 390 && route === '/dashboard') await screenshot(student, 'student-mobile.png');
      // الصور المؤجلة (lazy) خارج الشاشة لا تبدأ التحميل وحدها: نطلبها صراحةً قبل الفحص.
      await student.locator('img').evaluateAll((images) =>
        Promise.all(
          images.map(async (image) => {
            const img = image as HTMLImageElement;
            img.loading = 'eager';
            await img.decode().catch(() => {});
          }),
        ),
      );
      assert.equal(
        await student
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
          ),
        true,
        'Brand images must load',
      );
    }
  }
  await student.setViewportSize({ width: 390, height: 844 });
  assert.equal(await student.locator('.mobile-institution').isVisible(), true);
  assert.equal(
    await student.locator('.route-surface').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await student.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
  await student
    .locator('.sidebar')
    .getByRole('button', { name: 'إغلاق القائمة', exact: true })
    .click();
  const motionContext = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    reducedMotion: 'no-preference',
  });
  const motionPage = await motionContext.newPage();
  await login(motionPage);
  assert.notEqual(
    await motionPage.locator('.route-surface').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await motionContext.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        workflows: [
          'student submission',
          'private upload',
          'revision and resubmission',
          'PDF download',
          'physical receipt and approval',
          '40 points',
          'staff creation and deactivation',
          'mobile overflow and navigation',
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Browser workflow passed. Fresh artifacts:', output);
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
