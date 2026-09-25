/**
 * Small round face that shows the feeling behind a funnel statement
 * (/start-test, /start-test-bwk). Hand-drawn SVG rather than emoji: emoji
 * render differently on every phone and read cheap next to the funnel's
 * type. Each mood has its own hue, expression and one small cue (scribble,
 * sweat drop, low battery…) so the feeling reads at a glance.
 *
 * Colors are oklch literals, like the dusk tokens in the funnel: the face
 * sits on a tinted disc, features in a dark (light theme) or pale (dusk)
 * shade of the same hue, the cue in a mid shade.
 */

export type Mood =
  | "overloaded"
  | "stretched"
  | "worried"
  | "drained"
  | "foggy"
  | "stuck"
  | "frustrated"
  | "talking"
  | "hopeful";

const HUE: Record<Mood, number> = {
  overloaded: 30,
  stretched: 60,
  worried: 75,
  drained: 290,
  foggy: 240,
  stuck: 270,
  frustrated: 48,
  talking: 170,
  hopeful: 150,
};

/** Accessible description, also used as the tooltip. */
const LABEL: Record<Mood, string> = {
  overloaded: "Overloaded",
  stretched: "Stretched thin",
  worried: "Worried",
  drained: "Drained",
  foggy: "Foggy",
  stuck: "Stuck",
  frustrated: "Frustrated",
  talking: "Talking it out",
  hopeful: "Hopeful",
};

// 64×64 canvas. The face sits a little low so the cue has room at the top.
const EYE_L = 25;
const EYE_R = 39;
const EYE_Y = 36;

function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case "overloaded":
      return (
        <>
          <circle cx={EYE_L} cy={EYE_Y} r={3.2} fill="none" />
          <circle cx={EYE_R} cy={EYE_Y} r={3.2} fill="none" />
        </>
      );
    case "stretched":
    case "drained":
      // Heavy, half-shut lids
      return (
        <>
          <path d={`M${EYE_L - 3.5} ${EYE_Y} q3.5 2.6 7 0`} fill="none" />
          <path d={`M${EYE_R - 3.5} ${EYE_Y} q3.5 2.6 7 0`} fill="none" />
        </>
      );
    case "foggy":
      return (
        <>
          <path d={`M${EYE_L - 3} ${EYE_Y} h6`} fill="none" />
          <path d={`M${EYE_R - 3} ${EYE_Y} h6`} fill="none" />
        </>
      );
    case "stuck":
      // Looking down and away
      return (
        <>
          <circle cx={EYE_L - 1} cy={EYE_Y + 1.5} r={2.3} stroke="none" fill="currentColor" />
          <circle cx={EYE_R - 1} cy={EYE_Y + 1.5} r={2.3} stroke="none" fill="currentColor" />
        </>
      );
    case "talking":
    case "hopeful":
      // Smiling eyes
      return (
        <>
          <path d={`M${EYE_L - 3.5} ${EYE_Y + 1} q3.5 -4 7 0`} fill="none" />
          <path d={`M${EYE_R - 3.5} ${EYE_Y + 1} q3.5 -4 7 0`} fill="none" />
        </>
      );
    default:
      return (
        <>
          <circle cx={EYE_L} cy={EYE_Y} r={2.4} stroke="none" fill="currentColor" />
          <circle cx={EYE_R} cy={EYE_Y} r={2.4} stroke="none" fill="currentColor" />
        </>
      );
  }
}

function Brows({ mood }: { mood: Mood }) {
  if (mood === "worried") {
    // Raised in the middle
    return (
      <>
        <path d={`M${EYE_L - 4} ${EYE_Y - 5} l7 -2.5`} fill="none" />
        <path d={`M${EYE_R + 4} ${EYE_Y - 5} l-7 -2.5`} fill="none" />
      </>
    );
  }
  if (mood === "frustrated") {
    // Pulled down toward the middle
    return (
      <>
        <path d={`M${EYE_L - 4} ${EYE_Y - 7.5} l7 3`} fill="none" />
        <path d={`M${EYE_R + 4} ${EYE_Y - 7.5} l-7 3`} fill="none" />
      </>
    );
  }
  return null;
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case "overloaded":
      return <path d="M25 47 q2.3 -2.4 4.6 0 t4.6 0 t4.6 0" fill="none" />;
    case "worried":
    case "drained":
      return <path d="M27 49 q5 -4 10 0" fill="none" />;
    case "frustrated":
      return <path d="M26 48 h12" fill="none" />;
    case "stuck":
    case "foggy":
    case "stretched":
      return <path d="M28 48 h8" fill="none" />;
    case "talking":
      return <ellipse cx={32} cy={48} rx={3.6} ry={3} fill="none" />;
    case "hopeful":
      return <path d="M25 46 q7 6 14 0" fill="none" />;
  }
}

/** The small cue that carries the feeling (drawn in the mid shade). */
function Cue({ mood }: { mood: Mood }) {
  switch (mood) {
    case "overloaded":
      // Tangled scribble above the head
      return <path d="M22 16 c3 -7 9 3 12 -3 s6 6 9 0 m-19 3 c4 3 7 -4 11 0 s5 2 7 -2" fill="none" />;
    case "stretched":
      // Three things in the air
      return (
        <>
          <path d="M20 19 q12 -12 24 0" fill="none" strokeDasharray="0.1 6" />
          <circle cx={20} cy={19} r={2.4} stroke="none" fill="currentColor" />
          <circle cx={32} cy={11} r={2.4} stroke="none" fill="currentColor" />
          <circle cx={44} cy={19} r={2.4} stroke="none" fill="currentColor" />
        </>
      );
    case "worried":
      // Sweat drop at the temple
      return <path d="M49 22 c-2.6 3.6 -3.4 5.6 -3.4 7 a3.4 3.4 0 0 0 6.8 0 c0 -1.4 -0.8 -3.4 -3.4 -7 z" stroke="none" fill="currentColor" />;
    case "drained":
      // Low battery
      return (
        <>
          <rect x={23} y={10} width={16} height={8} rx={2} fill="none" />
          <path d="M41.5 12.5 v3" fill="none" />
          <rect x={25.5} y={12.5} width={3} height={3} rx={0.6} stroke="none" fill="currentColor" />
        </>
      );
    case "foggy":
      return (
        <>
          <path d="M8 30 q3 -2 6 0 t6 0" fill="none" />
          <path d="M44 42 q3 -2 6 0 t6 0" fill="none" />
          <path d="M22 15 q3 -2 6 0 t6 0 t6 0" fill="none" />
        </>
      );
    case "stuck":
      return (
        <>
          <circle cx={26} cy={15} r={1.9} stroke="none" fill="currentColor" />
          <circle cx={32} cy={15} r={1.9} stroke="none" fill="currentColor" />
          <circle cx={38} cy={15} r={1.9} stroke="none" fill="currentColor" />
        </>
      );
    case "frustrated":
      // Tension zigzag above the head (steam puffs read as horns)
      return <path d="M21 15 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4" fill="none" />;
    case "talking":
      // Sound waves
      return (
        <>
          <path d="M45 43 q3 5 0 10" fill="none" />
          <path d="M50 40 q5 8 0 16" fill="none" />
        </>
      );
    case "hopeful":
      // Sparkle
      return <path d="M46 8 q1 6 7 7 q-6 1 -7 7 q-1 -6 -7 -7 q6 -1 7 -7 z" stroke="none" fill="currentColor" />;
  }
}

export function MoodAvatar({ mood, dark = false, size = 56 }: { mood: Mood; dark?: boolean; size?: number }) {
  const h = HUE[mood];
  const disc = dark ? `oklch(0.34 0.07 ${h})` : `oklch(0.93 0.055 ${h})`;
  const ring = dark ? `oklch(1 0 0 / 0.10)` : `oklch(0.86 0.07 ${h})`;
  const ink = dark ? `oklch(0.93 0.03 ${h})` : `oklch(0.36 0.07 ${h})`;
  const cue = dark ? `oklch(0.78 0.12 ${h})` : `oklch(0.62 0.14 ${h})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={LABEL[mood]}
      className="shrink-0"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{LABEL[mood]}</title>
      <circle cx={32} cy={32} r={31} fill={disc} stroke={ring} strokeWidth={1.5} />
      {/* Features scaled up around the lower-middle so they read at 56-60px */}
      <g stroke={ink} color={ink} transform="translate(32 41) scale(1.25) translate(-32 -41)">
        <Brows mood={mood} />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
      </g>
      <g stroke={cue} color={cue}>
        <Cue mood={mood} />
      </g>
    </svg>
  );
}
