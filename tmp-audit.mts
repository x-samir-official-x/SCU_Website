import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './server/index';
import { browserExecutable } from './server/browser';
const OUT = process.argv[2];
const { app } = createApp({ dataDir: mkdtempSync(path.join(os.tmpdir(), 'au-')), demo: true });
const server: any = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ executablePath: browserExecutable(), args: ['--no-sandbox'] });
const accounts: Record<string, [string, string]> = {
  student: ['student@demo.local', 'Demo2026!'],
  moderator: ['moderator@demo.local', 'Demo2026!'],
  admin: ['admin@demo.local', 'Demo2026!'],
};
const routes: Record<string, string[]> = {
  public: ['/', '/login', '/register', '/forgot-password', '/guide'],
  student: ['/dashboard', '/activity', '/documents', '/profile', '/community', '/guide'],
  moderator: ['/dashboard', '/requests', '/community', '/profile'],
  admin: ['/dashboard', '/requests', '/staff', '/community', '/profile'],
};
const report: any[] = [];
for (const [role, list] of Object.entries(routes)) {
  for (const [vname, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]] as const) {
    const ctx = await b.newContext({ viewport: vp, locale: 'ar-EG', reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    const errs: string[] = [];
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    pg.on('requestfailed', (r) => errs.push('reqfail: ' + r.url()));
    pg.on('response', (r) => { if (r.status() >= 400 && r.status() !== 401) errs.push(`http ${r.status()}: ${r.url()}`); });
    if (role !== 'public') {
      const [email, password] = accounts[role];
      await pg.goto(`${base}/login`, { waitUntil: 'networkidle' });
      await pg.locator('input[name=email]').fill(email);
      await pg.locator('input[name=password]').fill(password);
      await pg.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
      await pg.locator('.sidebar, .mobile-nav, nav').first().waitFor();
    }
    for (const r of list) {
      errs.length = 0;
      await pg.goto(base + r, { waitUntil: 'networkidle' }).catch(() => {});
      await pg.waitForTimeout(500);
      const info = await pg.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over: string[] = [];
        document.querySelectorAll('body *').forEach((e) => {
          const rc = (e as HTMLElement).getBoundingClientRect();
          const cs = getComputedStyle(e);
          if (rc.width > 0 && (rc.right > vw + 2 || rc.left < -2) && cs.position !== 'fixed' && cs.visibility !== 'hidden') {
            let p: Element | null = e.parentElement; let clipped = false;
            while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } p = p.parentElement; }
            if (!clipped && over.length < 6) over.push(e.tagName + '.' + String((e as HTMLElement).className).slice(0, 40));
          }
        });
        const noName: string[] = [];
        document.querySelectorAll('button,a[href],input,select,textarea').forEach((e) => {
          const el = e as HTMLInputElement;
          const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim() || (el.labels && el.labels.length ? 'x' : '') || el.getAttribute('placeholder') || '';
          if (!name && noName.length < 6) noName.push(e.tagName + '.' + String(el.className).slice(0, 30));
        });
        const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(-50));
        const small: string[] = [];
        if (innerWidth < 600) document.querySelectorAll('button,a[href]').forEach((e) => { const rc = e.getBoundingClientRect(); if (rc.width > 0 && rc.height > 0 && (rc.height < 32 || rc.width < 32) && small.length < 6) small.push((e.textContent || '').trim().slice(0, 20) || e.getAttribute('aria-label') || e.className.toString().slice(0, 20)); });
        return { scrollW: document.documentElement.scrollWidth, vw, over, noName, broken, small, title: document.title, h1: document.querySelector('h1')?.textContent?.slice(0, 50) ?? null, url: location.pathname };
      });
      const name = `${role}-${vname}-${r.replace(/\//g, '_') || 'root'}`;
      await pg.screenshot({ path: `${OUT}/audit/${name}.png`, fullPage: true });
      report.push({ role, v: vname, route: r, ...info, errs: [...errs] });
    }
    await ctx.close();
  }
}
writeFileSync(`${OUT}/audit/report.json`, JSON.stringify(report, null, 1));
await b.close(); server.close(); process.exit(0);
