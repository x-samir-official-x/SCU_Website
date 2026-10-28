import { typeDemoCredentials } from './demo-login';
import express from 'express';
import { chromium } from 'playwright-core';
import { browserExecutable } from '../server/browser';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Server } from 'node:http';
import assert from 'node:assert/strict';

// اختبار المعرض من طرف المتصفح (نسخة المعاينة الثابتة): موافقة الطالب → نشر بعد الإرسال بدون اسم →
// إخفاء الموظف → النشر لا يمنح اعتمادًا ولا درجة.
const app = express();
const dist = path.resolve('dist-preview');
app.use(express.static(dist));
app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
const server: Server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
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
// PNG صالح (٦٤×٤٨) مع جزء tEXt يحمل "موقعًا" وهميًا، لنتأكد أنه لا يصل للمعرض.
function makePng() {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const w = 64;
  const h = 48;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 120);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('GPS\0SECRET-30.58N')),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = makePng();
async function login(role: string) {
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
const galleryPosts = () =>
  page.evaluate(async () => (await (await fetch('/api/gallery')).json()).posts as unknown[]);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal((await galleryPosts()).length, 0);
  assert.equal(await page.locator('.public-post .sample-label').count(), 3);

  await login('طالب');
  await page.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  // المساعد المحلي: الطالب يكتب بكلماته فتُعبّأ الاستمارة، ثم ينتقل لأول ما ينقصه (المستند)
  await page
    .getByLabel('اكتب ما فعلته بكلماتك')
    .fill(
      'شاركت في حملة تنظيف الحرم الجامعي يوم 20 أكتوبر 2026 مع فريق أصدقاء البيئة، ووزعنا أكياس القمامة على الطلاب.',
    );
  await page.getByRole('button', { name: 'اقترح تعبئة الاستمارة' }).click();
  await page.locator('.assistant-result').waitFor();
  assert.ok((await page.locator('.assistant-result').innerText()).includes('2026-10-20'));
  await page.getByRole('button', { name: 'تطبيق على الاستمارة' }).click();
  assert.equal(
    await page.locator('#activity-title').inputValue(),
    'المشاركة في حملة تنظيف الحرم الجامعي',
  );
  assert.equal(await page.locator('#activity-category').inputValue(), 'نشاط بيئي');
  assert.equal(await page.locator('#activity-date').inputValue(), '2026-10-20');
  assert.equal(await page.locator('#activity-org').inputValue(), 'فريق أصدقاء البيئة');
  assert.ok((await page.locator('#activity-description').inputValue()).includes('أكياس القمامة'));
  await page.waitForFunction(() => document.activeElement?.id === 'doc-upload');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('link', { name: 'proof.png', exact: true }).waitFor();

  // موافقة بدون صورة تمنع الإرسال برسالة واضحة
  await page.getByRole('checkbox', { name: /أوافق على نشر/ }).check();
  await page.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await page.getByText('أضف صورة المعرض أو ألغِ خيار النشر قبل التقديم.').waitFor();
  await page.getByRole('checkbox', { name: /اسمي الأول/ }).check();
  await page.waitForFunction(
    async () => (await (await fetch('/api/requests/mine')).json()).request.gallery.showName,
  );
  await page
    .getByLabel('صورة المعرض')
    .setInputFiles({ name: 'IMG_secret.png', mimeType: 'image/png', buffer: PNG });
  await page.getByAltText('معاينة صورة المعرض').waitFor();
  await page.getByRole('button', { name: 'مراجعة وإرسال الطلب' }).click();
  await page.locator('.modal').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'تأكيد التقديم', exact: true }).click();
  await page.getByRole('heading', { name: 'تم استلام طلبك بنجاح', exact: true }).waitFor();

  // النشر مباشرة بعد الإرسال، بدون اسم، والطلب لا يزال قيد المراجعة
  const posts = await galleryPosts();
  assert.equal(posts.length, 1);
  const flat = JSON.stringify(posts);
  assert.equal((posts[0] as { author: string }).author, 'يوسف');
  for (const secret of ['يوسف أحمد', 'student@demo.local', '20260001', 'student_name'])
    assert.ok(!flat.includes(secret));
  const mine = await page.evaluate(
    async () => (await (await fetch('/api/requests/mine')).json()).request,
  );
  assert.equal(mine.status, 'pending');
  assert.equal(mine.gallery.published, true);
  await logout();
  // المعرض يُحمَّل بعد ظهور الصفحة: ننتظر وصول المنشور الحقيقي ثم نتحقق.
  await page.waitForFunction(
    () => document.querySelectorAll('.public-post .sample-label').length === 2,
  );
  assert.equal(await page.locator('.public-post').count(), 3);
  assert.ok(
    (await page.locator('.public-post').first().innerText()).includes('حملة تنظيف الحرم الجامعي'),
  );
  const landing = await page.locator('.landing-page').innerText();
  assert.ok(landing.includes('يوسف ·') && !landing.includes('يوسف أحمد'));
  const firstImage = page.locator('.public-post').first().locator('img');
  await firstImage.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => {
      const img = document.querySelector('.public-post img') as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: 8000 },
  );

  // الموظف يخفي المنشور من المعرض
  await login('موظف');
  await page.goto(`${base}/requests/${mine.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'إخفاء من المعرض' }).click();
  await page.getByRole('button', { name: 'إظهار في المعرض' }).waitFor();
  assert.equal((await galleryPosts()).length, 0);
  await page.getByRole('button', { name: 'إظهار في المعرض' }).click();
  await page.getByRole('button', { name: 'إخفاء من المعرض' }).waitFor();
  assert.equal((await galleryPosts()).length, 1);
  await logout();
  await login('طالب');
  assert.equal(
    await page.evaluate(
      async () => (await (await fetch('/api/requests/mine')).json()).request.status,
    ),
    'pending',
  );

  // الطالب يسحب موافقته بعد الإرسال → يختفي من المعرض
  await page.goto(`${base}/activity`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox', { name: /أوافق على نشر/ }).click();
  await page.waitForFunction(
    async () => (await (await fetch('/api/gallery')).json()).posts.length === 0,
  );
  // تسجيل بالرقم القومي فقط: يُنشأ الحساب ولا يظهر الرقم كاملًا
  const fresh = await browser.newContext();
  const reg = await fresh.newPage();
  await reg.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await reg.getByLabel('الاسم الكامل').fill('منى إبراهيم');
  await reg.getByLabel('الرقم القومي').fill('٢٩٩٠١٠١١٢٣٤٥٦٧');
  await reg.getByLabel('البريد الإلكتروني').fill('mona@example.test');
  await reg.getByLabel('كلمة المرور').fill('Example2026!');
  await reg.getByLabel('الفرقة الدراسية').selectOption('الفرقة الثانية');
  await reg.getByRole('checkbox', { name: /قرأت شروط الاستخدام/ }).check();
  await reg.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await reg.locator('.sidebar').waitFor();
  const me = await reg.evaluate(async () => (await (await fetch('/api/session')).json()).user);
  assert.equal(me.student_id, 'ق.م ••••4567');
  assert.ok(!JSON.stringify(me).includes('29901011234567'));
  await fresh.close();
  assert.deepEqual(errors, []);
  console.log('Gallery browser workflow passed.');
} finally {
  await browser.close();
  server.close();
}
