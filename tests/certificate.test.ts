import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { checkCertificate, findDates } from '../src/certificate';
import { createApp } from '../server/index';

const input = {
  name: 'أحمد محمد علي حسن',
  date: '2026-03-12',
  organization: 'جمعية صناع الخير',
  title: 'حملة التبرع بالدم',
};
const status = (text: string, field: string) =>
  checkCertificate(text, input).find((c) => c.field === field)!.status;

test('dates: numeric, Arabic digits, month names, invalid ignored', () => {
  assert.deepEqual(findDates('بتاريخ ١٢/٠٣/٢٠٢٦'), ['2026-03-12']);
  assert.deepEqual(findDates('2026-03-12 و 5.4.2026'), ['2026-03-12', '2026-04-05']);
  assert.deepEqual(findDates('12 مارس 2026'), ['2026-03-12']);
  assert.deepEqual(findDates('31/02/2026'), []);
});

test('certificate check: full match', () => {
  const text =
    'شهادة شكر\nجمعية صناع الخير تشكر الطالب أحمد محمد علي حسن\nلمشاركته في حملة التبرع بالدم بتاريخ 12/03/2026';
  for (const f of ['name', 'date', 'organization', 'title']) assert.equal(status(text, f), 'match');
});

test('certificate check: tolerates one OCR letter error, flags differences', () => {
  const text = 'الطالب احمد محمر علي حسن حمله التبرع بالدم 15/03/2026 جمعيه صناع الخير';
  assert.equal(status(text, 'name'), 'match'); // محمر ≈ محمد
  assert.equal(status(text, 'date'), 'mismatch');
  assert.equal(status('شهادة عامة بدون بيانات', 'name'), 'missing');
  assert.equal(status('شهادة عامة بدون بيانات', 'date'), 'missing');
  assert.equal(status('أحمد محمد', 'name'), 'partial');
});

test('staff can read a certificate image; students cannot; nothing is decided', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-ocr-'));
  const { app, db } = createApp({ dataDir: dir, demo: true });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  type Account = { cookie: string; csrf: string };
  const call = (url: string, a: Account, method = 'GET', body?: unknown) =>
    fetch(base + url, {
      method,
      headers: {
        Cookie: a.cookie,
        'X-CSRF-Token': a.csrf,
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  async function login(email: string): Promise<Account> {
    const r = await fetch(base + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Demo2026!' }),
    });
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  }
  const student = await login('student@demo.local');
  const moderator = await login('moderator@demo.local');
  const created = await (await call('/requests', student, 'POST', {})).json();
  const id = created.request.id as number;
  await call(`/requests/${id}`, student, 'PUT', {
    title: 'حملة التبرع بالدم',
    category: 'نشاط اجتماعي',
    organization: 'جمعية صناع الخير',
    activity_date: '2026-03-12',
    description: 'شاركت في حملة التبرع بالدم التي نظمتها الجمعية داخل الكلية.',
  });
  const f = new FormData();
  f.set(
    'file',
    new File([readFileSync('tests/fixtures/certificate.png')], 'cert.png', { type: 'image/png' }),
  );
  const up = await call(`/requests/${id}/attachments`, student, 'POST', f);
  assert.equal(up.status, 201);
  const att = (await up.json()).request.attachments[0].id as number;

  assert.equal((await call(`/staff/attachments/${att}/read`, student, 'POST', {})).status, 403);
  const res = await call(`/staff/attachments/${att}/read`, moderator, 'POST', {});
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.match(out.text, /صناع الخير/);
  const by = Object.fromEntries(
    out.checks.map((c: { field: string; status: string }) => [c.field, c.status]),
  );
  assert.equal(by.organization, 'match');
  assert.equal(by.date, 'match');
  // القراءة لا تغيّر حالة الطلب
  const after = await (await call(`/requests/${id}`, student)).json();
  assert.equal(after.request.status, 'draft');
});
