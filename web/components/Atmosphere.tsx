/** Layered gradient mesh + focal glow + SVG grain + faint lime seal-hex
 *  wallpaper (deterministically seeded from the real selector). Decorative. */

function buildHexWallpaper() {
  let seed = 0x73c457ba >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const glyph = "0123456789abcdef";
  let hex = "73c457ba";
  for (let i = 0; i < 4200; i++) hex += glyph[(rnd() >>> (i % 24)) & 0xf];
  const id = "c1fb4c3a7577b245";
  let out = "";
  for (let j = 0; j < hex.length; j += 2) {
    out += hex.substr(j, 2);
    out += j % 64 === 62 ? " " + id.substr((j / 2) % 16, 8) + " " : " ";
  }
  return out;
}

const HEX_WALLPAPER = buildHexWallpaper();

export function Atmosphere() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <div className="focal-glow" aria-hidden="true" />
      <div className="seal-wallpaper" aria-hidden="true">
        {HEX_WALLPAPER}
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
