import type { Page } from 'playwright-core';
const emails: Record<string, string> = {
  'طالب': 'student@demo.local',
  'موظف': 'moderator@demo.local',
  'مسؤول رئيسي': 'admin@demo.local',
};
/** يكتب بيانات حساب الديمو يدويًا (لم يعد هناك زر تعبئة تلقائية في الواجهة). */
export async function typeDemoCredentials(page: Page, role = 'طالب') {
  await page.locator('input[type=email]').fill(emails[role]);
  await page.locator('input[type=password]').fill('Demo2026!');
}
