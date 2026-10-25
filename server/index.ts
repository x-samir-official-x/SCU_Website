import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, faculty, hashPassword, now } from './db';
import { renderForm } from './pdf';
import type { ActivityRequest, Role, User } from '../src/types';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const publicColumns = 'id,name,email,role,student_id,year,active';
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
const credentials = z.object({ email: z.email().max(180), password: z.string().min(1).max(128) });
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

export function createApp(options: { dataDir?: string; demo?: boolean } = {}) {
  const demo = options.demo ?? process.env.DEMO_MODE === 'true';
  const dataDir = path.resolve(options.dataDir ?? process.env.DATA_DIR ?? path.join(root, '.data'));
  const uploadDir = path.join(dataDir, 'uploads');
  const formDir = path.join(dataDir, 'forms');
  const db = openDatabase(dataDir, demo);
  mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  mkdirSync(formDir, { recursive: true, mode: 0o700 });
  const app = express();
  app.disable('x-powered-by');
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
          upgradeInsecureRequests: process.env.COOKIE_SECURE === 'true' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '64kb' }));
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
          `SELECT s.csrf, u.${publicColumns.split(',').join(',u.')} FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
        )
        .get(hash(cookie), Date.now());
      if (session) {
        const { csrf, ...user } = session;
        res.locals.user = user;
        res.locals.csrf = csrf;
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

  const log = (actor: number, requestId: number | null, action: string, note = '') =>
    db
      .prepare('INSERT INTO events (request_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?)')
      .run(requestId, actor, action, note, now());
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
  function getRequest(id: number, user: User) {
    const r = db
      .prepare(
        `SELECT r.*, u.name AS student_name, u.student_id, u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE r.id=?`,
      )
      .get(id) as unknown as ActivityRequest | undefined;
    assert(r && (user.role !== 'student' || r.user_id === user.id), 404, 'الطلب غير موجود.');
    return r;
  }
  function detail(r: ActivityRequest) {
    return {
      ...r,
      attachments: db
        .prepare(
          'SELECT id,original_name,mime,size,created_at FROM attachments WHERE request_id=? ORDER BY id',
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
    res.json({ user: res.locals.user ?? null, csrfToken: res.locals.csrf, demo, faculty }),
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
  app.post(
    '/api/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'محاولات كثيرة. يرجى المحاولة لاحقًا.' },
    }),
    (req, res) => {
      const input = credentials.parse(req.body);
      const user = db
        .prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1')
        .get(input.email.trim()) as (User & { password_hash: string }) | undefined;
      const [salt, expected] = user?.password_hash.split(':') ?? ['dummy', '0'.repeat(128)];
      const candidate = scryptSync(input.password, salt, 64);
      assert(
        user && timingSafeEqual(candidate, Buffer.from(expected, 'hex')),
        401,
        'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      );
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
        hash(token),
        user.id,
        csrf,
        Date.now() + 12 * 60 * 60 * 1000,
      );
      res.cookie('activity_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 12 * 60 * 60 * 1000,
        path: '/',
      });
      res.json({ ok: true });
    },
  );
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
      .prepare('SELECT count(*) AS n FROM attachments WHERE request_id=?')
      .get(r.id) as { n: number };
    assert(attachments.n > 0, 400, 'أرفق مستندًا واحدًا على الأقل قبل إرسال الطلب.');
    transaction(() => {
      const date = now();
      const version = r.version + 1;
      db.prepare(
        "UPDATE requests SET status='pending',submitted_at=?,updated_at=?,version=?,physical_received=0,reviewed_at=NULL WHERE id=?",
      ).run(date, date, version, r.id);
      const updated = getRequest(r.id, user);
      const student = { name: user.name, student_id: user.student_id, year: user.year };
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
      const count = db
        .prepare('SELECT count(*) AS n FROM attachments WHERE request_id=?')
        .get(r.id) as { n: number };
      assert(count.n < 5, 400, 'الحد الأقصى خمسة مرفقات.');
      const b = file.buffer;
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
      const storedName = randomBytes(24).toString('hex');
      const original =
        path
          .basename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
          .replace(/[\r\n\x00-\x1f]/g, '')
          .slice(0, 180) || 'document';
      writeFileSync(path.join(uploadDir, storedName), b, { mode: 0o600 });
      try {
        db.prepare(
          'INSERT INTO attachments (request_id,original_name,stored_name,mime,size,created_at) VALUES (?,?,?,?,?,?)',
        ).run(r.id, original, storedName, detected, file.size, now());
      } catch (e) {
        unlinkSync(path.join(uploadDir, storedName));
        throw e;
      }
      res.status(201).json({ request: detail(r) });
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
      const filename = path.join(formDir, `${r.id}-v${r.version}.pdf`);
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
        `SELECT r.*,u.name AS student_name,u.student_id,u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE period=? AND status!='draft' ORDER BY updated_at DESC LIMIT 6`,
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
        `SELECT r.*,u.name AS student_name,u.student_id,u.year FROM requests r JOIN users u ON u.id=r.user_id WHERE ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
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
      .prepare('INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)')
      .run(data.name, data.email.toLowerCase(), hashPassword(data.password), data.role, now());
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
      res
        .status(400)
        .json({
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
  return { app, db };
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
