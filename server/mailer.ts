import nodemailer from 'nodemailer';

export interface Transport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
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

/** قالب عربي بسيط (من اليمين لليسار). لا يحتوي بيانات الطلب نفسها، فقط رابطًا للموقع. */
export function renderEmail(opts: {
  platform: string;
  heading: string;
  lines: string[];
  button?: { label: string; url: string };
  footer?: string;
}): { text: string; html: string } {
  const text = [
    opts.heading,
    '',
    ...opts.lines,
    ...(opts.button ? ['', `${opts.button.label}: ${opts.button.url}`] : []),
    ...(opts.footer ? ['', opts.footer] : []),
    '',
    `— ${opts.platform}`,
  ].join('\n');
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f3f6fc;font-family:Tahoma,Arial,sans-serif;color:#0c1f3f">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #dce5f2">
<h2 style="margin:0 0 14px;color:#102b50;font-size:20px">${esc(opts.heading)}</h2>
${opts.lines.map((l) => `<p style="margin:0 0 10px;line-height:1.9;font-size:15px">${esc(l)}</p>`).join('')}
${
  opts.button
    ? `<p style="margin:22px 0"><a href="${esc(opts.button.url)}" style="background:#235ce3;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;font-size:15px">${esc(opts.button.label)}</a></p>
<p style="margin:0 0 10px;font-size:12px;color:#5b6b84;direction:ltr;text-align:left;word-break:break-all">${esc(opts.button.url)}</p>`
    : ''
}
${opts.footer ? `<p style="margin:16px 0 0;font-size:12px;color:#5b6b84;line-height:1.8">${esc(opts.footer)}</p>` : ''}
<p style="margin:18px 0 0;font-size:12px;color:#8a97ad">— ${esc(opts.platform)}</p>
</div></body></html>`;
  return { text, html };
}
