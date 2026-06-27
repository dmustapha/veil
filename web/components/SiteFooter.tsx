import { COPY, SITE } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="foot-brand">
        <div
          className="brand-mark"
          style={{ width: 24, height: 24 }}
          aria-hidden="true"
        />
        {COPY.wordmark}
      </div>
      <div className="foot-meta">
        <span>{SITE.networks}</span>
        <span className="live">{SITE.live}</span>
        <span>{COPY.track}</span>
      </div>
    </footer>
  );
}
