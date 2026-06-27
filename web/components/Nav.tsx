import { COPY } from "@/lib/constants";
import { BrandMark } from "@/components/BrandMark";

export function Nav() {
  return (
    <header className="nav reveal d1">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">{COPY.wordmark}</span>
      </div>
      <nav className="nav-meta" aria-label="Primary">
        <a className="nav-link" href="#flow">
          How it works
        </a>
        <a className="nav-link" href="#proof">
          The proof
        </a>
        <a className="nav-link" href="#trust">
          What we trust
        </a>
        <span className="track-pill">{COPY.track}</span>
      </nav>
    </header>
  );
}
