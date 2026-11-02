import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits } from '../src/terms';
import {
  parseRosterCsv,
  validateRosterRow,
  normalizeYear,
  isPlaceholderEmail,
  NO_EMAIL_DOMAIN,
} from '../src/roster';

test('digits are normalized from Arabic-Indic and separators', () => {
  assert.equal(normalizeDigits(' ٢٠٢٦-١٢٣٤ '), '20261234');
  assert.equal(normalizeDigits('٢٩٩٠١٠١١٢٣٤٥٦٧'), '29901011234567');
});

test('roster row: national ID is required, university ID optional', () => {
  const ok = validateRosterRow({ name: 'منى إبراهيم', national_id: '٢٩٩٠١٠١١٢٣٤٥٦٧', year: '2' });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.national_id, '29901011234567');
    assert.equal(ok.value.student_id, null);
    assert.equal(ok.value.year, 'الفرقة الثانية');
  }
  assert.equal(validateRosterRow({ name: 'من', national_id: '29901011234567' }).ok, false);
  assert.equal(validateRosterRow({ name: 'منى إبراهيم', national_id: '123' }).ok, false);
  assert.equal(
    validateRosterRow({ name: 'منى إبراهيم', national_id: '29901011234567', student_id: '12' }).ok,
    false,
  );
  // Excel يحوّل الأرقام الطويلة إلى صيغة علمية
  const sci = validateRosterRow({ name: 'منى إبراهيم', national_id: '2.99E+13' });
  assert.equal(sci.ok, false);
});

test('year normalization accepts digits and Arabic words', () => {
  assert.equal(normalizeYear('1'), 'الفرقة الأولى');
  assert.equal(normalizeYear('الفرقة الثالثة'), 'الفرقة الثالثة');
  assert.equal(normalizeYear('رابعة'), 'الفرقة الرابعة');
  assert.equal(normalizeYear('تمهيدي'), null);
  assert.equal(normalizeYear(''), null);
});

test('roster CSV: Arabic headers, BOM, quotes, semicolons, duplicates and bad rows', () => {
  const csv =
    '﻿الاسم;الرقم القومي;الرقم الجامعي;الفرقة\n' +
    '"منى، إبراهيم السيد";29901011234567;20261234;الفرقة الثانية\n' +
    'كريم حسن عبد الله;٣٠٣١١١٢١٢٠٠١٧٢٠;;3\n' +
    'كريم حسن عبد الله;30311121200172;;3\n' +
    'سارة علي حسن;30311121200172;;3\n' +
    'ناقص;123;;1\n';
  const out = parseRosterCsv(csv);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].name, 'منى، إبراهيم السيد');
  assert.equal(out.rows[1].student_id, null);
  assert.equal(out.errors.length, 3);
  assert.deepEqual(
    out.errors.map((e) => e.line),
    [3, 5, 6],
  );
  assert.match(parseRosterCsv('a,b\n1,2').errors[0].error, /القومي/);
  assert.match(parseRosterCsv('الاسم,x\n1,2').errors[0].error, /القومي/);
  assert.equal(parseRosterCsv('').rows.length, 0);
});

test('placeholder emails are recognised', () => {
  assert.ok(isPlaceholderEmail(`29901011234567@${NO_EMAIL_DOMAIN}`));
  assert.ok(!isPlaceholderEmail('mona@example.test'));
  assert.ok(!isPlaceholderEmail(''));
});
