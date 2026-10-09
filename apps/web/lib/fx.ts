// Which visual effects may run (redesign spec "Performance and accessibility rules"). Pure: the hooks in use-fx.ts
// feed it what the browser reports.
export const MAX_DPR = 1.5; // WebGL device pixel ratio cap
export const SCROLLED_AT = 24; // px scrolled before the header turns frosted

export interface FxEnv {
  reducedMotion: boolean; // prefers-reduced-motion: reduce
  pointerFine: boolean;   // a mouse or trackpad (hover: hover and pointer: fine)
  wide: boolean;          // at least 640 px wide
  webgl: boolean | null;  // null until checked in the browser
  ready: boolean;         // the page has loaded and the browser is idle
}

export interface FxPlan {
  animate: boolean;      // false: every animation shows its final still state
  heroWebGL: boolean;    // DarkVeil + Particles behind the hero (else the CSS gradient)
  galleryWebGL: boolean; // CircularGallery (else a static row of images)
  ghostCursor: boolean;  // GhostCursor trail
  sparks: boolean;       // ClickSpark
  intro3d: boolean;      // the 3D scroll intro (else today's hero); phones too, at a lower resolution
}

export function fxPlan(e: FxEnv): FxPlan {
  const animate = !e.reducedMotion;
  const gl = animate && e.ready && e.webgl === true;
  return {
    animate,
    heroWebGL: gl && e.wide,
    galleryWebGL: gl,
    ghostCursor: gl && e.wide && e.pointerFine,
    sparks: animate && e.ready,
    intro3d: gl,
  };
}

export const cappedDpr = (dpr: number | undefined): number => Math.min(dpr && dpr > 0 ? dpr : 1, MAX_DPR);

export const isScrolled = (y: number): boolean => y > SCROLLED_AT;

interface GlLike { getExtension?(name: string): { loseContext?(): void } | null }
export interface CanvasLike { getContext(id: string): unknown }

// True when a WebGL (2 or 1) context can be made. The test context is released straight away.
export function webglAvailable(makeCanvas: () => CanvasLike | null): boolean {
  try {
    const canvas = makeCanvas();
    if (!canvas) return false;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as GlLike | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
