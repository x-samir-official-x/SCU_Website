import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
const emails: Record<string, string> = {
  طالب: 'student@demo.local',
  موظف: 'moderator@demo.local',
  'مسؤول رئيسي': 'admin@demo.local',
};
/** يكتب بيانات حساب الديمو يدويًا (لم يعد هناك زر تعبئة تلقائية في الواجهة). */
export async function typeDemoCredentials(page: Page, role = 'طالب') {
  await page.locator('input[name=email]').fill(emails[role]);
  await page.locator('input[type=password]').fill('Demo2026!');
}

/**
 * مسار الطالب الجديد كاملًا من الواجهة: إثبات الهوية بالرقم القومي، ثم الدخول بالكلمة
 * المؤقتة، ثم اختيار كلمة مرور خاصة (إجباري). يُرجع الكلمة المؤقتة التي ظهرت.
 */
export async function claimAndActivate(
  page: Page,
  base: string,
  opts: { national: string; studentId?: string; password: string },
): Promise<string> {
  await page.goto(`${base}/activate`, { waitUntil: 'networkidle' });
  await page.locator('input[name=national_id]').fill(opts.national);
  if (opts.studentId) await page.locator('input[name=student_id]').fill(opts.studentId);
  await page.getByRole('checkbox', { name: /قرأت شروط الاستخدام/ }).check();
  await page.getByRole('button', { name: 'تحقق وأصدر كلمة المرور المؤقتة' }).click();
  const code = page.locator('.lp-temp-code code');
  await code.waitFor();
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  assert.equal(await overflow(), false, 'claim result must not overflow horizontally');
  const temp = (await code.innerText()).trim();
  await page.getByRole('link', { name: 'الانتقال إلى تسجيل الدخول' }).click();
  await page.locator('input[name=email]').fill(opts.national);
  await page.locator('input[name=password]').fill(temp);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('heading', { name: 'اختر كلمة مرور خاصة بك' }).waitFor();
  assert.equal(await overflow(), false, 'forced-change page must not overflow horizontally');
  await page.locator('input[name=password]').fill(opts.password);
  await page.locator('input[name=confirm]').fill(opts.password);
  await page.getByRole('button', { name: 'حفظ والمتابعة' }).click();
  await page.locator('.sidebar, .mobile-institution').first().waitFor({ state: 'attached' });
  return temp;
}
