import { Circle, Svg } from "react-native-svg";

/**
 * StarField — deterministic procedural cosmos background. 70 stars
 * scattered via seed-prime arithmetic (x = i*137 % width, y = i*89 %
 * height, opacity from i*7 % 60). Same pattern every render — no
 * randomization — so the entrance feels predictable across sessions.
 *
 * Per design spec (_design/design_handoff_acuity_v2/screen-thememap.jsx
 * lines 28-40). Lives as an absolute-positioned full-screen background
 * behind the orbital SVG so stars fill the entire screen, not just the
 * orbital box.
 *
 * Star color: white at the caller-passed opacity in dark mode; a muted
 * indigo in light mode (per design's `oklch(0.45 0.05 285)`). Caller
 * supplies via `color` prop so the field stays palette-agnostic.
 */
interface Props {
  width: number;
  height: number;
  color: string;
}

const STAR_COUNT = 70;

export function StarField({ width, height, color }: Props) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      pointerEvents="none"
    >
      {Array.from({ length: STAR_COUNT }).map((_, i) => {
        const x = (i * 137) % width;
        const y = (i * 89) % height;
        const r = i % 7 === 0 ? 1.4 : 0.7;
        const op = 0.2 + ((i * 7) % 60) / 100;
        return (
          <Circle
            key={`star-${i}`}
            cx={x}
            cy={y}
            r={r}
            fill={color}
            opacity={op}
          />
        );
      })}
    </Svg>
  );
}
