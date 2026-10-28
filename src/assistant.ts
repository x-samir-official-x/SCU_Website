/**
 * مساعد الاستمارة المحلي.
 * يقرأ وصف الطالب بكلماته (فصحى أو عامية) ويقترح تعبئة حقول الاستمارة.
 * - يعمل بالكامل داخل المتصفح بقواعد نصية: لا يرسل كلام الطالب لأي جهة خارجية، ولا يحتاج اتصالًا.
 * - لا يخترع معلومة: ما لم يجده يتركه فارغًا ويقول ذلك، والطالب هو من يراجع ويؤكد.
 */
import { normalizeDigits } from './terms';

export interface Suggestion {
  title: string;
  category: string;
  organization: string;
  activity_date: string;
  description: string;
  /** ما لم يستطع المساعد تحديده، أو ما يحتاج انتباه الطالب */
  notes: string[];
}

// تطبيع ١:١ (لا يغيّر الأطوال) لتتطابق المواضع مع النص الأصلي.
const fold = (s: string) =>
  s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
const clean = (s: string) =>
  s
    .replace(/[ً-ْـ]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

const NB = '(?<![\\u0600-\\u06FF])'; // لا حرف عربي قبله
const NA = '(?![\\u0600-\\u06FF])'; // ولا بعده
const MONTHS: [number, string][] = [
  [1, `(?:يناير|كانون\\s+(?:ال)?ثاني)`],
  [2, `(?:فبراير|شباط)`],
  [3, `(?:مارس|اذار)`],
  [4, `(?:ابريل|نيسان)`],
  [5, `(?:مايو|ايار)`],
  [6, `(?:يونيو|يونيه|حزيران)`],
  [7, `(?:يوليو|يوليه|تموز)`],
  [8, `(?:اغسطس|${NB}اب${NA})`],
  [9, `(?:سبتمبر|ايلول)`],
  [10, `(?:اكتوبر|تشرين\\s+(?:ال)?اول)`],
  [11, `(?:نوفمبر|تشرين\\s+(?:ال)?ثاني)`],
  [12, `(?:ديسمبر|كانون\\s+(?:ال)?اول)`],
];
const monthAlt = MONTHS.map(([, p]) => p).join('|');
const monthOf = (word: string) => MONTHS.find(([, p]) => new RegExp(`^(?:${p})$`).test(word))?.[0];

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const todayIso = (today: Date) => iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
function shiftDays(today: Date, days: number) {
  const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
const NUMBER_WORDS: Record<string, number> = {
  يومين: 2,
  تلات: 3,
  ثلاث: 3,
  ثلاثه: 3,
  اربع: 4,
  اربعه: 4,
  خمس: 5,
  خمسه: 5,
  ست: 6,
  سته: 6,
  سبع: 7,
  سبعه: 7,
};

function findDate(m: string, today: Date, notes: string[]): string {
  const now = todayIso(today);
  const finish = (y: number, mo: number, d: number, yearGiven: boolean) => {
    if (!validDate(y, mo, d)) {
      notes.push('التاريخ المكتوب غير صحيح، اكتبه بنفسك.');
      return '';
    }
    let date = iso(y, mo, d);
    if (date > now && !yearGiven) {
      // «١٥ ديسمبر» قيلت في أكتوبر: غالبًا السنة الماضية
      if (validDate(y - 1, mo, d)) date = iso(y - 1, mo, d);
      notes.push(`افترضت أن السنة ${y - 1}. راجع التاريخ.`);
    }
    if (date > now) {
      notes.push(
        'التاريخ الذي ذكرته في المستقبل، ولا يمكن تقديم نشاط لم يحدث بعد. اكتب تاريخ المشاركة الفعلي.',
      );
      return '';
    }
    return date;
  };
  let r: RegExpMatchArray | null;
  if ((r = m.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/)))
    return finish(+r[1], +r[2], +r[3], true);
  if ((r = m.match(/(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})(?!\d)/)))
    return finish(+r[3], +r[2], +r[1], true);
  const named = new RegExp(
    `(?<!\\d)(\\d{1,2})\\s*(?:من\\s+)?(?:شهر\\s+)?(${monthAlt})(?:\\s*(?:من\\s+)?(?:عام\\s+|سنه\\s+)?(\\d{4}))?(?!\\d)`,
  );
  if ((r = m.match(named))) {
    const mo = monthOf(r[2].replace(/\s+/g, ' '));
    if (mo) return finish(r[3] ? +r[3] : today.getFullYear(), mo, +r[1], Boolean(r[3]));
  }
  if ((r = m.match(/(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/)))
    return finish(today.getFullYear(), +r[2], +r[1], false);
  // تعبيرات نسبية
  if (new RegExp(`${NB}(?:اول\\s+)(?:امبارح|امس|الامس)${NA}`).test(m)) return shiftDays(today, 2);
  if (new RegExp(`${NB}(?:امبارح|امس|الامس)${NA}`).test(m)) return shiftDays(today, 1);
  if (new RegExp(`${NB}(?:النهارده|النهاردا|اليوم)${NA}`).test(m)) return now;
  if ((r = m.match(/من\s+(\d{1,2}|[؀-ۿ]+)\s+(?:ايام|يوم)/))) {
    const n = /^\d+$/.test(r[1]) ? +r[1] : NUMBER_WORDS[r[1]];
    if (n && n <= 60) return shiftDays(today, n);
  }
  if (new RegExp(`من\\s+يومين${NA}`).test(m)) return shiftDays(today, 2);
  if (new RegExp(`من\\s+اسبوعين${NA}`).test(m)) return shiftDays(today, 14);
  if (new RegExp(`(?:من\\s+اسبوع|الاسبوع\\s+(?:اللي\\s+فات|الماضي|الفايت))${NA}`).test(m))
    return shiftDays(today, 7);
  notes.push('لم أجد تاريخ المشاركة (مثل «يوم ١٥ أكتوبر»)، اكتبه بنفسك.');
  return '';
}

// كلمات دالة على نوع النشاط، مرتبة بحسب الأولوية عند التعادل.
const CATEGORY_WORDS: [string, string[]][] = [
  [
    'نشاط بيئي',
    ['تشجير', 'شجر', 'زراع', 'نظافه', 'تنظيف', 'بيئ', 'شاطي', 'تدوير', 'نفايات', 'مخلفات', 'اخضر'],
  ],
  [
    'خدمة مجتمعية',
    [
      'قافله',
      'خدمه مجتمع',
      'دار ايتام',
      'دار الايتام',
      'مسنين',
      'ملجا',
      'محو اميه',
      'توعيه صحي',
      'حمله صحي',
      'تبرع بالدم',
      'قرييه',
      'قرية',
      'احتياجات خاصه',
    ],
  ],
  ['عمل تطوعي', ['تطوع', 'متطوع', 'توزيع', 'تبرع', 'كفاله', 'مساعده']],
  [
    'مبادرة طلابية',
    [
      'مبادر',
      'ورشه',
      'ندوه',
      'مؤتمر',
      'مسابقه',
      'محاضر',
      'تنظيم',
      'اتحاد طلاب',
      'نادي',
      'فعاليه',
      'معرض',
      'يوم توعيه',
    ],
  ],
];
function findCategory(m: string, types: string[], notes: string[]): string {
  let best = '';
  let bestScore = 0;
  for (const [name, words] of CATEGORY_WORDS) {
    if (!types.includes(name)) continue;
    const score = words.reduce((n, w) => n + (m.includes(fold(w)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  if (best) return best;
  notes.push('لم أستطع تحديد نوع النشاط، اختره من القائمة.');
  return '';
}

const ORG_KINDS =
  'فريق|نادي|جمعيه|مبادره|مؤسسه|اتحاد|مركز|وحده|لجنه|كليه|جامعه|اسره|مستشفي|بنك|بيت|حمله|مجموعه|منظمه';
const ORG_STOP = new Set([
  'في',
  'يوم',
  'بتاريخ',
  'لمده',
  'علي',
  'على',
  'من',
  'الي',
  'الى',
  'عن',
  'خلال',
  'ب',
  'و',
  'ومن',
  'وكان',
  'وده',
  'ودي',
  'اللي',
  'حيث',
  'كان',
  'وقد',
  'فى',
]);
function findOrganization(raw: string, m: string, notes: string[]): string {
  const re = new RegExp(
    `(?:مع|ضمن|تحت\\s+اشراف|بتنظيم|من\\s+تنظيم|تنظيم|عن\\s+طريق|تبع|بدعوه\\s+من)\\s+(${ORG_KINDS})(?=\\s)`,
    'g',
  );
  let best = '';
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m))) {
    const start = hit.index + hit[0].length - hit[1].length;
    const words = raw.slice(start).split(/\s+/);
    const picked: string[] = [];
    for (const [i, w] of words.entries()) {
      const bare = w.replace(/[،,.؛:!؟?]+$/, '');
      // نتوقف عند حروف الجر الدالة على غرض (لتوزيع، لتنظيف…) أو التاريخ أو كلمات الربط
      if (
        i > 0 &&
        (ORG_STOP.has(fold(bare)) || /^\d/.test(bare) || /^لت[\u0600-\u06FF]{3,}$/.test(bare))
      )
        break;
      picked.push(bare);
      if (/[،,.؛:!؟?]$/.test(w) || picked.length >= 5) break;
    }
    // نحتاج الاسم بعد النوع (فريق + اسم) على الأقل
    if (picked.length >= 2) {
      best = picked.join(' ');
      break;
    }
  }
  if (!best) notes.push('لم أجد الجهة المنظمة (مثل «مع فريق ...»)، اكتبها بنفسك.');
  return best;
}

const PARTICIPATE = 'شاركت|اشتركت|ساهمت|شاركنا|اشتركنا|ساهمنا';
function findTitle(raw: string, m: string, notes: string[]): string {
  const re = new RegExp(
    `(${PARTICIPATE}|تطوعت|تطوعنا|نظمت|نظمنا|حضرت|حضرنا|قمت|قمنا|عملت|عملنا)\\s+(?:في\\s+|ب|بال)?(?!${NB}(?:ال)?(?:نهارده|يوم)${NA})`,
  );
  const hit = re.exec(m);
  let title = '';
  if (hit) {
    const verb = hit[1];
    let rest = raw.slice(hit.index + hit[0].length);
    // نقطع عند أول فاصل يبدأ معلومة أخرى (تاريخ/جهة/مكان زمني)
    const cut = rest.search(
      new RegExp(
        `(?:\\s+(?:يوم|مع|بتاريخ|في\\s+(?:يوم|\\d)|خلال|لمده|وكان|وده|ودي|اللي|حيث|\\d{1,2}\\s*(?:[/\\-]|${monthAlt})|(?:النهارده|امبارح|امس))${NA})|[،,.؛\\n]`,
      ),
    );
    if (cut > 0) rest = rest.slice(0, cut);
    rest = rest.trim();
    if (rest.length >= 3) {
      const prefix = new RegExp(`^(?:${PARTICIPATE})$`).test(verb)
        ? 'المشاركة في '
        : /^(?:تطوعت|تطوعنا)$/.test(verb)
          ? 'التطوع في '
          : /^(?:نظمت|نظمنا)$/.test(verb)
            ? 'تنظيم '
            : /^(?:حضرت|حضرنا)$/.test(verb)
              ? 'حضور '
              : '';
      title = prefix + rest;
    }
  }
  if (!title) {
    const first = raw
      .split(/[.،\n]/)[0]
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(' ');
    title = first;
    if (first) notes.push('اقترحت عنوانًا من أول كلامك. عدّله ليصف النشاط بوضوح.');
  }
  title = title.slice(0, 120).trim();
  if (title.length < 5) {
    notes.push('لم أستطع كتابة عنوان مناسب، اكتب اسم النشاط بنفسك.');
    return '';
  }
  return title;
}

export function suggestActivity(
  text: string,
  options: { types: string[]; today?: Date },
): Suggestion {
  const notes: string[] = [];
  const raw = clean(text);
  const m = fold(raw);
  const today = options.today ?? new Date();
  const description = raw.slice(0, 2000);
  if (description.length < 20)
    notes.push('اكتب وصفًا أطول قليلًا (٢٠ حرفًا على الأقل) ليكون مقبولًا في الاستمارة.');
  return {
    title: raw ? findTitle(raw, m, notes) : '',
    category: raw ? findCategory(m, options.types, notes) : '',
    organization: raw ? findOrganization(raw, m, notes) : '',
    activity_date: raw ? findDate(m, today, notes) : '',
    description,
    notes: raw ? notes : ['اكتب ما فعلته أولًا.'],
  };
}

// يستخدمه الاختبار لضمان أن التطبيع لا يغيّر الأطوال
export const _internal = { fold, clean, normalizeDigits };
