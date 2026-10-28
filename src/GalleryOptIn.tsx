import { useRef, useState } from 'react';
import { Images, LoaderCircle, Trash2 } from 'lucide-react';
import { api, prepareGalleryImage, useToast } from './lib';
import type { ActivityRequest } from './types';

/**
 * خيار نشر صورة النشاط في المعرض العام (اختياري).
 * الاسم لا يظهر أبدًا، والنشر لا يعني اعتماد النشاط ولا يمنح درجة.
 */
export function GalleryOptIn({
  request,
  ensureRequest,
  onChange,
  disabled,
}: {
  request: ActivityRequest | null | undefined;
  ensureRequest: () => Promise<ActivityRequest>;
  onChange: (r: ActivityRequest) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [namePending, setNamePending] = useState<boolean | null>(null);
  const consent = pending ?? Boolean(request?.gallery?.consent);
  const showName = consent && (namePending ?? Boolean(request?.gallery?.showName));
  const requireApproval = Boolean(request?.gallery?.requireApproval);

  async function setName(next: boolean) {
    setNamePending(next);
    try {
      const r = await ensureRequest();
      const result = await api<{ request: ActivityRequest }>(`/requests/${r.id}/gallery`, {
        method: 'PUT',
        body: JSON.stringify({ showName: next }),
      });
      onChange(result.request);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setNamePending(null);
    }
  }
  async function setConsent(next: boolean) {
    setPending(next);
    try {
      const r = await ensureRequest();
      const result = await api<{ request: ActivityRequest }>(`/requests/${r.id}/gallery`, {
        method: 'PUT',
        body: JSON.stringify({ consent: next }),
      });
      onChange(result.request);
      if (!next) toast('تم سحب موافقتك. لن تظهر صورة نشاطك في المعرض.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setPending(null);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const prepared = await prepareGalleryImage(file);
      const r = await ensureRequest();
      const body = new FormData();
      body.append('file', prepared);
      const result = await api<{ request: ActivityRequest }>(
        `/requests/${r.id}/attachments?kind=gallery`,
        { method: 'POST', body },
      );
      onChange(result.request);
      toast('تمت إضافة صورة المعرض.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function removeImage() {
    const id = request?.gallery?.imageId;
    if (!id) return;
    setBusy(true);
    try {
      await api(`/attachments/${id}`, { method: 'DELETE', body: '{}' });
      onChange({ ...request!, gallery: { ...request!.gallery!, imageId: null, published: false } });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const imageId = request?.gallery?.imageId;
  return (
    <div className="gallery-optin">
      <div className="form-section-heading">
        <span>٠٤</span>
        <div>
          <h2>المعرض العام (اختياري)</h2>
          <p>
            شارك صورة من نشاطك مع زملائك. الاسم لا يظهر إلا إذا وافقت، ورقمك الجامعي لا يظهر أبدًا.
          </p>
        </div>
        <Images size={19} />
      </div>
      <label className="checkbox-label gallery-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy || (disabled && !consent)}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>أوافق على نشر صورة ووصف نشاطي في المعرض العام.</span>
      </label>
      {consent && (
        <label className="checkbox-label gallery-consent gallery-name-consent">
          <input
            type="checkbox"
            checked={showName}
            disabled={busy || (disabled && !showName)}
            onChange={(e) => setName(e.target.checked)}
          />
          <span>
            وأوافق أيضًا على إظهار <strong>اسمي الأول</strong> بجانب المنشور (اختياري). لو لم أختر،
            يظهر المنشور باسم الجهة المنظمة فقط.
          </span>
        </label>
      )}
      {consent && (
        <div className="gallery-picker">
          <input
            className="sr-only"
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            aria-label="صورة المعرض"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {imageId ? (
            <div className="gallery-thumb">
              <img src={`/api/attachments/${imageId}`} alt="معاينة صورة المعرض" />
              {!disabled && (
                <div className="gallery-thumb-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    تغيير الصورة
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="حذف صورة المعرض"
                    disabled={busy}
                    onClick={removeImage}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="button secondary"
              disabled={disabled || busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Images size={17} />}
              اختر صورة المعرض
            </button>
          )}
          <p className="muted gallery-note">
            تُزال بيانات الموقع والكاميرا من الصورة تلقائيًا.{' '}
            {requireApproval ? 'تظهر الصورة بعد اعتماد النشاط.' : 'تظهر الصورة بمجرد إرسال الطلب.'}{' '}
            النشر في المعرض لا يعني اعتماد النشاط ولا يمنح أي درجة، ويمكنك سحب موافقتك في أي وقت.
          </p>
        </div>
      )}
    </div>
  );
}
