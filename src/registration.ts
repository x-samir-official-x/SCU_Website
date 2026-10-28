import { TERMS_VERSION, normalizeDigits } from './terms';

export const YEARS = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];

export interface RegistrationValue {
  name: string;
  email: string;
  password: string;
  year: string;
  student_id: string | null;
  national_id: string | null;
  terms_version: string;
}

/**
 * قواعد إنشاء حساب الطالب (واحدة للخادم ولاختباراتها):
 * - الرقم الجامعي أو الرقم القومي: يكفي واحد منهما، ويجوز الاثنان.
 * - الموافقة على الشروط إلزامية.
 */
export function validateRegistration(
  input: Record<string, unknown>,
): { ok: true; value: RegistrationValue } | { ok: false; error: string } {
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase();
  const password = String(input.password ?? '');
  const studentId = normalizeDigits(input.student_id);
  const nationalId = normalizeDigits(input.national_id);
  const fail = (error: string) => ({ ok: false as const, error });
  if (name.length < 3 || name.length > 100) return fail('اكتب اسمًا من ٣ إلى ١٠٠ حرف.');
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail('راجع البريد الإلكتروني.');
  if (!studentId && !nationalId)
    return fail('اكتب الرقم الجامعي (على الكارنيه) أو الرقم القومي. يكفي واحد منهما.');
  if (studentId && !/^[0-9]{4,20}$/.test(studentId))
    return fail('الرقم الجامعي من ٤ إلى ٢٠ رقمًا.');
  if (nationalId && !/^[0-9]{14}$/.test(nationalId)) return fail('الرقم القومي ١٤ رقمًا.');
  if (password.length < 8 || password.length > 100) return fail('كلمة المرور من ٨ إلى ١٠٠ حرف.');
  if (!YEARS.includes(String(input.year))) return fail('اختر الفرقة الدراسية.');
  if (input.accepted_terms !== true && input.accepted_terms !== 'on')
    return fail('يجب الموافقة على الشروط لإنشاء الحساب.');
  return {
    ok: true,
    value: {
      name,
      email,
      password,
      year: String(input.year),
      student_id: studentId || null,
      national_id: nationalId || null,
      terms_version: TERMS_VERSION,
    },
  };
}
