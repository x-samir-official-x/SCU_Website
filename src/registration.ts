import { normalizeDigits } from './terms';

export const YEARS = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];

/** رقم موبايل مصري: 01 + (0/1/2/5) + 8 أرقام. يقبل +20 و0020 والأرقام الهندية، ويُرجع الصيغة 01xxxxxxxxx. فارغ = غير مسجل. */
export function validatePhone(
  input: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  let v = normalizeDigits(input).replace(/^\+/, '');
  if (!v) return { ok: true, value: null };
  if (v.startsWith('0020')) v = v.slice(4);
  else if (v.startsWith('20') && v.length === 12) v = v.slice(2);
  if (/^1[0125][0-9]{8}$/.test(v)) v = '0' + v;
  if (!/^01[0125][0-9]{8}$/.test(v))
    return { ok: false, error: 'رقم الموبايل المصري ١١ رقمًا ويبدأ بـ 01.' };
  return { ok: true, value: v };
}

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwertyui',
  'qwerty123',
  'qwertyuiop',
  'abcd1234',
  'abc12345',
  'iloveyou',
  'admin123',
  'admin1234',
  'welcome1',
  'letmein1',
  'student123',
  'suez2026',
  'suezcanal',
  'commerce123',
  '01234567',
  '0123456789',
]);
/** يرجع سبب رفض كلمة المرور الضعيفة، أو null لو مقبولة. (الطول يُفحص بشكل منفصل.) */
export function weakPasswordReason(password: string, ...personal: (string | null | undefined)[]) {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password))
    return 'كلمة المرور شائعة وسهلة التخمين. اختر كلمة أطول وأقل توقعًا.';
  for (const item of personal) {
    const part = String(item ?? '')
      .split('@')[0]
      .toLowerCase();
    if (part.length >= 4 && lower.includes(part))
      return 'لا تضع بريدك أو رقمك الجامعي داخل كلمة المرور.';
  }
  return null;
}
