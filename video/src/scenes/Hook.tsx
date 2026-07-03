import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { VeilGlyph } from "../components/VeilGlyph";

const Line: React.FC<{ delay: number; children: React.ReactNode }> = ({ delay, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 90 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(p, [0, 1], [-26, 0]);
  return (
    <div style={{
      opacity: op, transform: `translateX(${x}px)`,
      fontFamily: INTER, fontWeight: 800, fontSize: 62, lineHeight: 1.18,
      letterSpacing: "-0.02em", color: COLORS.white,
    }}>
      {children}
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelP = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } });
  const labelOp = interpolate(labelP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ruleW = interpolate(spring({ frame: frame - 90, fps, config: { damping: 20, stiffness: 60 } }), [0, 1], [0, 560]);
  const subP = spring({ frame: frame - 170, fps, config: { damping: 16, stiffness: 90 } });
  const subOp = interpolate(subP, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  const glyphGlow = 0.5 + Math.sin(frame * 0.05) * 0.2;

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 70 }}>
        {/* LEFT: wordmark + hook */}
        <div style={{ flex: 1.35 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14, opacity: labelOp, marginBottom: 34,
          }}>
            <div style={{ width: 26, height: 2, background: COLORS.accent }} />
            <span style={{
              fontFamily: MONO, fontSize: 15, letterSpacing: "0.34em",
              color: COLORS.accent, textTransform: "uppercase",
            }}>
              Private Cross-Chain Lending
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Line delay={26}>Keep your ETH on <span style={{ color: COLORS.eth }}>Ethereum</span>.</Line>
            <Line delay={54}>Get working USDC on <span style={{ color: COLORS.offWhite }}>Stellar</span>.</Line>
            <Line delay={90}>
              Move the <span style={{ color: COLORS.accent }}>proof</span>,
              <br />never the collateral.
            </Line>
          </div>

          <div style={{ height: 2, width: ruleW, background: `linear-gradient(90deg, ${COLORS.accent}, transparent)`, marginTop: 34, marginBottom: 26 }} />

          <div style={{
            opacity: subOp, fontFamily: INTER, fontWeight: 500, fontSize: 26,
            color: COLORS.muted, letterSpacing: "0.01em",
          }}>
            Reveal neither your amount nor your wallet.
          </div>
        </div>

        {/* RIGHT: animated monogram + wordmark */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
          <div style={{ filter: `drop-shadow(0 0 ${60 * glyphGlow}px ${COLORS.accent}33)` }}>
            <VeilGlyph size={340} delay={10} />
          </div>
          <div style={{
            opacity: interpolate(spring({ frame: frame - 60, fps, config: { damping: 18, stiffness: 100 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" }),
            fontFamily: INTER, fontWeight: 900, fontSize: 78,
            letterSpacing: "0.14em", color: COLORS.white,
          }}>
            VEIL
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
