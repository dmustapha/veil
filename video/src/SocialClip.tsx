import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SOCIAL_DURATION, PROOF } from "./constants";
import { INTER, MONO } from "./fonts";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { VeilGlyph } from "./components/VeilGlyph";
import { GlowText } from "./components/GlowText";

const VERTICAL_ORBS = [
  { baseX: 220, baseY: 340, size: 440, color: "#BEF264", blur: 150, opacity: 0.05, speed: 0.005 },
  { baseX: 880, baseY: 1600, size: 400, color: "#8E97C4", blur: 140, opacity: 0.06, speed: 0.004 },
  { baseX: 540, baseY: 980, size: 520, color: "#C7CCD1", blur: 180, opacity: 0.03, speed: 0.006 },
  { baseX: 120, baseY: 1420, size: 340, color: "#BEF264", blur: 120, opacity: 0.04, speed: 0.007 },
];

const HookLine: React.FC<{ text: string; accent?: React.ReactNode; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 90 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(p, [0, 1], [18, 0]);
  return (
    <div style={{
      opacity: op, transform: `translateY(${y}px)`,
      fontFamily: INTER, fontWeight: 800, fontSize: 64, lineHeight: 1.2,
      letterSpacing: "-0.02em", color: COLORS.white, textAlign: "center",
    }}>
      {text}
    </div>
  );
};

export const SocialClip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SOCIAL_DURATION;

  const exitOp = interpolate(frame, [dur - 20, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glyphGlow = 0.5 + Math.sin(frame * 0.05) * 0.2;
  const ruleW = interpolate(spring({ frame: frame - 150, fps, config: { damping: 20, stiffness: 60 } }), [0, 1], [0, 460]);
  const wm = interpolate(spring({ frame: frame - 44, fps, config: { damping: 18, stiffness: 100 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground orbs={VERTICAL_ORBS} />
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "120px 80px", zIndex: 10, opacity: exitOp }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
          <div style={{ width: 24, height: 2, background: COLORS.accent }} />
          <span style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.3em", color: COLORS.accent }}>PRIVATE CROSS-CHAIN LENDING</span>
          <div style={{ width: 24, height: 2, background: COLORS.accent }} />
        </div>

        <div style={{ filter: `drop-shadow(0 0 ${60 * glyphGlow}px ${COLORS.accent}33)`, marginBottom: 24 }}>
          <VeilGlyph size={220} delay={8} />
        </div>
        <div style={{ opacity: wm, fontFamily: INTER, fontWeight: 900, fontSize: 96, letterSpacing: "0.14em", color: COLORS.white, marginBottom: 70 }}>
          VEIL
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 44 }}>
          <HookLine text="Keep your ETH on Ethereum." delay={70} />
          <HookLine text="Borrow USDC on Stellar." delay={96} />
        </div>

        <div style={{ height: 2, width: ruleW, background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`, marginBottom: 44 }} />

        <GlowText text="Move the proof, not the money." fontSize={44} color={COLORS.accent} delay={175} fontWeight={700} glowIntensity={0.8} style={{ textAlign: "center", marginBottom: 90 }} />

        <div style={{
          opacity: interpolate(spring({ frame: frame - 210, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
          fontFamily: MONO, fontSize: 30, color: COLORS.offWhite, letterSpacing: "0.04em",
        }}>
          {PROOF.liveApp}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
