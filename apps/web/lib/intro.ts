// The scroll intro's timeline (spec 2026-10-09-spookpad-intro-stage-design.md). Pure: scroll progress in, every value
// the scene needs out, so scrolling back up plays it exactly in reverse.
export const RING_COUNT = 7;           // the seven costumes on the wardrobe ring
export const RING_STEP = (2 * Math.PI) / RING_COUNT;
export const INTRO_SVH = 350;          // the section's height; the stage inside it is sticky
export const SWAP_AT = 0.75;           // the top of the hop: the mascot's picture switches here, under full smoke
export const MAX_YAW = (25 * Math.PI) / 180;
const TURNS = 1.5;                     // ring turns between 0.3 and 0.7

export interface IntroFrame {
  textIn: number;     // opening text opacity
  textOut: number;    // closing text opacity
  camZ: number;       // camera distance from the mascot
  ringRise: number;   // 0: costumes below the floor, 1: on the ring
  ringAngle: number;  // ring item i stands at ringAngle + i * RING_STEP; angle 0 is the front (nearest the camera)
  yaw: number;        // mascot turn, radians, toward the costume nearest the front
  lean: number;       // mascot tilt, radians
  hop: number;        // mascot height above the floor
  squash: number;     // landing squash: scaleY = 1 - squash, scaleX = 1 + 0.6 * squash
  smoke: number;      // 0..1 smoke puff
  pickedLeft: number; // 0..1 how far the picked costume has left the ring
  wearing: number;    // -1 plain, else the ring index the mascot wears
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x); // smoothstep: no jolt where a phase starts or ends

export function introFrame(progress: number, pick: number): IntroFrame {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const k = ((Math.floor(pick) % RING_COUNT) + RING_COUNT) % RING_COUNT;
  const end = -k * RING_STEP; // puts item k at the front
  const ringAngle = end + TURNS * 2 * Math.PI * (1 - ease(seg(p, 0.3, 0.7)));
  // The items are 1/7 of a turn apart, so sin(7 * angle) is the same for all of them: it leans toward the item nearest
  // the front, passes through 0 halfway between two items, and is 0 when an item is exactly in front. At the ring's
  // start (end + 3 pi) and end angles that holds too, so the mascot is still before 0.3 and after 0.7.
  const yaw = MAX_YAW * Math.sin(RING_COUNT * ringAngle);
  return {
    textIn: 1 - ease(seg(p, 0, 0.15)),
    textOut: ease(seg(p, 0.85, 0.95)),
    camZ: 9 - 3 * ease(seg(p, 0, 0.3)),
    ringRise: ease(seg(p, 0.15, 0.3)),
    ringAngle,
    yaw,
    lean: -0.35 * yaw,
    hop: 0.9 * Math.sin(Math.PI * seg(p, 0.7, 0.8)),
    squash: 0.18 * Math.sin(Math.PI * seg(p, 0.8, 0.85)),
    smoke: clamp01((0.035 - Math.abs(p - SWAP_AT)) / 0.015), // full within 0.02 of the swap, gone 0.035 away
    pickedLeft: ease(seg(p, 0.72, SWAP_AT)),
    wearing: p >= SWAP_AT ? k : -1,
  };
}

// Scroll progress through the intro section from its bounding box: 0 while its top is at (or below) the top of the
// screen, 1 once its bottom reaches the bottom of the screen.
export function progressAt(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return 0;
  return clamp01(-top / travel);
}

export const randomPick = (): number => Math.floor(Math.random() * RING_COUNT) % RING_COUNT;
