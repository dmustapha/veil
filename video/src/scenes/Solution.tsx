import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const ZONE_W = 340;
const BAND_W = 1560;
const START_X = ZONE_W - 20;
const END_X = BAND_W - ZONE_W - 120;

const Chip: React.FC<{ label: string; enter: number; y: number; accent?: boolean }> = ({ label, enter, y, accent }) => {
  const frame = useCurrentFrame();
  const f = frame - enter;
  const x = interpolate(f, [0, 56], [START_X, END_X], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const color = accent ? COLORS.accent : COLORS.offWhite;
  return (
    <div style={{
      position: "absolute", left: x, top: y, opacity: op,
      fontFamily: MONO, fontSize: 17, fontWeight: 600, color,
      padding: "9px 16px", borderRadius: 999,
      background: accent ? "rgba(190,242,100,0.10)" : "rgba(199,204,209,0.06)",
      border: `1px solid ${color}${accent ? "88" : "44"}`,
      whiteSpace: "nowrap",
      boxShadow: accent ? `0 0 20px ${COLORS.accent}44` : "none",
    }}>
      {label}
    </div>
  );
};

export const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const label = interpolate(spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const head = spring({ frame: frame - 16, fps, config: { damping: 16, stiffness: 90 } });
  const headOp = interpolate(head, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const headY = interpolate(head, [0, 1], [20, 0]);

  const bandP = spring({ frame: frame - 56, fps, config: { damping: 18, stiffness: 80 } });
  const bandOp = interpolate(bandP, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const capOp = interpolate(spring({ frame: frame - 300, fps, config: { damping: 16, stiffness: 90 } }), [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  const dash = -(frame * 0.5) % 18;
  const lockPulse = 0.6 + Math.sin(frame * 0.06) * 0.4;

  const Zone: React.FC<{ side: "L" | "R"; chain: string; color: string; title: string; sub: string; icon: React.ReactNode }> =
    ({ side, chain, color, title, sub, icon }) => (
      <div style={{
        position: "absolute", top: 40, [side === "L" ? "left" : "right"]: 0, width: ZONE_W, height: 220,
        padding: "22px 22px", borderRadius: 18, background: COLORS.bgCard,
        border: `1px solid ${color}44`, boxShadow: `0 0 40px ${color}12`,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.22em", color, marginBottom: 18 }}>{chain}</div>
        <div style={{ marginBottom: 14 }}>{icon}</div>
        <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 24, color: COLORS.white }}>{title}</div>
        <div style={{ fontFamily: INTER, fontWeight: 500, fontSize: 15, color: COLORS.muted, marginTop: 4 }}>{sub}</div>
      </div>
    );

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 110px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: label, marginBottom: 18 }}>
          <div style={{ width: 26, height: 2, background: COLORS.accent }} />
          <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.32em", color: COLORS.accent }}>THE SOLUTION</span>
        </div>
        <div style={{
          opacity: headOp, transform: `translateY(${headY}px)`,
          fontFamily: INTER, fontWeight: 900, fontSize: 66, letterSpacing: "-0.02em",
          color: COLORS.white, marginBottom: 44,
        }}>
          Veil gives you <span style={{ color: COLORS.accent }}>both</span>.
        </div>

        {/* crossing band */}
        <div style={{ position: "relative", width: BAND_W, height: 300, opacity: bandOp }}>
          <Zone side="L" chain="ETHEREUM" color={COLORS.eth} title="Real ETH, locked" sub="never bridges"
            icon={
              <svg width={46} height={46} viewBox="0 0 52 52" style={{ filter: `drop-shadow(0 0 ${8 * lockPulse}px ${COLORS.eth}66)` }}>
                <path d="M26 6 L40 27 L26 35 L12 27 Z" fill={COLORS.eth} opacity={0.9} />
                <path d="M26 38 L40 30 L26 46 L12 30 Z" fill={COLORS.eth} opacity={0.5} />
              </svg>
            } />
          <Zone side="R" chain="STELLAR" color={COLORS.stellar} title="Real USDC, borrowed" sub="fast rails"
            icon={
              <svg width={46} height={46} viewBox="0 0 52 52">
                <circle cx={26} cy={26} r={19} fill="none" stroke={COLORS.offWhite} strokeWidth={3} />
                <text x={26} y={34} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={22} fill={COLORS.offWhite}>$</text>
              </svg>
            } />

          {/* center boundary */}
          <svg width={BAND_W} height={300} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <line x1={BAND_W / 2} y1={20} x2={BAND_W / 2} y2={280} stroke={COLORS.borderStrong} strokeWidth={2} strokeDasharray="6 8" strokeDashoffset={dash} />
          </svg>

          {/* traveling chips */}
          <Chip label="commitment" enter={80} y={70} />
          <Chip label="amount" enter={130} y={135} />
          <Chip label="Groth16 proof" enter={180} y={200} accent />
        </div>

        {/* caption */}
        <div style={{
          opacity: capOp, marginTop: 40, fontFamily: INTER, fontWeight: 500, fontSize: 26,
          color: COLORS.offWhite, textAlign: "center",
        }}>
          Only a commitment, an amount, and a zero-knowledge <span style={{ color: COLORS.accent }}>proof</span> ever cross.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
