import { BookOpenCheck, Check, FileText } from 'lucide-react';
import { logoSrc, useSession } from './lib';

export function BrandMark({ light = false }: { light?: boolean }) {
  const { session } = useSession();
  return (
    <div className={`brand ${light ? 'light' : ''}`}>
      <div className="brand-logos">
        <img
          src={logoSrc(session.faculty.logoPath)}
          width="2001"
          height="786"
          alt="شعار جامعة قناة السويس وشعار كلية التجارة"
          fetchPriority="high"
        />
      </div>
      <div className="brand-copy">
        <strong>{session.faculty.faculty}</strong>
        <small>{session.faculty.university}</small>
      </div>
    </div>
  );
}

export function AcademicSeal() {
  const { session } = useSession();
  return (
    <div className="academic-seal">
      <img
        src={logoSrc(session.faculty.logoPath)}
        width="2001"
        height="786"
        alt="جامعة قناة السويس — كلية التجارة"
      />
      <div className="seal-divider" />
      <strong>{session.faculty.faculty}</strong>
      <span>{session.faculty.university}</span>
      <small>منظومة تسجيل واعتماد النشاط الطلابي</small>
    </div>
  );
}

export function LoginProcess() {
  return (
    <div className="login-process">
      {[
        { Icon: FileText, title: 'سجّل مشاركتك', text: 'بيانات واضحة ومستندات محفوظة' },
        { Icon: BookOpenCheck, title: 'قدّم استمارتك', text: 'نسخة منظمة جاهزة للطباعة' },
        { Icon: Check, title: 'تابع الاعتماد', text: '٤٠ درجة بعد المراجعة والاعتماد' },
      ].map(({ Icon, title, text }) => (
        <div key={title}>
          <span>
            <Icon size={21} aria-hidden="true" />
          </span>
          <div>
            <strong>{title}</strong>
            <small>{text}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
