// The machine's mark: a dark disc, gold ring, and the voice line. Original, not any company's logo.
export default function Mark({ size = 48, ring = true, className = "" }) {
  const gid = `mk-line-${size}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="1"><stop offset="0" stopColor="#F0EEE6" /><stop offset="1" stopColor="#D97757" /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#1F1E1D" />
      {ring && <circle cx="50" cy="50" r="46" fill="none" stroke="#D97757" strokeWidth="3" />}
      <path d="M18 50 C24 50 24 38 30 38 S36 62 42 62 S48 30 54 30 S60 70 66 70 S72 44 78 44 S82 50 82 50"
        fill="none" stroke={`url(#${gid})`} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
