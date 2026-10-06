// Небо и пиксельная Луна: код с moonlandmc.ru (site.js), логика не менялась.

type Cell = { nx: number; ny: number; nz: number; alb: number } | null;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function rand(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function drawSky(sc: HTMLCanvasElement): void {
  const sctx = sc.getContext('2d')!;
  const draw = () => {
    const CELL = 2, w = Math.ceil(innerWidth / CELL), h = Math.ceil(innerHeight / CELL);
    sc.width = w; sc.height = h; sctx.clearRect(0, 0, w, h);
    const r = rand(20260914), count = Math.min(220, Math.round((w * h) / 2600));
    for (let i = 0; i < count; i++) {
      const x = Math.floor(r() * w), y = Math.floor(r() * h), b = r();
      const a = b < .7 ? .18 + r() * .18 : b < .95 ? .4 + r() * .2 : .75;
      sctx.fillStyle = `rgba(214,224,255,${a.toFixed(2)})`; sctx.fillRect(x, y, 1, 1);
      if (b > .985) {
        sctx.fillStyle = `rgba(214,224,255,${(a * .35).toFixed(2)})`;
        sctx.fillRect(x - 1, y, 1, 1); sctx.fillRect(x + 1, y, 1, 1); sctx.fillRect(x, y - 1, 1, 1); sctx.fillRect(x, y + 1, 1, 1);
      }
    }
  };
  draw();
  let rt: number | undefined;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(draw, 150); });
}

const SYNODIC = 29.530588853, NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
const moonAge = (d: Date) => { const days = d.getTime() / 86400000 - NEW_MOON_EPOCH; return ((days % SYNODIC) + SYNODIC) % SYNODIC; };
const PHASES = ['новолуние', 'растущий серп', 'первая четверть', 'растущая Луна', 'полнолуние', 'убывающая Луна', 'последняя четверть', 'убывающий серп'];
const phaseName = (age: number) => PHASES[Math.floor((age / SYNODIC) * 8 + .5) % 8];
function phaseInfo(angle: number) {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return { name: phaseName(a / (Math.PI * 2) * SYNODIC), lit: Math.round((1 - Math.cos(a)) / 2 * 100) };
}

function buildMoon(N: number): Cell[] {
  const r = rand(1969);
  const maria = [[-.32, -.38, .30], [.18, -.36, .19], [.36, -.04, .23], [-.58, .06, .34], [-.16, .44, .19], [.70, -.30, .12], [.10, .20, .12]];
  const craters = [[-.08, .70, 1.25, 1], [-.46, -.66, .9, 0], [.52, .52, .9, 0], [-.66, .42, .8, 0], [.30, -.72, .8, 0], [-.30, .02, .7, 1], [.62, .14, .7, 0], [.02, -.08, .6, 0]];
  const cells: Cell[] = [], R = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = (x + .5 - R) / R, ny = (y + .5 - R) / R, d2 = nx * nx + ny * ny;
    if (d2 > 1) { cells.push(null); continue; }
    let alb = .86 + (r() - .5) * .07;
    for (const m of maria) { const mx = nx - m[0], my = ny - m[1], md = Math.sqrt(mx * mx + my * my) / m[2]; if (md < 1) alb -= .26 * (1 - md * md * .6); }
    for (const c of craters) {
      const cr = c[2] / R * 2.2, cx = nx - c[0], cy = ny - c[1], cd = Math.sqrt(cx * cx + cy * cy);
      if (c[3] && cd < cr * .55) alb = Math.max(alb, 1.02); else if (cd < cr * .55) alb -= .2; else if (cd < cr && cx < 0 && cy < 0) alb += .08;
    }
    cells.push({ nx, ny, nz: Math.sqrt(1 - d2), alb: Math.max(.35, Math.min(1.05, alb)) });
  }
  return cells;
}

const LIT = ['#30374a', '#4b546a', '#6b748a', '#8f97ab', '#b4bacb', '#d6dae5', '#f0f2f7'], ASH = ['#0e1321', '#131a2a', '#1a2234', '#212a3e'];

function paintMoon(c2: CanvasRenderingContext2D, N: number, cells: Cell[], angle: number) {
  const sx = Math.sin(angle), sz = -Math.cos(angle); c2.clearRect(0, 0, N, N);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]; if (!c) continue;
    const diffuse = c.nx * sx + c.nz * sz;
    let col: string;
    if (diffuse <= 0.015) { const a = Math.floor((c.alb - .45) / .6 * ASH.length) + (c.nz < .32 ? 1 : 0); col = ASH[Math.max(0, Math.min(ASH.length - 1, a))]; }
    else { const v = c.alb * (.3 + .76 * Math.pow(diffuse, .5)); col = LIT[Math.max(0, Math.min(LIT.length - 1, Math.floor(v * LIT.length)))]; }
    c2.fillStyle = col; c2.fillRect(i % N, Math.floor(i / N), 1, 1);
  }
}

/** Луна всходит до сегодняшней фазы; движение мыши над ней листает фазы. Возвращает функцию повторного восхода. */
export function initMoon(canvas: HTMLCanvasElement, caption: HTMLElement): () => void {
  const N = 30;
  canvas.width = canvas.height = N;
  const mctx = canvas.getContext('2d')!, cells = buildMoon(N);
  const todayAngle = (moonAge(new Date()) / SYNODIC) * Math.PI * 2;
  let current = 0, anim: number | null = null, back: number | undefined;

  const setCaption = (angle: number, isToday: boolean) => {
    const info = phaseInfo(angle);
    caption.textContent = isToday ? 'Сегодня на небе ' : 'Фаза: ';
    const b = document.createElement('b'); b.textContent = info.name;
    caption.append(b, `, освещено ${info.lit}%`);
  };
  const render = (a: number) => { current = a; paintMoon(mctx, N, cells, a); };
  const animateTo = (target: number, dur: number, done?: () => void) => {
    if (anim) cancelAnimationFrame(anim);
    if (reduceMotion) { render(target); done?.(); return; }
    const from = current; let start: number | null = null;
    const frame = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      render(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) anim = requestAnimationFrame(frame); else { anim = null; done?.(); }
    };
    anim = requestAnimationFrame(frame);
  };
  const rise = () => {
    render(.001); setCaption(todayAngle, true);
    const tgt = todayAngle < .05 ? Math.PI * 2 : todayAngle;
    setTimeout(() => animateTo(tgt, 900 + 1500 * (tgt / (Math.PI * 2))), 250);
  };
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && e.buttons === 0) return;
    clearTimeout(back); if (anim) { cancelAnimationFrame(anim); anim = null; }
    const rc = canvas.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width)), a = .02 + p * (Math.PI * 2 - .04);
    render(a); setCaption(a, false);
  });
  const goBack = () => { clearTimeout(back); back = window.setTimeout(() => animateTo(todayAngle, 700, () => setCaption(todayAngle, true)), 350); };
  canvas.addEventListener('pointerleave', goBack);
  canvas.addEventListener('pointerup', goBack);
  rise();
  return rise;
}
