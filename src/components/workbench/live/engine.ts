import * as T from 'three';
import {
  type Box,
  clipBox,
  isFlat,
  LIVE_COLOR,
  type LiveLook,
  SOLID_SCALE,
  type SolidLook,
  underCover,
} from '@/lib/live-status';

type Tick = (t: number) => void;
type Built = [T.Object3D, Tick];

const STILL_T = 1.3;
const UNFOCUSED_GAP_MS = 33;
const REDUCED_GAP_MS = 500;
const DIM_ALPHA = 0.55;

const canvas = document.createElement('canvas');
canvas.className = 'live-gl';
canvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(canvas);

const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio());
renderer.outputEncoding = T.sRGBEncoding;
renderer.setClearColor(0x000000, 0);
const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
camera.position.set(0, 0, 4.6);

const col = (hex: string) => new T.Color(hex).convertSRGBToLinear();
const mat = (hex: string, e = 0.16, flat = true) =>
  new T.MeshStandardMaterial({
    color: col(hex),
    roughness: 0.42,
    metalness: 0.06,
    emissive: col(hex),
    emissiveIntensity: e,
    flatShading: flat,
  });
const geo = new Map<string, T.BufferGeometry>();
const g = (key: string, make: () => T.BufferGeometry) => {
  const found = geo.get(key);
  if (found) return found;
  const made = make();
  geo.set(key, made);
  return made;
};
const shake = (t: number, period: number, len: number, amp: number) => {
  const p = t % period;
  return p < len ? Math.sin(p * 60) * amp * (1 - p / len) : 0;
};

function gearGeo() {
  const shape = new T.Shape();
  const teeth = 8;
  const ro = 1.05;
  const ri = 0.8;
  const step = (Math.PI * 2) / teeth;
  let first = true;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const seq: [number, number][] = [
      [a - step * 0.5, ri],
      [a - step * 0.22, ri],
      [a - step * 0.14, ro],
      [a + step * 0.14, ro],
      [a + step * 0.22, ri],
    ];
    for (const [ang, r] of seq) {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (first) {
        shape.moveTo(x, y);
        first = false;
      } else shape.lineTo(x, y);
    }
  }
  const hole = new T.Path();
  hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const eg = new T.ExtrudeGeometry(shape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 16,
  });
  eg.center();
  return eg;
}

const sphere = (c: string) =>
  new T.Mesh(
    g('sph', () => new T.SphereGeometry(0.72, 32, 24)),
    mat(c, 0.1, false),
  );
const torus = (c: string) =>
  new T.Mesh(
    g('tor', () => new T.TorusGeometry(0.7, 0.25, 18, 48)),
    mat(c, 0.16, false),
  );

const BUILD: Record<SolidLook, (c: string) => Built> = {
  idle: (c) => {
    const m = sphere(c);
    return [m, (t) => m.scale.setScalar(1 + 0.02 * Math.sin(t * 1.5))];
  },
  still: (c) => [sphere(c), () => {}],
  thinking: (c) => {
    const grp = new T.Group();
    const ico = new T.Mesh(
      g('ico', () => new T.IcosahedronGeometry(0.85, 0)),
      mat(c, 0.2),
    );
    const ring = new T.Mesh(
      g('ring', () => new T.TorusGeometry(1.12, 0.06, 8, 64)),
      mat('#e3dbff', 0.3, false),
    );
    ring.rotation.x = 1.2;
    grp.add(ico, ring);
    return [
      grp,
      (t) => {
        ico.rotation.x = t * 0.9;
        ico.rotation.y = t * 1.3;
        ico.scale.setScalar(1 + 0.06 * Math.sin(t * 3));
        ring.rotation.y = t * 1.8;
      },
    ];
  },
  tool: (c) => {
    const grp = new T.Group();
    const m = new T.Mesh(g('gear', gearGeo), mat(c, 0.16));
    grp.add(m);
    grp.rotation.x = -0.5;
    grp.rotation.y = 0.3;
    return [
      grp,
      (t) => {
        m.rotation.z = -t * 1.6;
      },
    ];
  },
  agents: (c) => {
    const grp = new T.Group();
    grp.add(
      new T.Mesh(
        g('core', () => new T.SphereGeometry(0.55, 32, 24)),
        mat(c, 0.18, false),
      ),
    );
    const tilt = [0.4, 1.2, -0.7];
    const turn = [0, 1.1, 2.2];
    const pivots = [0, 1, 2].map((i) => {
      const p = new T.Group();
      p.rotation.x = tilt[i] ?? 0;
      p.rotation.z = turn[i] ?? 0;
      const sat = new T.Mesh(
        g('sat', () => new T.SphereGeometry(0.17, 16, 12)),
        mat('#d6e6ff', 0.35, false),
      );
      sat.position.x = 1.02;
      p.add(sat);
      grp.add(p);
      return p;
    });
    return [
      grp,
      (t) =>
        pivots.forEach((p, i) => {
          p.rotation.y = t * (1.7 + i * 0.35) + i * 2;
        }),
    ];
  },
  waiting: (c) => {
    const m = new T.Mesh(
      g('oct', () => new T.OctahedronGeometry(0.82)),
      mat(c, 0.2),
    );
    return [
      m,
      (t) => {
        const s = Math.abs(Math.sin(t * 3.2));
        m.position.y = s * 0.4 - 0.2;
        const sq = (1 - s) ** 6 * 0.22;
        m.scale.set(1 + sq, 1 - sq, 1 + sq);
        m.rotation.y = t * 0.8;
      },
    ];
  },
  done: (c) => {
    const m = new T.Mesh(
      g('dod', () => new T.DodecahedronGeometry(0.85)),
      mat(c, 0.16),
    );
    m.rotation.x = 0.35;
    return [
      m,
      (t) => {
        m.rotation.y = t * 0.5;
      },
    ];
  },
  error: (c) => {
    const m = new T.Mesh(
      g('tet', () => new T.TetrahedronGeometry(1.0)),
      mat(c, 0.2),
    );
    m.rotation.x = 0.6;
    return [
      m,
      (t) => {
        m.position.x = shake(t, 2.4, 0.45, 0.09);
        m.rotation.y = t * 0.4;
      },
    ];
  },
  dev_run: (c) => {
    const m = torus(c);
    return [
      m,
      (t) => {
        m.rotation.x = t * 1.2;
        m.rotation.y = t * 0.7;
      },
    ];
  },
  dev_slow: (c) => {
    const m = torus(c);
    return [
      m,
      (t) => {
        m.rotation.x = t * 0.35;
        m.rotation.y = t * 0.2;
      },
    ];
  },
};

interface Made {
  scene: T.Scene;
  tick: Tick;
  materials: T.Material[];
  alpha: number;
}

const scenes = new Map<LiveLook, Made>();

function setAlpha(s: Made, alpha: number) {
  if (s.alpha === alpha) return;
  for (const m of s.materials) {
    m.transparent = alpha < 1;
    m.opacity = alpha;
  }
  s.alpha = alpha;
}

function sceneOf(look: LiveLook) {
  const found = scenes.get(look);
  if (found) return found;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x2a2d34, 0.9));
  const light = new T.DirectionalLight(0xffffff, 1.15);
  light.position.set(2.5, 3.5, 4);
  scene.add(light);
  const solid = isFlat(look) ? 'still' : look;
  const [obj, tick] = BUILD[solid](LIVE_COLOR[look]);
  const fit = new T.Group();
  fit.scale.setScalar(SOLID_SCALE[solid]);
  fit.add(obj);
  scene.add(fit);
  const materials: T.Material[] = [];
  fit.traverse((o) => {
    if (o instanceof T.Mesh) materials.push(o.material as T.Material);
  });
  const made = { scene, tick, materials, alpha: 1 };
  scenes.set(look, made);
  return made;
}

interface Slot {
  look: LiveLook;
  clips: HTMLElement[];
  cut: Element | null;
  dim: boolean;
}

const slots = new Map<Element, Slot>();
const visible = new Set<Element>();
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
let raf = 0;
let last = 0;
let width = 0;
let height = 0;

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) visible.add(e.target);
    else visible.delete(e.target);
  }
  wake();
});

function clipsOf(el: HTMLElement): HTMLElement[] {
  const clips: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') clips.push(p);
  }
  return clips;
}

const boxOf = (el: Element): Box => el.getBoundingClientRect();

function clear() {
  renderer.setScissorTest(false);
  renderer.clear();
}

function draw(t: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ratio = pixelRatio();
  if (ratio !== renderer.getPixelRatio()) {
    renderer.setPixelRatio(ratio);
    width = 0;
  }
  if (w !== width || h !== height) {
    renderer.setSize(w, h, false);
    width = w;
    height = h;
  }
  clear();
  renderer.setScissorTest(true);
  const covers = [...document.querySelectorAll('[data-live-cover]')].map(boxOf);
  const ticked = new Set<LiveLook>();
  for (const el of visible) {
    const slot = slots.get(el);
    if (!slot) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (covers.length > 0 && !el.closest('[data-live-top]') && underCover(r, covers)) continue;
    const box = clipBox(r, slot.clips.map(boxOf), w, h);
    if (!box) continue;
    if (slot.cut?.parentElement?.matches(':hover, :focus-visible')) {
      box.bottom = Math.min(box.bottom, slot.cut.getBoundingClientRect().top);
      if (box.bottom <= box.top) continue;
    }
    const s = sceneOf(slot.look);
    if (!ticked.has(slot.look)) {
      s.tick(t);
      ticked.add(slot.look);
    }
    setAlpha(s, slot.dim ? DIM_ALPHA : 1);
    renderer.setViewport(r.left, h - r.bottom, r.width, r.height);
    renderer.setScissor(box.left, h - box.bottom, box.right - box.left, box.bottom - box.top);
    renderer.render(s.scene, camera);
  }
}

function frame(now: number) {
  raf = 0;
  if (document.hidden || visible.size === 0) {
    clear();
    return;
  }
  const gap = reduce.matches ? REDUCED_GAP_MS : document.hasFocus() ? 0 : UNFOCUSED_GAP_MS;
  if (now - last >= gap) {
    draw(reduce.matches ? STILL_T : now / 1000);
    last = now;
  }
  raf = requestAnimationFrame(frame);
}

function wake() {
  last = Number.NEGATIVE_INFINITY;
  if (!raf) raf = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', wake);
window.addEventListener('focus', wake);
for (const type of ['scroll', 'pointerover', 'pointerout', 'focusin', 'focusout']) {
  document.addEventListener(type, () => reduce.matches && wake(), { capture: true, passive: true });
}

export function register(el: HTMLElement, look: LiveLook, dim = false): () => void {
  slots.set(el, {
    look,
    dim,
    clips: clipsOf(el),
    cut: el.parentElement?.querySelector(':scope > [data-live-cut]') ?? null,
  });
  visible.add(el);
  io.observe(el);
  wake();
  return () => {
    slots.delete(el);
    visible.delete(el);
    io.unobserve(el);
    wake();
  };
}

export function onLost(lost: (off: boolean) => void) {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost(true);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost(false);
    wake();
  });
}
