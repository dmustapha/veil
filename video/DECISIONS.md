# Veil Demo Video — Autonomous Decisions

Fully autonomous run (no user input). Sensible defaults taken and logged below.

## Decision: Narration = TTS (Gemini Charon), not text-only
**Recommendation:** Synthetic voiceover via Gemini `Charon` (composed, measured authority).
**Rationale:** Skill default; a standalone explainer lands harder with voice. Synthetic narration
makes no false "human voice" claim. Two scenes hit the free-tier 3/min limit and were regenerated.
**Override:** Delete `public/audio/*.mp3`, regenerate, re-run ffprobe → update AUDIO_DURATIONS.
**Affected:** constants.ts (AUDIO_DURATIONS, SUBTITLES), all audio files.

## Decision: PACING_MODE = GAP (TTS, 1.0x + 1.0s scene gaps)
**Recommendation:** GAP mode, SCENE_GAP = 30 frames (1.0s), atempo 1.12 on each clip.
**Rationale:** No human recording exists. 1.0s gap (not 1.5s) keeps a ~142s runtime, within 90-150s.
**Override:** constants.ts SCENE_GAP.

## Decision: Composition = Strategy C (TransitionSeries + per-scene audio), 15fr crossfade
**Rationale:** Recommended default; smooth fades + precise per-scene audio. 15fr = hackathon pacing.
**Override:** constants.ts CROSSFADE; MainVideo.tsx.

## Decision: Brand theme (custom, overrides archetype default)
**Recommendation:** dark `#0A0C10`, light-grey `#C7CCD1`, single lime `#BEF264`. ETH = periwinkle
`#8E97C4`, Stellar = light grey. Lime reserved for the ZK proof / sealed value only.
**Rationale:** Brief brand tokens. Monochrome + one accent = editorial/cryptographic/premium, matches logo.
**Override:** constants.ts COLORS.

## Decision: Logo = animated inline SVG monogram (VeilGlyph), not the static PNG
**Recommendation:** Recreated `veil-final.svg` as an animated component (draw-on arms, pulsing lime vertex).
**Rationale:** Far more premium than a static image; avoids any ImageMagick rasterization (used Playwright
earlier for PNGs anyway). Static PNG still copied to public/assets/logo.png as fallback.
**Override:** components/VeilGlyph.tsx.

## Decision: Scene lineup (8 scenes, dual-angle co-equal)
Hook → Capital (Problem 01) → Privacy (Problem 02) → Solution → Flow → Guarantee → Proof → Close.
**Rationale:** Both problems get their own scene so neither is demoted. Flow is the animated centerpiece.
**Override:** MainVideo.tsx scenes[] + SCENE_ORDER in constants.ts (keep them in sync).

## Honesty constraints honored
- Only real on-chain proof cited: WETH lock `0x4fa09246…c959`, Axelar execute `bdc2af52…fe27`,
  ~6.05 real Circle USDC, both provers verify live, tampered proof rejected. Live app veilzk.vercel.app.
- Repay/release NOT shown or claimed as live (deferred).
- No em-dashes anywhere. No bridge-bashing (bridging/selling stated neutrally as "lose your position").
- Privacy scene's leaked values are illustrative of a generic public-chain loan, labeled "PUBLIC CHAIN",
  not presented as Veil's own numbers.

## Placeholder status
This is an animated explainer PLACEHOLDER. A live-app walkthrough recording will replace it later.
