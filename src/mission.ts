import type { ActivityRequest } from './types';

export type StepState = 'done' | 'current' | 'todo' | 'attention';
export interface MissionStep {
  id: string;
  title: string;
  state: StepState;
  tips: string[];
  to?: string;
  cta?: string;
}

const filled = (r: ActivityRequest) =>
  Boolean(
    r.title.trim() &&
    r.category &&
    r.organization.trim() &&
    r.activity_date &&
    r.description.trim().length >= 20,
  );

/** خطوات مهمة الطالب. الحالة تُحسب من حالة طلبه الفعلية، لا من ضغطه على زر. */
export function missionSteps(
  r: ActivityRequest | null | undefined,
  office: string,
  points: number,
): MissionStep[] {
  const submitted = Boolean(r && r.status !== 'draft' && r.version > 0);
  const revision = r?.status === 'revision';
  const approved = r?.status === 'approved';
  const closed = r?.status === 'rejected' || r?.status === 'cancelled';
  const hasDetails = Boolean(r && filled(r));
  const hasFile = Boolean(r?.attachments?.length);
  const steps: MissionStep[] = [
    {
      id: 'account',
      title: 'أنشأت حسابك',
      state: 'done',
      tips: ['بياناتك محفوظة. تقدر تراجعها وتغيّر كلمة المرور من «ملفي الشخصي».'],
    },
    {
      id: 'details',
      title: 'اكتب بيانات نشاطك',
      state: submitted || hasDetails ? 'done' : 'todo',
      to: '/activity',
      cta: r ? 'استكمل البيانات' : 'ابدأ تسجيل نشاطك',
      tips: [
        'اكتب اسم النشاط والجهة المنظمة وتاريخ مشاركتك، ووصفًا لدورك (٢٠ حرفًا على الأقل).',
        'مش عارف تبدأ منين؟ اكتب اللي عملته بكلامك العادي في «مساعد الكتابة» وهو يعبّي الحقول، وإنت تراجعها.',
        'نشاط واحد فقط في الفترة، ويُحسب لك ' + points + ' درجة بعد الاعتماد.',
      ],
    },
    {
      id: 'proof',
      title: 'أرفق مستندًا يثبت مشاركتك',
      state: submitted || hasFile ? 'done' : 'todo',
      to: '/activity',
      cta: 'ارفع المستند',
      tips: [
        'مثال: شهادة مشاركة أو خطاب شكر أو صورة من بطاقة التطوع.',
        'الصيغ: PDF أو JPG أو PNG، حتى ٨ ميجابايت للملف و٥ ملفات.',
        'تأكد إن الاسم والتاريخ واضحين ومقروءين، فده بيسرّع المراجعة.',
      ],
    },
    {
      id: 'submit',
      title: revision ? 'عدّل حسب ملاحظة الموظف ثم أعد الإرسال' : 'راجع بياناتك وأرسل الطلب',
      state: revision ? 'attention' : submitted ? 'done' : 'todo',
      to: '/activity',
      cta: revision ? 'استكمال طلبي' : 'راجع وأرسل',
      tips: revision
        ? ['راجع ملاحظة الموظف في صفحة «نشاطي»، عدّل المطلوب، ثم أعد إرسال الطلب.']
        : [
            'راجع كل البيانات قبل الإرسال؛ بعده يتوقف التعديل إلا لو الموظف طلب استكمالًا.',
            'الإرسال لا يعني الاعتماد، والدرجة تُضاف بعد قرار الموظف فقط.',
          ],
    },
    {
      id: 'deliver',
      title: 'نزّل الاستمارة واطبعها وسلّمها للمكتب',
      state: approved ? 'done' : submitted && !revision ? 'current' : 'todo',
      to: '/documents',
      cta: 'نزّل الاستمارة',
      tips: [
        'بعد الإرسال تظهر الاستمارة برقم طلبك. اطبعها وسلّمها مع الأصول: ' + office + '.',
        'الاستمارة مش إثبات اعتماد؛ هي ورقة تسليمك للمراجعة.',
      ],
    },
    {
      id: 'review',
      title: closed ? 'تم إغلاق الطلب' : 'انتظر قرار المراجعة',
      state: approved ? 'done' : closed ? 'attention' : 'todo',
      tips: closed
        ? ['راجع ملاحظة الموظف في صفحة «نشاطي» أو تواصل مع المكتب المختص.']
        : ['هتشوف النتيجة في حسابك: اعتماد أو طلب استكمال. وقت المراجعة بيعتمد على مكتب التسليم.'],
    },
  ];
  // الخطوة الحالية: أول خطوة غير مكتملة (إن لم تكن محددة)
  if (!steps.some((s) => s.state === 'current' || s.state === 'attention')) {
    const first = steps.find((s) => s.state === 'todo');
    if (first) first.state = 'current';
  }
  return steps;
}
