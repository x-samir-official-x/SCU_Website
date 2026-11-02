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
/* الحساب يحمل رقمًا جامعيًا أو قوميًا (واحد على الأقل). للعرض: الجامعي، وإلا آخر ٤ أرقام من القومي. */
const idShown = (u) =>
  u.student_id || (u.national_id ? 'ق.م ••••' + String(u.national_id).slice(-4) : null);
const NO_EMAIL = '@no-email.invalid';
const isPlaceholder = (email) =>
  String(email || '')
    .toLowerCase()
    .endsWith(NO_EMAIL);
const TEMP_HOURS = 72;
const MAX_EXPIRIES = 3;
const cleanUser = ({
  password,
  national_id,
  avatar_blob,
  temp_expiries,
  locked_reason,
  must_change_password,
  temp_expires_at,
  ...user
}) => ({
  ...user,
  email: isPlaceholder(user.email) ? '' : user.email,
  must_change: Boolean(must_change_password),
  temp_expires_at: must_change_password ? temp_expires_at : null,
  student_id: idShown({ ...user, national_id }),
});
/* يجب أن يطابق منطق الخادم (server/index.ts): كلمة مؤقتة، مهلة، قفل، ثم موظف. */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeTempPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const c = [...bytes].map((b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]);
  return [c.slice(0, 4), c.slice(4, 8), c.slice(8)].map((g) => g.join('')).join('-');
};
const normalizeTemp = (v) => {
  const n = String(v ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  return n.length === 12 ? `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}` : n;
};
const settleExpired = (u) => {
  if (u.locked_reason) return u.locked_reason;
  if (!u.must_change_password || !u.temp_expires_at || u.temp_expires_at > Date.now()) return null;
  u.temp_expiries = (u.temp_expiries || 0) + 1;
  u.locked_reason = u.temp_expiries >= MAX_EXPIRIES ? 'staff' : 'expired';
  return u.locked_reason;
};
const issueTemp = (u) => {
  const password = makeTempPassword();
  u.password = password;
  u.must_change_password = 1;
  u.temp_expires_at = Date.now() + TEMP_HOURS * 3600 * 1000;
  u.locked_reason = null;
  return { password, expiresAt: new Date(u.temp_expires_at).toISOString() };
};
const DEMO_ROSTER = [
  ['منى إبراهيم السيد', '30401011200141', '20269001', 'الفرقة الثانية'],
  ['كريم حسن عبد الله', '30311121200172', '20269002', 'الفرقة الثالثة'],
  ['هدى محمود فتحي', '30507201200215', null, 'الفرقة الأولى'],
  ['ياسين طارق مصطفى', '30209091200333', '20269004', 'الفرقة الرابعة'],
];
const seedRoster = (users) => {
  const rows = users
    .filter((u) => u.role === 'student')
    .map((u) => [u.name, u.national_id, u.student_id, u.year])
    .concat(DEMO_ROSTER);
  return rows.map(([name, national_id, student_id, year], i) => ({
    id: i + 1,
    name,
    national_id,
    student_id,
    year,
  }));
};
const claimMismatch =
  'بياناتك غير مطابقة لسجلات الكلية. راجع الأرقام، أو تواصل مع مكتب النشاط الطلابي.';
const YEARS = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
/* يجب أن يطابق validatePhone في src/registration.ts */
const validatePhone = (input) => {
  let v = normalizeDigits(input).replace(/^\+/, '');
  if (!v) return { ok: true, value: null };
  if (v.startsWith('0020')) v = v.slice(4);
  else if (v.startsWith('20') && v.length === 12) v = v.slice(2);
  if (/^1[0125][0-9]{8}$/.test(v)) v = '0' + v;
  if (!/^01[0125][0-9]{8}$/.test(v))
    return { ok: false, error: 'رقم الموبايل المصري ١١ رقمًا ويبدأ بـ 01.' };
  return { ok: true, value: v };
};
const notify = (state, userId, title, body = '', link = null) => {
  state.notifications ||= [];
  const id = state.notifications.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  state.notifications.push({
    id,
    user_id: userId,
    title,
    body: String(body).slice(0, 300),
    link,
    created_at: new Date().toISOString(),
    read: false,
  });
  const mine = state.notifications.filter((n) => n.user_id === userId);
  if (mine.length > 100)
    state.notifications = state.notifications.filter(
      (n) => n.user_id !== userId || mine.slice(-100).includes(n),
    );
};
/* يجب أن يطابق src/terms.ts */
const TERMS_VERSION = '2026-10-v1';
const normalizeDigits = (v) =>
  String(v ?? '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s,\-_.]/g, '');
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
        note: 'تم تقديم الطلب',
        actor_name: users.find((u) => u.id === user_id).name,
        created_at: ts,
      },
    ],
  }));
  return {
    users,
    requests,
    roster: seedRoster(users),
    activeUser: null,
    nextRequest: 5,
    nextAttachment: 1,
    nextUser: 8,
  };
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
          // معاينات محفوظة قبل «إثبات الهوية» تحصل على السجل دون فقد بياناتها
          state.roster ||= seedRoster(state.users);
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
/* شرط النشر في المعرض (نفس منطق الخادم). النشر لا يعني الاعتماد ولا يمنح درجة. */
const isPublished = (r, faculty) =>
  Boolean(r.gallery_consent) &&
  !r.gallery_hidden &&
  (faculty.gallery?.requireApproval ? ['approved'] : ['pending', 'approved']).includes(r.status) &&
  r.attachments.some((f) => f.kind === 'gallery');
function publicRequest(r, state, faculty) {
  const u = state.users.find((u) => u.id === r.user_id);
  const { versions, attachments, ...fields } = r;
  const image = [...attachments].reverse().find((f) => f.kind === 'gallery');
  return {
    ...fields,
    student_name: u.name,
    student_phone: u.phone || null,
    student_avatar: u.avatar_v || 0,
    student_id: idShown(u),
    year: u.year,
    gallery: {
      consent: Boolean(r.gallery_consent),
      showName: Boolean(r.gallery_show_name),
      hidden: Boolean(r.gallery_hidden),
      imageId: image ? image.id : null,
      published: isPublished(r, faculty),
      requireApproval: Boolean(faculty.gallery?.requireApproval),
    },
    attachments: attachments.filter((f) => f.kind !== 'gallery').map(({ blob, ...file }) => file),
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
      let user = state.users.find((u) => u.id === state.activeUser && u.active);
      if (user && settleExpired(user)) {
        state.activeUser = null;
        user = undefined;
      }
      if (route === '/health') return json({ status: 'ok', demo: true, preview: true });
      if (route === '/session')
        return json({
          user: user ? cleanUser(user) : null,
          csrfToken: 'browser-demo-only',
          demo: true,
          preview: true,
          tempPasswordHours: TEMP_HOURS,
          emailEnabled: false,
          faculty,
        });
      if (route === '/gallery' && method === 'GET') {
        const limit = Math.max(1, Math.min(24, Number(url.searchParams.get('limit')) || 9));
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const all = state.requests
          .filter((r) => isPublished(r, faculty))
          .sort(
            (a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)) || b.id - a.id,
          );
        const posts = all.slice(offset, offset + limit).map((r) => {
          const u = state.users.find((u) => u.id === r.user_id);
          const clean = String(u.name).trim().replace(/\s+/g, ' ');
          return {
            id: r.id,
            title: r.title,
            category: r.category,
            organization: r.organization,
            activityDate: r.activity_date,
            text: r.description,
            publishedAt: r.submitted_at,
            author: r.gallery_show_name
              ? faculty.gallery?.nameDisplay === 'full'
                ? clean
                : clean.split(' ')[0]
              : null,
            image: `/api/gallery/${r.id}/image`,
          };
        });
        return json({ posts, hasMore: all.length > offset + limit });
      }
      const galleryImage = route.match(/^\/gallery\/(\d+)\/image$/);
      if (galleryImage && method === 'GET') {
        const r = state.requests.find((r) => r.id === Number(galleryImage[1]));
        fail(r && isPublished(r, faculty), 404, 'الصورة غير موجودة.');
        const f = [...r.attachments].reverse().find((f) => f.kind === 'gallery');
        return new Response(f.blob, {
          headers: { 'Content-Type': f.mime, 'Cache-Control': 'no-store' },
        });
      }
      if (route === '/demo-accounts')
        return json({
          accounts: ['student', 'moderator', 'admin'].map((role) => ({
            role,
            email: `${role}@demo.local`,
            password: 'Demo2026!',
          })),
        });
      if (route === '/claim' && method === 'POST') {
        const national = normalizeDigits(input.national_id);
        const student = normalizeDigits(input.student_id);
        fail(/^[0-9]{14}$/.test(national), 400, 'الرقم القومي ١٤ رقمًا.');
        fail(!student || /^[0-9]{4,20}$/.test(student), 400, 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.');
        fail(
          input.accepted_terms === true || input.accepted_terms === 'on',
          400,
          'يجب الموافقة على الشروط للمتابعة.',
        );
        const entry = state.roster.find((r) => r.national_id === national);
        fail(
          entry && (!student || !entry.student_id || entry.student_id === student),
          404,
          claimMismatch,
        );
        let account = state.users.find((u) => u.national_id === national);
        if (!account) {
          const idTaken =
            entry.student_id && state.users.some((u) => u.student_id === entry.student_id);
          account = {
            id: state.nextUser++,
            name: entry.name,
            email: national + NO_EMAIL,
            student_id: idTaken ? null : entry.student_id,
            national_id: national,
            year: entry.year,
            role: 'student',
            active: 1,
            created_at: stamp(),
            terms_version: TERMS_VERSION,
            terms_accepted_at: stamp(),
            temp_expiries: 0,
          };
          state.users.push(account);
        } else {
          fail(account.active, 403, 'هذا الحساب موقوف. تواصل مع مكتب النشاط الطلابي.');
          const locked = settleExpired(account);
          fail(
            locked !== 'staff',
            403,
            'تكرر انتهاء المهلة. توجّه إلى مكتب النشاط الطلابي لإصدار كلمة مرور جديدة.',
          );
          fail(
            locked === 'expired',
            409,
            account.must_change_password
              ? 'أُصدرت لك كلمة مرور مؤقتة ولم تنتهِ مدتها بعد. استخدمها لتسجيل الدخول، أو تواصل مع المكتب إن فُقدت.'
              : 'هذا الحساب مفعّل بالفعل. سجّل الدخول بالرقم القومي وكلمة مرورك.',
          );
        }
        const issued = issueTemp(account);
        return json(
          {
            temporaryPassword: issued.password,
            expiresAt: issued.expiresAt,
            hours: TEMP_HOURS,
            firstName: entry.name.split(' ')[0],
          },
          201,
        );
      }
      if (route === '/login' && method === 'POST') {
        const ident = String(input.email || '').trim();
        const asNational = normalizeDigits(ident);
        const found = state.users.find(
          (u) =>
            u.active &&
            (/^[0-9]{14}$/.test(asNational)
              ? u.national_id === asNational
              : u.email.toLowerCase() === ident.toLowerCase()),
        );
        const typed = String(input.password || '');
        fail(
          found &&
            (found.password === typed ||
              (found.must_change_password && found.password === normalizeTemp(typed))),
          401,
          'بيانات الدخول غير صحيحة. راجع الرقم القومي أو البريد وكلمة المرور.',
        );
        const locked = settleExpired(found);
        fail(
          !locked,
          403,
          locked === 'staff'
            ? 'تكرر انتهاء مهلة كلمة المرور المؤقتة. توجّه إلى مكتب النشاط الطلابي لإصدار كلمة مرور جديدة.'
            : 'انتهت مهلة كلمة المرور المؤقتة. أثبت هويتك من جديد من صفحة «إثبات هويتك» لإصدار كلمة مرور جديدة.',
        );
        state.activeUser = found.id;
        return json({ ok: true, mustChange: Boolean(found.must_change_password) });
      }
      fail(user, 401, 'يرجى تسجيل الدخول أولًا.');
      if (route === '/logout' && method === 'POST') {
        state.activeUser = null;
        return json({ ok: true });
      }
      if (user.must_change_password) {
        const open =
          (method === 'PUT' && ['/profile/first-password', '/profile/password'].includes(route)) ||
          (method === 'GET' && ['/session', '/health'].includes(route));
        fail(open, 403, 'يجب اختيار كلمة مرور خاصة بك أولًا قبل متابعة استخدام الحساب.');
      }
      const studentOnly = () => fail(user.role === 'student', 403, 'هذه الصفحة للطلاب فقط.');
      if (route === '/profile/first-password' && method === 'PUT') {
        fail(user.must_change_password, 409, 'كلمة مرورك خاصة بك بالفعل. غيّرها من ملفك الشخصي.');
        const next = String(input.password || '');
        fail(next.length >= 8 && next.length <= 100, 400, 'كلمة المرور من ٨ إلى ١٠٠ حرف.');
        fail(
          next !== user.password && normalizeTemp(next) !== user.password,
          400,
          'اختر كلمة مرور مختلفة عن المؤقتة.',
        );
        fail(
          !/^(.)\1+$/.test(next),
          400,
          'كلمة المرور شائعة وسهلة التخمين. اختر كلمة أطول وأقل توقعًا.',
        );
        fail(
          !(user.national_id && next.includes(user.national_id)) &&
            !(user.student_id && next.includes(user.student_id)),
          400,
          'لا تضع بريدك أو رقمك الجامعي داخل كلمة المرور.',
        );
        user.password = next;
        user.must_change_password = 0;
        user.temp_expires_at = null;
        user.temp_expiries = 0;
        user.locked_reason = null;
        return json({ ok: true });
      }
      if (route === '/profile' && method === 'GET') {
        studentOnly();
        const history = state.requests
          .filter((r) => r.user_id === user.id && r.status !== 'draft')
          .sort((a, b) => b.id - a.id)
          .map((r) => ({
            id: r.id,
            period: r.period,
            title: r.title,
            status: r.status,
            submitted_at: r.submitted_at,
            points: r.status === 'approved' ? faculty.points : 0,
          }));
        return json({
          profile: {
            name: user.name,
            email: isPlaceholder(user.email) ? '' : user.email,
            phone: user.phone || null,
            year: user.year,
            idShown: idShown(user),
            hasUniversityId: Boolean(user.student_id),
            hasNationalId: Boolean(user.national_id),
            createdAt: user.created_at,
            termsVersion: user.terms_version || null,
            termsAcceptedAt: user.terms_accepted_at || null,
          },
          history,
          totalPoints: history.reduce((n, h) => n + h.points, 0),
        });
      }
      if (route === '/profile/year' && method === 'PUT') {
        studentOnly();
        fail(YEARS.includes(input.year), 400, 'اختر الفرقة الدراسية.');
        user.year = input.year;
        return json({ ok: true });
      }
      if (route === '/profile/university-id' && method === 'PUT') {
        studentOnly();
        fail(!user.student_id, 409, 'الرقم الجامعي مسجل بالفعل ولا يمكن تغييره من هنا.');
        const value = normalizeDigits(input.studentId);
        fail(/^[0-9]{4,20}$/.test(value), 400, 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.');
        fail(
          !state.users.some((u) => u.student_id === value),
          409,
          'هذا الرقم الجامعي مستخدم في حساب آخر.',
        );
        user.student_id = value;
        return json({ ok: true });
      }
      if (route === '/profile/password' && method === 'PUT') {
        fail(
          user.password === input.current ||
            (user.must_change_password && user.password === normalizeTemp(input.current)),
          403,
          'كلمة المرور الحالية غير صحيحة.',
        );
        const next = String(input.password || '');
        fail(next.length >= 8 && next.length <= 100, 400, 'كلمة المرور الجديدة من ٨ إلى ١٠٠ حرف.');
        fail(next !== input.current, 400, 'اختر كلمة مرور مختلفة عن الحالية.');
        user.password = next;
        user.must_change_password = 0;
        user.temp_expires_at = null;
        user.temp_expiries = 0;
        user.locked_reason = null;
        return json({ ok: true });
      }
      if (route === '/profile/logout-others' && method === 'POST') return json({ ok: true });
      if (route === '/profile/onboarding' && method === 'PUT') {
        studentOnly();
        user.onboarding_dismissed = input.dismissed ? 1 : 0;
        return json({ ok: true });
      }
      if (route === '/notifications' && method === 'GET') {
        const mine = (state.notifications || []).filter((n) => n.user_id === user.id);
        return json({
          notifications: mine
            .slice(-30)
            .reverse()
            .map(({ user_id, ...n }) => n),
          unread: mine.filter((n) => !n.read).length,
        });
      }
      if (route === '/notifications/read' && method === 'POST') {
        for (const n of state.notifications || [])
          if (n.user_id === user.id && (!input.id || n.id === input.id)) n.read = true;
        return json({ ok: true });
      }
      if (route === '/profile/avatar' && method === 'POST') {
        studentOnly();
        fail(file.size <= 2 * 1024 * 1024, 400, 'الصورة أكبر من ٢ ميجابايت أو غير صالحة.');
        fail(file.type !== 'application/pdf', 400, 'اختر صورة PNG أو JPG صحيحة.');
        user.avatar_blob = file;
        user.avatar_v = Date.now();
        return json({ ok: true }, 201);
      }
      if (route === '/profile/avatar' && method === 'DELETE') {
        user.avatar_blob = null;
        user.avatar_v = 0;
        return json({ ok: true });
      }
      const avatarMatch = route.match(/^\/avatar\/(\d+)$/);
      if (avatarMatch && method === 'GET') {
        const owner = state.users.find((u) => u.id === Number(avatarMatch[1]));
        fail(user.id === Number(avatarMatch[1]) || user.role !== 'student', 403, 'غير مسموح.');
        fail(owner && owner.avatar_blob, 404, 'لا توجد صورة.');
        return new Response(owner.avatar_blob, {
          headers: {
            'Content-Type': owner.avatar_blob.type,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
      if (route === '/profile/phone' && method === 'PUT') {
        studentOnly();
        const phone = validatePhone(input.phone);
        fail(phone.ok, 400, phone.error);
        user.phone = phone.value;
        return json({ ok: true });
      }
      if (route === '/profile/email' && method === 'PUT') {
        studentOnly();
        const email = String(input.email || '')
          .trim()
          .toLowerCase();
        fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'راجع البريد الإلكتروني.');
        fail(user.password === input.password, 403, 'كلمة المرور غير صحيحة.');
        fail(
          !state.users.some((u) => u.id !== user.id && u.email.toLowerCase() === email),
          409,
          'هذا البريد مستخدم في حساب آخر.',
        );
        user.email = email;
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
        return json({ request: r ? publicRequest(r, state, faculty) : null });
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
        return json({ request: publicRequest(r, state, faculty) }, 201);
      }
      let match = route.match(/^\/requests\/(\d+)(?:\/(submit|attachments|form|gallery))?$/);
      if (match) {
        const r = get(match[1]);
        const action = match[2];
        if (!action && method === 'GET') return json({ request: publicRequest(r, state, faculty) });
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
          return json({ request: publicRequest(r, state, faculty) });
        }
        if (action === 'attachments' && method === 'POST') {
          editable(r);
          const kind = url.searchParams.get('kind') === 'gallery' ? 'gallery' : 'document';
          fail(
            kind === 'gallery' || r.attachments.filter((f) => f.kind !== 'gallery').length < 5,
            400,
            'الحد الأقصى خمسة ملفات.',
          );
          fail(file, 400, 'اختر المستند.');
          if (kind === 'gallery') {
            fail(file.type !== 'application/pdf', 400, 'صورة المعرض يجب أن تكون PNG أو JPG.');
            r.attachments = r.attachments.filter((f) => f.kind !== 'gallery');
          }
          r.attachments.push({
            id: state.nextAttachment++,
            original_name: kind === 'gallery' ? 'gallery-image' : file.name,
            mime: file.type,
            size: file.size,
            created_at: stamp(),
            kind,
            blob: file,
          });
          return json({ request: publicRequest(r, state, faculty) }, 201);
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
          fail(
            r.attachments.some((f) => f.kind !== 'gallery'),
            400,
            'أرفق مستندًا واحدًا على الأقل.',
          );
          fail(
            !r.gallery_consent || r.attachments.some((f) => f.kind === 'gallery'),
            400,
            'أضف صورة المعرض أو ألغِ خيار النشر قبل الإرسال.',
          );
          r.status = 'pending';
          r.version++;
          r.submitted_at = stamp();
          r.reviewed_at = null;
          r.physical_received = 0;
          r.versions.push({
            student: {
              ...cleanUser(user),
              id_label: user.student_id ? 'الرقم الجامعي' : 'الرقم القومي',
              student_id: user.student_id || user.national_id || '',
            },
            title: r.title,
            category: r.category,
            organization: r.organization,
            activity_date: r.activity_date,
            description: r.description,
            submitted_at: r.submitted_at,
            version: r.version,
          });
          record(r, user, 'submitted', 'تم تقديم النشاط للمراجعة');
          for (const u of state.users.filter((u) => u.role !== 'student' && u.active))
            notify(
              state,
              u.id,
              r.version > 1 ? 'طلب أُعيد إرساله للمراجعة' : 'طلب جديد للمراجعة',
              `${user.name} — ${r.title}`,
              `/requests/${r.id}`,
            );
          return json({ request: publicRequest(r, state, faculty) });
        }
        if (action === 'gallery' && method === 'PUT') {
          fail(user.role === 'student' && r.user_id === user.id, 403, 'غير مسموح.');
          fail(
            (input.consent === undefined || typeof input.consent === 'boolean') &&
              (input.showName === undefined || typeof input.showName === 'boolean'),
            400,
            'طلب غير صحيح.',
          );
          if (input.consent === true || input.showName === true) editable(r);
          if (input.consent !== undefined) r.gallery_consent = input.consent ? 1 : 0;
          if (input.showName !== undefined) r.gallery_show_name = input.showName ? 1 : 0;
          if (input.consent === false) r.gallery_show_name = 0;
          return json({ request: publicRequest(r, state, faculty) });
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
      const rosterState = (r) => {
        const u = state.users.find((x) => x.national_id === r.national_id);
        if (!u) return 'none';
        if (!u.active) return 'disabled';
        const locked =
          u.locked_reason ||
          (u.must_change_password && u.temp_expires_at && u.temp_expires_at <= Date.now()
            ? (u.temp_expiries || 0) + 1 >= MAX_EXPIRIES
              ? 'staff'
              : 'expired'
            : null);
        return locked || (u.must_change_password ? 'temp' : 'active');
      };
      if (route === '/staff/roster' && method === 'GET') {
        const text = String(url.searchParams.get('q') || '')
          .trim()
          .slice(0, 60);
        const q = normalizeDigits(text);
        let rows = state.roster;
        if (text)
          rows = /^[0-9]{4,}$/.test(q)
            ? rows.filter((r) => r.national_id === q || r.student_id === q)
            : rows.filter((r) => r.name.includes(text));
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ar')).slice(0, 50);
        const activated = state.roster.filter((r) => {
          const u = state.users.find((x) => x.national_id === r.national_id);
          return u && !u.must_change_password;
        }).length;
        return json({
          total: state.roster.length,
          activated,
          tempHours: TEMP_HOURS,
          students: rows.map((r) => ({
            id: r.id,
            name: r.name,
            year: r.year,
            studentId: r.student_id,
            nationalLast4: r.national_id.slice(-4),
            state: rosterState(r),
          })),
        });
      }
      match = route.match(/^\/staff\/roster\/(\d+)\/temp-password$/);
      if (match && method === 'POST') {
        const entry = state.roster.find((r) => r.id === Number(match[1]));
        fail(entry, 404, 'الطالب غير موجود في السجل.');
        let account = state.users.find((u) => u.national_id === entry.national_id);
        fail(!account || account.active, 409, 'هذا الحساب موقوف.');
        if (!account) {
          account = {
            id: state.nextUser++,
            name: entry.name,
            email: entry.national_id + NO_EMAIL,
            student_id: entry.student_id,
            national_id: entry.national_id,
            year: entry.year,
            role: 'student',
            active: 1,
            created_at: stamp(),
          };
          state.users.push(account);
        }
        account.temp_expiries = 0;
        const issued = issueTemp(account);
        return json(
          {
            temporaryPassword: issued.password,
            expiresAt: issued.expiresAt,
            hours: TEMP_HOURS,
            name: entry.name,
          },
          201,
        );
      }
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
            .map((r) => publicRequest(r, state, faculty)),
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
          requests: rows
            .slice((page - 1) * 10, page * 10)
            .map((r) => publicRequest(r, state, faculty)),
          total: rows.length,
          page,
          limit: 10,
        });
      }
      match = route.match(/^\/staff\/requests\/(\d+)\/gallery-hidden$/);
      if (match && method === 'POST') {
        const r = get(match[1]);
        fail(typeof input.hidden === 'boolean', 400, 'طلب غير صحيح.');
        r.gallery_hidden = input.hidden ? 1 : 0;
        record(
          r,
          user,
          input.hidden ? 'gallery_hidden' : 'gallery_shown',
          input.hidden ? 'إخفاء النشاط من المعرض العام' : 'إظهار النشاط في المعرض العام',
        );
        if (input.hidden)
          notify(
            state,
            r.user_id,
            'أُخفي نشاطك من المعرض العام',
            'راجع مكتب النشاط الطلابي لو عندك استفسار. لا يؤثر هذا على اعتماد نشاطك.',
            '/activity',
          );
        return json({ request: publicRequest(r, state, faculty) });
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
        const text = {
          approve: ['تم اعتماد نشاطك', `أُضيفت ${faculty.points} درجة إلى سجلك.`],
          revision: ['مطلوب استكمال طلبك', note],
          reject: ['لم يُعتمد طلبك', note],
          cancel: ['تم إلغاء طلبك', note],
          reopen: ['أُعيد فتح طلبك للتعديل', note],
          revoke: ['تم سحب اعتماد نشاطك', note],
        }[action];
        notify(state, r.user_id, text[0], text[1], '/activity');
        return json({ request: publicRequest(r, state, faculty) });
      }
      if (route.startsWith('/admin/')) admin();
      if (route === '/admin/roster/import' && method === 'POST') {
        const rows = Array.isArray(input.rows) ? input.rows : [];
        fail(rows.length >= 1 && rows.length <= 300, 400, 'عدد الصفوف غير صحيح.');
        let added = 0;
        let updated = 0;
        const rejected = [];
        rows.forEach((raw, index) => {
          const name = String(raw.name || '')
            .trim()
            .replace(/\s+/g, ' ');
          const national = normalizeDigits(raw.national_id);
          const student = normalizeDigits(raw.student_id);
          const year = YEARS.includes(raw.year) ? raw.year : null;
          const error =
            name.length < 3 || name.length > 100
              ? 'الاسم من ٣ إلى ١٠٠ حرف.'
              : !/^[0-9]{14}$/.test(national)
                ? 'الرقم القومي ١٤ رقمًا.'
                : student && !/^[0-9]{4,20}$/.test(student)
                  ? 'الرقم الجامعي من ٤ إلى ٢٠ رقمًا.'
                  : '';
          if (error) return rejected.push({ index, error });
          const hit = state.roster.find((r) => r.national_id === national);
          if (hit) {
            hit.name = name;
            hit.student_id = student || hit.student_id;
            hit.year = year || hit.year;
            updated++;
          } else {
            state.roster.push({
              id: state.roster.reduce((m, r) => Math.max(m, r.id), 0) + 1,
              name,
              national_id: national,
              student_id: student || null,
              year,
            });
            added++;
          }
        });
        return json({ added, updated, rejected });
      }
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
  </style><div class="toolbar"><button onclick="window.print()">طباعة الاستمارة / حفظ PDF</button><p>من نافذة الطباعة اختر «حفظ بتنسيق PDF» لتنزيل نسخة. هذه معاينة ببيانات محفوظة في متصفحك فقط.</p></div><main class="sheet"><header><img src="${escape(faculty.logoPath)}" width="2001" height="786" alt="شعار الجامعة والكلية"><div><strong>${escape(faculty.university)}</strong><span>${escape(faculty.faculty)}</span><small>بوابة النشاط الطلابي</small></div></header><h1>استمارة تقديم النشاط الطلابي</h1><div class="notice">رقم الطلب ACT-${String(r.id).padStart(5, '0')} · الإصدار ${r.version}</div><h2>بيانات الطالب</h2><div class="grid">${field('الاسم', s.student.name)}${field(s.student.id_label || 'الرقم الجامعي', s.student.student_id)}${field('الفرقة', s.student.year)}${field('الكلية', faculty.faculty)}</div><h2>بيانات النشاط</h2><div class="grid">${field('اسم النشاط', s.title)}${field('نوع النشاط', s.category)}${field('الجهة المنظمة', s.organization)}${field('تاريخ المشاركة', s.activity_date)}</div><h2>وصف المشاركة</h2><div class="description">${escape(s.description)}</div><p>أقر بصحة البيانات والمستندات المقدمة.</p><div class="sign"><span>توقيع الطالب<br>........................</span><span>الموظف المختص<br>........................</span><span>التاريخ<br>........................</span></div><footer>${escape(faculty.office)}<br>هذه الاستمارة تثبت التقديم فقط، والدرجة لا تُضاف قبل المراجعة والاعتماد.</footer></main></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
