// Veil brand glyph: a value (proof dot) sitting above a veil line, redaction bars
// beneath it: the signature "frosted veil over the hidden amount" distilled to a mark.
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="6.6" r="2.3" fill="var(--steel-bright)" />
        <line
          x1="4"
          y1="12"
          x2="20"
          y2="12"
          stroke="var(--platinum-bright)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect x="6" y="15.4" width="12" height="1.7" rx="0.85" fill="var(--platinum)" fillOpacity="0.4" />
        <rect x="6" y="18.4" width="8" height="1.7" rx="0.85" fill="var(--platinum)" fillOpacity="0.4" />
      </svg>
    </span>
  );
}
