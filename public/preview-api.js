/* Interactive, browser-local demo only. This is NOT an authentication or storage backend. */
const DATABASE = 'scu-activity-browser-preview-v1';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const stamp = () => new Date().toISOString();
const fail = (condition, status, message) => {
  if (!condition) throw { status, message };
};
const cleanUser = ({ password, national_id, ...user }) => user;
let facultyPromise;
const facultyConfig = () =>
  (facultyPromise ||= fetch('/preview-config.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('Preview configuration unavailable');
    return r.json();
  }));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/'))
    event.respondWith(handle(event.request, url));
});

function initialState(faculty) {
  const ts = stamp();
  const people = [
    ['يوسف أحمد', 'student@demo.local', 'student', '20260001', '00000000000001', 'الفرقة الثالثة'],
    ['مريم علي', 'moderator@demo.local', 'moderator', null, null, null],
    ['عمر حسن', 'admin@demo.local', 'admin', null, null, null],
    ['سارة محمد', 'sara@demo.local', 'student', '20260002', '00000000000002', 'الفرقة الثانية'],
    ['أحمد محمود', 'ahmed@demo.local', 'student', '20260003', '00000000000003', 'الفرقة الرابعة'],
    ['نور خالد', 'nour@demo.local', 'student', '20260004', '00000000000004', 'الفرقة الأولى'],
    ['علي مصطفى', 'ali@demo.local', 'student', '20260005', '00000000000005', 'الفرقة الثالثة'],
  ];
  const users = people.map(([name, email, role, student_id, national_id, year], i) => ({
    id: i + 1,
    name,
    email,
    role,
    student_id,
    national_id,
    year,
    active: 1,
    password: 'Demo2026!',
    created_at: ts,
  }));
  const samples = [
    [4, 'المشاركة في قافلة مجتمعية', 'خدمة مجتمعية', 'pending', ''],
    [5, 'حملة تشجير الحرم الجامعي', 'نشاط بيئي', 'approved', 'تمت مراجعة الاستمارة الورقية.'],
    [
      6,
      'تنظيم يوم التوعية المالية',
      'مبادرة طلابية',
      'revision',
      'يرجى إرفاق مستند يوضح تاريخ المشاركة.',
    ],
    [7, 'المشاركة في حملة تطوعية', 'عمل تطوعي', 'pending', ''],
  ];
  const requests = samples.map(([user_id, title, category, status, review_note], i) => ({
    id: i + 1,
    user_id,
    title,
    category,
    status,
    review_note,
    period: faculty.periodId,
    organization: 'فريق المبادرات الطلابية',
    activity_date: '2026-10-20',
    description: 'بيانات توضيحية لتجربة مراجعة النشاط. ليست مشاركة أو شهادة فعلية.',
    created_at: ts,
    updated_at: ts,
    submitted_at: ts,
    reviewed_at: status === 'approved' ? ts : null,
    version: 1,
    physical_received: status === 'approved' ? 1 : 0,
    attachments: [],
    versions: [],
    events: [
      {
        id: 1,
        action: 'submitted',
        note: 'طلب تجريبي',
        actor_name: users.find((u) => u.id === user_id).name,
        created_at: ts,
      },
    ],
  }));
  return { users, requests, activeUser: null, nextRequest: 5, nextAttachment: 1, nextUser: 8 };
}
async function withState(faculty, operation) {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('state');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const read = store.get('portal');
      let result;
      read.onsuccess = () => {
        try {
          const state = read.result || initialState(faculty);
          result = operation(state);
          store.put(state, 'portal');
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Preview operation aborted'));
    });
  } finally {
    db.close();
  }
}
function publicRequest(r, state) {
  const u = state.users.find((u) => u.id === r.user_id);
  const { versions, attachments, ...fields } = r;
  return {
    ...fields,
    student_name: u.name,
    student_id: u.student_id,
    year: u.year,
    attachments: attachments.map(({ blob, ...file }) => file),
  };
}
function record(r, user, action, note = '') {
  r.events.unshift({
    id: r.events.length + 1,
    action,
    note,
    actor_name: user.name,
    created_at: stamp(),
  });
  r.updated_at = stamp();
}

async function handle(request, url) {
  try {
    const faculty = await facultyConfig();
    const method = request.method;
    const route = url.pathname.slice(4);
    let input = {};
    let file;
    if (!['GET', 'HEAD'].includes(method)) {
      if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
        file = (await request.formData()).get('file');
        fail(file instanceof File, 400, 'اختر ملفًا للرفع.');
        fail(file.size <= 8 * 1024 * 1024, 400, 'الحد الأقصى للملف ٨ ميجابايت.');
        const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const detected =
          String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
            ? 'application/pdf'
            : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
              ? 'image/png'
              : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
                ? 'image/jpeg'
                : null;
        fail(detected && detected === file.type, 400, 'اختر PDF أو صورة PNG أو JPG صحيحة.');
      } else input = await request.json();
    }
    return await withState(faculty, (state) => {
      const user = state.users.find((u) => u.id === state.activeUser && u.active);
      if (route === '/health') return json({ status: 'ok', demo: true, preview: true });
      if (route === '/session')
        return json({
          user: user ? cleanUser(user) : null,
          csrfToken: 'browser-demo-only',
          demo: true,
          preview: true,
          faculty,
        });
      if (route === '/demo-accounts')
        return json({
          accounts: ['student', 'moderator', 'admin'].map((role) => ({
            role,
            email: `${role}@demo.local`,
            password: 'Demo2026!',
          })),
        });
      if (route === '/login' && method === 'POST') {
        const found = state.users.find(
          (u) =>
            u.email.toLowerCase() ===
              String(input.email || '')
                .trim()
                .toLowerCase() &&
            u.password === input.password &&
            u.active,
        );
        fail(found, 401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        state.activeUser = found.id;
        return json({ ok: true });
      }
      fail(user, 401, 'يرجى تسجيل الدخول أولًا.');
      if (route === '/logout' && method === 'POST') {
        state.activeUser = null;
        return json({ ok: true });
      }
      const staff = () =>
        fail(['admin', 'moderator'].includes(user.role), 403, 'هذه الوظيفة للموظفين فقط.');
      const admin = () => fail(user.role === 'admin', 403, 'هذه الوظيفة للمسؤول الرئيسي فقط.');
      const get = (id) => {
        const r = state.requests.find((r) => r.id === Number(id));
        fail(r && (user.role !== 'student' || r.user_id === user.id), 404, 'الطلب غير موجود.');
        return r;
      };
      const editable = (r) =>
        fail(
          user.role === 'student' &&
            r.user_id === user.id &&
            ['draft', 'revision'].includes(r.status),
          409,
          'لا يمكن تعديل الطلب في حالته الحالية.',
        );
      if (route === '/requests/mine') {
        fail(user.role === 'student', 403, 'هذه الصفحة للطالب.');
        const r = state.requests.find(
          (r) => r.user_id === user.id && r.period === faculty.periodId,
        );
        return json({ request: r ? publicRequest(r, state) : null });
      }
      if (route === '/requests' && method === 'POST') {
        fail(user.role === 'student', 403, 'التقديم للطلاب فقط.');
        fail(
          !state.requests.some((r) => r.user_id === user.id && r.period === faculty.periodId),
          409,
          'لديك طلب مسجل بالفعل.',
        );
        const ts = stamp();
        const r = {
          id: state.nextRequest++,
          user_id: user.id,
          period: faculty.periodId,
          title: '',
          category: '',
          organization: '',
          activity_date: '',
          description: '',
          status: 'draft',
          review_note: '',
          created_at: ts,
          updated_at: ts,
          submitted_at: null,
          reviewed_at: null,
          version: 0,
          physical_received: 0,
          attachments: [],
          versions: [],
          events: [],
        };
        state.requests.push(r);
        return json({ request: publicRequest(r, state) }, 201);
      }
      let match = route.match(/^\/requests\/(\d+)(?:\/(submit|attachments|form))?$/);
      if (match) {
        const r = get(match[1]);
        const action = match[2];
        if (!action && method === 'GET') return json({ request: publicRequest(r, state) });
        if (!action && method === 'PUT') {
          editable(r);
          for (const [key, max] of [
            ['title', 120],
            ['category', 80],
            ['organization', 160],
            ['activity_date', 10],
            ['description', 2000],
          ]) {
            fail(
              typeof input[key] === 'string' && input[key].length <= max,
              400,
              'راجع البيانات المدخلة.',
            );
            r[key] = input[key].trim();
          }
          r.updated_at = stamp();
          return json({ request: publicRequest(r, state) });
        }
        if (action === 'attachments' && method === 'POST') {
          editable(r);
          fail(r.attachments.length < 5, 400, 'الحد الأقصى خمسة ملفات.');
          fail(file, 400, 'اختر المستند.');
          r.attachments.push({
            id: state.nextAttachment++,
            original_name: file.name,
            mime: file.type,
            size: file.size,
            created_at: stamp(),
            blob: file,
          });
          return json({ request: publicRequest(r, state) }, 201);
        }
        if (action === 'submit' && method === 'POST') {
          editable(r);
          fail(
            r.title.length >= 5 &&
              r.organization.length >= 3 &&
              r.description.length >= 20 &&
              faculty.activityTypes.includes(r.category),
            400,
            'استكمل بيانات النشاط والوصف.',
          );
          fail(
            /^\d{4}-\d{2}-\d{2}$/.test(r.activity_date) &&
              !Number.isNaN(Date.parse(r.activity_date)) &&
              new Date(r.activity_date).toISOString().slice(0, 10) === r.activity_date &&
              r.activity_date <= stamp().slice(0, 10),
            400,
            'راجع تاريخ المشاركة.',
          );
          fail(r.attachments.length > 0, 400, 'أرفق مستندًا واحدًا على الأقل.');
          r.status = 'pending';
          r.version++;
          r.submitted_at = stamp();
          r.reviewed_at = null;
          r.physical_received = 0;
          r.versions.push({
            student: cleanUser(user),
            title: r.title,
            category: r.category,
            organization: r.organization,
            activity_date: r.activity_date,
            description: r.description,
            submitted_at: r.submitted_at,
            version: r.version,
          });
          record(r, user, 'submitted', 'تم تقديم النشاط للمراجعة');
          return json({ request: publicRequest(r, state) });
        }
        if (action === 'form' && method === 'GET') {
          fail(r.version > 0, 409, 'قدم الطلب أولًا.');
          return printableForm(r, state, faculty);
        }
      }
      match = route.match(/^\/attachments\/(\d+)$/);
      if (match) {
        const r = state.requests.find((r) => r.attachments.some((f) => f.id === Number(match[1])));
        fail(r, 404, 'الملف غير موجود.');
        get(r.id);
        const f = r.attachments.find((f) => f.id === Number(match[1]));
        if (method === 'DELETE') {
          editable(r);
          r.attachments = r.attachments.filter((f) => f.id !== Number(match[1]));
          return json({ ok: true });
        }
        if (method === 'GET')
          return new Response(f.blob, {
            headers: {
              'Content-Type': f.mime,
              'Content-Disposition': `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
              'Cache-Control': 'no-store',
            },
          });
      }
      if (route.startsWith('/staff/')) staff();
      const submitted = () =>
        state.requests.filter((r) => r.period === faculty.periodId && r.status !== 'draft');
      if (route === '/staff/overview') {
        const counts = {};
        for (const r of state.requests.filter((r) => r.period === faculty.periodId))
          counts[r.status] = (counts[r.status] || 0) + 1;
        return json({
          counts: Object.entries(counts).map(([status, count]) => ({ status, count })),
          students: { count: state.users.filter((u) => u.role === 'student' && u.active).length },
          recent: submitted()
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 6)
            .map((r) => publicRequest(r, state)),
        });
      }
      if (route === '/staff/requests') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const status = url.searchParams.get('status') || 'all';
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const rows = submitted()
          .filter((r) => {
            const u = state.users.find((u) => u.id === r.user_id);
            return (
              (status === 'all' || r.status === status) &&
              [u.name, u.student_id, u.national_id, r.title].some((v) =>
                String(v || '')
                  .toLowerCase()
                  .includes(q),
              )
            );
          })
          .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
        return json({
          requests: rows.slice((page - 1) * 10, page * 10).map((r) => publicRequest(r, state)),
          total: rows.length,
          page,
          limit: 10,
        });
      }
      match = route.match(/^\/staff\/requests\/(\d+)\/review$/);
      if (match && method === 'POST') {
        const r = get(match[1]);
        const action = input.action;
        const note = String(input.note || '').trim();
        let target;
        if (['reopen', 'revoke'].includes(action)) {
          admin();
          fail(
            action === 'revoke'
              ? r.status === 'approved'
              : ['rejected', 'cancelled'].includes(r.status),
            409,
            'تغيرت حالة الطلب.',
          );
          target = 'revision';
        } else {
          fail(['pending', 'revision'].includes(r.status), 409, 'تمت مراجعة الطلب أو تغيرت حالته.');
          target = {
            approve: 'approved',
            revision: 'revision',
            reject: 'rejected',
            cancel: 'cancelled',
          }[action];
          fail(target, 400, 'قرار غير صحيح.');
        }
        if (action === 'approve')
          fail(
            input.physicalReceived && r.status === 'pending',
            400,
            'أكد مطابقة الاستمارة الورقية.',
          );
        else
          fail(
            note.length >= 5 && note.length <= 1000,
            400,
            'وضح سبب القرار في خمس أحرف على الأقل.',
          );
        r.status = target;
        r.review_note = note;
        r.reviewed_at = stamp();
        r.physical_received = target === 'approved' ? 1 : 0;
        record(
          r,
          user,
          action === 'revoke' ? 'revoked' : action === 'reopen' ? 'reopened' : target,
          note,
        );
        return json({ request: publicRequest(r, state) });
      }
      if (route.startsWith('/admin/')) admin();
      if (route === '/admin/staff' && method === 'GET')
        return json({ staff: state.users.filter((u) => u.role !== 'student').map(cleanUser) });
      if (route === '/admin/staff' && method === 'POST') {
        fail(
          String(input.name || '').trim().length >= 3 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || '') &&
            String(input.password || '').length >= 12,
          400,
          'راجع الاسم والبريد وكلمة المرور.',
        );
        fail(
          !state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase()),
          409,
          'البريد مسجل بالفعل.',
        );
        state.users.push({
          id: state.nextUser++,
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          password: input.password,
          role: 'moderator',
          active: 1,
          student_id: null,
          national_id: null,
          year: null,
          created_at: stamp(),
        });
        return json({ ok: true }, 201);
      }
      match = route.match(/^\/admin\/staff\/(\d+)$/);
      if (match && method === 'PATCH') {
        fail(Number(match[1]) !== user.id, 400, 'لا يمكنك تعطيل حسابك الحالي.');
        const employee = state.users.find((u) => u.id === Number(match[1]) && u.role !== 'student');
        fail(employee, 404, 'الحساب غير موجود.');
        fail(typeof input.active === 'boolean', 400, 'حالة غير صحيحة.');
        employee.active = input.active ? 1 : 0;
        return json({ ok: true });
      }
      return json({ error: 'المسار غير موجود.' }, 404);
    });
  } catch (error) {
    return json(
      { error: error.message || 'تعذر حفظ التجربة. تحقق من مساحة تخزين المتصفح.' },
      error.status || 500,
    );
  }
}

function printableForm(r, state, faculty) {
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const s = r.versions.at(-1) || { ...r, student: state.users.find((u) => u.id === r.user_id) };
  const field = (label, value) =>
    `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`;
  return new Response(
    `<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>استمارة النشاط — ACT-${r.id}</title><style>
  @font-face{font-family:Arabic;src:url('/fonts/Tajawal-Regular.ttf')}@font-face{font-family:Arabic;src:url('/fonts/Tajawal-Bold.ttf');font-weight:700}*{box-sizing:border-box}body{font-family:Arabic,sans-serif;color:#183451;background:#eef3fa;margin:0;line-height:1.8}.sheet{max-width:790px;margin:24px auto;background:#fff;padding:35px}header{display:flex;gap:20px;align-items:center;border-bottom:2px solid #102b50;padding-bottom:18px}header img{width:150px;height:auto}h1{font-size:25px}h2{font-size:17px;margin:22px 0 10px}p{font-size:14px}.notice{background:#edf3fc;padding:15px;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe7f2}.grid>div{padding:13px;border-bottom:1px solid #e1e9f5}small,strong{display:block}small{color:#607793}strong{font-size:15px}.description{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dfe7f2;padding:15px;min-height:90px}.sign{display:flex;justify-content:space-between;margin-top:35px;font-size:13px}.toolbar{max-width:790px;margin:22px auto;padding:15px;color:#193c6b}.toolbar button{font:inherit;background:#235ce3;color:#fff;border:0;border-radius:8px;padding:12px 20px;cursor:pointer}footer{margin-top:35px;font-size:11px;color:#637996}@page{size:A4;margin:16mm}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;padding:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media(max-width:600px){.sheet{padding:22px}.toolbar{padding:18px}header img{width:110px}}
  </style><div class="toolbar"><button onclick="window.print()">طباعة الاستمارة / حفظ PDF</button><p>من نافذة الطباعة اختر «حفظ بتنسيق PDF» لتنزيل نسخة. هذه معاينة ببيانات محفوظة في متصفحك فقط.</p></div><main class="sheet"><header><img src="${escape(faculty.logoPath)}" width="2001" height="786" alt="شعار الجامعة والكلية"><div><strong>${escape(faculty.university)}</strong><span>${escape(faculty.faculty)}</span><small>بوابة النشاط الطلابي</small></div></header><h1>استمارة تقديم النشاط الطلابي</h1><div class="notice"><strong>نسخة معاينة تجريبية — لا تصلح للاعتماد الرسمي</strong>رقم الطلب ACT-${String(r.id).padStart(5, '0')} · الإصدار ${r.version}</div><h2>بيانات الطالب</h2><div class="grid">${field('الاسم', s.student.name)}${field('الرقم الجامعي', s.student.student_id)}${field('الفرقة', s.student.year)}${field('الكلية', faculty.faculty)}</div><h2>بيانات النشاط</h2><div class="grid">${field('اسم النشاط', s.title)}${field('نوع النشاط', s.category)}${field('الجهة المنظمة', s.organization)}${field('تاريخ المشاركة', s.activity_date)}</div><h2>وصف المشاركة</h2><div class="description">${escape(s.description)}</div><p>أقر بصحة البيانات والمستندات المقدمة.</p><div class="sign"><span>توقيع الطالب<br>........................</span><span>الموظف المختص<br>........................</span><span>التاريخ<br>........................</span></div><footer>${escape(faculty.office)}<br>هذه الاستمارة تثبت التقديم فقط، والدرجة لا تُضاف قبل المراجعة والاعتماد.</footer></main></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
