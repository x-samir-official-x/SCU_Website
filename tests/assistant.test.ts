import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestActivity } from '../src/assistant';
import faculty from '../config/faculty.json';

const types = faculty.activityTypes;
const today = new Date(2026, 9, 28); // ٢٨ أكتوبر ٢٠٢٦
const run = (text: string) => suggestActivity(text, { types, today });

test('MSA sentence with explicit Arabic date and organization', () => {
  const s = run(
    'شاركت في حملة تشجير الحرم الجامعي يوم ١٥ أكتوبر ٢٠٢٦ مع فريق أصدقاء البيئة، وزرعنا ٥٠ شتلة.',
  );
  assert.equal(s.title, 'المشاركة في حملة تشجير الحرم الجامعي');
  assert.equal(s.category, 'نشاط بيئي');
  assert.equal(s.organization, 'فريق أصدقاء البيئة');
  assert.equal(s.activity_date, '2026-10-15');
  assert.ok(s.description.includes('زرعنا'));
  assert.deepEqual(s.notes, []);
});

test('Egyptian dialect with relative date', () => {
  const s = run('امبارح اشتركت في قافلة طبية مع جمعية الأورمان لتوزيع أدوية على أهالي القرية');
  assert.equal(s.activity_date, '2026-10-27');
  assert.equal(s.category, 'خدمة مجتمعية');
  assert.equal(s.organization, 'جمعية الأورمان');
  assert.ok(s.title.startsWith('المشاركة في قافلة'));
});

test('numeric dates: dd/mm/yyyy, ISO, and dd/mm without year', () => {
  assert.equal(
    run('تطوعت في توزيع بطاطين للمحتاجين يوم 3/10/2026 مع فريق الخير').activity_date,
    '2026-10-03',
  );
  assert.equal(
    run('نظمت ورشة عن الادخار بتاريخ 2026-09-20 مع نادي الاقتصاد').activity_date,
    '2026-09-20',
  );
  assert.equal(run('حضرت ندوة عن ريادة الأعمال يوم 12/10 في الكلية').activity_date, '2026-10-12');
});

test('Arabic-Indic digits and digit-words ("من ٣ أيام", "من يومين")', () => {
  assert.equal(
    run('تطوعت في تنظيف الشاطئ من ٣ أيام مع فريق البيئة والتشجير').activity_date,
    '2026-10-25',
  );
  assert.equal(run('تطوعت في تنظيف الشاطئ من يومين').activity_date, '2026-10-26');
  assert.equal(
    run('شاركت في مبادرة تنظيف النهاردة مع فريق طلاب الكلية').activity_date,
    '2026-10-28',
  );
});

test('a month later than today without a year rolls back to last year, with a note', () => {
  const s = run('شاركت في معرض الكتاب يوم 15 ديسمبر مع نادي القراءة');
  assert.equal(s.activity_date, '2025-12-15');
  assert.ok(s.notes.some((n) => n.includes('2025')));
});

test('future or invalid dates are never filled', () => {
  const future = run('شاركت في مؤتمر الشباب يوم 20 ديسمبر 2026 مع اتحاد الطلاب');
  assert.equal(future.activity_date, '');
  assert.ok(future.notes.some((n) => n.includes('المستقبل')));
  const bad = run('شاركت في ورشة يوم 31/02/2026 مع فريق الابتكار');
  assert.equal(bad.activity_date, '');
  assert.ok(bad.notes.some((n) => n.includes('غير صحيح')));
});

test('missing information is reported, not invented', () => {
  const s = run('عملت حاجة حلوة مع الجامعة');
  assert.equal(s.activity_date, '');
  assert.equal(s.category, '');
  assert.ok(s.notes.length >= 3);
  assert.ok(s.notes.some((n) => n.includes('تاريخ المشاركة')));
  assert.ok(run('اشتركت في حاجة').notes.some((n) => n.includes('٢٠ حرفًا')));
});

test('category is always one of the faculty types; unknown falls back to empty', () => {
  for (const text of [
    'نظمت ورشة عن الادخار والاستثمار للطلاب',
    'تبرعت بالدم في حملة كلية التجارة',
    'نظفنا الشاطئ وزرعنا شجر',
    'تطوعت في توزيع وجبات رمضان',
  ]) {
    const c = run(text).category;
    assert.ok(c === '' || types.includes(c), `${text} -> ${c}`);
  }
  assert.equal(run('نظمت ورشة عن الادخار والاستثمار للطلاب').category, 'مبادرة طلابية');
  assert.equal(run('تطوعت في توزيع وجبات رمضان على المحتاجين').category, 'عمل تطوعي');
});

test('tashkeel and tatweel do not break extraction; empty input is handled', () => {
  const s = run('شَارَكْتُ فِي حَمْلَةِ تَشْجِيرٍ يَوْمَ ١٥ أُكْتُوبَر مَعَ فَرِيقِ الْبِيئَةِ.');
  assert.equal(s.activity_date, '2026-10-15');
  assert.equal(s.category, 'نشاط بيئي');
  assert.deepEqual(run('   ').notes, ['اكتب ما فعلته أولًا.']);
});

test('output respects server limits (title<=120, description<=2000)', () => {
  const long = 'شاركت في ' + 'حملة كبيرة جدا '.repeat(100) + ' يوم 10/10/2026';
  const s = run(long);
  assert.ok(s.title.length <= 120);
  assert.ok(s.description.length <= 2000);
});
