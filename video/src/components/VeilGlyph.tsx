import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";

// Animated recreation of web/design/logo/forge/veil-final.svg
// Solid left arm draws first, right arm dissolves into a veil (3 fanning strokes),
// lime "sealed value" vertex pulses. Draw-on via stroke-dashoffset (pathLength=1).
export const VeilGlyph: React.FC<{
  size: number;
  delay?: number;
  showPlate?: boolean;
  style?: React.CSSProperties;
}> = ({ size, delay = 0, showPlate = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;

  const draw = spring({ frame: f, fps, config: { damping: 18, stiffness: 60 } });
  const leftDraw = interpolate(draw, [0, 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rightDraw = interpolate(draw, [0.4, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vertexProg = spring({ frame: f - 22, fps, config: { damping: 12, stiffness: 120 } });
  const vertexScale = interpolate(vertexProg, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 0.7 + Math.sin(f * 0.09) * 0.3;

  const grey = COLORS.offWhite;
  return (
    <svg width={size} height={size} viewBox="0 0 480 480" style={style}>
      {showPlate && (
        <rect width="480" height="480" rx="104" fill="#0E1116" stroke={COLORS.border} strokeWidth="1" />
      )}
      {/* solid left arm */}
      <path
        d="M150 146 L240 330"
        stroke={grey} strokeWidth={48} strokeLinecap="round" fill="none"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1 - leftDraw}
      />
      {/* right arm dissolving into a veil */}
      <g fill="none" stroke={grey} strokeLinecap="round">
        <path d="M240 330 L330 146" strokeWidth={17} opacity={0.95 * rightDraw}
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - rightDraw} />
        <path d="M240 330 L357 165" strokeWidth={12} opacity={0.55 * rightDraw}
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - rightDraw} />
        <path d="M240 330 L379 187" strokeWidth={9} opacity={0.28 * rightDraw}
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - rightDraw} />
      </g>
      {/* lime sealed value at the vertex */}
      <circle
        cx={240} cy={330} r={16 * vertexScale}
        fill={COLORS.accent}
        style={{ filter: `drop-shadow(0 0 ${10 * pulse}px ${COLORS.accent})` }}
      />
    </svg>
  );
};
