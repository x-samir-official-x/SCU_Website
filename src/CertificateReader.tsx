import { useState } from 'react';
import { ScanText } from 'lucide-react';
import { api } from './lib';
import type { Attachment } from './types';
import type { CertificateCheck } from './certificate';

interface Reading {
  text: string;
  confidence: number;
  checks: CertificateCheck[];
}
const icon: Record<CertificateCheck['status'], string> = {
  match: '✓',
  partial: '~',
  mismatch: '✗',
  missing: '؟',
};
const word: Record<CertificateCheck['status'], string> = {
  match: 'مطابق',
  partial: 'جزئي',
  mismatch: 'مختلف',
  missing: 'غير ظاهر',
};

/** مساعد للموظف: يقرأ الشهادة آليًا ويقارن بياناتها بالطلب. لا يعتمد ولا يرفض. */
export function CertificateReader({ files }: { files: Attachment[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, Reading>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  if (!files.length) return null;
  const read = async (id: number) => {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      const data = await api<Reading>(`/staff/attachments/${id}/read`, {
        method: 'POST',
        body: '{}',
      });
      setResults((r) => ({ ...r, [id]: data }));
    } catch (error) {
      setErrors((e) => ({ ...e, [id]: error instanceof Error ? error.message : 'تعذرت القراءة.' }));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="cert-reader">
      <h3>
        <ScanText size={18} /> قراءة الشهادة (مساعدة للموظف)
      </h3>
      <p className="muted small-text">
        قراءة آلية قد تخطئ خاصة مع الصور غير الواضحة. هي مقارنة سريعة فقط، والقرار لك بعد مطابقة
        المستند الأصلي.
      </p>
      {files.map((file) => {
        const result = results[file.id];
        return (
          <div className="cert-item" key={file.id}>
            <div className="cert-head">
              <span>{file.original_name}</span>
              <button
                type="button"
                className="btn secondary"
                disabled={busy !== null}
                onClick={() => read(file.id)}
              >
                {busy === file.id ? 'جارٍ القراءة…' : result ? 'إعادة القراءة' : 'اقرأ المستند'}
              </button>
            </div>
            {errors[file.id] && <p className="error-text">{errors[file.id]}</p>}
            {result && (
              <>
                <ul className="cert-checks">
                  {result.checks.map((c) => (
                    <li key={c.field} className={`cert-${c.status}`}>
                      <b aria-hidden>{icon[c.status]}</b>
                      <div>
                        <strong>
                          {c.label}: {word[c.status]}
                        </strong>
                        <small>
                          المطلوب: {c.expected} — {c.detail}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>النص المقروء (دقة تقريبية {result.confidence}%)</summary>
                  <pre>{result.text || 'لم يُقرأ أي نص.'}</pre>
                </details>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
