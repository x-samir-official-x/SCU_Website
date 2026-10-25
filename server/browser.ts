import { existsSync } from 'node:fs';
import path from 'node:path';

export function browserExecutable() {
  if (process.env.CHROMIUM_PATH) {
    if (!existsSync(process.env.CHROMIUM_PATH))
      throw new Error('CHROMIUM_PATH does not point to an installed browser.');
    return process.env.CHROMIUM_PATH;
  }
  const candidates =
    process.platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
          .filter((p): p is string => Boolean(p))
          .flatMap((p) => [
            path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          ])
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/opt/google/chrome/chrome',
          ];
  const found = candidates.find((p) => existsSync(p));
  if (!found)
    throw new Error('Install Chrome/Chromium or set CHROMIUM_PATH to generate PDF forms.');
  return found;
}
