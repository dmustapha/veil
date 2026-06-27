import Link from "next/link";
import { COPY } from "@/lib/constants";

export function Hero() {
  return (
    <section className="hero wrap">
      <div className="eyebrow reveal d1">
        <span className="dot" aria-hidden="true" /> Private borrowing, proven not
        revealed
      </div>
      <h1 className="hero-title reveal d2">
        Borrow private.
        <br />
        <em>Proven, not revealed.</em>
      </h1>
      <p className="tagline reveal d2">{COPY.tagline}</p>
      <p className="privacy-line reveal d3">
        {COPY.privacyLead}{" "}
        <span className="public-set">{COPY.publicSet}</span>
        {COPY.privacyTail}
      </p>
      <div className="hero-cta reveal d3">
        <Link className="btn btn-primary" href="/app">
          Open the app
        </Link>
        <a className="btn btn-ghost" href="#trust">
          What stays trusted
        </a>
      </div>
    </section>
  );
}
