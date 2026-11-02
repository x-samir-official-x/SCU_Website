import type { DatabaseSync } from 'node:sqlite';
import { hashPassword, now } from '../server/db';
import { TERMS_VERSION, normalizeDigits } from '../src/terms';

export interface StudentSeed {
  name: string;
  email: string;
  password: string;
  year?: string;
  student_id?: string | null;
  national_id?: string | null;
  phone?: string | null;
}

/**
 * يُنشئ حساب طالب مفعّلًا بكلمة مرور وبريد مباشرةً في القاعدة ثم يسجّل دخوله.
 * (التسجيل المفتوح أُلغي؛ هذه الأداة لاختبارات تحتاج طالبًا جاهزًا فقط.)
 */
export async function seedStudent(
  db: DatabaseSync,
  login: (email: string, password: string) => Promise<Response>,
  s: StudentSeed,
): Promise<Response> {
  db.prepare(
    "INSERT INTO users (name,email,password_hash,role,student_id,national_id,year,created_at,terms_version,terms_accepted_at,phone) VALUES (?,?,?,'student',?,?,?,?,?,?,?)",
  ).run(
    s.name,
    s.email.toLowerCase(),
    hashPassword(s.password),
    s.student_id ? normalizeDigits(s.student_id) : null,
    s.national_id ? normalizeDigits(s.national_id) : null,
    s.year ?? 'الفرقة الثانية',
    now(),
    TERMS_VERSION,
    now(),
    s.phone ?? null,
  );
  return login(s.email, s.password);
}
