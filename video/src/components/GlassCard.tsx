import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";

export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  delay?: number;
  borderColor?: string;
}> = ({ children, style, delay = 0, borderColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const prog = spring({
    frame: frame - delay, fps,
    config: { mass: 1, damping: 15, stiffness: 80 },
  });
  const opacity = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(prog, [0, 1], [16, 0]);

  return (
    <div style={{
      background: COLORS.bgCard,
      border: `1px solid ${borderColor ?? COLORS.border}`,
      borderRadius: 16,
      padding: "24px 28px",
      opacity,
      transform: `translateY(${y}px)`,
      boxShadow: `0 0 30px rgba(0,0,0,0.35)`,
      ...style,
    }}>
      {children}
    </div>
  );
};
