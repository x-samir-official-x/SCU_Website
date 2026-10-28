/**
 * المعرض العام — أدوات الخصوصية.
 * الصورة المنشورة لا تحمل أي بيانات وصفية (موقع GPS، موديل الكاميرا، تاريخ…).
 */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// الشرائح التي تبقى في JPEG: JFIF وICC وAdobe (لازمة لعرض الألوان صحيحة).
const JPEG_KEEP = new Set([0xe0, 0xe2, 0xee]);
// الأجزاء التي تبقى في PNG؛ كل ما عداها (eXIf, tEXt, iTXt, zTXt, tIME…) يُحذف.
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'pHYs',
  'acTL',
  'fcTL',
  'fdAT',
]);

export function stripJpegMetadata(input: Buffer): Buffer {
  if (input[0] !== 0xff || input[1] !== 0xd8) throw new Error('ملف JPEG غير صالح');
  const parts: Buffer[] = [input.subarray(0, 2)];
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new Error('ملف JPEG غير صالح');
    while (input[i] === 0xff) i++;
    const marker = input[i++];
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (i + 2 > input.length) throw new Error('ملف JPEG غير صالح');
    const length = input.readUInt16BE(i);
    if (length < 2 || i + length > input.length) throw new Error('ملف JPEG غير صالح');
    if (marker === 0xda) {
      // بداية بيانات الصورة: ما بعدها يُنسخ كما هو حتى النهاية.
      parts.push(Buffer.from([0xff, marker]), input.subarray(i));
      return Buffer.concat(parts);
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe; // تعليقات نصية قد تحمل معلومات شخصية
    if (!isComment && (!isApp || JPEG_KEEP.has(marker)))
      parts.push(Buffer.from([0xff, marker]), input.subarray(i, i + length));
    i += length;
  }
  throw new Error('ملف JPEG غير صالح');
}

export function stripPngMetadata(input: Buffer): Buffer {
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('ملف PNG غير صالح');
  const parts: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= input.length) {
    const length = input.readUInt32BE(i);
    const type = input.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + length;
    if (end > input.length) throw new Error('ملف PNG غير صالح');
    if (PNG_KEEP.has(type)) parts.push(input.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  throw new Error('ملف PNG غير صالح');
}

export function sanitizeGalleryImage(buffer: Buffer, mime: string): Buffer {
  return mime === 'image/png' ? stripPngMetadata(buffer) : stripJpegMetadata(buffer);
}

/** الاسم الظاهر في المعرض بعد موافقة الطالب: الأول فقط (الافتراضي) أو الكامل حسب config. */
export function publicName(name: string, mode: 'first' | 'full' = 'first'): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  return mode === 'full' ? clean : (clean.split(' ')[0] ?? clean);
}
