import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { browserExecutable } from '../server/browser';

/** الشاشة الافتتاحية: تظهر بـ ?splash=1، تُغلق بالنقر وتتلاشى، ولا تحجب الأتمتة افتراضيًا. */
const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-splash-'));
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
  const page = await (await browser.newContext({ locale: 'ar-EG' })).newPage();
  // بدون ?splash=1 لا تظهر في وضع الأتمتة، فلا تعطّل باقي الاختبارات
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  assert.equal(await page.getByTestId('splash').count(), 0);
  // بالتفعيل: تظهر وفيها الشعار واسم الموقع، والصفحة مقفولة التمرير
  await page.goto(`${base}/?splash=1`, { waitUntil: 'commit' });
  await page.getByTestId('splash').waitFor();
  assert.equal(await page.locator('.splash-disc img').count(), 2);
  assert.match((await page.locator('.splash-title').textContent()) ?? '', /أَثَر/);
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains('splash-lock')),
    true,
  );
  // النقر يتخطاها: تتلاشى ثم تُزال من الصفحة
  await page.mouse.click(200, 200);
  await page.getByTestId('splash').waitFor({ state: 'detached', timeout: 3000 });
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains('splash-lock')),
    false,
  );
  assert.ok(await page.getByRole('link', { name: 'تسجيل الدخول' }).first().isVisible());
  // تنتهي تلقائيًا بدون نقر
  await page.goto(`${base}/?splash=1`, { waitUntil: 'commit' });
  await page.getByTestId('splash').waitFor({ state: 'detached', timeout: 6000 });
  console.log('Splash browser smoke passed');
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
