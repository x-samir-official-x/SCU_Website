import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import type { ActivityRequest, Faculty } from '../src/types';
import { browserExecutable } from './browser';

export const FORM_TEMPLATE_VERSION = 3;

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
    *{box-sizing:border-box;-webkit-print-color-adjust:exact} body{font-family:Arabic,sans-serif;color:#0c1f3f;font-size:12px;line-height:1.65;margin:0}
    .top{background:linear-gradient(135deg,#061629,#102b50 60%,#1a3d70);color:#fff;border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:18px;border-bottom:3px solid #e0c185}
    .identities{width:132px;height:auto;object-fit:contain;background:#fff;border-radius:8px;padding:5px 8px}
    .institution{flex:1}.institution b{display:block;font-size:24px;line-height:1.3;padding:2px 0}.institution span{display:block;font-size:12px;color:#cfe0ff}
    .institution i{font-style:normal;color:#e0c185;font-size:11px}
    .badge{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);padding:8px 12px;border-radius:8px;font-size:11px;text-align:center;line-height:1.7}.badge b{display:block;font-size:14px;color:#e0c185;direction:ltr}
    h1{font-size:22px;margin:22px 0 4px;color:#102b50} h2{font-size:13.5px;margin:18px 0 8px;color:#102b50;display:flex;align-items:center;gap:8px}h2:before{content:"";width:4px;height:15px;background:#e0c185;border-radius:2px}p{margin:6px 0}
    .muted,small{color:#5c6e85}
    .notice{background:#e8f0ff;padding:11px 14px;border-right:3px solid #235ce3;border-radius:6px;margin:14px 0}.notice.demo strong{display:block;color:#a32020}
    .grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dce5f2;border-radius:8px;overflow:hidden}
    .field{padding:11px 14px;border-bottom:1px solid #e7edf6;min-height:60px}.field:nth-child(odd){border-left:1px solid #e7edf6}small,strong{display:block}small{font-size:10.5px}
    .description{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dce5f2;border-radius:8px;padding:14px;min-height:100px;background:#fafcff}
    .signatures{display:flex;gap:20px;margin-top:30px}.signatures div{flex:1;border-top:1px dashed #9aa9bf;padding-top:9px}
    footer{margin-top:28px;border-top:1px solid #dce5f2;padding-top:12px;font-size:9.5px;color:#6b7a90}
  </style><body><div class="top"><img class="identities" src="data:image/png;base64,${identities}" alt="شعار الجامعة والكلية"><div class="institution"><b>${escape(f.platformName || f.brand)}</b>${f.platformName ? `<i>${escape(f.brand)}</i>` : ""}<span>جامعة قناة السويس — ${escape(f.faculty)}</span></div><div class="badge">رقم الطلب<b>ACT-${r.id.toString().padStart(5, '0')}</b>الإصدار ${r.version}</div></div>
  <h1>استمارة تقديم النشاط الطلابي</h1><p class="muted">${escape(f.period)}</p>
  <div class="notice${snapshot.demo ? " demo" : ""}">${snapshot.demo ? '<strong>نسخة تجريبية — لا تصلح للاعتماد الرسمي</strong>' : ''}هذه الاستمارة تثبت تقديم الطلب فقط. اعتماد النشاط واحتساب الدرجة يستلزمان مراجعة الموظف المختص.</div>
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
