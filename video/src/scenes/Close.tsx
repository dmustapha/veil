import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, PROOF, SCENE_DURATIONS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VeilGlyph } from "../components/VeilGlyph";
import { GlowText } from "../components/GlowText";

const DUR = SCENE_DURATIONS.close;

const Bracket: React.FC<{ pos: "tl" | "tr" | "bl" | "br"; op: number }> = ({ pos, op }) => {
  const s = 56, t = 2;
  const style: React.CSSProperties = { position: "absolute", width: s, height: s, opacity: op };
  const b = `${t}px solid ${COLORS.accent}`;
  if (pos === "tl") Object.assign(style, { top: 60, left: 60, borderTop: b, borderLeft: b });
  if (pos === "tr") Object.assign(style, { top: 60, right: 60, borderTop: b, borderRight: b });
  if (pos === "bl") Object.assign(style, { bottom: 60, left: 60, borderBottom: b, borderLeft: b });
  if (pos === "br") Object.assign(style, { bottom: 60, right: 60, borderBottom: b, borderRight: b });
  return <div style={style} />;
};

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const brk = interpolate(spring({ frame: frame - 4, fps, config: { damping: 20, stiffness: 90 } }), [0, 1], [0, 0.8], { extrapolateRight: "clamp" });
  const glyphGlow = 0.5 + Math.sin(frame * 0.05) * 0.2;
  const rowOp = interpolate(spring({ frame: frame - 150, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  // slow fade to black over the last 60 frames
  const fade = interpolate(frame, [DUR - 60, DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg, opacity: fade }}>
      <AnimatedBackground />
      <Bracket pos="tl" op={brk} /><Bracket pos="tr" op={brk} /><Bracket pos="bl" op={brk} /><Bracket pos="br" op={brk} />

      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ filter: `drop-shadow(0 0 ${50 * glyphGlow}px ${COLORS.accent}33)`, marginBottom: 20 }}>
          <VeilGlyph size={150} delay={8} />
        </div>
        <GlowText text="VEIL" fontSize={72} color={COLORS.white} delay={18} fontWeight={900} style={{ letterSpacing: "0.14em", marginBottom: 22 }} />

        <GlowText text="Move the proof, not the money." fontSize={34} color={COLORS.accent} delay={34} fontWeight={700} glowIntensity={0.8} style={{ marginBottom: 26 }} />

        <div style={{ opacity: rowOp, textAlign: "center", fontFamily: INTER, fontWeight: 500, fontSize: 23, color: COLORS.offWhite, lineHeight: 1.55, marginBottom: 40 }}>
          Your collateral stays yours, on <span style={{ color: COLORS.eth }}>Ethereum</span>.<br />
          Your privacy stays yours, on <span style={{ color: COLORS.stellar }}>Stellar</span>.
        </div>

        <div style={{ opacity: rowOp, display: "flex", alignItems: "center", gap: 26, fontFamily: MONO, fontSize: 18 }}>
          <span style={{ color: COLORS.accent }}>{PROOF.liveApp}</span>
          <span style={{ color: COLORS.muted }}>·</span>
          <span style={{ color: COLORS.offWhite }}>{PROOF.repo}</span>
        </div>
        <div style={{ opacity: rowOp, marginTop: 18, fontFamily: MONO, fontSize: 14, letterSpacing: "0.22em", color: COLORS.muted }}>
          {PROOF.track.toUpperCase()}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
