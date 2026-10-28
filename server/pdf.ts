import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import type { ActivityRequest, Faculty } from '../src/types';
import { browserExecutable } from './browser';

export const FORM_TEMPLATE_VERSION = 2;

interface Snapshot {
  student: { name: string; student_id: string; national_id?: string; year: string };
  request: ActivityRequest;
  faculty: Faculty;
  submittedAt: string;
  demo: boolean;
}
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export async function renderForm(snapshot: Snapshot) {
  const { student, request: r, faculty: f } = snapshot;
  const regular = readFileSync(
    new URL('../public/fonts/Tajawal-Regular.ttf', import.meta.url),
  ).toString('base64');
  const bold = readFileSync(new URL('../public/fonts/Tajawal-Bold.ttf', import.meta.url)).toString(
    'base64',
  );
  const identities = readFileSync(
    new URL('../public/brand/scu-commerce-identities.png', import.meta.url),
  ).toString('base64');
  const field = (label: string, value: string) =>
    `<div class="field"><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>استمارة النشاط الطلابي — ${r.id}</title><style>
    @font-face{font-family:Arabic;src:url(data:font/ttf;base64,${regular})} @font-face{font-family:Arabic;src:url(data:font/ttf;base64,${bold});font-weight:700}
    *{box-sizing:border-box} body{font-family:Arabic,sans-serif;color:#183451;font-size:12px;line-height:1.65;margin:0}
    header{border-bottom:2px solid #102b50;padding-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:18px}
    .identities{width:130px;height:auto;object-fit:contain}.institution{flex:1}.institution strong{font-size:17px}.institution span{font-size:12px;display:block;color:#5b6e88}
    h1{font-size:23px;margin:24px 0 8px} h2{font-size:14px;margin:18px 0 10px} p{margin:6px 0}
    .muted,small{color:#5c6e85} .badge{border:1px solid #d8e2ef;padding:8px 12px;border-radius:5px;font-size:11px}
    .notice{background:#f1f5fc;padding:12px;border-right:3px solid #3762a0;margin:18px 0}
    .grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe5e0}
    .field{padding:12px;border-bottom:1px solid #e4e9e5;min-height:63px}small,strong{display:block}
    .description{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dfe5e0;padding:14px;min-height:100px}
    .signatures{display:flex;gap:20px;margin-top:30px}.signatures div{flex:1;border-top:1px dashed #aab7af;padding-top:9px}
    footer{margin-top:28px;border-top:1px solid #dfe5e0;padding-top:12px;font-size:9px;color:#6b7771}
  </style><body><header><img class="identities" src="data:image/png;base64,${identities}" alt="شعار الجامعة والكلية"><div class="institution"><strong>جامعة قناة السويس</strong><span>${escape(f.faculty)}</span><span>بوابة النشاط الطلابي</span></div><div class="badge">رقم الطلب: ACT-${r.id.toString().padStart(5, '0')}<br>الإصدار: ${r.version}</div></header>
  <h1>استمارة تقديم النشاط الطلابي</h1><p class="muted">${escape(f.period)}</p>
  <div class="notice">${snapshot.demo ? '<strong>نسخة تجريبية — لا تصلح للاعتماد الرسمي</strong>' : ''}هذه الاستمارة تثبت تقديم الطلب فقط. اعتماد النشاط واحتساب الدرجة يستلزمان مراجعة الموظف المختص.</div>
  <h2>أولًا: بيانات الطالب</h2><div class="grid">${field('اسم الطالب', student.name)}${student.student_id ? field('الرقم الجامعي', student.student_id) : field('الرقم القومي', student.national_id ?? '')}${field('الفرقة الدراسية', student.year)}${field('الكلية', f.faculty)}</div>
  <h2>ثانيًا: بيانات النشاط</h2><div class="grid">${field('اسم النشاط', r.title)}${field('نوع النشاط', r.category)}${field('الجهة المنظمة', r.organization)}${field('تاريخ النشاط', r.activity_date)}</div>
  <h2>وصف المشاركة</h2><div class="description">${escape(r.description)}</div>
  <p style="margin-top:14px">أقر بأن البيانات المقدمة صحيحة، وأتحمل مسؤولية المستندات المرفقة بالطلب.</p>
  <div class="signatures"><div>توقيع الطالب<br><br>................................</div><div>مراجعة الموظف المختص<br><br>................................</div><div>التاريخ<br><br>................................</div></div>
  <footer>تاريخ التقديم: ${escape(new Date(snapshot.submittedAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }))}<br>${escape(f.office)} — تُطابق هذه الاستمارة بالطلب المسجل إلكترونيًا.</footer>
  </body></html>`;
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '17mm', bottom: '15mm', left: '17mm' },
    });
  } finally {
    await browser.close();
  }
}
