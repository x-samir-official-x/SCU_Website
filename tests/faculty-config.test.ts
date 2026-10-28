import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// اسم الكلية يأتي من config/faculty.json فقط، حتى تكون نسخة كلية جديدة تعديل إعدادات لا تعديل كود.
const root = path.resolve(import.meta.dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });

test('no faculty-specific text is hard-coded outside config/faculty.json', () => {
  const targets = [
    ...files(path.join(root, 'src')),
    ...files(path.join(root, 'server')),
    path.join(root, 'index.html'),
    path.join(root, 'vite.config.ts'),
  ];
  const hits: string[] = [];
  for (const file of targets) {
    if (!/\.(tsx?|css|html)$/.test(file)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!/^\s*(\/\/|\/\*|\*)/.test(line) && /التجارة|Commerce|commerce-/.test(line))
          hits.push(`${path.relative(root, file)}:${i + 1}`);
      });
  }
  // كلمة المرور الشائعة 'commerce123' في قائمة الرفض مستثناة عمدًا.
  assert.deepEqual(
    hits.filter((h) => !h.startsWith('src/registration.ts')),
    [],
  );
});

test('faculty config has every field the UI reads', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'config/faculty.json'), 'utf8'));
  for (const key of [
    'platformName',
    'brand',
    'faculty',
    'facultyShort',
    'university',
    'period',
    'periodId',
    'office',
    'logoPath',
  ])
    assert.ok(typeof config[key] === 'string' && config[key].length > 0, key);
  for (const asset of [
    config.logoPath,
    config.logoPath.replace(/\.png$/, '.webp'),
    '/photos/hero.webp',
    '/photos/hero-mobile.webp',
  ])
    assert.ok(statSync(path.join(root, 'public', asset)).isFile(), asset);
});
