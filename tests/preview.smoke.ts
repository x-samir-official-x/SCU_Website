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
  await page.getByRole('button', { name: 'تعبئة بيانات الحساب التجريبي' }).click();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.locator('.sidebar').waitFor();
  await page.waitForLoadState('networkidle');
}
async function logout() {
  await page.locator('.sidebar').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await page.locator('.lp-hero h1').waitFor();
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
  const header = page.locator('.lp-header');
  const headerBox = (await header.boundingBox())!;
  assert.ok(headerBox.y >= 20 && headerBox.width < 1440);
  assert.equal(await header.evaluate((e) => getComputedStyle(e).position), 'sticky');
  assert.ok(
    (await header.evaluate((e) => getComputedStyle(e, '::before').backdropFilter)).includes('blur'),
  );
  await page.getByRole('navigation').getByRole('link', { name: 'خطوات التسجيل' }).click();
  await page.locator('#landing-navigation a[href="#journey"][aria-current="location"]').waitFor();
  assert.ok((await header.boundingBox())!.y >= 19);
  assert.ok((await page.locator('#journey').boundingBox())!.y >= headerBox.height + 20);
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.screenshot({ path: path.join(output, 'glass-nav-over-content.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'عمل تطوعي', exact: true }).click();
  assert.equal(await page.locator('.public-post').count(), 1);
  await page.getByRole('button', { name: 'الكل', exact: true }).click();
  await page.getByText('هل رفع النشاط يعني اعتماده؟', { exact: true }).click();
  assert.equal(await page.locator('details[open]').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'أنشطة الطلاب' }).focus();
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .getByRole('button', { name: 'فتح قائمة التنقل' })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await page.getByRole('heading', { level: 1 }).click();
  assert.equal(
    await page.getByRole('button', { name: 'فتح قائمة التنقل' }).getAttribute('aria-expanded'),
    'false',
  );
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await page.screenshot({ path: path.join(output, 'glass-mobile-menu.png') });
  await page.getByRole('navigation').getByRole('link', { name: 'أنشطة الطلاب' }).click();
  await page.locator('.lp-nav nav').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'landing-mobile.png'), fullPage: true });
  for (const width of [320, 375, 768, 900, 901, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Landing overflow at ${width}`,
    );
  }
  await page.emulateMedia({ contrast: 'more' });
  assert.equal(
    await header.evaluate((e) => getComputedStyle(e, '::before').backdropFilter),
    'none',
  );
  await page.emulateMedia({ contrast: 'no-preference' });
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
  await page.getByRole('checkbox').check();
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
  await other.getByLabel('الرقم الجامعي').fill('20269999');
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
  const forbidden = await other.evaluate(async () => (await fetch('/api/admin/staff')).status);
  assert.equal(forbidden, 403);
  await other.getByRole('link', { name: 'أنشطة الطلاب', exact: true }).click();
  await other.getByRole('button', { name: 'اقرأ مشاركة مساحة خضراء… بأيدينا' }).click();
  await other.locator('dialog[open]').waitFor();
  await other.getByRole('button', { name: 'إغلاق المشاركة' }).press('Escape');
  assert.equal(await other.locator('dialog[open]').count(), 0);
  await isolated.close();
  const animatedContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  const animated = await animatedContext.newPage();
  animated.on('pageerror', (e) => errors.push(e.message));
  await animated.goto(base, { waitUntil: 'networkidle' });
  await animated.getByRole('button', { name: 'عمل تطوعي', exact: true }).click();
  await animated.locator('.public-post').nth(1).waitFor({ state: 'detached' });
  await animated.getByRole('button', { name: 'الكل', exact: true }).click();
  await animated.locator('.public-post').nth(2).waitFor();
  await animated.getByRole('button', { name: 'خدمة مجتمعية', exact: true }).click();
  await animated.locator('.public-post h3').getByText('معًا، نصل إلى أكثر').waitFor();
  assert.equal(await animated.locator('.public-post').count(), 1);
  await animated.setViewportSize({ width: 390, height: 844 });
  await animated.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await animated.getByRole('navigation').waitFor();
  await animated.getByRole('navigation').evaluate(async (e) => {
    await Promise.all(e.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  await animated.screenshot({ path: path.join(output, 'glass-mobile-menu-motion.png') });
  await animated.keyboard.press('Escape');
  await animated.getByRole('navigation').waitFor({ state: 'hidden' });
  // Crossing the breakpoint must not reopen a stale mobile disclosure.
  await animated.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await animated.setViewportSize({ width: 1024, height: 844 });
  await animated.getByRole('button', { name: 'فتح قائمة التنقل' }).waitFor({ state: 'hidden' });
  await animated.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await animated.getByRole('button', { name: 'فتح قائمة التنقل' }).getAttribute('aria-expanded'),
    'false',
  );
  await animatedContext.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        server: 'static files only',
        checks: [
          'public landing, sample filtering, mobile menu and FAQ',
          'floating glass, section tracking, Escape/outside dismissal and focus restoration',
          '320–1440px layout and increased-contrast glass fallback',
          'motion-enabled native gallery transitions and reversible mobile disclosure',
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
