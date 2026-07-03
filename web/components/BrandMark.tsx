// Veil brand mark: a V whose left arm is solid (revealed) and whose right arm
// dissolves into a fanning veil, with a lime sealed-value dot at the vertex.
// Matches app/icon.svg (favicon) and public/logo.png exactly.
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 480 480" fill="none">
        {/* solid left arm (revealed) */}
        <path d="M150 146 L240 330" stroke="#C7CCD1" strokeWidth="48" strokeLinecap="round" fill="none" />
        {/* right arm dissolving into a veil, fanning from the vertex */}
        <g fill="none" stroke="#C7CCD1" strokeLinecap="round">
          <path d="M240 330 L330 146" strokeWidth="17" opacity="0.95" />
          <path d="M240 330 L357 165" strokeWidth="12" opacity="0.55" />
          <path d="M240 330 L379 187" strokeWidth="9" opacity="0.28" />
        </g>
        {/* lime sealed value at the vertex */}
        <circle cx="240" cy="330" r="16" fill="#BEF264" />
      </svg>
    </span>
  );
}
