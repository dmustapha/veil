import { PROOF } from "@/lib/constants";
import styles from "./SealByteGrid.module.css";

/** Real selector 73 c4 57 ba (lime), rest deterministically seeded from the
 *  program image_id 0x494bfee7 via the same LCG used in the design source, so
 *  the grid is identical on every render (SSR-stable, no Math.random). */
const SELECTOR = [0x73, 0xc4, 0x57, 0xba];

type Cell = { hex: string; sel: boolean; dx: string; dy: string; dr: string };

function buildBytes(total: number): Cell[] {
  let s = 0x494bfee7 >>> 0;
  const nb = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 16) & 0xff;
  };
  const cells: Cell[] = [];
  for (let i = 0; i < total; i++) {
    const b = i < 4 ? SELECTOR[i] : nb();
    // shatter offsets derived from index+value (does not disturb byte stream)
    const dx = ((b * 7 + i * 5) % 11) - 5;
    const dy = ((b * 3 + i * 11) % 11) - 5;
    const dr = ((b * 13 + i) % 19) - 9;
    cells.push({
      hex: b.toString(16).padStart(2, "0"),
      sel: i < 4,
      dx: `${dx}px`,
      dy: `${dy}px`,
      dr: `${dr}deg`,
    });
  }
  return cells;
}

const BYTES = buildBytes(260);

const STATE_LABEL = { idle: "sealed", locked: "locked", forged: "rejected" };

export function SealByteGrid({
  state = "idle",
  className,
}: {
  state?: "idle" | "locked" | "forged";
  className?: string;
}) {
  const stateClass =
    state === "locked"
      ? styles.isLocked
      : state === "forged"
        ? styles.isForged
        : "";
  return (
    <div
      className={`${styles.seal} ${stateClass}${className ? ` ${className}` : ""}`}
    >
      <div className={styles.head}>
        <span className={styles.lhs}>
          <span>Groth16 seal</span>
          <span className={styles.sel}>selector {PROOF.sealSelector}</span>
          <span>{PROOF.size}</span>
        </span>
        <span className={styles.state}>
          <span className={styles.sd} aria-hidden="true" />
          {STATE_LABEL[state]}
        </span>
      </div>
      <div className={styles.bytes} aria-hidden="true">
        {BYTES.map((c, i) => (
          <span
            key={i}
            className={`${styles.byte}${c.sel ? ` ${styles.selByte}` : ""}`}
            style={
              state === "forged" && !c.sel
                ? ({
                    "--dx": c.dx,
                    "--dy": c.dy,
                    "--dr": c.dr,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {c.hex}
          </span>
        ))}
      </div>
      <span className={styles.sweep} aria-hidden="true" />
      <p className={styles.cap}>
        The 260-byte proof, byte by byte. Stellar reads it and decides on its
        own. A real seal locks lime. A forged one is rejected and nothing moves.
      </p>
    </div>
  );
}
