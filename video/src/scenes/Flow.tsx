import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";
import { AnimatedBackground } from "../components/AnimatedBackground";

const CENTERS = [320, 640, 960, 1280, 1600];
const RAIL_Y = 600;
const NODE_W = 268;
const ENTER = [66, 230, 368, 578, 678]; // synced to narration (frames)

type NodeDef = {
  title: string; sub: string; color: string; star?: boolean; icon: React.ReactNode;
};

const Lock = (c: string) => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
    <rect x={4} y={10} width={16} height={11} rx={2} /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);
const Bridge = (c: string) => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
    <path d="M3 8h18M3 8a4 4 0 0 0 4 4M21 8a4 4 0 0 1-4 4M7 12v6M17 12v6M3 18h18" />
  </svg>
);
const Shield = (c: string) => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
    <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const Chip = (c: string) => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
    <rect x={6} y={6} width={12} height={12} rx={2} /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /><path d="M10 13l1.5 1.5L15 11" />
  </svg>
);
const Coin = (c: string) => (
  <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
    <circle cx={12} cy={12} r={9} /><path d="M12 7v10M9.5 9.2a2.3 2.3 0 0 1 2.5-1.2c1.4 0 2.3.8 2.3 1.9 0 2.4-4.8 1.3-4.8 3.8 0 1.1 1 1.9 2.5 1.9a2.3 2.3 0 0 0 2.3-1.3" />
  </svg>
);

const NODES: NodeDef[] = [
  { title: "Escrow WETH", sub: "bound to a commitment", color: COLORS.eth, icon: null },
  { title: "Axelar GMP", sub: "commitment + amount", color: COLORS.offWhite, icon: null },
  { title: "Groth16 proof", sub: "generated in-browser", color: COLORS.accent, star: true, icon: null },
  { title: "Soroban verify", sub: "BN254, natively", color: COLORS.stellar, icon: null },
  { title: "USDC released", sub: "real Circle USDC", color: COLORS.offWhite, icon: null },
];
const ICONS = [Lock, Bridge, Shield, Chip, Coin];

const Node: React.FC<{ i: number; def: NodeDef }> = ({ i, def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = ENTER[i];
  const p = spring({ frame: frame - enter, fps, config: { damping: 16, stiffness: 110 } });
  const appear = interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const active = frame >= enter + 6;
  const glow = active ? 0.7 + Math.sin((frame - enter) * 0.1) * 0.3 : 0;
  const c = def.color;
  const litBorder = active ? `${c}${def.star ? "cc" : "88"}` : COLORS.border;
  return (
    <div style={{
      position: "absolute", left: CENTERS[i] - NODE_W / 2, top: RAIL_Y - 92, width: NODE_W,
      opacity: appear, transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px)`,
    }}>
      {/* step index */}
      <div style={{
        position: "absolute", top: -18, left: 18, width: 30, height: 30, borderRadius: 8,
        background: active ? `${c}22` : "rgba(20,24,30,0.9)", border: `1px solid ${litBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: MONO, fontSize: 14, fontWeight: 700, color: active ? c : COLORS.muted, zIndex: 2,
      }}>{i + 1}</div>
      <div style={{
        padding: "22px 20px 20px", borderRadius: 16, height: 168,
        background: COLORS.bgCardStrong, border: `1px solid ${litBorder}`,
        boxShadow: active ? `0 0 ${34 * glow}px ${c}${def.star ? "44" : "22"}` : "none",
        transition: "none",
      }}>
        <div style={{ opacity: active ? 1 : 0.35, marginBottom: 14 }}>{ICONS[i](active ? c : COLORS.muted)}</div>
        <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 23, color: active ? COLORS.white : COLORS.muted }}>{def.title}</div>
        <div style={{ fontFamily: MONO, fontSize: 14, color: active ? c : COLORS.muted, marginTop: 6, letterSpacing: "0.02em" }}>{def.sub}</div>
        {def.star && active && (
          <div style={{
            position: "absolute", top: 14, right: 14, fontFamily: MONO, fontSize: 10,
            letterSpacing: "0.14em", color: COLORS.accent, border: `1px solid ${COLORS.accent}66`,
            borderRadius: 999, padding: "3px 8px",
          }}>ZK</div>
        )}
      </div>
    </div>
  );
};

export const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const label = interpolate(spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // domain bands
  const bandOp = interpolate(spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 80 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // packet position
  const packetVisible = frame >= ENTER[0];
  const packetX = interpolate(frame, ENTER, CENTERS, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const packetPulse = 0.7 + Math.sin(frame * 0.2) * 0.3;

  // connectors fill
  const connFill = (i: number) => interpolate(frame, [ENTER[i], ENTER[i + 1]], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // anchor callout
  const anchor = spring({ frame: frame - 745, fps, config: { damping: 15, stiffness: 100 } });
  const anchorOp = interpolate(anchor, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  const anchorY = interpolate(anchor, [0, 1], [16, 0]);

  const DOMAINS = [
    { label: "ETHEREUM", x: CENTERS[0], color: COLORS.eth },
    { label: "CROSS-CHAIN · IN-BROWSER", x: (CENTERS[1] + CENTERS[2]) / 2, color: COLORS.muted },
    { label: "STELLAR", x: (CENTERS[3] + CENTERS[4]) / 2, color: COLORS.stellar },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      {/* header */}
      <div style={{ position: "absolute", top: 88, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", opacity: label }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 26, height: 2, background: COLORS.accent }} />
          <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.32em", color: COLORS.accent }}>HOW IT WORKS</span>
          <div style={{ width: 26, height: 2, background: COLORS.accent }} />
        </div>
        <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 46, letterSpacing: "-0.02em", color: COLORS.white }}>
          The path a private loan takes
        </div>
      </div>

      {/* domain band labels */}
      {DOMAINS.map((d, i) => (
        <div key={i} style={{
          position: "absolute", top: RAIL_Y - 158, left: d.x, transform: "translateX(-50%)", opacity: bandOp,
          fontFamily: MONO, fontSize: 13, letterSpacing: "0.2em", color: d.color,
          border: `1px solid ${d.color}33`, borderRadius: 999, padding: "5px 14px", whiteSpace: "nowrap",
          background: "rgba(10,12,16,0.6)",
        }}>{d.label}</div>
      ))}

      {/* rail + connectors */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* base rail */}
        <line x1={CENTERS[0]} y1={RAIL_Y} x2={CENTERS[4]} y2={RAIL_Y} stroke={COLORS.border} strokeWidth={2} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={CENTERS[i]} y1={RAIL_Y} x2={CENTERS[i] + (CENTERS[i + 1] - CENTERS[i]) * connFill(i)} y2={RAIL_Y}
            stroke={COLORS.accent} strokeWidth={3} opacity={0.8} style={{ filter: `drop-shadow(0 0 5px ${COLORS.accent}66)` }} />
        ))}
        {/* rail dots at nodes */}
        {CENTERS.map((cx, i) => (
          <circle key={i} cx={cx} cy={RAIL_Y} r={5} fill={frame >= ENTER[i] + 6 ? COLORS.accent : COLORS.muted} />
        ))}
        {/* traveling packet */}
        {packetVisible && (
          <circle cx={packetX} cy={RAIL_Y} r={9 * packetPulse} fill={COLORS.accent}
            style={{ filter: `drop-shadow(0 0 12px ${COLORS.accent})` }} />
        )}
      </svg>

      {/* nodes */}
      {NODES.map((n, i) => <Node key={i} i={i} def={n} />)}

      {/* anchor: ETH never left */}
      <div style={{
        position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center",
        opacity: anchorOp, transform: `translateY(${anchorY}px)`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: INTER, fontWeight: 700, fontSize: 26, color: COLORS.white,
          border: `1px solid ${COLORS.eth}44`, borderRadius: 14, padding: "14px 26px",
          background: "rgba(142,151,196,0.06)",
        }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={COLORS.eth} strokeWidth={1.8}>
            <rect x={4} y={10} width={16} height={11} rx={2} /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          Your ETH never left <span style={{ color: COLORS.eth }}>Ethereum</span>.
        </div>
      </div>
    </AbsoluteFill>
  );
};
