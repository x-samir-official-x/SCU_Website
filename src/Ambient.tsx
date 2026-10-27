/** خلفية زخرفية خفيفة: توهجات وشبكة وحبيبات. CSS فقط، ولا تُقرأ بقارئ الشاشة. */
export function Ambient({ variant = 'hero' }: { variant?: 'hero' | 'slab' | 'card' }) {
  return (
    <div className={`ambient ambient-${variant}`} aria-hidden="true">
      <span className="ambient-orb ambient-o1" />
      <span className="ambient-orb ambient-o2" />
      <span className="ambient-orb ambient-o3" />
      <span className="ambient-grid" />
      <span className="ambient-grain" />
    </div>
  );
}
