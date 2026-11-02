import { normalizeDigits } from './terms';
import { YEARS } from './registration';

/** سجل الكلية: من يحق له تفعيل حساب. الرقم القومي هو المفتاح (إلزامي)، والجامعي اختياري. */
export interface RosterRow {
  national_id: string;
  student_id: string | null;
  name: string;
  year: string | null;
}

/** حسابات الطلاب المفعّلة بالرقم القومي لا تحمل بريدًا؛ نحفظ عنوانًا وهميًا غير قابل للإرسال. */
export const NO_EMAIL_DOMAIN = 'no-email.invalid';
export const isPlaceholderEmail = (email: string | null | undefined) =>
  String(email ?? '')
    .toLowerCase()
    .endsWith(`@${NO_EMAIL_DOMAIN}`);

const ARABIC_YEARS: [RegExp, number][] = [
  [/(^|\s)(الاولي|الأولى|الاولى|الأولي|اولى|اولي|first|1st)(\s|$)/i, 0],
  [/(^|\s)(الثانيه|الثانية|ثانيه|ثانية|second|2nd)(\s|$)/i, 1],
  [/(^|\s)(الثالثه|الثالثة|ثالثه|ثالثة|third|3rd)(\s|$)/i, 2],
  [/(^|\s)(الرابعه|الرابعة|رابعه|رابعة|fourth|4th)(\s|$)/i, 3],
];
export function normalizeYear(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (YEARS.includes(raw)) return raw;
  const digit = normalizeDigits(raw);
  if (/^[1-4]$/.test(digit)) return YEARS[Number(digit) - 1];
  for (const [re, i] of ARABIC_YEARS) if (re.test(raw)) return YEARS[i];
  return null;
}

export function validateRosterRow(
  raw: Record<string, unknown>,
): { ok: true; value: RosterRow } | { ok: false; error: string } {
  const name = String(raw.name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const rawNational = String(raw.national_id ?? '').trim();
  if (/e\+?\d+/i.test(rawNational))
    return { ok: false, error: 'الرقم القومي بصيغة علمية (Excel). نسّق العمود كنص ثم صدّره.' };
  const national = normalizeDigits(rawNational);
  const student = normalizeDigits(raw.student_id);
  if (name.length < 3 || name.length > 100) return { ok: false, error: 'الاسم من ٣ إلى ١٠٠ حرف.' };
  if (!/^[0-9]{14}$/.test(national)) return { ok: false, error: 'الرقم القومي ١٤ رقمًا.' };
  if (student && !/^[0-9]{4,20}$/.test(student))
    return { ok: false, error: 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.' };
  return {
    ok: true,
    value: {
      name,
      national_id: national,
      student_id: student || null,
      year: normalizeYear(raw.year),
    },
  };
}

/** يقرأ CSV (فاصلة أو فاصلة منقوطة أو Tab، مع علامات اقتباس وBOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ',',
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const HEADERS: Record<keyof RosterRow, string[]> = {
  name: ['name', 'full name', 'الاسم', 'اسم الطالب', 'اسم'],
  national_id: [
    'national_id',
    'national id',
    'nationalid',
    'nid',
    'الرقم القومي',
    'الرقم القومى',
    'رقم قومي',
    'رقم قومى',
    'الرقم القومي للطالب',
  ],
  student_id: [
    'student_id',
    'student id',
    'university_id',
    'id',
    'الرقم الجامعي',
    'الرقم الجامعى',
    'رقم جامعي',
    'كود الطالب',
    'الكود',
    'رقم الكارنيه',
  ],
  year: ['year', 'level', 'الفرقة', 'الفرقه', 'السنة', 'السنه', 'المستوى'],
};

export function parseRosterCsv(text: string): {
  rows: RosterRow[];
  errors: { line: number; error: string }[];
} {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: [{ line: 1, error: 'الملف فارغ.' }] };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  const index = (key: keyof RosterRow) => header.findIndex((h) => HEADERS[key].includes(h));
  const col = {
    name: index('name'),
    national_id: index('national_id'),
    student_id: index('student_id'),
    year: index('year'),
  };
  if (col.national_id < 0)
    return { rows: [], errors: [{ line: 1, error: 'لم أجد عمود «الرقم القومي» في الصف الأول.' }] };
  if (col.name < 0)
    return { rows: [], errors: [{ line: 1, error: 'لم أجد عمود «الاسم» في الصف الأول.' }] };
  const rows: RosterRow[] = [];
  const errors: { line: number; error: string }[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const get = (c: number) => (c >= 0 ? (cells[c] ?? '') : '');
    const parsed = validateRosterRow({
      name: get(col.name),
      national_id: get(col.national_id),
      student_id: get(col.student_id),
      year: get(col.year),
    });
    if (!parsed.ok) return void errors.push({ line: i + 2, error: parsed.error });
    if (seen.has(parsed.value.national_id))
      return void errors.push({ line: i + 2, error: 'الرقم القومي مكرر في الملف.' });
    seen.add(parsed.value.national_id);
    rows.push(parsed.value);
  });
  return { rows, errors };
}

export const ROSTER_TEMPLATE =
  '﻿الاسم,الرقم القومي,الرقم الجامعي,الفرقة\nاسم الطالب الثلاثي,29901011234567,20261234,الفرقة الثانية\n';
