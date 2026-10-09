"use client";
// The scroll intro's 3D stage (spec 2026-10-09-spookpad-intro-stage-design.md). three.js, loaded lazily by IntroStage
// only: never part of the home page's initial JavaScript. Every value comes from introFrame(progress, pick).
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { cappedDpr } from "@/lib/fx";
import { introFrame, RING_COUNT, RING_STEP } from "@/lib/intro";
import { SHOWCASE } from "@/lib/showcase";

const MASCOT_H = 2.2;        // world units
const RING_SCALE = 0.55;     // ring costumes, relative to the mascot
const RING_R = 2.6;
const RING_Z = -0.4;         // ring centre, a little behind the mascot
const LAYERS = 6;            // planes per sticker: the front picture plus 5 dark ones behind it for thickness
const DEPTH = MASCOT_H * 0.015;
const RIM = 1.015;           // the pumpkin rim, scaled up from the picture
const EDGE = "#1a1030";
const PUMPKIN = "#ff7a1a";
const FOV = 35;
// the stage's width as seen on a 1.1:1 screen; taller screens widen the vertical view to keep it (up to 75 degrees)
const HALF_WIDTH = Math.tan((FOV * Math.PI) / 360) * 1.1;
const fovFor = (aspect: number) => Math.min(75, Math.max(FOV, (2 * Math.atan(HALF_WIDTH / aspect) * 180) / Math.PI));

interface Art { front: THREE.Texture; edge: THREE.Texture; rim: THREE.Texture }
// group: the picture and its thickness; shadow: on the floor, positioned by the caller (it must not hop or lean)
interface Sticker { group: THREE.Group; shadow: THREE.Mesh; setArt(art: Art): void }

// One picture, three textures: the picture itself, and its silhouette filled dark (edge) and pumpkin (rim).
function makeArt(img: HTMLImageElement): Art {
  const silhouette = (color: string) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const front = new THREE.Texture(img);
  front.colorSpace = THREE.SRGBColorSpace;
  front.needsUpdate = true;
  return { front, edge: silhouette(EDGE), rim: silhouette(PUMPKIN) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => new THREE.ImageLoader().load(src, resolve, undefined, () => reject(new Error(`could not load ${src}`))));
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A cut-out standing on the floor at its bottom edge: front picture, dark layers behind it (seen when it turns), and a
// thin pumpkin rim. Hidden until its picture has loaded.
function makeSticker(scene: THREE.Scene, plane: THREE.PlaneGeometry, shadowGeo: THREE.PlaneGeometry, shadowTex: THREE.Texture): Sticker {
  const group = new THREE.Group();
  const front = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02 });
  // soft alpha (not alphaTest) so the silhouettes keep smooth edges
  const edge = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02 });
  const rim = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02 });
  group.add(new THREE.Mesh(plane, front));
  for (let k = 1; k < LAYERS; k++) {
    const layer = new THREE.Mesh(plane, edge);
    layer.position.z = -k * DEPTH;
    group.add(layer);
  }
  const rimMesh = new THREE.Mesh(plane, rim);
  rimMesh.scale.set(RIM, RIM, 1);
  rimMesh.position.set(0, -(MASCOT_H * (RIM - 1)) / 2, -LAYERS * DEPTH); // grow about the centre, not the feet
  group.add(rimMesh);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.visible = shadow.visible = false;
  scene.add(group, shadow);
  return {
    group,
    shadow,
    setArt(art) {
      front.map = art.front;
      edge.map = art.edge;
      rim.map = art.rim;
      for (const m of [front, edge, rim]) m.needsUpdate = true;
      group.visible = shadow.visible = true;
    },
  };
}

export default function IntroScene({ progress, pick, active, wide, onReady }: {
  progress: RefObject<number>; pick: number; active: boolean; wide: boolean; onReady(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const startRef = useRef<() => void>(() => {});
  const readyRef = useRef(onReady);
  const [error, setError] = useState<Error | null>(null);
  if (error) throw error; // a picture that never loads: FxBoundary shows today's hero

  useEffect(() => { readyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(wide ? cappedDpr(window.devicePixelRatio) : 1);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    let w = 1, h = 1;
    const resize = () => {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = fovFor(camera.aspect);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const plane = new THREE.PlaneGeometry(MASCOT_H, MASCOT_H).translate(0, MASCOT_H / 2, 0);
    const shadowGeo = new THREE.PlaneGeometry(MASCOT_H * 0.8, MASCOT_H * 0.3);
    const shadowTex = radialTexture([[0, "rgba(0,0,0,0.55)"], [1, "rgba(0,0,0,0)"]]);
    const floorTex = radialTexture([[0, "rgba(255,122,26,0.35)"], [0.5, "rgba(120,50,160,0.18)"], [1, "rgba(13,10,20,0)"]]);
    const puffTex = radialTexture([[0, "rgba(255,190,120,1)"], [0.45, "rgba(255,122,26,0.7)"], [1, "rgba(255,122,26,0)"]]);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const mascot = makeSticker(scene, plane, shadowGeo, shadowTex);
    const ring = Array.from({ length: RING_COUNT }, () => makeSticker(scene, plane, shadowGeo, shadowTex));

    const smokeCount = wide ? 40 : 20;
    const puffs = Array.from({ length: smokeCount }, (_, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: i % 3 ? "#ffffff" : "#c9b8e6" }));
      // fixed directions (no Math.random): the puff looks the same every time it plays
      const a = i * 2.399963; // golden angle
      const dir = new THREE.Vector3(Math.cos(a), 0.6 * Math.sin(i * 1.7), Math.sin(a) * 0.6).normalize();
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, dir };
    });

    const arts: (Art | undefined)[] = [];
    let plain: Art | undefined;
    let wearing = -2; // the picture the mascot shows; -2 = none yet
    let disposed = false;
    const load = (src: string) => loadImage(src).then((img) => (disposed ? undefined : makeArt(img)));
    load(SHOWCASE[0].cut)
      .then((art) => {
        if (!art) return;
        plain = art;
        // the costumes load after the plain mascot is up
        return Promise.all(SHOWCASE.slice(1).map((c, i) => load(c.cut).then((a) => { if (a) { arts[i] = a; ring[i].setArt(a); } })));
      })
      .catch((e: Error) => { if (!disposed) setError(e); });

    let raf = 0;
    let announced = false;
    let shown = progress.current ?? 0; // the progress on screen: glides toward the scroll position
    let last = 0;
    const frame = (now: number) => {
      raf = activeRef.current ? requestAnimationFrame(frame) : 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const target = progress.current ?? 0;
      // a mouse wheel scrolls in jumps; easing toward the target (about 90% of the way in 0.4 s) smooths them out
      shown = Math.abs(target - shown) < 1e-4 ? target : shown + (target - shown) * (1 - Math.exp(-dt * 6));
      const f = introFrame(shown, pick);
      const t = now / 1000;

      camera.position.set(0, 1.6 + (f.camZ - 6) * 0.25, f.camZ);
      camera.lookAt(0, 1.1, 0);
      // while the text shows, the stage sits beside it (desktop) or below it (phone)
      const c = Math.max(f.textIn, f.textOut);
      if (wide) camera.setViewOffset(w, h, -w * 0.2 * c, 0, w, h);
      else camera.setViewOffset(w, h, 0, -h * 0.22 * c, w, h);

      if (plain && f.wearing !== wearing) {
        const art = f.wearing < 0 ? plain : arts[f.wearing];
        if (art) { mascot.setArt(art); wearing = f.wearing; }
      }
      mascot.group.position.y = f.hop + 0.04 * Math.sin(t * 2);
      mascot.group.rotation.set(0, f.yaw, f.lean);
      mascot.group.scale.set(1 + 0.6 * f.squash, 1 - f.squash, 1);
      mascot.shadow.scale.setScalar(1 - 0.35 * f.hop); // smaller while it is in the air

      for (let i = 0; i < RING_COUNT; i++) {
        const { group: g, shadow } = ring[i];
        const a = f.ringAngle + i * RING_STEP;
        const s = RING_SCALE * f.ringRise * (i === pick ? 1 - f.pickedLeft : 1);
        const x = RING_R * Math.sin(a);
        const z = RING_Z + RING_R * Math.cos(a);
        g.position.set(x, -0.6 * (1 - f.ringRise) + 0.05 * Math.sin(t * 2 + i), z);
        g.scale.setScalar(Math.max(s, 1e-4));
        g.lookAt(camera.position.x, g.position.y, camera.position.z);
        g.rotation.y += 0.35 * Math.sin(a); // a little turn so the sticker's thickness shows as it travels
        g.visible = shadow.visible = !!arts[i] && s > 1e-3;
        shadow.position.set(x, 0.01, z);
        shadow.scale.setScalar(Math.max(s, 1e-4));
      }

      for (const { sprite, dir } of puffs) {
        sprite.visible = f.smoke > 0.01;
        if (!sprite.visible) continue;
        const r = 0.3 + 0.9 * f.smoke;
        sprite.position.set(dir.x * r, 1.1 + f.hop + dir.y * r, 0.4 + dir.z * r);
        sprite.scale.setScalar(0.6 + 1.4 * f.smoke);
        sprite.material.opacity = f.smoke;
      }

      renderer.render(scene, camera);
      if (plain && !announced) { announced = true; readyRef.current(); }
    };
    const start = () => { if (!raf && activeRef.current) { last = 0; raf = requestAnimationFrame(frame); } };
    startRef.current = start;
    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
      });
      for (const a of [plain, ...arts]) if (a) { a.front.dispose(); a.edge.dispose(); a.rim.dispose(); }
      plane.dispose();
      shadowGeo.dispose();
      floor.geometry.dispose();
      shadowTex.dispose();
      floorTex.dispose();
      puffTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [pick, wide, progress]);

  // off screen or a hidden tab: stop drawing; back on screen: start again
  useEffect(() => {
    activeRef.current = active;
    if (active) startRef.current();
  }, [active]);

  return <div ref={host} aria-hidden className="absolute inset-0" />;
}
