import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { randomBytes, randomInt, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, faculty, hashPassword, now } from './db';
import { renderForm, FORM_TEMPLATE_VERSION } from './pdf';
import { sanitizeGalleryImage, publicName } from './gallery';
import { createOcr } from './ocr';
import { mailerFromEnv, renderEmail, inlineAttachments, type Mailer } from './mailer';
import { checkCertificate } from '../src/certificate';
import { weakPasswordReason, validatePhone, YEARS } from '../src/registration';
import { validateRosterRow, isPlaceholderEmail, NO_EMAIL_DOMAIN } from '../src/roster';
import { normalizeDigits, TERMS_VERSION } from '../src/terms';
import type { ActivityRequest, Role, User } from '../src/types';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// الحساب قد يحمل رقمًا جامعيًا أو قوميًا (واحد على الأقل). للعرض نستخدم الجامعي، وإلا آخر ٤ أرقام من القومي.
const idDisplay = (alias = '') =>
  `COALESCE(${alias}student_id, 'ق.م ••••' || substr(${alias}national_id, -4))`;
const publicColumns = `id,name,email,role,${idDisplay()} AS student_id,year,active`;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function assert(value: unknown, status: number, message: string): asserts value {
  if (!value) throw new HttpError(status, message);
}
// «email» يقبل البريد الإلكتروني أو الرقم القومي (حسابات الطلاب المفعّلة من سجل الكلية).
const credentials = z.object({
  email: z.string().trim().min(3).max(180),
  password: z.string().min(1).max(128),
});
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا I/O/0/1 لتجنب اللبس
/** كلمة مرور مؤقتة عشوائية (١٢ حرفًا ≈ ٦٠ بت) بصيغة ABCD-EFGH-JKLM. */
const makeTempPassword = () => {
  const c = Array.from({ length: 12 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]);
  return [c.slice(0, 4), c.slice(4, 8), c.slice(8)].map((g) => g.join('')).join('-');
};
/** يقبل المؤقتة بأي حالة أحرف وبدون الشرطات فيعيدها لصيغتها ABCD-EFGH-JKLM. */
const normalizeTemp = (v: string) => {
  const n = v.replace(/[\s-]/g, '').toUpperCase();
  return n.length === 12 ? `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}` : n;
};
const MAX_TEMP_EXPIRIES = 3;
const draftSchema = z.object({
  title: z.string().trim().max(120),
  category: z.string().max(80),
  organization: z.string().trim().max(160),
  activity_date: z
    .string()
    .max(10)
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'صيغة التاريخ غير صحيحة'),
  description: z.string().trim().max(2000),
});
const submittedSchema = draftSchema.extend({
  title: z.string().trim().min(5).max(120),
  organization: z.string().trim().min(3).max(160),
  category: z.string().refine((v) => faculty.activityTypes.includes(v)),
  activity_date: z
    .string()
    .refine(
      (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v &&
        v <= new Date().toISOString().slice(0, 10),
    ),
  description: z.string().trim().min(20).max(2000),
});

export function createApp(
  options: {
    dataDir?: string;
    demo?: boolean;
    mailer?: Mailer | null;
  } = {},
) {
  const demo = options.demo ?? process.env.DEMO_MODE === 'true';
  const dataDir = path.resolve(options.dataDir ?? process.env.DATA_DIR ?? path.join(root, '.data'));
  const uploadDir = path.join(dataDir, 'uploads');
  const formDir = path.join(dataDir, 'forms');
  const db = openDatabase(dataDir, demo);
  mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  mkdirSync(formDir, { recursive: true, mode: 0o700 });
  // مدة صلاحية كلمة المرور المؤقتة بالساعات (يلزم تغييرها قبل انتهائها وإلا يُقفل التفعيل).
  const tempHours = Math.max(1, Number(process.env.TEMP_PASSWORD_HOURS) || 72);
  const mailer = options.mailer === undefined ? mailerFromEnv() : options.mailer;
  const siteOrigin = (
    process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3001}`
  ).replace(/\/+$/, '');
  if (mailer && !process.env.APP_ORIGIN && process.env.NODE_ENV === 'production')
    console.warn('APP_ORIGIN غير مضبوط: روابط الرسائل ستشير إلى localhost.');
  const app = express();
  app.disable('x-powered-by');
  // خلف وسيط عكسي (Nginx أو منصة استضافة) يجب ضبط TRUST_PROXY=1 وإلا يرى الحد كل الزوار كعنوان واحد.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy)
    app.set(
      'trust proxy',
      trustProxy === 'true'
        ? 1
        : Number.isNaN(Number(trustProxy))
          ? trustProxy
          : Number(trustProxy),
    );
  // الكوكي Secure افتراضيًا في الإنتاج؛ للتجربة على http فقط: COOKIE_SECURE=false.
  const secureCookie = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  const pendingForms = new Map<string, Promise<void>>();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: secureCookie ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  // سقف عام لكل عنوان قبل أي مسار (يحمي من الإغراق الخفيف؛ الحدود الأدق على المسارات الحساسة).
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'طلبات كثيرة. يرجى المحاولة بعد قليل.' },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    const cookie = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('activity_session='))
      ?.slice(17);
    if (cookie && /^[a-f0-9]{64}$/.test(cookie)) {
      const session = db
        .prepare(
          `SELECT s.csrf, u.id,u.name,u.email,u.role,${idDisplay('u.')} AS student_id,u.year,u.active,u.onboarding_dismissed,u.phone,u.avatar_v,(u.email_verified_at IS NOT NULL) AS email_verified,u.email_notifications,u.must_change_password,u.temp_expires_at,u.temp_expiries,u.locked_reason FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
        )
        .get(hash(cookie), Date.now()) as
        | (Record<string, unknown> & {
            id: number;
            email: string;
            csrf: string;
            must_change_password: number;
            temp_expires_at: number | null;
            temp_expiries: number;
            locked_reason: string | null;
          })
        | undefined;
      if (session) {
        const {
          csrf,
          must_change_password,
          temp_expires_at,
          temp_expiries: _expiries,
          locked_reason,
          ...user
        } = session;
        const lockedNow = locked_reason || settleExpiredTemp(session);
        if (!lockedNow) {
          res.locals.user = {
            ...user,
            // الحساب الوهمي (بلا بريد) لا يُعرض كبريد.
            email: isPlaceholderEmail(user.email) ? '' : user.email,
            must_change: Boolean(must_change_password),
            temp_expires_at: must_change_password ? temp_expires_at : null,
          };
          res.locals.csrf = csrf;
        }
      }
    }
    next();
  });
  const auth = (_req: Request, res: Response, next: NextFunction) => {
    if (!res.locals.user) return next(new HttpError(401, 'يرجى تسجيل الدخول أولًا.'));
    next();
  };
  const staff = (_req: Request, res: Response, next: NextFunction) => {
    if (!['moderator', 'admin'].includes(res.locals.user?.role))
      return next(new HttpError(403, 'هذه الصفحة مخصصة للموظفين المخولين.'));
    next();
  };
  const admin = (_req: Request, res: Response, next: NextFunction) => {
    if (res.locals.user?.role !== 'admin')
      return next(new HttpError(403, 'هذا الإجراء متاح للمسؤول الرئيسي فقط.'));
    next();
  };
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const allowed = [process.env.APP_ORIGIN, `${req.protocol}://${req.get('host')}`].filter(
      Boolean,
    );
    if (origin && !allowed.includes(origin))
      return next(new HttpError(403, 'مصدر الطلب غير مسموح.'));
    if (res.locals.user && req.get('X-CSRF-Token') !== res.locals.csrf)
      return next(new HttpError(403, 'انتهت صلاحية الطلب. أعد تحميل الصفحة.'));
    if (!req.is('application/json') && !req.is('multipart/form-data'))
      return next(new HttpError(415, 'صيغة الطلب غير مدعومة.'));
    next();
  });

  // حساب بكلمة مرور مؤقتة لا يفعل أي شيء قبل أن يختار كلمة مرور خاصة به.
  app.use('/api', (req, res, next) => {
    if (!res.locals.user?.must_change) return next();
    const open =
      (req.method === 'POST' && req.path === '/logout') ||
      (req.method === 'PUT' && ['/profile/first-password', '/profile/password'].includes(req.path));
    if (open || (req.method === 'GET' && ['/session', '/health'].includes(req.path))) return next();
    next(new HttpError(403, 'يجب اختيار كلمة مرور خاصة بك أولًا قبل متابعة استخدام الحساب.'));
  });

  const log = (actor: number, requestId: number | null, action: string, note = '') =>
    db
      .prepare('INSERT INTO events (request_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?)')
      .run(requestId, actor, action, note, now());
  /** إشعار داخل الموقع. يُحتفظ بآخر ١٠٠ إشعار لكل مستخدم. */
  const notify = (userId: number, title: string, body = '', link: string | null = null) => {
    db.prepare(
      'INSERT INTO notifications (user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',
    ).run(userId, title, body.slice(0, 300), link, now());
    db.prepare(
      'DELETE FROM notifications WHERE user_id=? AND id NOT IN (SELECT id FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100)',
    ).run(userId, userId);
    emailNotification(userId);
  };
  const notifyStaff = (title: string, body: string, link: string) => {
    const staff = db
      .prepare("SELECT id FROM users WHERE role IN ('moderator','admin') AND active=1")
      .all() as { id: number }[];
    for (const u of staff) notify(u.id, title, body, link);
  };
  // ===== البريد الإلكتروني (اختياري؛ معطّل حتى تُضبط إعدادات SMTP) =====
  const platform = faculty.platformName || faculty.brand;
  const mailBrand = {
    platform,
    tagline: faculty.platformName ? faculty.brand : undefined,
    faculty: faculty.faculty,
    university: faculty.university,
  };
  const enqueueEmail = (
    kind: string,
    to: string,
    subject: string,
    body: { text: string; html: string },
  ) => {
    if (!mailer || isPlaceholderEmail(to)) return;
    db.prepare(
      'INSERT INTO email_outbox (kind,to_addr,subject,text,html,created_at) VALUES (?,?,?,?,?,?)',
    ).run(kind, to, subject, body.text, body.html, Date.now());
    setImmediate(() => void flushMail());
  };
  let flushing = false;
  /** يرسل الرسائل المعلقة بالترتيب، وتُعاد المحاولة عند الفشل (حتى ٥ مرات بفواصل متزايدة). */
  async function flushMail() {
    if (!mailer || flushing) return;
    flushing = true;
    try {
      const rows = db
        .prepare(
          'SELECT id,to_addr,subject,text,html,attempts FROM email_outbox WHERE sent_at IS NULL AND attempts<5 AND next_at<=? ORDER BY id LIMIT 20',
        )
        .all(Date.now()) as {
        id: number;
        to_addr: string;
        subject: string;
        text: string;
        html: string;
        attempts: number;
      }[];
      for (const m of rows) {
        try {
          await mailer.transport.sendMail({
            from: mailer.from,
            to: m.to_addr,
            subject: m.subject,
            text: m.text,
            html: m.html,
            attachments: inlineAttachments(m.html, root),
          });
          db.prepare('UPDATE email_outbox SET sent_at=?,last_error=NULL WHERE id=?').run(
            Date.now(),
            m.id,
          );
        } catch (error) {
          const delay = [60, 300, 900, 3600, 3600][m.attempts] * 1000;
          db.prepare(
            'UPDATE email_outbox SET attempts=attempts+1,next_at=?,last_error=? WHERE id=?',
          ).run(Date.now() + delay, String((error as Error).message).slice(0, 300), m.id);
          console.error('تعذر إرسال بريد', m.id, (error as Error).message);
        }
      }
      db.prepare('DELETE FROM password_resets WHERE expires_at<?').run(Date.now());
      // لا نحتفظ بنصوص الرسائل المرسلة أكثر من أسبوع
      db.prepare('DELETE FROM email_outbox WHERE sent_at IS NOT NULL AND sent_at<?').run(
        Date.now() - 7 * 24 * 3600 * 1000,
      );
    } catch (error) {
      console.error('Mail flush failed', (error as Error).message);
    } finally {
      flushing = false;
    }
  }
  if (mailer) setInterval(() => void flushMail(), 30_000).unref();
  /** رابط تأكيد البريد (صالح ٢٤ ساعة). يلغي أي رابط سابق لنفس الحساب. */
  function sendVerification(userId: number) {
    if (!mailer) return;
    const u = db.prepare('SELECT name,email FROM users WHERE id=?').get(userId) as
      { name: string; email: string } | undefined;
    if (!u) return;
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM email_tokens WHERE user_id=?').run(userId);
    db.prepare('INSERT INTO email_tokens VALUES (?,?,?,?,?)').run(
      hash(token),
      userId,
      u.email,
      Date.now() + 24 * 3600 * 1000,
      Date.now(),
    );
    enqueueEmail(
      'verify',
      u.email,
      `أكّد بريدك الإلكتروني في ${platform}`,
      renderEmail({
        ...mailBrand,
        heading: `أهلًا ${u.name.split(' ')[0]}`,
        lines: [`اضغط الزر التالي لتأكيد بريدك الإلكتروني في «${platform}». الرابط صالح ٢٤ ساعة.`],
        button: { label: 'تأكيد البريد', url: `${siteOrigin}/verify-email?token=${token}` },
        footer: 'إذا لم تطلب هذه الرسالة فتجاهلها ولن يحدث أي شيء.',
      }),
    );
  }
  /** بريد إشعار عام (بدون تفاصيل الطلب) لمن أكّد بريده ولم يوقف الرسائل. بريد واحد كل ٥ دقائق للحساب. */
  function emailNotification(userId: number) {
    if (!mailer) return;
    const u = db
      .prepare('SELECT email,email_verified_at,email_notifications,active FROM users WHERE id=?')
      .get(userId) as
      | {
          email: string;
          email_verified_at: string | null;
          email_notifications: number;
          active: number;
        }
      | undefined;
    if (!u || !u.active || !u.email_verified_at || !u.email_notifications) return;
    const recent = db
      .prepare(
        "SELECT 1 AS x FROM email_outbox WHERE kind='notification' AND to_addr=? AND created_at>?",
      )
      .get(u.email, Date.now() - 5 * 60 * 1000);
    if (recent) return;
    enqueueEmail(
      'notification',
      u.email,
      `إشعار جديد في ${platform}`,
      renderEmail({
        ...mailBrand,
        heading: 'عندك إشعار جديد',
        lines: [
          `يوجد إشعار جديد في حسابك على «${platform}». افتح الموقع للاطلاع عليه.`,
          'لا نرسل تفاصيل الطلب أو ملاحظات المراجعة بالبريد حفاظًا على خصوصيتك.',
        ],
        button: { label: 'فتح الموقع', url: `${siteOrigin}/dashboard` },
        footer: 'يمكنك إيقاف رسائل البريد من «ملفي الشخصي».',
      }),
    );
  }
  /** تنبيه أمني بعد تغيير كلمة المرور (من الملف الشخصي أو بالاستعادة). */
  function securityAlert(userId: number, how: 'reset' | 'change') {
    if (!mailer) return;
    const u = db
      .prepare('SELECT name,email,email_verified_at FROM users WHERE id=?')
      .get(userId) as { name: string; email: string; email_verified_at: string | null } | undefined;
    if (!u || (how === 'change' && !u.email_verified_at)) return;
    enqueueEmail(
      'security',
      u.email,
      `تم تغيير كلمة مرور حسابك في ${platform}`,
      renderEmail({
        ...mailBrand,
        heading: `أهلًا ${u.name.split(' ')[0]}`,
        lines: [
          how === 'reset'
            ? `تمت استعادة كلمة مرور حسابك في «${platform}» وتسجيل خروجك من كل الأجهزة.`
            : `تم تغيير كلمة مرور حسابك في «${platform}» وتسجيل خروجك من باقي الأجهزة.`,
        ],
        notice:
          'إذا لم تكن أنت من فعل ذلك، استعد كلمة المرور فورًا من «نسيت كلمة المرور» وتواصل مع إدارة النشاط الطلابي.',
        button: { label: 'تسجيل الدخول', url: `${siteOrigin}/login` },
      }),
    );
  }
  /** رابط استعادة كلمة المرور (ساعة واحدة). يلغي أي رابط سابق لنفس الحساب. */
  function sendPasswordReset(userId: number) {
    if (!mailer) return;
    const u = db.prepare('SELECT name,email FROM users WHERE id=?').get(userId) as
      { name: string; email: string } | undefined;
    if (!u) return;
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id=?').run(userId);
    db.prepare('INSERT INTO password_resets VALUES (?,?,?,?)').run(
      hash(token),
      userId,
      Date.now() + 3600 * 1000,
      Date.now(),
    );
    enqueueEmail(
      'reset',
      u.email,
      `استعادة كلمة المرور في ${platform}`,
      renderEmail({
        ...mailBrand,
        heading: `أهلًا ${u.name.split(' ')[0]}`,
        lines: [
          `وصلنا طلب لاستعادة كلمة مرور حسابك في «${platform}». اضغط الزر التالي لاختيار كلمة مرور جديدة. الرابط صالح ساعة واحدة ويعمل مرة واحدة.`,
        ],
        button: {
          label: 'اختيار كلمة مرور جديدة',
          url: `${siteOrigin}/reset-password?token=${token}`,
        },
        footer: 'إذا لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك الحالية تبقى كما هي.',
      }),
    );
  }
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  /** تنتهي مهلة كلمة المرور المؤقتة مرة واحدة: يُقفل الحساب مؤقتًا، وعند الثالثة يلزم موظف. */
  function settleExpiredTemp(u: {
    id: number;
    must_change_password: number;
    temp_expires_at: number | null;
    temp_expiries: number;
    locked_reason: string | null;
  }): string | null {
    if (u.locked_reason) return u.locked_reason;
    if (!u.must_change_password || !u.temp_expires_at || u.temp_expires_at > Date.now())
      return null;
    const count = u.temp_expiries + 1;
    const reason = count >= MAX_TEMP_EXPIRIES ? 'staff' : 'expired';
    db.prepare('UPDATE users SET temp_expiries=?,locked_reason=? WHERE id=?').run(
      count,
      reason,
      u.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    return reason;
  }
  /** يضع كلمة مرور مؤقتة جديدة (مشفرة) ويُرجع النص الصريح لمرة واحدة فقط. */
  function issueTempPassword(userId: number) {
    const password = makeTempPassword();
    const expiresAt = Date.now() + tempHours * 3600 * 1000;
    db.prepare(
      'UPDATE users SET password_hash=?,must_change_password=1,temp_expires_at=?,locked_reason=NULL WHERE id=?',
    ).run(hashPassword(password), expiresAt, userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    return { password, expiresAt };
  }
  type RosterEntry = {
    id: number;
    national_id: string;
    student_id: string | null;
    name: string;
    year: string | null;
  };
  /** ينشئ حساب طالب من سجل الكلية (بلا بريد) ويُرجع رقمه. */
  function createStudentFromRoster(r: RosterEntry, acceptTerms: boolean) {
    const idTaken = r.student_id
      ? db.prepare('SELECT 1 AS x FROM users WHERE student_id=?').get(r.student_id)
      : null;
    const result = db
      .prepare(
        "INSERT INTO users (name,email,password_hash,role,student_id,national_id,year,created_at,terms_version,terms_accepted_at) VALUES (?,?,?,'student',?,?,?,?,?,?)",
      )
      .run(
        r.name,
        `${r.national_id}@${NO_EMAIL_DOMAIN}`,
        hashPassword(randomBytes(24).toString('hex')),
        idTaken ? null : r.student_id,
        r.national_id,
        r.year,
        now(),
        acceptTerms ? TERMS_VERSION : null,
        acceptTerms ? now() : null,
      );
    return Number(result.lastInsertRowid);
  }
  function getRequest(id: number, user: User) {
    const r = db
      .prepare(
        `SELECT r.*, u.name AS student_name, u.phone AS student_phone, u.avatar_v AS student_avatar, ${idDisplay('u.')} AS student_id, u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE r.id=?`,
      )
      .get(id) as unknown as ActivityRequest | undefined;
    assert(r && (user.role !== 'student' || r.user_id === user.id), 404, 'الطلب غير موجود.');
    return r;
  }
  /**
   * شرط النشر في المعرض العام. النشر لا يعني اعتماد النشاط ولا يمنح أي درجة:
   * الدرجة مرتبطة بحالة approved فقط. مفتاح الموافقة المسبقة: config/faculty.json → gallery.requireApproval
   */
  const galleryStatuses = faculty.gallery?.requireApproval
    ? "('approved')"
    : "('pending','approved')";
  const publishedSql = `r.gallery_consent=1 AND r.gallery_hidden=0 AND r.status IN ${galleryStatuses} AND EXISTS (SELECT 1 FROM attachments g WHERE g.request_id=r.id AND g.kind='gallery')`;
  function detail(r: ActivityRequest) {
    const galleryImage = db
      .prepare("SELECT id FROM attachments WHERE request_id=? AND kind='gallery' ORDER BY id DESC")
      .get(r.id) as { id: number } | undefined;
    const published = db
      .prepare(`SELECT 1 AS ok FROM requests r WHERE r.id=? AND ${publishedSql}`)
      .get(r.id);
    return {
      ...r,
      gallery: {
        consent: Boolean(r.gallery_consent),
        showName: Boolean(r.gallery_show_name),
        hidden: Boolean(r.gallery_hidden),
        imageId: galleryImage?.id ?? null,
        published: Boolean(published),
        requireApproval: Boolean(faculty.gallery?.requireApproval),
      },
      attachments: db
        .prepare(
          "SELECT id,original_name,mime,size,created_at FROM attachments WHERE request_id=? AND kind='document' ORDER BY id",
        )
        .all(r.id),
      events: db
        .prepare(
          'SELECT e.id,e.action,e.note,e.created_at,u.name AS actor_name FROM events e JOIN users u ON u.id=e.actor_id WHERE request_id=? ORDER BY e.id DESC',
        )
        .all(r.id),
    };
  }
  function editable(r: ActivityRequest, user: User) {
    assert(
      user.role === 'student' && user.id === r.user_id && ['draft', 'revision'].includes(r.status),
      409,
      'لا يمكن تعديل الطلب في حالته الحالية.',
    );
  }
  function parseId(value: string) {
    const id = Number(value);
    assert(Number.isSafeInteger(id) && id > 0, 400, 'رقم غير صحيح.');
    return id;
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', demo });
  });
  app.get('/api/session', (_req, res) =>
    res.json({
      user: res.locals.user ?? null,
      csrfToken: res.locals.csrf,
      demo,
      faculty,
      tempPasswordHours: tempHours,
      emailEnabled: Boolean(mailer),
    }),
  );
  app.get('/api/demo-accounts', (_req, res) => {
    assert(demo, 404, 'غير متاح.');
    res.json({
      accounts: [
        { role: 'student', email: 'student@demo.local', password: 'Demo2026!' },
        { role: 'moderator', email: 'moderator@demo.local', password: 'Demo2026!' },
        { role: 'admin', email: 'admin@demo.local', password: 'Demo2026!' },
      ],
    });
  });
  function startSession(res: Response, userId: number) {
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
      hash(token),
      userId,
      csrf,
      Date.now() + 12 * 60 * 60 * 1000,
    );
    res.cookie('activity_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
  }
  app.post(
    '/api/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    // حد لكل حساب: يوقف تخمين كلمة مرور حساب بعينه من عناوين متعددة (الناجح لا يُحتسب).
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      skipSuccessfulRequests: true,
      standardHeaders: false,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `login:${String((req.body as { email?: unknown } | undefined)?.email ?? '')
          .trim()
          .toLowerCase()
          .slice(0, 180)}`,
      validate: { keyGeneratorIpFallback: false },
      message: { error: 'محاولات كثيرة على هذا الحساب. يرجى المحاولة بعد ١٥ دقيقة.' },
    }),
    (req, res) => {
      const input = credentials.parse(req.body);
      const identifier = input.email.trim();
      const asNational = normalizeDigits(identifier);
      type LoginRow = User & {
        password_hash: string;
        must_change_password: number;
        temp_expires_at: number | null;
        temp_expiries: number;
        locked_reason: string | null;
      };
      const user = (
        /^[0-9]{14}$/.test(asNational)
          ? db.prepare('SELECT * FROM users WHERE national_id=? AND active=1').get(asNational)
          : db
              .prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1')
              .get(identifier)
      ) as LoginRow | undefined;
      const [salt, expected] = user?.password_hash.split(':') ?? ['dummy', '0'.repeat(128)];
      const matches = (password: string) =>
        timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
      // كلمة المرور المؤقتة تُقبل بأي حالة أحرف أو بدون الشرطات
      const ok =
        matches(input.password) ||
        Boolean(user?.must_change_password && matches(normalizeTemp(input.password)));
      assert(user && ok, 401, 'بيانات الدخول غير صحيحة. راجع الرقم القومي أو البريد وكلمة المرور.');
      const locked = settleExpiredTemp(user);
      assert(
        !locked,
        403,
        locked === 'staff'
          ? 'تكرر انتهاء مهلة كلمة المرور المؤقتة. توجّه إلى مكتب النشاط الطلابي لإصدار كلمة مرور جديدة.'
          : 'انتهت مهلة كلمة المرور المؤقتة. أثبت هويتك من جديد من صفحة «إثبات هويتك» لإصدار كلمة مرور جديدة.',
      );
      startSession(res, user.id);
      res.json({ ok: true, mustChange: Boolean(user.must_change_password) });
    },
  );
  /**
   * إثبات الهوية: الطالب يكتب الرقم القومي (والجامعي اختياريًا) فيُقارَن بسجل الكلية.
   * عند التطابق يُنشأ الحساب بكلمة مرور مؤقتة تظهر مرة واحدة. لا يُكشف أي بيان قبل التطابق.
   */
  const claimMismatch =
    'بياناتك غير مطابقة لسجلات الكلية. راجع الأرقام، أو تواصل مع مكتب النشاط الطلابي.';
  app.post(
    '/api/claim',
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 15,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا أو التواصل مع مكتب النشاط الطلابي.' },
    }),
    // حد لكل رقم قومي: يمنع تجريب أرقام الجامعي على رقم بعينه
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 8,
      standardHeaders: false,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `claim:${normalizeDigits((req.body as { national_id?: unknown } | undefined)?.national_id).slice(0, 20)}`,
      validate: { keyGeneratorIpFallback: false },
      message: { error: 'محاولات كثيرة على هذا الرقم. حاول بعد ساعة أو تواصل مع المكتب.' },
    }),
    (req, res) => {
      const body = z
        .object({
          national_id: z.unknown(),
          student_id: z.unknown().optional(),
          accepted_terms: z.unknown().optional(),
        })
        .parse(req.body ?? {});
      const national = normalizeDigits(body.national_id);
      const student = normalizeDigits(body.student_id);
      assert(/^[0-9]{14}$/.test(national), 400, 'الرقم القومي ١٤ رقمًا.');
      assert(!student || /^[0-9]{4,20}$/.test(student), 400, 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.');
      assert(
        body.accepted_terms === true || body.accepted_terms === 'on',
        400,
        'يجب الموافقة على الشروط للمتابعة.',
      );
      const entry = db.prepare('SELECT * FROM roster WHERE national_id=?').get(national) as
        RosterEntry | undefined;
      // الجامعي اختياري، لكن إن كُتب وكان مخالفًا لما في السجل نرفض بنفس الرسالة
      assert(
        entry && (!student || !entry.student_id || entry.student_id === student),
        404,
        claimMismatch,
      );
      type Existing = {
        id: number;
        active: number;
        must_change_password: number;
        temp_expires_at: number | null;
        temp_expiries: number;
        locked_reason: string | null;
      };
      const existing = db
        .prepare(
          'SELECT id,active,must_change_password,temp_expires_at,temp_expiries,locked_reason FROM users WHERE national_id=?',
        )
        .get(national) as Existing | undefined;
      let userId: number;
      if (!existing) userId = createStudentFromRoster(entry, true);
      else {
        assert(existing.active === 1, 403, 'هذا الحساب موقوف. تواصل مع مكتب النشاط الطلابي.');
        const locked = settleExpiredTemp(existing);
        assert(
          locked !== 'staff',
          403,
          'تكرر انتهاء المهلة. توجّه إلى مكتب النشاط الطلابي لإصدار كلمة مرور جديدة.',
        );
        assert(
          locked === 'expired',
          409,
          existing.must_change_password
            ? 'أُصدرت لك كلمة مرور مؤقتة ولم تنتهِ مدتها بعد. استخدمها لتسجيل الدخول، أو تواصل مع المكتب إن فُقدت.'
            : 'هذا الحساب مفعّل بالفعل. سجّل الدخول بالرقم القومي وكلمة مرورك.',
        );
        userId = existing.id;
      }
      const issued = issueTempPassword(userId);
      res.status(201).json({
        temporaryPassword: issued.password,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        hours: tempHours,
        firstName: entry.name.split(' ')[0],
      });
    },
  );
  const tokenHash = (req: Request) => {
    const raw = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('activity_session='))
      ?.slice(17);
    return raw ? hash(raw) : '';
  };
  const studentOnly = (user: User) =>
    assert(user.role === 'student', 403, 'هذه الصفحة للطلاب فقط.');
  /** الملف الشخصي: لا يُرجع أي رقم كامل (الجامعي يُعرض كما هو، والقومي آخر ٤ أرقام فقط). */
  app.get('/api/profile', auth, (_req, res) => {
    const user: User = res.locals.user;
    studentOnly(user);
    const row = db
      .prepare(
        'SELECT name,email,phone,year,student_id,national_id,created_at,terms_version,terms_accepted_at FROM users WHERE id=?',
      )
      .get(user.id) as {
      name: string;
      email: string;
      phone: string | null;
      year: string | null;
      student_id: string | null;
      national_id: string | null;
      created_at: string;
      terms_version: string | null;
      terms_accepted_at: string | null;
    };
    const history = db
      .prepare(
        "SELECT id,period,title,status,submitted_at FROM requests WHERE user_id=? AND status!='draft' ORDER BY id DESC",
      )
      .all(user.id) as { id: number; period: string; title: string; status: string }[];
    res.json({
      profile: {
        name: row.name,
        email: isPlaceholderEmail(row.email) ? '' : row.email,
        phone: row.phone,
        year: row.year,
        idShown: user.student_id,
        hasUniversityId: Boolean(row.student_id),
        hasNationalId: Boolean(row.national_id),
        createdAt: row.created_at,
        termsVersion: row.terms_version,
        termsAcceptedAt: row.terms_accepted_at,
      },
      history: history.map((h) => ({ ...h, points: h.status === 'approved' ? faculty.points : 0 })),
      totalPoints: history.filter((h) => h.status === 'approved').length * faculty.points,
    });
  });
  app.put('/api/profile/year', auth, (req, res) => {
    const user: User = res.locals.user;
    studentOnly(user);
    const input = z.object({ year: z.string() }).parse(req.body);
    assert(YEARS.includes(input.year), 400, 'اختر الفرقة الدراسية.');
    db.prepare('UPDATE users SET year=? WHERE id=?').run(input.year, user.id);
    res.json({ ok: true });
  });
  app.put('/api/profile/university-id', auth, (req, res) => {
    const user: User = res.locals.user;
    studentOnly(user);
    const current = db.prepare('SELECT student_id FROM users WHERE id=?').get(user.id) as {
      student_id: string | null;
    };
    assert(!current.student_id, 409, 'الرقم الجامعي مسجل بالفعل ولا يمكن تغييره من هنا.');
    const value = normalizeDigits(z.object({ studentId: z.unknown() }).parse(req.body).studentId);
    assert(/^[0-9]{4,20}$/.test(value), 400, 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.');
    assert(
      !db.prepare('SELECT 1 AS x FROM users WHERE student_id=?').get(value),
      409,
      'هذا الرقم الجامعي مستخدم في حساب آخر.',
    );
    db.prepare('UPDATE users SET student_id=? WHERE id=?').run(value, user.id);
    res.json({ ok: true });
  });
  app.put(
    '/api/profile/password',
    auth,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const user: User = res.locals.user;
      const input = z
        .object({ current: z.string().max(128), password: z.string().max(128) })
        .parse(req.body);
      const row = db
        .prepare(
          'SELECT password_hash,student_id,national_id,must_change_password FROM users WHERE id=?',
        )
        .get(user.id) as {
        password_hash: string;
        student_id: string | null;
        national_id: string | null;
        must_change_password: number;
      };
      const [salt, expected] = row.password_hash.split(':');
      const same = (v: string) =>
        timingSafeEqual(scryptSync(v, salt, 64), Buffer.from(expected, 'hex'));
      assert(
        same(input.current) || (row.must_change_password && same(normalizeTemp(input.current))),
        403,
        'كلمة المرور الحالية غير صحيحة.',
      );
      assert(
        input.password.length >= 8 && input.password.length <= 100,
        400,
        'كلمة المرور الجديدة من ٨ إلى ١٠٠ حرف.',
      );
      assert(input.password !== input.current, 400, 'اختر كلمة مرور مختلفة عن الحالية.');
      const weakChange = weakPasswordReason(
        input.password,
        user.email,
        row.student_id,
        row.national_id,
      );
      assert(!weakChange, 400, weakChange ?? '');
      db.prepare(
        'UPDATE users SET password_hash=?,must_change_password=0,temp_expires_at=NULL,temp_expiries=0,locked_reason=NULL WHERE id=?',
      ).run(hashPassword(input.password), user.id);
      // تُغلق كل الجلسات الأخرى؛ تبقى الجلسة الحالية فقط
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(
        user.id,
        tokenHash(req),
      );
      securityAlert(user.id, 'change');
      res.json({ ok: true });
    },
  );
  /** أول دخول بكلمة مؤقتة: الجلسة أُثبتت بها للتو، فلا نطلبها مرة ثانية. */
  app.put(
    '/api/profile/first-password',
    auth,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const user: User & { must_change?: boolean } = res.locals.user;
      assert(user.must_change, 409, 'كلمة مرورك خاصة بك بالفعل. غيّرها من ملفك الشخصي.');
      const input = z.object({ password: z.string().max(128) }).parse(req.body);
      assert(
        input.password.length >= 8 && input.password.length <= 100,
        400,
        'كلمة المرور من ٨ إلى ١٠٠ حرف.',
      );
      const row = db
        .prepare('SELECT password_hash,student_id,national_id FROM users WHERE id=?')
        .get(user.id) as {
        password_hash: string;
        student_id: string | null;
        national_id: string | null;
      };
      const [salt, expected] = row.password_hash.split(':');
      assert(
        !timingSafeEqual(
          scryptSync(normalizeTemp(input.password), salt, 64),
          Buffer.from(expected, 'hex'),
        ) && !timingSafeEqual(scryptSync(input.password, salt, 64), Buffer.from(expected, 'hex')),
        400,
        'اختر كلمة مرور مختلفة عن المؤقتة.',
      );
      const weak = weakPasswordReason(input.password, user.email, row.student_id, row.national_id);
      assert(!weak, 400, weak ?? '');
      db.prepare(
        'UPDATE users SET password_hash=?,must_change_password=0,temp_expires_at=NULL,temp_expiries=0,locked_reason=NULL WHERE id=?',
      ).run(hashPassword(input.password), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(
        user.id,
        tokenHash(req),
      );
      res.json({ ok: true });
    },
  );
  app.post('/api/profile/logout-others', auth, (req, res) => {
    const user: User = res.locals.user;
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(
      user.id,
      tokenHash(req),
    );
    res.json({ ok: true });
  });
  app.put('/api/profile/onboarding', auth, (req, res) => {
    const user: User = res.locals.user;
    studentOnly(user);
    const input = z.object({ dismissed: z.boolean() }).parse(req.body);
    db.prepare('UPDATE users SET onboarding_dismissed=? WHERE id=?').run(
      input.dismissed ? 1 : 0,
      user.id,
    );
    res.json({ ok: true });
  });
  // ===== استعادة كلمة المرور (تعمل فقط عند تفعيل البريد) =====
  app.post(
    '/api/forgot-password',
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      assert(mailer, 404, 'استعادة كلمة المرور بالبريد غير مفعّلة. تواصل مع إدارة النشاط الطلابي.');
      const { email } = z.object({ email: z.string().trim().max(180) }).parse(req.body);
      const u = db
        .prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE AND active=1')
        .get(email) as { id: number } | undefined;
      // رد واحد ثابت سواء وُجد الحساب أم لا حتى لا يُكشف من له حساب؛ ورابط واحد كل دقيقتين لكل حساب
      if (u) {
        const recent = db
          .prepare('SELECT 1 AS x FROM password_resets WHERE user_id=? AND created_at>?')
          .get(u.id, Date.now() - 2 * 60 * 1000);
        if (!recent) sendPasswordReset(u.id);
      }
      res.json({ ok: true });
    },
  );
  app.post(
    '/api/reset-password',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const input = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(128) })
        .parse(req.body);
      assert(
        input.password.length >= 8 && input.password.length <= 100,
        400,
        'كلمة المرور الجديدة من ٨ إلى ١٠٠ حرف.',
      );
      const row = db
        .prepare('SELECT user_id,expires_at FROM password_resets WHERE token_hash=?')
        .get(hash(input.token)) as { user_id: number; expires_at: number } | undefined;
      assert(
        row && row.expires_at > Date.now(),
        400,
        'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
      );
      const active = db.prepare('SELECT active,email FROM users WHERE id=?').get(row.user_id) as
        { active: number; email: string } | undefined;
      assert(active?.active === 1, 400, 'رابط الاستعادة غير صالح.');
      const weakReset = weakPasswordReason(input.password, active.email);
      assert(!weakReset, 400, weakReset ?? '');
      transaction(() => {
        db.prepare(
          'UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=?',
        ).run(hashPassword(input.password), now(), row.user_id);
        db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
      });
      securityAlert(row.user_id, 'reset');
      res.json({ ok: true });
    },
  );
  // ===== تأكيد البريد وإيقاف رسائل الإشعارات =====
  app.post(
    '/api/verify-email',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
      const row = db
        .prepare('SELECT user_id,email,expires_at FROM email_tokens WHERE token_hash=?')
        .get(hash(token)) as { user_id: number; email: string; expires_at: number } | undefined;
      assert(
        row && row.expires_at > Date.now(),
        400,
        'رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من حسابك.',
      );
      const user = db.prepare('SELECT email FROM users WHERE id=?').get(row.user_id) as
        { email: string } | undefined;
      assert(
        user && user.email.toLowerCase() === row.email.toLowerCase(),
        400,
        'رابط التأكيد لا يخص بريدك الحالي. اطلب رابطًا جديدًا.',
      );
      db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(now(), row.user_id);
      db.prepare('DELETE FROM email_tokens WHERE user_id=?').run(row.user_id);
      res.json({ ok: true });
    },
  );
  app.post(
    '/api/profile/resend-verification',
    auth,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      message: { error: 'تم إرسال عدة روابط. انتظر قليلًا ثم حاول مرة أخرى.' },
    }),
    (_req, res) => {
      const user: User = res.locals.user;
      assert(mailer, 404, 'إرسال البريد غير مفعّل على هذا الخادم.');
      const row = db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(user.id) as {
        email_verified_at: string | null;
      };
      assert(!row.email_verified_at, 409, 'بريدك مؤكد بالفعل.');
      const last = db
        .prepare('SELECT created_at FROM email_tokens WHERE user_id=?')
        .get(user.id) as { created_at: number } | undefined;
      assert(
        !last || Date.now() - last.created_at > 60_000,
        429,
        'أُرسل رابط للتو. انتظر دقيقة ثم أعد المحاولة.',
      );
      sendVerification(user.id);
      res.json({ ok: true });
    },
  );
  app.put('/api/profile/email-notifications', auth, (req, res) => {
    const user: User = res.locals.user;
    const input = z.object({ enabled: z.boolean() }).parse(req.body);
    db.prepare('UPDATE users SET email_notifications=? WHERE id=?').run(
      input.enabled ? 1 : 0,
      user.id,
    );
    res.json({ ok: true });
  });
  app.post('/api/logout', auth, (req, res) => {
    const raw = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('activity_session='))
      ?.slice(17);
    if (raw) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(raw));
    res.clearCookie('activity_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/requests/mine', auth, (_req, res) => {
    const user: User = res.locals.user;
    assert(user.role === 'student', 403, 'هذه الصفحة خاصة بالطلاب.');
    const row = db
      .prepare('SELECT * FROM requests WHERE user_id=? AND period=?')
      .get(user.id, faculty.periodId) as unknown as ActivityRequest | undefined;
    res.json({ request: row ? detail(row) : null });
  });
  app.post('/api/requests', auth, (_req, res) => {
    const user: User = res.locals.user;
    assert(user.role === 'student', 403, 'التقديم متاح للطلاب فقط.');
    assert(
      !db
        .prepare('SELECT id FROM requests WHERE user_id=? AND period=?')
        .get(user.id, faculty.periodId),
      409,
      'لديك طلب مسجل بالفعل لهذه الفترة.',
    );
    const id = Number(
      db
        .prepare('INSERT INTO requests (user_id,period,created_at,updated_at) VALUES (?,?,?,?)')
        .run(user.id, faculty.periodId, now(), now()).lastInsertRowid,
    );
    res.status(201).json({ request: detail(getRequest(id, user)) });
  });
  app.get('/api/requests/:id', auth, (req, res) =>
    res.json({ request: detail(getRequest(parseId(String(req.params.id)), res.locals.user)) }),
  );
  app.put('/api/requests/:id', auth, (req, res) => {
    const r = getRequest(parseId(String(req.params.id)), res.locals.user);
    editable(r, res.locals.user);
    const input = draftSchema.parse(req.body);
    db.prepare(
      'UPDATE requests SET title=?,category=?,organization=?,activity_date=?,description=?,updated_at=? WHERE id=?',
    ).run(
      input.title,
      input.category,
      input.organization,
      input.activity_date,
      input.description,
      now(),
      r.id,
    );
    res.json({ request: detail(getRequest(r.id, res.locals.user)) });
  });
  app.post('/api/requests/:id/submit', auth, (req, res) => {
    const user: User = res.locals.user;
    const r = getRequest(parseId(String(req.params.id)), user);
    editable(r, user);
    const parsed = submittedSchema.safeParse(r);
    assert(
      parsed.success,
      400,
      'يرجى استكمال بيانات النشاط والتأكد من صحة التاريخ والوصف (٢٠ حرفًا على الأقل).',
    );
    const attachments = db
      .prepare("SELECT count(*) AS n FROM attachments WHERE request_id=? AND kind='document'")
      .get(r.id) as { n: number };
    assert(attachments.n > 0, 400, 'أرفق مستندًا واحدًا على الأقل قبل إرسال الطلب.');
    if (r.gallery_consent) {
      const gallery = db
        .prepare("SELECT count(*) AS n FROM attachments WHERE request_id=? AND kind='gallery'")
        .get(r.id) as { n: number };
      assert(gallery.n > 0, 400, 'أضف صورة المعرض أو ألغِ خيار النشر قبل الإرسال.');
    }
    transaction(() => {
      const date = now();
      const version = r.version + 1;
      db.prepare(
        "UPDATE requests SET status='pending',submitted_at=?,updated_at=?,version=?,physical_received=0,reviewed_at=NULL WHERE id=?",
      ).run(date, date, version, r.id);
      const updated = getRequest(r.id, user);
      const ids = db
        .prepare('SELECT student_id,national_id FROM users WHERE id=?')
        .get(user.id) as { student_id: string | null; national_id: string | null };
      const student = {
        name: user.name,
        student_id: ids.student_id ?? '',
        national_id: ids.student_id ? '' : (ids.national_id ?? ''),
        year: user.year,
      };
      db.prepare('INSERT INTO request_versions VALUES (?,?,?,?)').run(
        r.id,
        version,
        JSON.stringify({ student, request: updated, faculty, submittedAt: date, demo }),
        date,
      );
      log(
        user.id,
        r.id,
        'submitted',
        version > 1 ? 'إعادة تقديم الطلب بعد التعديل' : 'تم تقديم النشاط للمراجعة',
      );
      notifyStaff(
        version > 1 ? 'طلب أُعيد إرساله للمراجعة' : 'طلب جديد للمراجعة',
        `${user.name} — ${r.title}`,
        `/requests/${r.id}`,
      );
    });
    res.json({ request: detail(getRequest(r.id, user)) });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });
  app.post(
    '/api/requests/:id/attachments',
    auth,
    (req, res, next) => {
      try {
        editable(getRequest(parseId(String(req.params.id)), res.locals.user), res.locals.user);
        next();
      } catch (e) {
        next(e);
      }
    },
    upload.single('file'),
    (req, res) => {
      const r = getRequest(parseId(String(req.params.id)), res.locals.user);
      const file = req.file;
      assert(file, 400, 'اختر الملف المطلوب رفعه.');
      const kind = req.query.kind === 'gallery' ? 'gallery' : 'document';
      const count = db
        .prepare('SELECT count(*) AS n FROM attachments WHERE request_id=? AND kind=?')
        .get(r.id, kind) as { n: number };
      assert(kind === 'gallery' || count.n < 5, 400, 'الحد الأقصى خمسة مرفقات.');
      let b = file.buffer;
      const detected =
        b.subarray(0, 5).toString() === '%PDF-'
          ? 'application/pdf'
          : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'image/png'
            : b[0] === 255 && b[1] === 216 && b[2] === 255
              ? 'image/jpeg'
              : null;
      assert(
        detected && detected === file.mimetype,
        400,
        'يُسمح فقط بملفات PDF وصور PNG وJPG الصحيحة.',
      );
      if (kind === 'gallery') {
        assert(detected !== 'application/pdf', 400, 'صورة المعرض يجب أن تكون PNG أو JPG.');
        try {
          b = sanitizeGalleryImage(b, detected);
        } catch {
          assert(false, 400, 'تعذر قراءة الصورة. اختر صورة JPG أو PNG سليمة.');
        }
        // صورة واحدة فقط للمعرض: القديمة تُستبدل.
        const old = db
          .prepare("SELECT id,stored_name FROM attachments WHERE request_id=? AND kind='gallery'")
          .all(r.id) as { id: number; stored_name: string }[];
        for (const o of old) {
          db.prepare('DELETE FROM attachments WHERE id=?').run(o.id);
          if (existsSync(path.join(uploadDir, o.stored_name)))
            unlinkSync(path.join(uploadDir, o.stored_name));
        }
      }
      const storedName = randomBytes(24).toString('hex');
      const original =
        path
          .basename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
          .replace(/[\r\n\x00-\x1f]/g, '')
          .slice(0, 180) || 'document';
      writeFileSync(path.join(uploadDir, storedName), b, { mode: 0o600 });
      try {
        db.prepare(
          'INSERT INTO attachments (request_id,original_name,stored_name,mime,size,created_at,kind) VALUES (?,?,?,?,?,?,?)',
        ).run(
          r.id,
          kind === 'gallery' ? 'gallery-image' : original,
          storedName,
          detected,
          b.length,
          now(),
          kind,
        );
      } catch (e) {
        unlinkSync(path.join(uploadDir, storedName));
        throw e;
      }
      res.status(201).json({ request: detail(r) });
    },
  );
  // ===== الإشعارات داخل الموقع =====
  app.get('/api/notifications', auth, (_req, res) => {
    const user: User = res.locals.user;
    const rows = db
      .prepare(
        'SELECT id,title,body,link,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30',
      )
      .all(user.id) as { read_at: string | null }[];
    const unread = db
      .prepare('SELECT count(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL')
      .get(user.id) as { n: number };
    res.json({
      notifications: rows.map(({ read_at, ...n }) => ({ ...n, read: Boolean(read_at) })),
      unread: unread.n,
    });
  });
  app.post('/api/notifications/read', auth, (req, res) => {
    const user: User = res.locals.user;
    const input = z.object({ id: z.number().int().positive().optional() }).parse(req.body ?? {});
    if (input.id)
      db.prepare(
        'UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL',
      ).run(now(), input.id, user.id);
    else
      db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(
        now(),
        user.id,
      );
    res.json({ ok: true });
  });

  // ===== الصورة الشخصية (اختيارية) وبيانات التواصل =====
  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });
  const dropAvatarFile = (name: string | null | undefined) => {
    if (name && existsSync(path.join(uploadDir, name))) unlinkSync(path.join(uploadDir, name));
  };
  app.post(
    '/api/profile/avatar',
    auth,
    (req, res, next) => {
      avatarUpload.single('file')(req, res, (err) =>
        next(err ? new HttpError(400, 'الصورة أكبر من ٢ ميجابايت أو غير صالحة.') : undefined),
      );
    },
    (req, res) => {
      const user: User = res.locals.user;
      studentOnly(user);
      const file = req.file;
      assert(file, 400, 'اختر صورة.');
      const b = file.buffer;
      const detected = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : b[0] === 255 && b[1] === 216 && b[2] === 255
          ? 'image/jpeg'
          : null;
      assert(detected && detected === file.mimetype, 400, 'اختر صورة PNG أو JPG صحيحة.');
      let clean: Buffer;
      try {
        clean = sanitizeGalleryImage(b, detected);
      } catch {
        throw new HttpError(400, 'تعذر قراءة الصورة. اختر صورة سليمة.');
      }
      const old = db.prepare('SELECT avatar_stored FROM users WHERE id=?').get(user.id) as {
        avatar_stored: string | null;
      };
      const stored = `av-${randomBytes(20).toString('hex')}`;
      writeFileSync(path.join(uploadDir, stored), clean, { mode: 0o600 });
      db.prepare('UPDATE users SET avatar_stored=?,avatar_v=? WHERE id=?').run(
        stored,
        Date.now(),
        user.id,
      );
      dropAvatarFile(old.avatar_stored);
      res.status(201).json({ ok: true });
    },
  );
  app.delete('/api/profile/avatar', auth, (_req, res) => {
    const user: User = res.locals.user;
    const old = db.prepare('SELECT avatar_stored FROM users WHERE id=?').get(user.id) as {
      avatar_stored: string | null;
    };
    db.prepare('UPDATE users SET avatar_stored=NULL,avatar_v=0 WHERE id=?').run(user.id);
    dropAvatarFile(old.avatar_stored);
    res.json({ ok: true });
  });
  // الصورة تُعرض لصاحبها وللموظفين فقط (وليست علنية).
  app.get('/api/avatar/:id', auth, (req, res) => {
    const user: User = res.locals.user;
    const id = parseId(String(req.params.id));
    assert(user.id === id || ['moderator', 'admin'].includes(user.role), 403, 'غير مسموح.');
    const row = db.prepare('SELECT avatar_stored FROM users WHERE id=?').get(id) as
      { avatar_stored: string | null } | undefined;
    assert(row?.avatar_stored, 404, 'لا توجد صورة.');
    const file = path.join(uploadDir, row.avatar_stored);
    assert(existsSync(file), 404, 'لا توجد صورة.');
    res.setHeader('Content-Type', readFileSync(file)[0] === 0xff ? 'image/jpeg' : 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(file);
  });
  app.put('/api/profile/phone', auth, (req, res) => {
    const user: User = res.locals.user;
    studentOnly(user);
    const parsed = validatePhone(z.object({ phone: z.unknown() }).parse(req.body).phone);
    assert(parsed.ok, 400, parsed.ok ? '' : parsed.error);
    db.prepare('UPDATE users SET phone=? WHERE id=?').run(parsed.value, user.id);
    res.json({ ok: true });
  });
  app.put(
    '/api/profile/email',
    auth,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const user: User = res.locals.user;
      studentOnly(user);
      const input = z
        .object({ email: z.string().max(160), password: z.string().max(128) })
        .parse(req.body);
      const email = input.email.trim().toLowerCase();
      assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'راجع البريد الإلكتروني.');
      const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as {
        password_hash: string;
      };
      const [salt, expected] = row.password_hash.split(':');
      assert(
        timingSafeEqual(scryptSync(input.password, salt, 64), Buffer.from(expected, 'hex')),
        403,
        'كلمة المرور غير صحيحة.',
      );
      assert(
        !db
          .prepare('SELECT 1 AS x FROM users WHERE email=? COLLATE NOCASE AND id!=?')
          .get(email, user.id),
        409,
        'هذا البريد مستخدم في حساب آخر.',
      );
      db.prepare('UPDATE users SET email=?,email_verified_at=NULL WHERE id=?').run(email, user.id);
      sendVerification(user.id);
      res.json({ ok: true });
    },
  );
  app.delete('/api/attachments/:id', auth, (req, res) => {
    const file = db
      .prepare('SELECT * FROM attachments WHERE id=?')
      .get(parseId(String(req.params.id))) as
      { request_id: number; stored_name: string } | undefined;
    assert(file, 404, 'الملف غير موجود.');
    editable(getRequest(file.request_id, res.locals.user), res.locals.user);
    db.prepare('DELETE FROM attachments WHERE id=?').run(Number(req.params.id));
    if (existsSync(path.join(uploadDir, file.stored_name)))
      unlinkSync(path.join(uploadDir, file.stored_name));
    res.json({ ok: true });
  });
  // موافقة الطالب على عرض نشاطه في المعرض (بدون اسمه). السحب مسموح في أي وقت، والمنح أثناء التعديل فقط.
  app.put('/api/requests/:id/gallery', auth, (req, res) => {
    const user: User = res.locals.user;
    const r = getRequest(parseId(String(req.params.id)), user);
    assert(user.role === 'student' && r.user_id === user.id, 403, 'غير مسموح.');
    const input = z
      .object({ consent: z.boolean().optional(), showName: z.boolean().optional() })
      .safeParse(req.body);
    assert(input.success, 400, 'طلب غير صحيح.');
    const { consent, showName } = input.data;
    // منح الموافقة (أو إظهار الاسم) أثناء التعديل فقط؛ السحب مسموح دائمًا.
    if (consent === true || showName === true) editable(r, user);
    // لا تغيير في updated_at حتى لا تُعاد تهيئة نموذج الطالب أثناء الكتابة.
    if (consent !== undefined)
      db.prepare('UPDATE requests SET gallery_consent=? WHERE id=?').run(consent ? 1 : 0, r.id);
    if (showName !== undefined)
      db.prepare('UPDATE requests SET gallery_show_name=? WHERE id=?').run(showName ? 1 : 0, r.id);
    if (consent === false)
      db.prepare('UPDATE requests SET gallery_show_name=0 WHERE id=?').run(r.id);
    res.json({ request: detail(getRequest(r.id, user)) });
  });
  // إخفاء/إظهار نشاط في المعرض من طرف الموظف (إشراف لاحق، لا علاقة له بالاعتماد).
  app.post('/api/staff/requests/:id/gallery-hidden', auth, staff, (req, res) => {
    const input = z.object({ hidden: z.boolean() }).safeParse(req.body);
    assert(input.success, 400, 'طلب غير صحيح.');
    const r = getRequest(parseId(String(req.params.id)), res.locals.user);
    db.prepare('UPDATE requests SET gallery_hidden=? WHERE id=?').run(
      input.data.hidden ? 1 : 0,
      r.id,
    );
    log(
      res.locals.user.id,
      r.id,
      input.data.hidden ? 'gallery_hidden' : 'gallery_shown',
      input.data.hidden ? 'إخفاء النشاط من المعرض العام' : 'إظهار النشاط في المعرض العام',
    );
    if (input.data.hidden)
      notify(
        r.user_id,
        'أُخفي نشاطك من المعرض العام',
        'راجع مكتب النشاط الطلابي لو عندك استفسار. لا يؤثر هذا على اعتماد نشاطك.',
        '/activity',
      );
    res.json({ request: detail(getRequest(r.id, res.locals.user)) });
  });
  // المعرض العام: بدون تسجيل دخول، وبدون اسم الطالب أو رقمه أو أي معرّف شخصي.
  const galleryLimit = rateLimit({ windowMs: 60 * 1000, limit: 120 });
  app.get('/api/gallery', galleryLimit, (req, res) => {
    const limit = Math.max(1, Math.min(24, Number(req.query.limit) || 9));
    const offset = Math.max(0, Math.min(100000, Number(req.query.offset) || 0));
    // المنشورات تبقى ظاهرة دائمًا (بدون ربط بفترة)، مرتبة من الأحدث، وتُحمَّل على دفعات.
    const rows = db
      .prepare(
        `SELECT r.id,r.title,r.category,r.organization,r.activity_date,r.description,r.submitted_at,CASE WHEN r.gallery_show_name=1 THEN u.name END AS author_name FROM requests r JOIN users u ON u.id=r.user_id WHERE ${publishedSql} ORDER BY r.submitted_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      )
      .all(limit + 1, offset) as {
      id: number;
      title: string;
      category: string;
      organization: string;
      activity_date: string;
      description: string;
      submitted_at: string;
      author_name: string | null;
    }[];
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      hasMore: rows.length > limit,
      posts: rows.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        organization: r.organization,
        activityDate: r.activity_date,
        text: r.description,
        publishedAt: r.submitted_at,
        // الاسم لا يخرج إلا إذا وافق الطالب صراحةً (والإعداد الافتراضي: الاسم الأول فقط).
        author: r.author_name ? publicName(r.author_name, faculty.gallery?.nameDisplay) : null,
        image: `/api/gallery/${r.id}/image`,
      })),
    });
  });
  app.get('/api/gallery/:id/image', galleryLimit, (req, res) => {
    const id = parseId(String(req.params.id));
    const file = db
      .prepare(
        `SELECT g.stored_name,g.mime FROM requests r JOIN attachments g ON g.request_id=r.id AND g.kind='gallery' WHERE r.id=? AND ${publishedSql} ORDER BY g.id DESC`,
      )
      .get(id) as { stored_name: string; mime: string } | undefined;
    assert(file, 404, 'الصورة غير موجودة.');
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(path.join(uploadDir, file.stored_name));
  });
  app.get('/api/attachments/:id', auth, (req, res) => {
    const file = db
      .prepare('SELECT * FROM attachments WHERE id=?')
      .get(parseId(String(req.params.id))) as
      { request_id: number; stored_name: string; original_name: string; mime: string } | undefined;
    assert(file, 404, 'الملف غير موجود.');
    getRequest(file.request_id, res.locals.user);
    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
    );
    res.sendFile(path.join(uploadDir, file.stored_name));
  });
  const ocr = createOcr(dataDir);
  app.post(
    '/api/staff/attachments/:id/read',
    auth,
    staff,
    rateLimit({
      windowMs: 60 * 1000,
      limit: 10,
      message: { error: 'يرجى الانتظار قليلًا قبل قراءة مستند آخر.' },
    }),
    async (req, res) => {
      const user: User = res.locals.user;
      const file = db
        .prepare("SELECT * FROM attachments WHERE id=? AND kind='document'")
        .get(parseId(String(req.params.id))) as
        { id: number; request_id: number; stored_name: string; mime: string } | undefined;
      assert(file, 404, 'الملف غير موجود.');
      const r = getRequest(file.request_id, user);
      let result: { text: string; confidence: number };
      try {
        result = await ocr.read(path.join(uploadDir, file.stored_name), file.mime);
      } catch (error) {
        if (error instanceof Error && error.message === 'PDF_UNSUPPORTED')
          throw new HttpError(
            422,
            'تعذر قراءة ملف PDF على هذا الخادم. افتح المستند وراجعه يدويًا.',
          );
        console.error('OCR failed', error);
        throw new HttpError(500, 'تعذرت قراءة المستند. راجعه يدويًا.');
      }
      log(user.id, r.id, 'document_read', `قراءة آلية لمستند رقم ${file.id}`);
      const checks = checkCertificate(result.text, {
        name: r.student_name ?? '',
        date: r.activity_date,
        organization: r.organization,
        title: r.title,
      });
      res.json({ text: result.text.slice(0, 4000), confidence: result.confidence, checks });
    },
  );
  app.get(
    '/api/requests/:id/form',
    auth,
    rateLimit({
      windowMs: 60 * 1000,
      limit: 15,
      message: { error: 'يرجى الانتظار قليلًا قبل إعادة تنزيل الاستمارة.' },
    }),
    async (req, res) => {
      const r = getRequest(parseId(String(req.params.id)), res.locals.user);
      assert(r.version > 0, 409, 'أرسل الطلب أولًا لاستخراج الاستمارة.');
      const filename = path.join(
        formDir,
        `${r.id}-v${r.version}-template${FORM_TEMPLATE_VERSION}.pdf`,
      );
      if (!existsSync(filename)) {
        let job = pendingForms.get(filename);
        if (!job) {
          assert(pendingForms.size < 2, 429, 'جارٍ تجهيز استمارات أخرى. يرجى المحاولة بعد قليل.');
          const version = db
            .prepare('SELECT snapshot FROM request_versions WHERE request_id=? AND version=?')
            .get(r.id, r.version) as { snapshot: string };
          job = (async () => {
            const pdf = await renderForm(JSON.parse(version.snapshot));
            writeFileSync(filename, pdf, { mode: 0o600 });
          })();
          pendingForms.set(filename, job);
          job.finally(() => pendingForms.delete(filename)).catch(() => {});
        }
        await job;
      }
      res.type('pdf').attachment(`Activity-${r.id}-v${r.version}.pdf`).sendFile(filename);
    },
  );

  app.get('/api/staff/overview', auth, staff, (_req, res) => {
    const counts = db
      .prepare('SELECT status,count(*) AS count FROM requests WHERE period=? GROUP BY status')
      .all(faculty.periodId);
    const students = db
      .prepare("SELECT count(*) AS count FROM users WHERE role='student' AND active=1")
      .get();
    const recent = db
      .prepare(
        `SELECT r.*,u.name AS student_name,${idDisplay('u.')} AS student_id,u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE period=? AND status!='draft' ORDER BY updated_at DESC LIMIT 6`,
      )
      .all(faculty.periodId);
    res.json({ counts, students, recent });
  });
  app.get('/api/staff/requests', auth, staff, (req, res) => {
    const q = String(req.query.q ?? '')
      .trim()
      .slice(0, 140);
    const status = String(req.query.status ?? 'all');
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const limit = 10;
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const where = `r.period=? AND r.status!='draft' AND (u.name LIKE ? ESCAPE '\\' OR u.student_id LIKE ? ESCAPE '\\' OR u.national_id LIKE ? ESCAPE '\\' OR r.title LIKE ? ESCAPE '\\')${status !== 'all' ? ' AND r.status=?' : ''}`;
    const params = [
      faculty.periodId,
      like,
      like,
      like,
      like,
      ...(status !== 'all' ? [status] : []),
    ];
    const rows = db
      .prepare(
        `SELECT r.*,u.name AS student_name,${idDisplay('u.')} AS student_id,u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, (page - 1) * limit);
    const total = db
      .prepare(
        `SELECT count(*) AS count FROM requests r JOIN users u ON u.id=r.user_id WHERE ${where}`,
      )
      .get(...params);
    res.json({ requests: rows, total: (total as { count: number }).count, page, limit });
  });
  app.post('/api/staff/requests/:id/review', auth, staff, (req, res) => {
    const input = z
      .object({
        action: z.enum(['approve', 'revision', 'reject', 'cancel', 'reopen', 'revoke']),
        note: z.string().trim().max(1000).default(''),
        physicalReceived: z.boolean().default(false),
      })
      .parse(req.body);
    const user: User = res.locals.user;
    const r = getRequest(parseId(String(req.params.id)), user);
    let target: string;
    if (['reopen', 'revoke'].includes(input.action)) {
      assert(
        user.role === 'admin',
        403,
        'سحب الاعتماد وإعادة فتح الطلب متاحان للمسؤول الرئيسي فقط.',
      );
      assert(
        input.action === 'revoke'
          ? r.status === 'approved'
          : ['rejected', 'cancelled'].includes(r.status),
        409,
        'تغيرت حالة الطلب. يرجى تحديث الصفحة.',
      );
      target = 'revision';
    } else {
      assert(
        ['pending', 'revision'].includes(r.status),
        409,
        'تغيرت حالة الطلب أو تمت مراجعته بالفعل.',
      );
      if (input.action === 'approve') {
        assert(r.status === 'pending', 409, 'يجب أن يعيد الطالب إرسال الطلب أولًا.');
        assert(input.physicalReceived, 400, 'أكد استلام ومطابقة الاستمارة الورقية قبل الاعتماد.');
      }
      target = (
        {
          approve: 'approved',
          revision: 'revision',
          reject: 'rejected',
          cancel: 'cancelled',
        } as Record<string, string>
      )[input.action];
    }
    assert(
      input.action === 'approve' || input.note.length >= 5,
      400,
      'يرجى توضيح السبب في خمس أحرف على الأقل.',
    );
    transaction(() => {
      db.prepare(
        'UPDATE requests SET status=?,review_note=?,reviewed_at=?,updated_at=?,physical_received=? WHERE id=?',
      ).run(target, input.note, now(), now(), target === 'approved' ? 1 : 0, r.id);
      log(
        user.id,
        r.id,
        input.action === 'revoke' ? 'revoked' : input.action === 'reopen' ? 'reopened' : target,
        input.note,
      );
      const text = {
        approve: ['تم اعتماد نشاطك', `أُضيفت ${faculty.points} درجة إلى سجلك.`],
        revision: ['مطلوب استكمال طلبك', input.note],
        reject: ['لم يُعتمد طلبك', input.note],
        cancel: ['تم إلغاء طلبك', input.note],
        reopen: ['أُعيد فتح طلبك للتعديل', input.note],
        revoke: ['تم سحب اعتماد نشاطك', input.note],
      }[input.action as 'approve'];
      notify(r.user_id, text[0], text[1], '/activity');
    });
    res.json({ request: detail(getRequest(r.id, user)) });
  });
  app.get('/api/admin/staff', auth, admin, (_req, res) =>
    res.json({
      staff: db
        .prepare(
          `SELECT ${publicColumns},created_at FROM users WHERE role IN ('moderator','admin') ORDER BY id`,
        )
        .all(),
    }),
  );
  app.post('/api/admin/staff', auth, admin, (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(3).max(80),
        email: z.email().max(180),
        password: z.string().min(12).max(128),
        role: z.enum(['moderator', 'admin']).default('moderator'),
      })
      .parse(req.body);
    assert(
      !db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(data.email),
      409,
      'البريد الإلكتروني مسجل بالفعل.',
    );
    const result = db
      .prepare(
        'INSERT INTO users (name,email,password_hash,role,created_at,email_verified_at) VALUES (?,?,?,?,?,?)',
      )
      .run(
        data.name,
        data.email.toLowerCase(),
        hashPassword(data.password),
        data.role,
        now(),
        now(),
      );
    log(res.locals.user.id, null, 'staff_created', `تم إنشاء الحساب رقم ${result.lastInsertRowid}`);
    res.status(201).json({ ok: true });
  });
  app.patch('/api/admin/staff/:id', auth, admin, (req, res) => {
    const id = parseId(String(req.params.id));
    const input = z.object({ active: z.boolean() }).parse(req.body);
    assert(id !== res.locals.user.id, 400, 'لا يمكنك تعطيل حسابك الحالي.');
    const user = db
      .prepare("SELECT id,role FROM users WHERE id=? AND role IN ('admin','moderator')")
      .get(id);
    assert(user, 404, 'الحساب غير موجود.');
    transaction(() => {
      db.prepare('UPDATE users SET active=? WHERE id=?').run(input.active ? 1 : 0, id);
      if (!input.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      log(
        res.locals.user.id,
        null,
        input.active ? 'staff_enabled' : 'staff_disabled',
        `الحساب رقم ${id}`,
      );
    });
    res.json({ ok: true });
  });
  // ===== سجل الطلاب (الموظفون): بحث، وإصدار كلمة مرور مؤقتة عند الحاجة =====
  type RosterListRow = {
    id: number;
    name: string;
    year: string | null;
    student_id: string | null;
    national_id: string;
    user_id: number | null;
    must_change_password: number | null;
    temp_expires_at: number | null;
    temp_expiries: number | null;
    locked_reason: string | null;
    active: number | null;
  };
  const rosterState = (r: RosterListRow) => {
    if (!r.user_id) return 'none';
    if (!r.active) return 'disabled';
    const locked =
      r.locked_reason ||
      (r.must_change_password && r.temp_expires_at && r.temp_expires_at <= Date.now()
        ? (r.temp_expiries ?? 0) + 1 >= MAX_TEMP_EXPIRIES
          ? 'staff'
          : 'expired'
        : null);
    if (locked) return locked;
    return r.must_change_password ? 'temp' : 'active';
  };
  app.get('/api/staff/roster', auth, staff, (req, res) => {
    const q = normalizeDigits(String(req.query.q ?? '').slice(0, 60)) || '';
    const text = String(req.query.q ?? '')
      .trim()
      .slice(0, 60);
    const base = `SELECT r.id,r.name,r.year,r.student_id,r.national_id,u.id AS user_id,u.must_change_password,u.temp_expires_at,u.temp_expiries,u.locked_reason,u.active FROM roster r LEFT JOIN users u ON u.national_id=r.national_id`;
    let rows: RosterListRow[];
    if (!text) rows = db.prepare(`${base} ORDER BY r.name LIMIT 50`).all() as RosterListRow[];
    else if (/^[0-9]{4,}$/.test(q))
      // الرقم القومي كاملًا أو الجامعي؛ لا نبحث بجزء من القومي حتى لا يُستخدم للتنقيب
      rows = db
        .prepare(`${base} WHERE r.national_id=? OR r.student_id=? LIMIT 20`)
        .all(q, q) as RosterListRow[];
    else
      rows = db
        .prepare(`${base} WHERE r.name LIKE ? ESCAPE '\\' ORDER BY r.name LIMIT 50`)
        .all(`%${text.replace(/[\\%_]/g, '\\$&')}%`) as RosterListRow[];
    const total = (db.prepare('SELECT count(*) AS n FROM roster').get() as { n: number }).n;
    const activated = (
      db
        .prepare(
          'SELECT count(*) AS n FROM roster r JOIN users u ON u.national_id=r.national_id WHERE u.must_change_password=0',
        )
        .get() as { n: number }
    ).n;
    res.json({
      total,
      activated,
      tempHours,
      students: rows.map((r) => ({
        id: r.id,
        name: r.name,
        year: r.year,
        studentId: r.student_id,
        nationalLast4: r.national_id.slice(-4),
        state: rosterState(r),
      })),
    });
  });
  app.post(
    '/api/staff/roster/:id/temp-password',
    auth,
    staff,
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 120,
      message: { error: 'عدد كبير من الإصدارات. حاول لاحقًا.' },
    }),
    (req, res) => {
      const id = parseId(String(req.params.id));
      const entry = db.prepare('SELECT * FROM roster WHERE id=?').get(id) as
        RosterEntry | undefined;
      assert(entry, 404, 'الطالب غير موجود في السجل.');
      const issued = transaction(() => {
        const existing = db
          .prepare('SELECT id,active FROM users WHERE national_id=?')
          .get(entry.national_id) as { id: number; active: number } | undefined;
        assert(!existing || existing.active === 1, 409, 'هذا الحساب موقوف.');
        const userId = existing?.id ?? createStudentFromRoster(entry, false);
        // الإصدار من الموظف يبدأ العدّ من جديد
        db.prepare('UPDATE users SET temp_expiries=0 WHERE id=?').run(userId);
        const result = issueTempPassword(userId);
        log(
          res.locals.user.id,
          null,
          'temp_password_issued',
          `سجل الطلاب رقم ${entry.id} (الحساب رقم ${userId})`,
        );
        return result;
      });
      res.status(201).json({
        temporaryPassword: issued.password,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        hours: tempHours,
        name: entry.name,
      });
    },
  );
  // استيراد السجل (المسؤول الرئيسي): دفعات صغيرة، والتحديث بالرقم القومي دون حذف أحد.
  app.post('/api/admin/roster/import', auth, admin, (req, res) => {
    const { rows } = z
      .object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(300) })
      .parse(req.body);
    let added = 0;
    let updated = 0;
    const rejected: { index: number; error: string }[] = [];
    const find = db.prepare('SELECT id FROM roster WHERE national_id=?');
    const insert = db.prepare(
      'INSERT INTO roster (national_id,student_id,name,year,imported_at) VALUES (?,?,?,?,?)',
    );
    const update = db.prepare(
      'UPDATE roster SET name=?,student_id=COALESCE(?,student_id),year=COALESCE(?,year) WHERE id=?',
    );
    transaction(() => {
      rows.forEach((raw, index) => {
        const parsed = validateRosterRow(raw);
        if (!parsed.ok) return void rejected.push({ index, error: parsed.error });
        const v = parsed.value;
        const hit = find.get(v.national_id) as { id: number } | undefined;
        if (hit) {
          update.run(v.name, v.student_id, v.year, hit.id);
          updated++;
        } else {
          insert.run(v.national_id, v.student_id, v.name, v.year, now());
          added++;
        }
      });
      log(res.locals.user.id, null, 'roster_import', `أُضيف ${added}، حُدّث ${updated}`);
    });
    res.json({ added, updated, rejected });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
  if (existsSync(path.join(root, 'dist', 'index.html'))) {
    app.use(express.static(path.join(root, 'dist')));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'يرجى مراجعة البيانات المدخلة واستكمال الحقول المطلوبة.' });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'حجم الملف يتجاوز ٨ ميجابايت.'
            : 'تعذر رفع الملف. تحقق من عدد الملفات وحجمها.',
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'صيغة البيانات غير صحيحة.' });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
    res.status(500).json({ error: 'تعذر إتمام العملية. يرجى المحاولة لاحقًا.' });
  });
  return { app, db, flushMail };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app } = createApp();
  const port = Number(process.env.PORT || 3001);
  app.listen(port, '0.0.0.0', () =>
    console.log(
      `Activity API listening on port ${port}. Demo mode: ${process.env.DEMO_MODE === 'true'}.`,
    ),
  );
}
