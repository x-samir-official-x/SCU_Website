import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { missionSteps } from '../src/mission';
import type { ActivityRequest } from '../src/types';

const req = (over: Partial<ActivityRequest> = {}) =>
  ({
    id: 1,
    status: 'draft',
    version: 0,
    title: '',
    category: '',
    organization: '',
    activity_date: '',
    description: '',
    attachments: [],
    ...over,
  }) as unknown as ActivityRequest;
const states = (r: ActivityRequest | null) => missionSteps(r, 'مكتب', 40).map((s) => s.state);

test('mission steps follow the real request state', () => {
  assert.deepEqual(states(null), ['done', 'current', 'todo', 'todo', 'todo', 'todo']);
  const filled = {
    title: 'حملة',
    category: 'نشاط بيئي',
    organization: 'فريق',
    activity_date: '2026-10-01',
    description: 'شاركت في تنظيف الشاطئ مع الفريق كله.',
  };
  assert.deepEqual(states(req(filled)), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
  assert.deepEqual(states(req({ ...filled, attachments: [{ id: 1 }] as never })), [
    'done',
    'done',
    'done',
    'current',
    'todo',
    'todo',
  ]);
  const sent = req({ ...filled, status: 'pending', version: 1, attachments: [{ id: 1 }] as never });
  assert.deepEqual(states(sent), ['done', 'done', 'done', 'done', 'current', 'todo']);
  assert.deepEqual(states({ ...sent, status: 'revision' } as ActivityRequest)[3], 'attention');
  assert.deepEqual(states({ ...sent, status: 'approved' } as ActivityRequest), [
    'done',
    'done',
    'done',
    'done',
    'done',
    'done',
  ]);
  // وصف قصير لا يُحتسب مكتملًا
  assert.equal(states(req({ ...filled, description: 'قصير' }))[1], 'current');
});

test('student profile: privacy, ID upgrade, password change, sessions', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-profile-'));
  const { app, db } = createApp({ dataDir: dir, demo: true, registrationOpen: true });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  type Acc = { cookie: string; csrf: string };
  const call = (url: string, a?: Acc, method = 'GET', body?: unknown) =>
    fetch(base + url, {
      method,
      headers: {
        ...(a ? { Cookie: a.cookie, 'X-CSRF-Token': a.csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const acc = async (r: Response): Promise<Acc> => {
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  };
  const login = async (email: string, password: string) =>
    acc(await call('/login', undefined, 'POST', { email, password }));

  const reg = await call('/register', undefined, 'POST', {
    name: 'منى إبراهيم',
    email: 'mona@example.test',
    password: 'StrongPass1',
    year: 'الفرقة الثانية',
    national_id: '29901011234567',
    accepted_terms: true,
  });
  assert.equal(reg.status, 201);
  const mona = await acc(reg);

  await t.test('profile never exposes full IDs and starts with onboarding visible', async () => {
    const out = await (await call('/profile', mona)).json();
    const flat = JSON.stringify(out);
    assert.ok(!flat.includes('29901011234567'));
    assert.equal(out.profile.idShown, 'ق.م ••••4567');
    assert.equal(out.profile.hasUniversityId, false);
    assert.equal(out.profile.termsVersion, '2026-10-v1');
    assert.equal(out.totalPoints, 0);
    const session = await (await call('/session', mona)).json();
    assert.equal(session.user.onboarding_dismissed, 0);
  });

  await t.test('onboarding can be dismissed and restored', async () => {
    assert.equal((await call('/profile/onboarding', mona, 'PUT', { dismissed: true })).status, 200);
    assert.equal((await (await call('/session', mona)).json()).user.onboarding_dismissed, 1);
    await call('/profile/onboarding', mona, 'PUT', { dismissed: false });
    assert.equal((await (await call('/session', mona)).json()).user.onboarding_dismissed, 0);
  });

  await t.test('university ID can be added once, must be valid and unique', async () => {
    assert.equal(
      (await call('/profile/university-id', mona, 'PUT', { studentId: '12' })).status,
      400,
    );
    // الرقم الجامعي للطالب التجريبي مستخدم بالفعل
    assert.equal(
      (await call('/profile/university-id', mona, 'PUT', { studentId: '20260001' })).status,
      409,
    );
    assert.equal(
      (await call('/profile/university-id', mona, 'PUT', { studentId: '٢٠٢٦٩٩٩٩' })).status,
      200,
    );
    const out = await (await call('/profile', mona)).json();
    assert.equal(out.profile.idShown, '20269999');
    assert.equal(out.profile.hasUniversityId, true);
    assert.equal(
      (await call('/profile/university-id', mona, 'PUT', { studentId: '20268888' })).status,
      409,
    );
  });

  await t.test('year must be a valid grade', async () => {
    assert.equal((await call('/profile/year', mona, 'PUT', { year: 'خطأ' })).status, 400);
    assert.equal(
      (await call('/profile/year', mona, 'PUT', { year: 'الفرقة الثالثة' })).status,
      200,
    );
    assert.equal((await (await call('/profile', mona)).json()).profile.year, 'الفرقة الثالثة');
  });

  await t.test('password change needs the current password and ends other sessions', async () => {
    const other = await login('mona@example.test', 'StrongPass1');
    assert.equal(
      (await call('/profile/password', mona, 'PUT', { current: 'wrong', password: 'NewPass123' }))
        .status,
      403,
    );
    assert.equal(
      (await call('/profile/password', mona, 'PUT', { current: 'StrongPass1', password: 'short' }))
        .status,
      400,
    );
    assert.equal(
      (
        await call('/profile/password', mona, 'PUT', {
          current: 'StrongPass1',
          password: 'NewPass123',
        })
      ).status,
      200,
    );
    // الجلسة الحالية تبقى، والأخرى تنتهي
    assert.equal((await call('/profile', mona)).status, 200);
    assert.equal((await call('/profile', other)).status, 401);
    assert.equal(
      (
        await call('/login', undefined, 'POST', {
          email: 'mona@example.test',
          password: 'StrongPass1',
        })
      ).status,
      401,
    );
    await login('mona@example.test', 'NewPass123');
  });

  await t.test('staff have no student profile', async () => {
    const mod = await login('moderator@demo.local', 'Demo2026!');
    assert.equal((await call('/profile', mod)).status, 403);
  });
});
