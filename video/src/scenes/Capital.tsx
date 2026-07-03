import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const Plate: React.FC<{
  delay: number; chain: string; chainColor: string;
  title: string; sub: string; glyph: React.ReactNode;
}> = ({ delay, chain, chainColor, title, sub, glyph }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110 } });
  const op = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(p, [0, 1], [24, 0]);
  return (
    <div style={{
      opacity: op, transform: `translateY(${y}px)`,
      width: 300, padding: "26px 24px", borderRadius: 18,
      background: COLORS.bgCard, border: `1px solid ${chainColor}44`,
      boxShadow: `0 0 44px ${chainColor}14`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.24em", color: chainColor, marginBottom: 20 }}>
        {chain}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {glyph}
        <div>
          <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 26, color: COLORS.white }}>{title}</div>
          <div style={{ fontFamily: INTER, fontWeight: 500, fontSize: 16, color: COLORS.muted, marginTop: 3 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
};

const EthGlyph = () => (
  <svg width={52} height={52} viewBox="0 0 52 52">
    <path d="M26 6 L40 27 L26 35 L12 27 Z" fill={`${COLORS.eth}`} opacity={0.9} />
    <path d="M26 38 L40 30 L26 46 L12 30 Z" fill={COLORS.eth} opacity={0.55} />
  </svg>
);

const UsdcGlyph = () => (
  <svg width={52} height={52} viewBox="0 0 52 52">
    <circle cx={26} cy={26} r={20} fill="none" stroke={COLORS.offWhite} strokeWidth={3} opacity={0.9} />
    <text x={26} y={34} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={24} fill={COLORS.offWhite}>$</text>
  </svg>
);

export const Capital: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const label = interpolate(spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const head = spring({ frame: frame - 20, fps, config: { damping: 16, stiffness: 90 } });
  const headOp = interpolate(head, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const headY = interpolate(head, [0, 1], [22, 0]);
  const body = spring({ frame: frame - 46, fps, config: { damping: 16, stiffness: 90 } });
  const bodyOp = interpolate(body, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  // dashed gap + red cost tag
  const gapOp = interpolate(spring({ frame: frame - 150, fps, config: { damping: 20, stiffness: 80 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const dash = -(frame * 0.6) % 20;

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 60 }}>
        {/* LEFT text */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: label, marginBottom: 26 }}>
            <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: COLORS.muted }}>PROBLEM</span>
            <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: COLORS.accent }}>01</span>
          </div>
          <div style={{
            opacity: headOp, transform: `translateY(${headY}px)`,
            fontFamily: INTER, fontWeight: 900, fontSize: 68, lineHeight: 1.1,
            letterSpacing: "-0.02em", color: COLORS.white, marginBottom: 28,
          }}>
            Your capital<br />is stuck.
          </div>
          <div style={{
            opacity: bodyOp, fontFamily: INTER, fontWeight: 500, fontSize: 27, lineHeight: 1.55,
            color: COLORS.offWhite, maxWidth: 560,
          }}>
            Your ETH sits on Ethereum. The Circle USDC you want runs on Stellar's fast, low-cost rails. Reaching it means bridging your ETH or selling it, and giving up the position you meant to keep.
          </div>
        </div>

        {/* RIGHT diagram */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <Plate delay={70} chain="ETHEREUM" chainColor={COLORS.eth} title="Your ETH" sub="held in custody" glyph={<EthGlyph />} />

          <div style={{ opacity: gapOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: 84, justifyContent: "center" }}>
            <svg width={60} height={40}>
              <line x1={30} y1={0} x2={30} y2={30} stroke={COLORS.red} strokeWidth={2.5} strokeDasharray="6 6" strokeDashoffset={dash} />
              <polygon points="30,40 24,30 36,30" fill={COLORS.red} />
            </svg>
            <div style={{
              fontFamily: MONO, fontSize: 14, letterSpacing: "0.08em", color: COLORS.red,
              border: `1px solid ${COLORS.red}55`, borderRadius: 8, padding: "5px 12px",
              background: `${COLORS.redDim}22`,
            }}>
              bridge or sell = lose your position
            </div>
          </div>

          <Plate delay={100} chain="STELLAR" chainColor={COLORS.stellar} title="Circle USDC" sub="fast, low-cost rails" glyph={<UsdcGlyph />} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
