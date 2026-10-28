import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/index';
import { stripJpegMetadata, stripPngMetadata } from '../server/gallery';

// JPEG صغير جدًا وصالح، وبه شريحة APP1 (Exif) فيها نص GPS وهمي.
function jpegWithExif() {
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude-SECRET-30.58')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), exif]);
  app1.writeUInt16BE(exif.length + 2, 2);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, 0]), Buffer.from('camera-SECRET')]);
  com.writeUInt16BE('camera-SECRET'.length + 2, 2);
  const sos = Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, com, sos]);
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}
function pngWithText() {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.from('Comment\0SECRET-location')),
    chunk('eXIf', Buffer.from('SECRET-exif')),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('metadata stripping removes EXIF, comments and PNG text chunks', () => {
  const j = stripJpegMetadata(jpegWithExif());
  assert.ok(!j.includes('SECRET'));
  assert.deepEqual([...j.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...j.subarray(-2)], [0xff, 0xd9]);
  const p = stripPngMetadata(pngWithText());
  assert.ok(!p.includes('SECRET'));
  assert.ok(p.includes('IDAT') && p.includes('IEND'));
  assert.throws(() => stripJpegMetadata(Buffer.from('not a jpeg')));
});

test('gallery: publishes right after submit, hides the name, never grants points', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scu-gallery-'));
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
  const call = (url: string, a?: Account, method = 'GET', body?: unknown) =>
    fetch(base + url, {
      method,
      headers: {
        ...(a ? { Cookie: a.cookie, 'X-CSRF-Token': a.csrf } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  async function login(email: string): Promise<Account> {
    const r = await call('/login', undefined, 'POST', { email, password: 'Demo2026!' });
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const s = await (await fetch(base + '/session', { headers: { Cookie: cookie } })).json();
    return { cookie, csrf: s.csrfToken };
  }
  const student = await login('student@demo.local');
  const moderator = await login('moderator@demo.local');
  const form = (bytes: Buffer, type: string, name: string) => {
    const f = new FormData();
    f.set('file', new File([new Uint8Array(bytes)], name, { type }));
    return f;
  };

  const created = await (await call('/requests', student, 'POST', {})).json();
  const id = created.request.id as number;
  await call(`/requests/${id}`, student, 'PUT', {
    title: 'حملة تنظيف الشاطئ',
    category: 'نشاط بيئي',
    organization: 'فريق البيئة',
    activity_date: '2026-10-01',
    description: 'شاركنا في تنظيف الشاطئ وتوزيع أكياس القمامة على الزوار.',
  });
  const pdf = Buffer.from('%PDF-1.4\n%test\n');
  assert.equal(
    (
      await call(
        `/requests/${id}/attachments`,
        student,
        'POST',
        form(pdf, 'application/pdf', 'proof.pdf'),
      )
    ).status,
    201,
  );

  await t.test('before consent the activity is not public', async () => {
    assert.deepEqual((await (await call('/gallery')).json()).posts, []);
  });

  await t.test('consent without an image blocks submit', async () => {
    const r = await call(`/requests/${id}/gallery`, student, 'PUT', { consent: true });
    assert.equal(r.status, 200);
    assert.equal((await call(`/requests/${id}/submit`, student, 'POST', {})).status, 400);
  });

  await t.test('gallery image is stripped and does not count as a document', async () => {
    const r = await call(
      `/requests/${id}/attachments?kind=gallery`,
      student,
      'POST',
      form(jpegWithExif(), 'image/jpeg', 'IMG_secret_location.jpg'),
    );
    assert.equal(r.status, 201);
    const { request } = await r.json();
    assert.equal(request.attachments.length, 1);
    assert.ok(request.gallery.imageId);
    assert.equal(request.gallery.published, false);
  });

  await t.test(
    'publishes immediately after submit (pending), without approval or points',
    async () => {
      assert.equal((await call(`/requests/${id}/submit`, student, 'POST', {})).status, 200);
      const list = await (await call('/gallery')).json();
      assert.equal(list.posts.length, 1);
      const post = list.posts[0];
      const flat = JSON.stringify(list);
      for (const secret of [
        'يوسف',
        'student@demo.local',
        '20260001',
        'user_id',
        'student_name',
        'student_id',
      ])
        assert.ok(!flat.includes(secret), `leaked ${secret}`);
      assert.deepEqual(Object.keys(post).sort(), [
        'activityDate',
        'category',
        'id',
        'image',
        'organization',
        'publishedAt',
        'text',
        'title',
      ]);
      const img = await call(post.image.replace('/api', ''));
      assert.equal(img.status, 200);
      const bytes = Buffer.from(await img.arrayBuffer());
      assert.ok(!bytes.includes('SECRET'));
      const status = db.prepare('SELECT status FROM requests WHERE id=?').get(id) as {
        status: string;
      };
      assert.equal(status.status, 'pending');
      const mine = await (await call('/requests/mine', student)).json();
      assert.notEqual(mine.request?.status, 'approved');
    },
  );

  await t.test(
    'student cannot see other attachments through the gallery and ids are validated',
    async () => {
      assert.equal((await call('/gallery/9999/image')).status, 404);
      assert.equal((await call('/gallery/abc/image')).status, 400);
    },
  );

  await t.test('staff can hide, and withdrawing consent removes it', async () => {
    assert.equal(
      (await call(`/staff/requests/${id}/gallery-hidden`, student, 'POST', { hidden: true }))
        .status,
      403,
    );
    assert.equal(
      (await call(`/staff/requests/${id}/gallery-hidden`, moderator, 'POST', { hidden: true }))
        .status,
      200,
    );
    assert.deepEqual((await (await call('/gallery')).json()).posts, []);
    await call(`/staff/requests/${id}/gallery-hidden`, moderator, 'POST', { hidden: false });
    assert.equal((await (await call('/gallery')).json()).posts.length, 1);
    assert.equal(
      (await call(`/requests/${id}/gallery`, student, 'PUT', { consent: false })).status,
      200,
    );
    assert.deepEqual((await (await call('/gallery')).json()).posts, []);
    // لا يمكن منح الموافقة بعد الإرسال (الطلب لم يعد قابلًا للتعديل)
    assert.equal(
      (await call(`/requests/${id}/gallery`, student, 'PUT', { consent: true })).status,
      409,
    );
  });

  await t.test('rejected or revision requests are never public', async () => {
    db.prepare('UPDATE requests SET gallery_consent=1 WHERE id=?').run(id);
    assert.equal((await (await call('/gallery')).json()).posts.length, 1);
    for (const s of ['revision', 'rejected', 'cancelled', 'draft']) {
      db.prepare('UPDATE requests SET status=? WHERE id=?').run(s, id);
      assert.deepEqual((await (await call('/gallery')).json()).posts, [], s);
    }
  });
});
