# شعار «أثر» والأيقونات

شعار المنصة (رمز + كلمة «أثر») ثابت في كل النسخ، أما شعارات الكلية والجامعة فتأتي من `config/faculty.json`.

## الملفات

| الملف | الاستخدام |
| --- | --- |
| `public/brand/athar-horizontal-dark.svg` | الرمز مع الكلمة على الخلفيات الغامقة (الافتتاحية، الهيرو، الدخول) |
| `public/brand/athar-horizontal-light.svg` | على الخلفيات الفاتحة (القائمة العائمة) |
| `public/brand/athar-icon-dark.svg` / `athar-icon-light.svg` | الرمز وحده (القائمة الجانبية) |
| `public/favicon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png` | أيقونة التبويب |
| `public/apple-touch-icon.png` (180) | أيقونة أيفون عند إضافة الموقع للشاشة الرئيسية |
| `public/icon-192.png`, `icon-512.png` | أيقونات التطبيق |
| `public/icon-maskable-512.png` | نسخة أندرويد القابلة للقص (الرمز داخل 50% من المساحة) |

الأيقونات النقطية على مربع كحلي مصمت (أيفون يحوّل الشفاف إلى أسود)، ولا يوجد اسم كلية داخل الشعار.

## تبديل الشعار

1. استبدل ملفات `public/brand/*.svg` مع الحفاظ على الأسماء. الشعار الأفقي `viewBox` ضيق بلا هوامش.
2. أعد توليد الأيقونات النقطية بنفس المقاسات أعلاه (الرمز نحو 62% من المربع، و50% للـ maskable).
3. غيّر `name` و`theme_color` في manifest داخل `vite.config.ts` عند الحاجة.
4. `npm test` يتحقق من وجود الملفات والمقاسات (`tests/brand-assets.test.ts`).
