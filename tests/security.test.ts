import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { validateRegistration, weakPasswordReason } from '../src/registration';

async function boot(t: test.TestContext, env: Record<string, string | undefined> = {}) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-sec-'));
  const { app, db } = createApp({ dataDir: dir, demo: true });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const login = (email: string, password: string, extra: Record<string, string> = {}) =>
    fetch(`${url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ email, password }),
    });
  return { url, login };
}

test('weak and personal passwords are rejected', () => {
  assert.ok(weakPasswordReason('12345678'));
  assert.ok(weakPasswordReason('Password123'.toLowerCase()));
  assert.ok(weakPasswordReason('aaaaaaaaaa'));
  assert.ok(weakPasswordReason('mona.ibrahim2026', 'mona.ibrahim@example.test'));
  assert.equal(weakPasswordReason('كلمة-سر-طويلة-٢٠٢٦'), null);
  const reg = validateRegistration({
    name: 'منى إبراهيم',
    email: 'mona@example.test',
    password: 'qwertyui',
    year: 'الفرقة الثانية',
    student_id: '20261234',
    accepted_terms: true,
  });
  assert.equal(reg.ok, false);
});

test('session cookie is Secure by default in production and can be relaxed explicitly', async (t) => {
  const prod = await boot(t, { NODE_ENV: 'production', COOKIE_SECURE: undefined });
  const res = await prod.login('student@demo.local', 'Demo2026!');
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('cookie is not Secure only when explicitly disabled', async (t) => {
  const local = await boot(t, { NODE_ENV: 'production', COOKIE_SECURE: 'false' });
  const res = await local.login('student@demo.local', 'Demo2026!');
  assert.doesNotMatch(res.headers.get('set-cookie') ?? '', /Secure/i);
});

test('security headers are present on API and pages', async (t) => {
  const { url } = await boot(t);
  const res = await fetch(`${url}/session`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/);
  assert.ok(res.headers.get('permissions-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('guessing one account password is throttled per account, not just per IP', async (t) => {
  const { login } = await boot(t);
  let last = 0;
  for (let i = 0; i < 12; i++)
    last = (await login('sara@demo.local', `wrong-password-${i}`)).status;
  assert.equal(last, 429);
  // حساب آخر من نفس العنوان لا يتأثر بحد الحساب الأول
  assert.equal((await login('ahmed@demo.local', 'Demo2026!')).status, 200);
  // الدخول الصحيح لا يُحتسب ضد الحد
});
