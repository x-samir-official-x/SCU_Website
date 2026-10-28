// مطابقة نص الشهادة (الناتج عن القراءة الآلية) ببيانات الطلب.
// أداة مساعدة للموظف فقط: لا تعتمد ولا ترفض ولا تمنح درجة.

export type CheckStatus = 'match' | 'partial' | 'mismatch' | 'missing';

export interface CertificateCheck {
  field: 'name' | 'date' | 'organization' | 'title';
  label: string;
  status: CheckStatus;
  expected: string;
  detail: string;
}

export interface CertificateInput {
  name: string;
  date: string; // YYYY-MM-DD
  organization: string;
  title: string;
}

const fold = (s: string) =>
  s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .toLowerCase();

const tokens = (s: string) =>
  fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const STOP = new Set([
  'في',
  'من',
  'الي',
  'على',
  'عن',
  'مع',
  'ال',
  'و',
  'لل',
  'هذه',
  'هذا',
  'التي',
  'الذي',
  'كلية',
  'جامعة',
  'الطالب',
  'الطالبه',
  'شهاده',
  'شكر',
  'تقدير',
  'حضور',
  'مشاركه',
  'فعاليه',
  'نشاط',
  'حمله',
  'تنظيم',
  'بعنوان',
  'تحت',
  'رعايه',
]);

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

/** كلمة مطلوبة موجودة في النص؟ نسمح بخطأ حرف واحد في الكلمات الطويلة (أخطاء القراءة الآلية). */
function hasToken(pool: string[], word: string): boolean {
  return pool.some(
    (t) => t === word || (word.length >= 4 && t.length >= 3 && distance(t, word) <= 1),
  );
}

function ratioStatus(found: number, total: number): CheckStatus {
  if (total === 0) return 'missing';
  if (found === total) return 'match';
  if (found / total >= 0.5 && found >= 1) return 'partial';
  return found > 0 ? 'partial' : 'missing';
}

const MONTHS: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  اغسطس: 8,
  سبتمبر: 9,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

/** يستخرج كل التواريخ الصالحة الظاهرة في النص. */
export function findDates(text: string): string[] {
  const t = fold(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/g)) {
    const v = iso(+m[1], +m[2], +m[3]);
    if (v) out.add(v);
  }
  for (const m of t.matchAll(
    /(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?!\d)/g,
  )) {
    const v = iso(+m[3], +m[2], +m[1]);
    if (v) out.add(v);
  }
  const names = Object.keys(MONTHS).join('|');
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s+(${names})\\s*,?\\s*(\\d{4})`, 'g'))) {
    const v = iso(+m[3], MONTHS[m[2]], +m[1]);
    if (v) out.add(v);
  }
  return [...out].sort();
}

export function checkCertificate(text: string, input: CertificateInput): CertificateCheck[] {
  const pool = tokens(text);
  const checks: CertificateCheck[] = [];

  const nameWords = tokens(input.name).filter((w) => w.length >= 2);
  const nameFound = nameWords.filter((w) => hasToken(pool, w));
  const nameStatus = ratioStatus(nameFound.length, nameWords.length);
  checks.push({
    field: 'name',
    label: 'اسم الطالب',
    status: nameStatus,
    expected: input.name,
    detail:
      nameStatus === 'match'
        ? 'كل أجزاء الاسم ظاهرة في الشهادة.'
        : nameStatus === 'partial'
          ? `ظهر ${nameFound.length} من ${nameWords.length} أجزاء الاسم فقط.`
          : 'لم يظهر اسم الطالب في النص المقروء.',
  });

  const dates = findDates(text);
  const wanted = input.date;
  const dateStatus: CheckStatus = !dates.length
    ? 'missing'
    : dates.includes(wanted)
      ? 'match'
      : 'mismatch';
  checks.push({
    field: 'date',
    label: 'تاريخ النشاط',
    status: dateStatus,
    expected: wanted || '—',
    detail:
      dateStatus === 'match'
        ? 'تاريخ النشاط ظاهر في الشهادة.'
        : dateStatus === 'mismatch'
          ? `التواريخ الظاهرة في الشهادة: ${dates.join('، ')}.`
          : 'لم يُقرأ أي تاريخ في الشهادة.',
  });

  const orgWords = tokens(input.organization).filter((w) => w.length >= 3 && !STOP.has(w));
  const orgFound = orgWords.filter((w) => hasToken(pool, w));
  const orgStatus = ratioStatus(orgFound.length, orgWords.length);
  checks.push({
    field: 'organization',
    label: 'الجهة المنظمة',
    status: orgStatus,
    expected: input.organization,
    detail:
      orgStatus === 'match'
        ? 'اسم الجهة ظاهر في الشهادة.'
        : orgStatus === 'partial'
          ? 'ظهر جزء من اسم الجهة فقط.'
          : 'لم يظهر اسم الجهة في النص المقروء.',
  });

  const titleWords = tokens(input.title).filter((w) => w.length >= 3 && !STOP.has(w));
  const titleFound = titleWords.filter((w) => hasToken(pool, w));
  const titleStatus = ratioStatus(titleFound.length, titleWords.length);
  checks.push({
    field: 'title',
    label: 'اسم النشاط',
    status: titleStatus,
    expected: input.title,
    detail:
      titleStatus === 'match'
        ? 'كلمات عنوان النشاط ظاهرة في الشهادة.'
        : titleStatus === 'partial'
          ? `ظهرت ${titleFound.length} من ${titleWords.length} كلمات من العنوان.`
          : 'لم تظهر كلمات العنوان في النص المقروء.',
  });
  return checks;
}
