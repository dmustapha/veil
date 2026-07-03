import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const StruckPill: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 120 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const strike = interpolate(frame - (delay + 18), [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", opacity: op }}>
      <div style={{
        fontFamily: MONO, fontSize: 22, letterSpacing: "0.16em", color: COLORS.muted,
        border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: "10px 22px",
      }}>{label}</div>
      <div style={{
        position: "absolute", top: "50%", left: 12, height: 2, width: `calc((100% - 24px) * ${strike})`,
        background: COLORS.red, boxShadow: `0 0 8px ${COLORS.red}`,
      }} />
    </div>
  );
};

const Verdict: React.FC<{
  delay: number; ok: boolean; title: string; result: string;
}> = ({ delay, ok, title, result }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 100 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(p, [0, 1], [22, 0]);
  const c = ok ? COLORS.accent : COLORS.red;
  const stampP = spring({ frame: frame - (delay + 20), fps, config: { damping: 12, stiffness: 130 } });
  const stampScale = interpolate(stampP, [0, 1], [0.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stampOp = interpolate(stampP, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{
      opacity: op, transform: `translateY(${y}px)`, width: 420,
      padding: "26px 28px", borderRadius: 18, background: COLORS.bgCardStrong,
      border: `1px solid ${c}55`, boxShadow: `0 0 40px ${c}14`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 22, color: COLORS.offWhite }}>{title}</span>
        <div style={{
          opacity: stampOp, transform: `scale(${stampScale})`, display: "flex", alignItems: "center", gap: 8,
          fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", color: c,
          border: `1.5px solid ${c}`, borderRadius: 8, padding: "6px 12px",
        }}>
          {ok ? (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={3}><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={3}><path d="M18 6 6 18M6 6l12 12" /></svg>
          )}
          {ok ? "ACCEPT" : "REJECT"}
        </div>
      </div>
      <div style={{ fontFamily: INTER, fontSize: 18, color: ok ? COLORS.white : COLORS.muted }}>{result}</div>
    </div>
  );
};

export const Guarantee: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const head = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 90 } });
  const headOp = interpolate(head, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  const chip = spring({ frame: frame - 108, fps, config: { damping: 15, stiffness: 90 } });
  const chipOp = interpolate(chip, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const chipScale = interpolate(chip, [0, 1], [0.94, 1]);
  const chipGlow = 0.6 + Math.sin(frame * 0.06) * 0.3;

  const devOp = interpolate(spring({ frame: frame - 280, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 110px" }}>
        {/* headline + struck pills */}
        <div style={{ opacity: headOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, marginBottom: 40 }}>
          <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 58, letterSpacing: "-0.02em", color: COLORS.white }}>
            No relayer. No committee.
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <StruckPill label="RELAYER" delay={30} />
            <StruckPill label="COMMITTEE" delay={48} />
          </div>
        </div>

        {/* trust chip */}
        <div style={{ opacity: chipOp, transform: `scale(${chipScale})`, display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <div style={{ fontFamily: INTER, fontWeight: 500, fontSize: 22, color: COLORS.muted, marginBottom: 16 }}>
            The only thing Stellar trusts:
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "18px 30px", borderRadius: 16,
            background: "rgba(190,242,100,0.08)", border: `1px solid ${COLORS.accent}66`,
            boxShadow: `0 0 ${40 * chipGlow}px ${COLORS.accent}22`,
          }}>
            <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth={1.7}>
              <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" /><path d="M9 12l2 2 4-4" />
            </svg>
            <div>
              <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 30, color: COLORS.white }}>A Groth16 proof</div>
              <div style={{ fontFamily: MONO, fontSize: 16, color: COLORS.accent, marginTop: 3 }}>verified on-chain · BN254</div>
            </div>
          </div>
        </div>

        {/* device caption */}
        <div style={{ opacity: devOp, fontFamily: INTER, fontWeight: 500, fontSize: 21, color: COLORS.offWhite, marginBottom: 40, textAlign: "center" }}>
          Built on your device. Your amount and identity never leave the browser.
        </div>

        {/* verifier gate */}
        <div style={{ display: "flex", gap: 40 }}>
          <Verdict delay={440} ok title="Valid proof" result="USDC is released." />
          <Verdict delay={470} ok={false} title="Forged proof" result="Fails before a single dollar moves." />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
