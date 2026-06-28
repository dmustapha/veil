// Veil brand glyph (combo B "open coin"): a coin (your value) whose lower arc opens
// where a V monogram's point dissolves into lime + fading redaction blocks. Value, veiled.
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        {/* coin arc, open at the bottom where the value breaks into the veil */}
        <path d="M11 25.2 A11.2 11.2 0 1 1 21 25.2" stroke="var(--platinum)" strokeWidth="2.4" strokeLinecap="round" />
        {/* V monogram arms */}
        <path d="M10 10.4 L14 16.8 M22 10.4 L18 16.8" stroke="var(--platinum)" strokeWidth="2.4" strokeLinecap="round" />
        {/* the point dissolves into redaction blocks, centered + clean stagger */}
        <rect x="11.4" y="18.6" width="4" height="3.2" rx="1" fill="var(--lime)" />
        <rect x="16.6" y="18.6" width="4" height="3.2" rx="1" fill="var(--platinum)" fillOpacity="0.5" />
        <rect x="14" y="22.6" width="4" height="3.2" rx="1" fill="var(--platinum)" fillOpacity="0.3" />
      </svg>
    </span>
  );
}
