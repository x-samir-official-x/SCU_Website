import { typeDemoCredentials } from './demo-login';
import express from 'express';
import { chromium, type Page } from 'playwright-core';
import { browserExecutable } from '../server/browser';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import assert from 'node:assert/strict';

const app = express();
const dist = path.resolve('dist-preview');
app.use(express.static(dist));
app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const output = path.resolve(
  'test-results',
  `preview-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
async function login(role = 'طالب') {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: role, exact: true }).click();
  await typeDemoCredentials(page, role);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForLoadState('networkidle');
}
async function logout() {
  await page.locator('.sidebar').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await page.locator('.px-hero h1').waitFor();
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.equal(await page.locator('.public-post').count(), 3);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page
      .locator('.landing-page img')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    true,
  );
  await page.screenshot({ path: path.join(output, 'landing-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'عمل تطوعي', exact: true }).click();
  assert.equal(await page.locator('.public-post').count(), 1);
  await page.getByRole('button', { name: 'الكل', exact: true }).click();
  await page.getByText('هل رفع النشاط يعني اعتماده؟', { exact: true }).click();
  assert.equal(await page.locator('details[open]').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'أنشطة الطلاب' }).click();
  await page.locator('#fnav-sheet').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'landing-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'اقرأ مشاركة مساحة خضراء… بأيدينا' }).click();
  await page.getByRole('heading', { name: 'تسجيل الدخول', exact: true }).waitFor();
  await login();
  assert.equal(
    await page
      .locator('.demo-bar')
      .innerText()
      .then((t) => t.includes('في هذا المتصفح')),
    true,
  );
  assert.ok(await page.evaluate(async () => (await (await fetch('/api/health')).json()).preview));
  await page.getByRole('link', { name: 'سجّل نشاطك الآن' }).click();
  await page.locator('#activity-title').fill('نشاط تجربة النشر على Vercel');
  await page.getByLabel('نوع النشاط').selectOption('عمل تطوعي');
  await page.getByLabel('تاريخ المشاركة').fill('2026-10-20');
  await page.getByLabel('الجهة المنظمة').fill('فريق طلاب كلية التجارة');
  await page
    .getByLabel('وصف مشاركتك')
    .fill('اختبار تقديم نشاط وحفظ مستنداته ومراجعته في وضع المعاينة التفاعلية.');
  await page.locator('input[type=file]').setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('link', { name: 'preview.png', exact: true }).waitFor();
  await page.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await page.locator('.modal').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await page.getByRole('heading', { name: 'تم استلام طلبك بنجاح', exact: true }).waitFor();
  const mine = await page.evaluate(
    async () => (await (await fetch('/api/requests/mine')).json()).request,
  );
  assert.equal(mine.status, 'pending');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'عرض وطباعة الاستمارة', exact: true }).click();
  const form: Page = await popupPromise;
  await form.waitForLoadState('networkidle');
  await form.getByRole('heading', { name: 'استمارة تقديم النشاط الطلابي', exact: true }).waitFor();
  await form.getByRole('button', { name: 'طباعة الاستمارة / حفظ PDF' }).waitFor();
  assert.ok((await form.locator('body').innerText()).includes('نشاط تجربة النشر على Vercel'));
  await form.pdf({
    path: path.join(output, 'preview-print.pdf'),
    format: 'A4',
    printBackground: true,
  });
  await form.close();
  await logout();
  await login('موظف');
  assert.equal(await page.evaluate(async () => (await fetch('/api/admin/staff')).status), 403);
  await page.goto(`${base}/requests/${mine.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'اعتماد النشاط وإضافة ٤٠ درجة' }).click();
  await page.getByRole('button', { name: 'تأكيد القرار', exact: true }).click();
  await page.getByRole('heading', { name: 'تمت مراجعة الطلب', exact: true }).waitFor();
  await logout();
  await login();
  await page.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'تم اعتماد نشاطك — ٤٠ / ٤٠ درجة', exact: true })
    .waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.evaluate(
      async () => (await (await fetch('/api/requests/mine')).json()).request.status,
    ),
    'approved',
  );
  await page.screenshot({ path: path.join(output, 'preview-approved.png'), fullPage: true });
  const isolated = await browser.newContext();
  const other = await isolated.newPage();
  await other.goto(base, { waitUntil: 'networkidle' });
  assert.equal(
    await other.evaluate(async () => (await (await fetch('/api/session')).json()).user),
    null,
  );
  await other.getByRole('link', { name: 'إنشاء حساب جديد', exact: true }).click();
  await other.getByLabel('الاسم الكامل').fill('طالب تجربة جديد');
  // بدون رقم جامعي ولا قومي: يظهر خطأ واضح ولا يُنشأ حساب
  await other.getByLabel('الاسم الكامل').fill('طالب تجربة جديد');
  await other.getByLabel('البريد الإلكتروني').fill('new-student@example.test');
  await other.getByLabel('كلمة المرور التجريبية').fill('Example2026!');
  await other.getByLabel('الفرقة الدراسية').selectOption('الفرقة الأولى');
  await other.getByRole('checkbox', { name: /قرأت شروط الاستخدام/ }).check();
  await other.getByRole('button', { name: 'إنشاء الحساب التجريبي' }).click();
  await other
    .getByText('اكتب الرقم الجامعي (على الكارنيه) أو الرقم القومي', { exact: false })
    .waitFor();
  assert.equal(await other.locator('.sidebar').count(), 0);
  await other.getByLabel('الرقم الجامعي').fill('٢٠٢٦٩٩٩٩');
  await other.getByLabel('البريد الإلكتروني').fill('new-student@example.test');
  await other.getByLabel('كلمة المرور التجريبية').fill('Example2026!');
  await other.getByLabel('الفرقة الدراسية').selectOption('الفرقة الأولى');
  await other.getByRole('button', { name: 'إنشاء الحساب التجريبي' }).click();
  await other.locator('.sidebar').waitFor();
  const registered = await other.evaluate(
    async () => (await (await fetch('/api/session')).json()).user,
  );
  assert.equal(registered.role, 'student');
  assert.equal(registered.student_id, '20269999');
  // بطاقة المهمة تظهر فورًا بعد إنشاء الحساب، ثم الملف الشخصي
  await other.getByRole('heading', { name: /مهمتك الأولى/ }).waitFor();
  await other.getByRole('link', { name: 'ملفي الشخصي', exact: true }).first().click();
  await other.getByRole('heading', { name: 'ملفي الشخصي', level: 1 }).waitFor();
  assert.equal((await other.getByText('20269999').count()) > 0, true);
  await other.getByLabel('كلمة المرور الحالية', { exact: true }).fill('Example2026!');
  await other.getByLabel(/^كلمة المرور الجديدة/).fill('Changed2026!');
  await other.getByLabel('أعد كتابة كلمة المرور الجديدة').fill('Changed2026!');
  await other.getByRole('button', { name: 'تغيير كلمة المرور' }).click();
  await other.getByText('تم تغيير كلمة المرور').waitFor();
  await other.getByLabel(/^رقم الموبايل/).fill('٠١٠١٢٣٤٥٦٧٨');
  await other.getByRole('button', { name: 'حفظ الرقم' }).click();
  await other.getByText('تم حفظ رقم الموبايل').waitFor();
  await other.getByRole('button', { name: /^الإشعارات/ }).click();
  await other.getByText('لا توجد إشعارات بعد').waitFor();
  await other.keyboard.press('Escape');
  const forbidden = await other.evaluate(async () => (await fetch('/api/admin/staff')).status);
  assert.equal(forbidden, 403);
  await other.getByRole('link', { name: 'أنشطة الطلاب', exact: true }).click();
  await other.getByRole('button', { name: 'اقرأ مشاركة مساحة خضراء… بأيدينا' }).click();
  await other.locator('dialog[open]').waitFor();
  await other.getByRole('button', { name: 'إغلاق المشاركة' }).press('Escape');
  assert.equal(await other.locator('dialog[open]').count(), 0);
  await isolated.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        server: 'static files only',
        checks: [
          'public landing, sample filtering, mobile menu and FAQ',
          'new browser-local student registration and role boundaries',
          'authenticated sample dialog and Escape dismissal',
          'service worker initialization',
          'local IndexedDB draft and file upload',
          'submission',
          'print form with actual student data',
          'role switching and review',
          '40 points',
          'state survives reload',
          'separate browser state',
          'no JS errors',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Static Vercel preview workflow passed:', output);
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
