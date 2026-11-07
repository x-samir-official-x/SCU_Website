import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const pub = (p: string) => new URL(`../public/${p}`, import.meta.url);

test('ملفات شعار أثر والأيقونات موجودة بالمقاسات الصحيحة', () => {
  for (const f of [
    'favicon.svg',
    'favicon.ico',
    'favicon-16.png',
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
    'brand/athar-icon-light.svg',
    'brand/athar-icon-dark.svg',
    'brand/athar-horizontal-light.svg',
    'brand/athar-horizontal-dark.svg',
  ])
    assert.ok(existsSync(pub(f)), `الملف ناقص: ${f}`);
  const dims = (f: string) => {
    const b = readFileSync(pub(f));
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  assert.deepEqual(dims('icon-192.png'), [192, 192]);
  assert.deepEqual(dims('icon-512.png'), [512, 512]);
  assert.deepEqual(dims('icon-maskable-512.png'), [512, 512]);
  assert.deepEqual(dims('apple-touch-icon.png'), [180, 180]);
});

test('manifest التطبيق يحوي أيقونة maskable و512', () => {
  const cfg = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(cfg, /icon-maskable-512\.png[^}]*maskable/);
  assert.match(cfg, /icon-512\.png/);
});
