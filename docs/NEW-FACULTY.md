# إنشاء نسخة لكلية جديدة

كل ما يخص اسم الكلية وهويتها يأتي من ملف واحد وبضعة ملفات صور، دون تعديل أي كود. يحرس ذلك اختبار `tests/faculty-config.test.ts` الذي يفشل لو كُتب اسم كلية داخل الكود.

## 1. الإعدادات: `config/faculty.json`

| الحقل | معناه |
|---|---|
| `platformName` | اسم المنصة (مثل «أَثَر») |
| `brand` | العنوان الفرعي (مثل «بوابة النشاط الطلابي») |
| `faculty` / `facultyShort` | «كلية التجارة» / «التجارة» (الثاني يظهر في جمل مثل «طلاب التجارة») |
| `university` | اسم الجامعة |
| `period` / `periodId` | الفترة المعروضة، ومعرّف داخلي ثابت لها (غيّره عند بدء فترة جديدة فقط) |
| `office` | مكتب التسليم كما يظهر في الاستمارة |
| `points` / `activityTypes` | الدرجة وأنواع الأنشطة |
| `gallery` | إعدادات المعرض |
| `logoPath` | مسار صورة الشعارين (انظر الخطوة 2) |

## 2. الملفات التي تُستبدل (بنفس الأسماء)

- `public/brand/identities.png` و`identities.webp`: شعارا الجامعة والكلية جنبًا إلى جنب بخلفية شفافة.
- `public/brand/email-logos.png`: نفس الشعارين لرسائل البريد.
- `public/brand/splash-university.webp` و`splash-college.webp`: شعار كل منهما منفردًا للشاشة الافتتاحية.
- `public/photos/hero.webp` (عريضة) و`hero-mobile.webp` (للهاتف): صورة الخلفية.
- الأيقونات: `public/favicon*`, `icon-192.png`, `apple-touch-icon.png`.

عنوان الصفحة والوصف وملف التطبيق (`manifest`) يُولَّدان تلقائيًا من الإعدادات عند `npm run build`.

## 3. بيانات التشغيل

لكل كلية مجلد بيانات مستقل (`DATA_DIR`) وحساب مسؤول خاص (`ADMIN_NAME` و`ADMIN_EMAIL` و`ADMIN_PASSWORD`)، وبريد إرسال خاص إن لزم. لا تشارك قاعدة بيانات بين كليتين. انظر [SHOW-COPY.md](SHOW-COPY.md) و[SECURITY.md](SECURITY.md).

## 4. قبل التسليم

```bash
npm ci && npm test && npm run build && npm run test:real
```

وراجع نص شروط الاستخدام مع إدارة الكلية الجديدة.
