import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { openDatabase } from '../server/db';

test('student activity workflow, server authorization, documents and review', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-workflow-'));
  const { app, db } = createApp({ dataDir: dir, demo: true });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  type Account = { cookie: string; csrf: string };
  async function request(
    url: string,
    account?: Account,
    method = 'GET',
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    return fetch(base + url, {
      method,
      headers: {
        ...(account ? { Cookie: account.cookie, 'X-CSRF-Token': account.csrf } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  }
  async function login(email: string, password = 'Demo2026!'): Promise<Account> {
    const r = await request('/login', undefined, 'POST', { email, password });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const session = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    assert.ok(session.user);
    assert.ok(session.csrfToken);
    return { cookie, csrf: session.csrfToken };
  }
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let student: Account;
  let moderator: Account;
  let admin: Account;
  let other: Account;
  let id = 0;
  let attachment = 0;

  await t.test('unauthenticated requests and cross-origin login are rejected', async () => {
    assert.equal((await request('/requests/mine')).status, 401);
    assert.equal(
      (
        await request(
          '/login',
          undefined,
          'POST',
          { email: 'student@demo.local', password: 'Demo2026!' },
          { Origin: 'https://untrusted.example' },
        )
      ).status,
      403,
    );
    student = await login('student@demo.local');
    moderator = await login('moderator@demo.local');
    admin = await login('admin@demo.local');
    other = await login('sara@demo.local');
  });
  await t.test('role boundaries and CSRF are enforced on the server', async () => {
    assert.equal((await request('/admin/staff', moderator)).status, 403);
    assert.equal((await request('/staff/requests', student)).status, 403);
    assert.equal(
      (await request('/admin/staff', moderator, 'POST', { role: 'admin', name: 'fake' })).status,
      403,
    );
    assert.equal(
      (await request('/requests', { ...student, csrf: 'invalid' }, 'POST', {})).status,
      403,
    );
  });
  await t.test(
    'one draft per student and period; incomplete submissions are rejected',
    async () => {
      const r = await request('/requests', student, 'POST', {});
      assert.equal(r.status, 201);
      id = (await r.json()).request.id;
      assert.equal((await request('/requests', student, 'POST', {})).status, 409);
      assert.equal((await request(`/requests/${id}/submit`, student, 'POST', {})).status, 400);
      assert.equal((await request(`/requests/${id}`, other)).status, 404);
      assert.equal((await request(`/requests/${id}`, other, 'PUT', {})).status, 404);
    },
  );
  const draft = {
    title: 'حملة تطوعية لخدمة المجتمع',
    category: 'عمل تطوعي',
    organization: 'فريق طلاب كلية التجارة',
    activity_date: '2026-10-20',
    description: 'شاركت في تنظيم الحملة وتنسيق المتطوعين وتجهيز المواد التوعوية للمشاركين.',
  };
  await t.test('draft validation and attachment validation reject invalid input', async () => {
    assert.equal((await request(`/requests/${id}`, student, 'PUT', draft)).status, 200);
    assert.equal((await request(`/requests/${id}/submit`, student, 'POST', {})).status, 400);
    const body = new FormData();
    body.append(
      'file',
      new Blob(['<html>invalid document</html>'], { type: 'application/pdf' }),
      'wrong.pdf',
    );
    assert.equal((await request(`/requests/${id}/attachments`, student, 'POST', body)).status, 400);
  });
  await t.test('valid attachments persist and are private to authorized accounts', async () => {
    const body = new FormData();
    body.append(
      'file',
      new Blob(
        [
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64',
          ),
        ],
        { type: 'image/png' },
      ),
      'participation.png',
    );
    const r = await request(`/requests/${id}/attachments`, student, 'POST', body);
    assert.equal(r.status, 201);
    attachment = (await r.json()).request.attachments[0].id;
    assert.equal((await request(`/attachments/${attachment}`, other)).status, 404);
    assert.equal((await request(`/attachments/${attachment}`, student)).status, 200);
    assert.equal((await request(`/attachments/${attachment}`, moderator)).status, 200);
  });
  await t.test('submission freezes student editing and saves an immutable version', async () => {
    const r = await request(`/requests/${id}/submit`, student, 'POST', {});
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.request.status, 'pending');
    assert.equal(data.request.version, 1);
    assert.equal((await request(`/requests/${id}`, student, 'PUT', draft)).status, 409);
    assert.equal((await request(`/requests/${id}/submit`, student, 'POST', {})).status, 409);
    assert.equal((await request(`/attachments/${attachment}`, student, 'DELETE', {})).status, 409);
  });
  await t.test(
    'review requires physical receipt; revision allows editing and resubmission',
    async () => {
      assert.equal(
        (await request(`/staff/requests/${id}/review`, moderator, 'POST', { action: 'approve' }))
          .status,
        400,
      );
      const revision = await request(`/staff/requests/${id}/review`, moderator, 'POST', {
        action: 'revision',
        note: 'يرجى توضيح دورك في النشاط.',
      });
      assert.equal(revision.status, 200);
      assert.equal((await revision.json()).request.status, 'revision');
      assert.equal(
        (
          await request(`/requests/${id}`, student, 'PUT', {
            ...draft,
            description: draft.description + ' وتابعت تسجيل المشاركين.',
          })
        ).status,
        200,
      );
      const submit = await request(`/requests/${id}/submit`, student, 'POST', {});
      assert.equal(submit.status, 200);
      assert.equal((await submit.json()).request.version, 2);
      assert.equal(
        (
          db.prepare('SELECT count(*) AS n FROM request_versions WHERE request_id=?').get(id) as {
            n: number;
          }
        ).n,
        2,
      );
    },
  );
  await t.test('Arabic PDF is generated and unauthorized access is blocked', async () => {
    assert.equal((await request(`/requests/${id}/form`, other)).status, 404);
    const pdf = await request(`/requests/${id}/form`, student);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type')!, /application\/pdf/);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 15000);
  });
  await t.test(
    'approval is recorded once and cannot be duplicated or revoked by a moderator',
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(`/staff/requests/${id}/review`, moderator, 'POST', {
            action: 'approve',
            physicalReceived: true,
            note: 'تمت المطابقة.',
          }),
        ),
      );
      assert.equal(responses.filter((r) => r.status === 200).length, 1);
      assert.equal(responses.filter((r) => r.status === 409).length, 7);
      const r = responses.find((r) => r.status === 200)!;
      assert.equal((await r.json()).request.status, 'approved');
      assert.equal(
        (
          await request(`/staff/requests/${id}/review`, moderator, 'POST', {
            action: 'approve',
            physicalReceived: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/staff/requests/${id}/review`, moderator, 'POST', {
            action: 'revoke',
            note: 'إعادة فحص المستندات.',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          db
            .prepare("SELECT count(*) AS n FROM events WHERE request_id=? AND action='approved'")
            .get(id) as { n: number }
        ).n,
        1,
      );
    },
  );
  await t.test(
    'principal admin can revoke with a reason; a student sees the updated status',
    async () => {
      const r = await request(`/staff/requests/${id}/review`, admin, 'POST', {
        action: 'revoke',
        note: 'إعادة المراجعة بناءً على طلب الجهة المختصة.',
      });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).request.status, 'revision');
      const mine = await (await request('/requests/mine', student)).json();
      assert.equal(mine.request.status, 'revision');
      assert.equal(mine.request.physical_received, 0);
    },
  );
  await t.test(
    'search finds student IDs and national IDs without exposing national ID values',
    async () => {
      const byId = await (await request('/staff/requests?q=20260001', moderator)).json();
      assert.equal(byId.total, 1);
      assert.equal(byId.requests[0].id, id);
      assert.equal(byId.requests[0].national_id, undefined);
      const byNationalId = await (
        await request('/staff/requests?q=00000000000001', moderator)
      ).json();
      assert.equal(byNationalId.total, 1);
      const injected = await request(
        '/staff/requests?q=' + encodeURIComponent("%' OR 1=1 --"),
        moderator,
      );
      assert.equal(injected.status, 200);
      assert.equal((await injected.json()).total, 0);
    },
  );
  await t.test(
    'admin adds staff; disabling a staff account invalidates existing sessions',
    async () => {
      assert.equal(
        (
          await request('/admin/staff', admin, 'POST', {
            name: 'موظف اختبار',
            email: 'test@demo.local',
            password: 'StrongPassword2026!',
          })
        ).status,
        201,
      );
      const staff = await login('test@demo.local', 'StrongPassword2026!');
      const list = await (await request('/admin/staff', admin)).json();
      const employee = list.staff.find((u: any) => u.email === 'test@demo.local');
      assert.equal(employee.role, 'moderator');
      assert.equal(
        (await request(`/admin/staff/${employee.id}`, admin, 'PATCH', { active: false })).status,
        200,
      );
      assert.equal((await request('/staff/overview', staff)).status, 401);
      assert.equal(
        (await request('/admin/staff/3', admin, 'PATCH', { active: false })).status,
        400,
      );
    },
  );
  await t.test('demo database cannot be accidentally reused outside demo mode', () => {
    assert.throws(() => openDatabase(dir, false), /demo data/);
  });
});
