/**
 * Shared inline SVG icons, ported verbatim from the A-frosted-vault proposal.
 * All decorative; callers set aria-hidden where appropriate.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  ...props,
});

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.8} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function WaitIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
    </svg>
  );
}

export function XCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8" />
      <path d="M3 4v4h4" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-4Z" />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.8} aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2} aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
