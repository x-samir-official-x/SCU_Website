import nodemailer from 'nodemailer';

export interface Transport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: { filename: string; path: string; cid: string; contentDisposition: 'inline' }[];
  }): Promise<unknown>;
}
export interface Mailer {
  from: string;
  transport: Transport;
}

/**
 * يقرأ إعدادات SMTP من البيئة. الإرسال معطّل (null) ما لم يُضبط SMTP_HOST و MAIL_FROM.
 * يعمل مع أي مزود (Gmail بكلمة مرور تطبيق، Brevo، Resend، SendGrid، أو بريد الجامعة)؛
 * الانتقال بين المزودين يتم بتغيير الإعدادات فقط.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return null;
  const port = Number(env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return { from: env.MAIL_FROM, transport };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** معرّف الصورة المضمّنة (CID) لشعاري الكلية والجامعة؛ تُرفق عند الإرسال فتظهر دون حظر الصور الخارجية. */
export const LOGO_CID = 'athar-logos@scu';

export interface EmailBrand {
  platform: string;
  tagline?: string;
  faculty?: string;
  university?: string;
}

/**
 * قالب بريد عربي (يمين لليسار) مبني بجداول وأنماط مضمّنة ليعمل في Gmail وOutlook والجوال.
 * الترويسة: شعارا الكلية والجامعة، ثم اسم الموقع وعنوانه الفرعي. لا يحتوي بيانات الطلب، فقط رابطًا للموقع.
 */
export function renderEmail(opts: {
  platform: string;
  tagline?: string;
  faculty?: string;
  university?: string;
  heading: string;
  lines: string[];
  button?: { label: string; url: string };
  notice?: string;
  footer?: string;
}): { text: string; html: string } {
  const org = [opts.faculty, opts.university].filter(Boolean).join(' | ');
  const text = [
    opts.heading,
    '',
    ...opts.lines,
    ...(opts.notice ? ['', opts.notice] : []),
    ...(opts.button ? ['', `${opts.button.label}: ${opts.button.url}`] : []),
    ...(opts.footer ? ['', opts.footer] : []),
    '',
    `— ${opts.platform}${opts.tagline ? ` | ${opts.tagline}` : ''}`,
    ...(org ? [org] : []),
  ].join('\n');
  const font = "Tahoma,'Segoe UI',Arial,sans-serif";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#eef2f9;font-family:${font};color:#0c1f3f">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f9">${esc(opts.lines[0] ?? opts.heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d9e2f1">
<tr><td align="center" style="background:#ffffff;padding:26px 24px 18px">
<img src="cid:${LOGO_CID}" width="280" alt="شعارا ${esc(opts.faculty ?? '')} و${esc(opts.university ?? '')}" style="display:block;width:280px;max-width:100%;height:auto;border:0;margin:0 auto">
</td></tr>
<tr><td align="center" style="background:#102b50;padding:22px 24px 20px">
<div style="font-size:34px;line-height:1.3;font-weight:bold;color:#ffffff;font-family:${font}">${esc(opts.platform)}</div>
${opts.tagline ? `<div style="margin-top:4px;font-size:15px;color:#cfe0ff">${esc(opts.tagline)}</div>` : ''}
${org ? `<div style="margin-top:10px;font-size:12px;color:#9fb6de">${esc(org)}</div>` : ''}
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:#235ce3">&nbsp;</td></tr>
<tr><td style="padding:30px 32px 8px;text-align:right">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.5;color:#102b50;font-family:${font}">${esc(opts.heading)}</h1>
${opts.lines.map((l) => `<p style="margin:0 0 12px;line-height:2;font-size:15px;color:#1b2f52">${esc(l)}</p>`).join('\n')}
${opts.notice ? `<div style="margin:16px 0 4px;padding:12px 14px;background:#fff6e0;border:1px solid #f0d58a;border-radius:10px;font-size:14px;line-height:1.9;color:#5a4300">${esc(opts.notice)}</div>` : ''}
</td></tr>
${
  opts.button
    ? `<tr><td align="center" style="padding:14px 32px 6px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#235ce3" style="background:#235ce3;border-radius:12px"><a href="${esc(opts.button.url)}" style="display:inline-block;padding:14px 38px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:${font}">${esc(opts.button.label)}</a></td></tr></table>
</td></tr>
<tr><td style="padding:10px 32px 0;text-align:right;font-size:12px;color:#5b6b84;line-height:1.8">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:
<div dir="ltr" style="text-align:left;word-break:break-all;color:#235ce3;margin-top:4px">${esc(opts.button.url)}</div></td></tr>`
    : ''
}
${opts.footer ? `<tr><td style="padding:18px 32px 0;text-align:right;font-size:13px;color:#5b6b84;line-height:1.9">${esc(opts.footer)}</td></tr>` : ''}
<tr><td style="padding:26px 32px 24px"><div style="border-top:1px solid #e3eaf5;padding-top:14px;text-align:center;font-size:12px;color:#8a97ad;line-height:1.8">${esc(opts.platform)}${opts.tagline ? ` — ${esc(opts.tagline)}` : ''}${org ? `<br>${esc(org)}` : ''}<br>هذه رسالة آلية، يرجى عدم الرد عليها.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

/** المرفقات المضمّنة التي يحتاجها محتوى الرسالة (تُقرأ من الملف وقت الإرسال ولا تُخزَّن مع الرسالة). */
export function inlineAttachments(html: string, root: string) {
  return html.includes(`cid:${LOGO_CID}`)
    ? [
        {
          filename: 'logos.png',
          path: `${root}/public/brand/email-logos.png`,
          cid: LOGO_CID,
          contentDisposition: 'inline' as const,
        },
      ]
    : [];
}
