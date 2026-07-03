import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const LEAKS = [
  { k: "Collateral locked", v: "4.20 ETH" },
  { k: "Loan size", v: "6,050 USDC" },
  { k: "Borrower wallet", v: "0xA91c…8f3b" },
];

const Row: React.FC<{ i: number; k: string; v: string }> = ({ i, k, v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = 70 + i * 26;
  const p = spring({ frame: frame - enter, fps, config: { damping: 16, stiffness: 110 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(p, [0, 1], [18, 0]);
  const flag = interpolate(spring({ frame: frame - (enter + 16), fps, config: { damping: 13, stiffness: 130 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 0.6 + Math.sin((frame - enter) * 0.14) * 0.4;
  return (
    <div style={{
      opacity: op, transform: `translateX(${x}px)`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 20px", borderRadius: 12,
      background: "rgba(228,98,111,0.06)", border: `1px solid ${COLORS.red}33`,
    }}>
      <div>
        <div style={{ fontFamily: INTER, fontSize: 15, color: COLORS.muted, marginBottom: 4 }}>{k}</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: COLORS.offWhite }}>{v}</div>
      </div>
      <div style={{
        opacity: flag, display: "flex", alignItems: "center", gap: 7,
        fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: COLORS.red,
        border: `1px solid ${COLORS.red}66`, borderRadius: 999, padding: "5px 12px",
        boxShadow: `0 0 ${12 * pulse}px ${COLORS.red}44`,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth={2}>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
          <circle cx={12} cy={12} r={3} />
        </svg>
        EXPOSED
      </div>
    </div>
  );
};

export const Privacy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const label = interpolate(spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const head = spring({ frame: frame - 20, fps, config: { damping: 16, stiffness: 90 } });
  const headOp = interpolate(head, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const headY = interpolate(head, [0, 1], [22, 0]);
  const bodyOp = interpolate(spring({ frame: frame - 46, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  const panel = spring({ frame: frame - 54, fps, config: { damping: 18, stiffness: 90 } });
  const panelOp = interpolate(panel, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const panelScale = interpolate(panel, [0, 1], [0.96, 1]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 70 }}>
        {/* LEFT text */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: label, marginBottom: 26 }}>
            <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: COLORS.muted }}>PROBLEM</span>
            <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: COLORS.accent }}>02</span>
          </div>
          <div style={{
            opacity: headOp, transform: `translateY(${headY}px)`,
            fontFamily: INTER, fontWeight: 900, fontSize: 68, lineHeight: 1.1,
            letterSpacing: "-0.02em", color: COLORS.white, marginBottom: 28,
          }}>
            Everything<br />leaks.
          </div>
          <div style={{
            opacity: bodyOp, fontFamily: INTER, fontWeight: 500, fontSize: 27, lineHeight: 1.55,
            color: COLORS.offWhite, maxWidth: 540,
          }}>
            So you borrow against your ETH instead of selling. But on a public chain, borrowing reveals your exact collateral, your loan size, and the wallet behind it. For real size, that is a permanent, public target.
          </div>
        </div>

        {/* RIGHT public ledger */}
        <div style={{ flex: 1, transform: `scale(${panelScale})`, opacity: panelOp }}>
          <div style={{
            padding: "22px 24px", borderRadius: 18,
            background: COLORS.bgCardStrong, border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.red }} />
              <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.18em", color: COLORS.muted }}>
                PUBLIC CHAIN · anyone can read
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {LEAKS.map((l, i) => <Row key={i} i={i} k={l.k} v={l.v} />)}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
