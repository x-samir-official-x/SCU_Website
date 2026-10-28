import { useEffect, useState } from 'react';

/** الصورة الشخصية إن وُجدت، وإلا أول حرف من الاسم. */
export function Avatar({
  userId,
  version,
  name,
  className = '',
}: {
  userId: number | undefined;
  version?: number;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [userId, version]);
  const letter = (name || '').trim().charAt(0) || '؟';
  const showImage = Boolean(userId && version && !failed);
  return (
    <span className={`avatar ${className} ${showImage ? 'has-photo' : ''}`.trim()}>
      {showImage ? (
        <img
          src={`/api/avatar/${userId}?v=${version}`}
          alt=""
          onError={() => setFailed(true)}
          width="64"
          height="64"
        />
      ) : (
        <span aria-hidden="true">{letter}</span>
      )}
    </span>
  );
}
