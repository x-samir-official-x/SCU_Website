import { useState } from 'react';
import { Check, Sparkles, TriangleAlert } from 'lucide-react';
import { suggestActivity, type Suggestion } from './assistant';

const FIELDS: { key: keyof Omit<Suggestion, 'notes'>; label: string }[] = [
  { key: 'title', label: 'اسم النشاط' },
  { key: 'category', label: 'نوع النشاط' },
  { key: 'organization', label: 'الجهة المنظمة' },
  { key: 'activity_date', label: 'تاريخ المشاركة' },
];

/**
 * مساعد الاستمارة المحلي: الطالب يكتب ما فعله بكلماته، فيقترح المساعد تعبئة الحقول.
 * يعمل داخل المتصفح فقط (لا يُرسل كلامه لأي جهة)، والطالب يراجع ويؤكد قبل التطبيق.
 */
export function FormAssistant({
  types,
  onApply,
}: {
  types: string[];
  onApply: (s: Suggestion) => void;
}) {
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const found = suggestion ? FIELDS.filter((f) => suggestion[f.key]).length : 0;
  return (
    <div className="assistant-card">
      <div className="assistant-head">
        <span className="assistant-icon">
          <Sparkles size={20} />
        </span>
        <div>
          <h3>اكتب نشاطك بكلماتك ونحن نعبّي الاستمارة</h3>
          <p>
            مثال: «شاركت في حملة تشجير الحرم الجامعي يوم ١٥ أكتوبر مع فريق أصدقاء البيئة». يعمل
            المساعد داخل متصفحك فقط، ولا يُرسل كلامك لأي جهة.
          </p>
        </div>
      </div>
      <textarea
        aria-label="اكتب ما فعلته بكلماتك"
        value={text}
        rows={3}
        maxLength={2000}
        placeholder="اكتب ما فعلته: ماذا؟ ومتى؟ ومع من؟"
        onChange={(e) => {
          setText(e.target.value);
          setSuggestion(null);
        }}
      />
      <button
        type="button"
        className="button secondary"
        disabled={!text.trim()}
        onClick={() => setSuggestion(suggestActivity(text, { types }))}
      >
        <Sparkles size={17} />
        اقترح تعبئة الاستمارة
      </button>
      {suggestion && (
        <div className="assistant-result" role="status">
          <dl>
            {FIELDS.map((f) => (
              <div key={f.key} data-missing={!suggestion[f.key]}>
                <dt>{f.label}</dt>
                <dd>{suggestion[f.key] || 'لم أتعرّف عليه، اكتبه بنفسك'}</dd>
              </div>
            ))}
            <div data-missing={suggestion.description.length < 20}>
              <dt>وصف المشاركة</dt>
              <dd>كلامك كما كتبته</dd>
            </div>
          </dl>
          {suggestion.notes.length > 0 && (
            <ul className="assistant-notes">
              {suggestion.notes.map((n) => (
                <li key={n}>
                  <TriangleAlert size={15} />
                  {n}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="button primary"
            disabled={found === 0 && suggestion.description.length < 20}
            onClick={() => onApply(suggestion)}
          >
            <Check size={17} />
            تطبيق على الاستمارة
          </button>
          <small className="muted">
            راجع القيم بعد التطبيق وعدّلها لو لزم، فالمسؤولية على صحة البيانات تظل عليك.
          </small>
        </div>
      )}
    </div>
  );
}
