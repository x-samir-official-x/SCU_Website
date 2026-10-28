import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Faculty } from '../src/types';

export const faculty: Faculty = JSON.parse(
  readFileSync(new URL('../config/faculty.json', import.meta.url), 'utf8'),
);
export const now = () => new Date().toISOString();
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function openDatabase(dataDir: string, demo: boolean) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'portal.sqlite'));
  db.exec(`
    PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','moderator','admin')),
      student_id TEXT UNIQUE, national_id TEXT UNIQUE, year TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), period TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', organization TEXT NOT NULL DEFAULT '',
      activity_date TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','revision','approved','rejected','cancelled')),
      review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_at TEXT, reviewed_at TEXT, version INTEGER NOT NULL DEFAULT 0,
      physical_received INTEGER NOT NULL DEFAULT 0, UNIQUE(user_id,period)
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id),
      original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime TEXT NOT NULL,
      size INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS request_versions (
      request_id INTEGER NOT NULL REFERENCES requests(id), version INTEGER NOT NULL,
      snapshot TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(request_id,version)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, request_id INTEGER REFERENCES requests(id),
      actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS request_status_idx ON requests(period,status);
    CREATE INDEX IF NOT EXISTS events_request_idx ON events(request_id);
  `);
  // ترقيات خفيفة لقواعد بيانات أُنشئت قبل المعرض.
  const addColumn = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumn('requests', 'gallery_consent', 'gallery_consent INTEGER NOT NULL DEFAULT 0');
  addColumn('requests', 'gallery_hidden', 'gallery_hidden INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'terms_version', 'terms_version TEXT');
  addColumn('users', 'terms_accepted_at', 'terms_accepted_at TEXT');
  addColumn('users', 'onboarding_dismissed', 'onboarding_dismissed INTEGER NOT NULL DEFAULT 0');
  addColumn('requests', 'gallery_show_name', 'gallery_show_name INTEGER NOT NULL DEFAULT 0');
  addColumn('attachments', 'kind', "kind TEXT NOT NULL DEFAULT 'document'");
  const marker = db.prepare('SELECT value FROM metadata WHERE key=?').get('dataset') as
    { value: string } | undefined;
  if (marker?.value === 'demo' && !demo) {
    db.close();
    throw new Error(
      'This directory contains demo data. Use a fresh DATA_DIR for non-demo operation.',
    );
  }
  const count = db.prepare('SELECT count(*) AS count FROM users').get() as { count: number };
  if (!count.count && demo) seedDemo(db);
  if (!count.count && !demo && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12)
      throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
    db.prepare(
      'INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',
    ).run(
      'المسؤول الرئيسي',
      process.env.ADMIN_EMAIL.trim().toLowerCase(),
      hashPassword(process.env.ADMIN_PASSWORD),
      'admin',
      now(),
    );
  }
  return db;
}

function seedDemo(db: DatabaseSync) {
  const insert = db.prepare(
    'INSERT INTO users (name,email,password_hash,role,student_id,national_id,year,created_at) VALUES (?,?,?,?,?,?,?,?)',
  );
  const password = hashPassword('Demo2026!');
  const timestamp = now();
  const users = [
    ['يوسف أحمد', 'student@demo.local', 'student', '20260001', '00000000000001', 'الفرقة الثالثة'],
    ['مريم علي', 'moderator@demo.local', 'moderator', null, null, null],
    ['عمر حسن', 'admin@demo.local', 'admin', null, null, null],
    ['سارة محمد', 'sara@demo.local', 'student', '20260002', '00000000000002', 'الفرقة الثانية'],
    ['أحمد محمود', 'ahmed@demo.local', 'student', '20260003', '00000000000003', 'الفرقة الرابعة'],
    ['نور خالد', 'nour@demo.local', 'student', '20260004', '00000000000004', 'الفرقة الأولى'],
    ['علي مصطفى', 'ali@demo.local', 'student', '20260005', '00000000000005', 'الفرقة الثالثة'],
  ];
  db.exec('BEGIN');
  try {
    for (const [name, email, role, sid, nid, year] of users)
      insert.run(name, email, password, role, sid, nid, year, timestamp);
    const create = db.prepare(
      `INSERT INTO requests (user_id,period,title,category,organization,activity_date,description,status,review_note,created_at,updated_at,submitted_at,reviewed_at,version,physical_received) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const activities = [
      [4, 'المشاركة في قافلة مجتمعية', 'خدمة مجتمعية', 'فريق المبادرات الطلابية', 'pending', ''],
      [
        5,
        'حملة تشجير الحرم الجامعي',
        'نشاط بيئي',
        'فريق الجامعة الأخضر',
        'approved',
        'تمت مراجعة الاستمارة والمستندات الورقية.',
      ],
      [
        6,
        'تنظيم يوم التوعية المالية',
        'مبادرة طلابية',
        'النادي الطلابي',
        'revision',
        'يرجى إرفاق مستند يوضح تاريخ المشاركة.',
      ],
      [7, 'المشاركة في حملة تطوعية', 'عمل تطوعي', 'فريق المتطوعين', 'pending', ''],
    ] as const;
    for (const [uid, title, category, org, status, note] of activities) {
      const id = Number(
        create.run(
          uid,
          faculty.periodId,
          title,
          category,
          org,
          '2026-10-20',
          'بيانات تجريبية لعرض دورة مراجعة النشاط. ليست سجلًا أو شهادة فعلية.',
          status,
          note,
          timestamp,
          timestamp,
          timestamp,
          status === 'approved' ? timestamp : null,
          1,
          status === 'approved' ? 1 : 0,
        ).lastInsertRowid,
      );
      const student = db.prepare('SELECT name,student_id,year FROM users WHERE id=?').get(uid);
      const request = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
      db.prepare('INSERT INTO request_versions VALUES (?,?,?,?)').run(
        id,
        1,
        JSON.stringify({ student, request, faculty, submittedAt: timestamp, demo: true }),
        timestamp,
      );
      db.prepare(
        'INSERT INTO events (request_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?)',
      ).run(id, uid, 'submitted', 'طلب تجريبي', timestamp);
      if (status !== 'pending')
        db.prepare(
          'INSERT INTO events (request_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?)',
        ).run(id, 2, status, note, timestamp);
    }
    db.prepare('INSERT INTO metadata VALUES (?,?)').run('dataset', 'demo');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
