import { createWorker, type Worker } from 'tesseract.js';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/** قارئ الشهادات: قراءة عربي + إنجليزي داخل السيرفر نفسه دون إرسال أي ملف لجهة خارجية. */
export function createOcr(dataDir: string) {
  const langDir = path.join(dataDir, 'ocr-lang');
  let worker: Promise<Worker> | null = null;
  let idle: NodeJS.Timeout | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const prepareLang = () => {
    mkdirSync(langDir, { recursive: true });
    for (const lang of ['ara', 'eng']) {
      const target = path.join(langDir, `${lang}.traineddata.gz`);
      if (existsSync(target)) continue;
      const pkg = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
      copyFileSync(path.join(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`), target);
    }
  };

  const getWorker = () => {
    if (!worker) {
      prepareLang();
      worker = createWorker(['ara', 'eng'], 1, {
        langPath: langDir,
        gzip: true,
        cacheMethod: 'none',
      });
    }
    return worker;
  };
  const scheduleIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(async () => {
      const w = worker;
      worker = null;
      if (w) await (await w).terminate().catch(() => undefined);
    }, 30_000);
    idle.unref();
  };

  /** يحوّل أول صفحتين من الـ PDF لصور (يتطلب pdftoppm). */
  async function pdfPages(file: string): Promise<{ buffers: Buffer[]; cleanup: () => void }> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    try {
      await run(
        'pdftoppm',
        ['-png', '-r', '200', '-f', '1', '-l', '2', file, path.join(dir, 'p')],
        {
          timeout: 30_000,
        },
      );
    } catch {
      rmSync(dir, { recursive: true, force: true });
      throw new Error('PDF_UNSUPPORTED');
    }
    const names = readdirSync(dir).sort();
    return {
      buffers: names.map((n) => readFileSync(path.join(dir, n))),
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  /** طابور واحد: قراءة واحدة في كل مرة لحماية السيرفر. */
  function read(file: string, mime: string): Promise<{ text: string; confidence: number }> {
    const job = chain.then(async () => {
      let cleanup = () => {};
      try {
        let inputs: Buffer[];
        if (mime === 'application/pdf') {
          const pages = await pdfPages(file);
          inputs = pages.buffers;
          cleanup = pages.cleanup;
        } else inputs = [readFileSync(file)];
        const w = await getWorker();
        let text = '';
        let conf = 0;
        for (const input of inputs) {
          const { data } = await w.recognize(input);
          text += `${data.text}\n`;
          conf += data.confidence;
        }
        return { text: text.trim(), confidence: Math.round(conf / Math.max(inputs.length, 1)) };
      } finally {
        cleanup();
        scheduleIdle();
      }
    });
    chain = job.catch(() => undefined);
    return job;
  }
  return { read };
}
