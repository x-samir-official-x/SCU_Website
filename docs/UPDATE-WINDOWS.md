# تحديث المشروع في VS Code

## إذا نزلت المشروع ZIP

1. اضغط Ctrl+C في التيرمنال القديم لإيقاف التشغيل.
2. نزّل آخر ZIP من فرع `feat/commerce-activity-portal`، وليس main.
3. فك الضغط في مجلد جديد وافتحه من File → Open Folder.
4. للاحتفاظ ببيانات التجربة، انسخ مجلد `.data` من النسخة القديمة للجديدة قبل التشغيل. لا ترفعه على GitHub.
5. افتح Terminal → New Terminal ونفذ:

```powershell
npm.cmd ci
npm.cmd run dev:demo
```

افتح `http://localhost:5173` على جهازك. إذا كان المنفذ مشغولًا سيظهر البديل في التيرمنال؛ الأفضل إيقاف النسخة القديمة أولًا. اضغط Ctrl+F5 للتحديث القوي في المتصفح.

## إذا كانت النسخة مرتبطة بـGit

احفظ تعديلاتك المحلية أولًا، وأنت على فرع `feat/commerce-activity-portal`:

```powershell
git pull --ff-only origin feat/commerce-activity-portal
npm.cmd ci
npm.cmd run dev:demo
```

إذا ظهرت تعارضات، لا تستخدم reset أو clean؛ احتفظ بتعديلاتك قبل استكمال التحديث.

## الملفات الأساسية التي تغيرت

- `config/faculty.json`: اسم الخدمة والجامعة ومسار الشعارين.
- `src/Brand.tsx` و`public/brand/`: هوية الجامعة والكلية.
- `src/identity.css` و`public/fonts/`: الألوان والخط والمقاسات والموبايل والحركة.
- `src/App.tsx` و`src/Student.tsx` و`src/Staff.tsx`: الواجهات والمحتوى.
- `server/pdf.ts`: الاستمارة بالهوية الجديدة، مع حفظ بيانات الطلب وإصداراته.
- `server/browser.ts`: اكتشاف Chrome أو Edge تلقائيًا على Windows لتوليد PDF. يمكن تحديد CHROMIUM_PATH يدويًا عند الحاجة.
- `package.json` و`package-lock.json`: أمر dev:demo يعمل على Windows وLinux وmacOS.
- `.agents/skills/`: مهارات التصميم ومراجعة الواجهة والحركة.

لا تحتاج نسخ CSS يدويًا؛ حدّث المشروع كاملًا. البيانات وقاعدة النشاط الواحد والـ٤٠ درجة وصلاحيات الاعتماد محفوظة. متطلبات Node.js 24 والحسابات التجريبية موضحة في README.md.
