import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type Orb = {
  baseX: number; baseY: number; size: number;
  color: string; blur: number; opacity: number; speed: number;
};

// Veil brand: dark, editorial. Very subtle lime + periwinkle + grey orbs.
export const VEIL_ORBS: Orb[] = [
  { baseX: 320,  baseY: 250, size: 520, color: "#BEF264", blur: 150, opacity: 0.05, speed: 0.005 },
  { baseX: 1600, baseY: 800, size: 470, color: "#8E97C4", blur: 140, opacity: 0.06, speed: 0.004 },
  { baseX: 960,  baseY: 520, size: 620, color: "#C7CCD1", blur: 180, opacity: 0.03, speed: 0.006 },
  { baseX: 1680, baseY: 180, size: 380, color: "#BEF264", blur: 120, opacity: 0.035, speed: 0.007 },
];

export const AnimatedBackground: React.FC<{ orbs?: Orb[] }> = ({ orbs = VEIL_ORBS }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* faint grid for cryptographic texture */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(199,204,209,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(199,204,209,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 78%)",
        }}
      />
      {orbs.map((orb, i) => {
        const x = orb.baseX + Math.sin(frame * orb.speed + i * 1.5) * 90;
        const y = orb.baseY + Math.cos(frame * orb.speed + i * 2.1) * 70;
        return (
          <div key={i} style={{
            position: "absolute",
            left: x - orb.size / 2,
            top: y - orb.size / 2,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: orb.color,
            filter: `blur(${orb.blur}px)`,
            opacity: orb.opacity,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};
