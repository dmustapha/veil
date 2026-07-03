import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, PROOF } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const Check: React.FC<{ show: number }> = ({ show }) => (
  <div style={{
    opacity: show, display: "flex", alignItems: "center", gap: 7,
    fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: COLORS.accent,
    border: `1px solid ${COLORS.accent}55`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap",
  }}>
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth={3}><path d="M20 6 9 17l-5-5" /></svg>
    VERIFIED
  </div>
);

const ProofRow: React.FC<{
  enter: number; label: string; hash?: string; note?: string; verifyAt: number;
}> = ({ enter, label, hash, note, verifyAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - enter, fps, config: { damping: 16, stiffness: 110 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(p, [0, 1], [16, 0]);
  const chars = hash ? Math.floor(Math.max(0, frame - (enter + 8)) * 2.4) : 0;
  const shown = hash ? hash.slice(0, Math.min(hash.length, chars)) : "";
  const typing = hash && chars < hash.length && chars > 0;
  const verifyOp = interpolate(frame - verifyAt, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      opacity: op, transform: `translateX(${x}px)`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
      padding: "18px 24px", borderRadius: 14,
      background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 20, color: COLORS.white, marginBottom: hash || note ? 8 : 0 }}>{label}</div>
        {hash && (
          <div style={{ fontFamily: MONO, fontSize: 15, color: COLORS.offWhite, letterSpacing: "0.01em" }}>
            {shown}{typing && <span style={{ color: COLORS.accent, opacity: frame % 16 < 8 ? 1 : 0 }}>_</span>}
          </div>
        )}
        {note && <div style={{ fontFamily: MONO, fontSize: 15, color: COLORS.accent }}>{note}</div>}
      </div>
      <Check show={verifyOp} />
    </div>
  );
};

export const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const label = interpolate(spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const head = spring({ frame: frame - 16, fps, config: { damping: 16, stiffness: 90 } });
  const headOp = interpolate(head, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const headY = interpolate(head, [0, 1], [20, 0]);

  const liveDot = 0.5 + Math.sin(frame * 0.18) * 0.5;
  const footOp = interpolate(spring({ frame: frame - 500, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 110px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: label, marginBottom: 14 }}>
          <div style={{ width: 9, height: 9, borderRadius: 999, background: COLORS.accent, opacity: liveDot, boxShadow: `0 0 10px ${COLORS.accent}` }} />
          <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.32em", color: COLORS.accent }}>LIVE NOW</span>
        </div>
        <div style={{
          opacity: headOp, transform: `translateY(${headY}px)`,
          fontFamily: INTER, fontWeight: 900, fontSize: 58, letterSpacing: "-0.02em", color: COLORS.white, marginBottom: 40,
        }}>
          This runs today.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 1160 }}>
          <ProofRow enter={60} verifyAt={150} label="Real WETH locked · Ethereum Sepolia" hash={PROOF.ethLockTx} />
          <ProofRow enter={150} verifyAt={250} label="Attestation delivered · Axelar to Stellar" hash={PROOF.axelarTx} />
          <ProofRow enter={270} verifyAt={330} label="Borrowed against a zero-knowledge proof" note={"~" + PROOF.usdcBorrowed + " · real Circle USDC"} />
          <ProofRow enter={420} verifyAt={470} label="Both provers verify live on-chain · a tampered proof is rejected" />
        </div>

        <div style={{ opacity: footOp, marginTop: 34, fontFamily: MONO, fontSize: 20, color: COLORS.offWhite, letterSpacing: "0.04em" }}>
          Try it live · <span style={{ color: COLORS.accent }}>{PROOF.liveApp}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
