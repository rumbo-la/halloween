// Núcleo determinista de Dulce Rumbo.
// Lo ejecutan el navegador (inline en dulce-rumbo.html y web/index.html) y la Edge Function game-finish,
// que vuelve a simular la partida con la misma semilla y los mismos movimientos para calcular el puntaje real.
// Reglas: sin Math.random (solo g.rng), paso fijo TICK, nada de DOM ni de dibujo.
export const BASE_W = 400, H = 600, DURATION = 60, TICK = 1 / 60, MAX_LEVEL = 5, MAX_SCORE = 5000;
export const MIN_W = 260, MAX_W = 1400;
export const MAX_TICKS = Math.ceil(DURATION / TICK) + 2;
export const TECHS = [
  {n: "K8s", c: "#326CE5"}, {n: "Docker", c: "#2496ED"}, {n: "Java", c: "#E76F00"}, {n: "TS", c: "#3178C6"},
  {n: "Go", c: "#00ADD8"}, {n: "Quarkus", c: "#4695EB"}, {n: "Spring", c: "#6DB33F"}, {n: "AWS", c: "#FF9900"},
  {n: "GCP", c: "#4285F4"}, {n: "Azure", c: "#0078D4"}, {n: "Python", c: "#3776AB"}, {n: "React", c: "#1FB6D8"},
  {n: "Node", c: "#339933"}, {n: "Terraform", c: "#7B42BC"}, {n: "Kafka", c: "#6E5BE8"}, {n: "Rust", c: "#DEA584"}
];
export const GOLD_TECH = {n: "rumbo", c: "#FFB020", gold: true};
export const TECH_NAMES = TECHS.map(t => t.n).concat(GOLD_TECH.n);

// Generador pseudoaleatorio con semilla (mulberry32): misma semilla, misma partida.
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampW(w) {
  const n = Math.round(Number(w) || BASE_W);
  return Math.max(MIN_W, Math.min(MAX_W, n));
}
export function levelFor(elapsed) { return elapsed < 10 ? 0 : Math.min(MAX_LEVEL, 1 + Math.floor((elapsed - 10) / 10)); }
export function multFor(combo) { return Math.min(4, 1 + Math.floor(combo / 5)); }

export function createGame(seed, w) {
  const W = clampW(w);
  return {
    seed: seed | 0, W, rng: mulberry32(seed), tick: 0, t: 0, timeLeft: DURATION,
    score: 0, candies: 0, combo: 0, maxCombo: 0, lives: 3, stack: {}, level: 0,
    ghost: {x: W / 2, target: W / 2, w: 64, h: 78}, items: [],
    spawnIn: .6, invuln: 0, shake: 0, ended: false, endReason: ""
  };
}

function spawn(g) {
  const lvl = g.level, W = g.W, rnd = g.rng;
  const roll = rnd();
  const batP = .09 + lvl * .045, pumpP = .045, goldP = .06;
  let type = "candy";
  if (roll < batP) type = "bat"; else if (roll < batP + pumpP) type = "pumpkin"; else if (roll < batP + pumpP + goldP) type = "gold";
  const speed = (135 + lvl * 48) * (type === "bat" ? 1.15 : 1) * (0.85 + rnd() * .3);
  const rot0 = (rnd() - .5) * 0.5;
  const x = 44 + rnd() * (W - 88);
  const vx = type === "bat" ? (rnd() * 2 - 1) * 60 : 0;
  const vr = (rnd() * 2 - 1) * 2.5;
  const tech = type === "gold" ? GOLD_TECH : TECHS[Math.floor(rnd() * TECHS.length)];
  const phase = rnd() * 6;
  g.items.push({type, x, y: -30, vy: speed, vx, rot: rot0, rot0, vr, s: type === "pumpkin" ? 16 : type === "bat" ? 12 : 8, tech, phase});
}

function catchItem(g, it, ev) {
  if (it.type === "bat") {
    if (g.invuln > 0) return;
    g.lives--; g.invuln = 1.4; g.shake = .35; g.combo = 0;
    ev.push({type: "hit", x: it.x, y: it.y});
    if (g.lives <= 0) { g.ended = true; g.endReason = "bats"; ev.push({type: "end", reason: "bats"}); }
    return;
  }
  if (it.type === "pumpkin") {
    g.score += 25; g.lives = Math.min(3, g.lives + 1);
    ev.push({type: "pumpkin", x: it.x, y: it.y});
    return;
  }
  g.combo++; g.candies++; g.maxCombo = Math.max(g.maxCombo, g.combo);
  const pts = (it.type === "gold" ? 50 : 10) * multFor(g.combo);
  g.score += pts;
  g.stack[it.tech.n] = (g.stack[it.tech.n] || 0) + 1;
  ev.push({type: "catch", x: it.x, y: it.y, pts, tech: it.tech, gold: it.type === "gold", combo: g.combo});
}

// Entrada de un tick: px (posición del puntero en coordenadas del juego) o teclas.
export function encodeInput(inp, W) {
  if (inp.px != null && Number.isFinite(inp.px)) return Math.round(Math.max(0, Math.min(W, inp.px)) * 10) / 10;
  return inp.left ? -2 : inp.right ? -3 : -1;
}
export function decodeInput(v) {
  if (v >= 0) return {px: v, left: false, right: false};
  return {px: null, left: v === -2, right: v === -3};
}
export function validInputValue(v, W) {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (v === -1 || v === -2 || v === -3) return true;
  return v >= 0 && v <= W && Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
}
// Codificación por tramos: [valor, repeticiones, valor, repeticiones, ...]
export function encodeRLE(values) {
  const out = [];
  for (const v of values) {
    if (out.length && out[out.length - 2] === v) out[out.length - 1]++; else out.push(v, 1);
  }
  return out;
}
export function rleTicks(rle) { let n = 0; for (let i = 1; i < rle.length; i += 2) n += rle[i]; return n; }
export function validRLE(rle, W) {
  if (!Array.isArray(rle) || rle.length % 2 !== 0 || rle.length > 2 * MAX_TICKS) return false;
  for (let i = 0; i < rle.length; i += 2) {
    const n = rle[i + 1];
    if (!validInputValue(rle[i], W)) return false;
    if (!Number.isInteger(n) || n < 1 || n > MAX_TICKS) return false;
  }
  return rleTicks(rle) <= MAX_TICKS;
}

// Avanza un tick. Devuelve los eventos (para sonidos y partículas en el cliente).
export function stepGame(g, inp) {
  const ev = [];
  if (g.ended) return ev;
  const dt = TICK, W = g.W;
  g.tick++; g.t += dt;
  g.timeLeft -= dt;
  if (g.timeLeft <= 1e-9) { g.timeLeft = 0; g.ended = true; g.endReason = "time"; ev.push({type: "end", reason: "time"}); return ev; }
  const gh = g.ghost, speed = 420 * Math.max(1, W / BASE_W);
  if (inp.px != null) gh.target = inp.px;
  else if (inp.left) gh.target = gh.x - speed * dt;
  else if (inp.right) gh.target = gh.x + speed * dt;
  gh.target = Math.max(gh.w / 2, Math.min(W - gh.w / 2, gh.target));
  gh.x += (gh.target - gh.x) * Math.min(1, dt * 14);
  if (g.invuln > 0) g.invuln -= dt;
  if (g.shake > 0) g.shake -= dt;
  const lvl = levelFor(DURATION - g.timeLeft);
  if (lvl !== g.level) { g.level = lvl; ev.push({type: "level", lvl}); }
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) { spawn(g); g.spawnIn = (.95 - lvl * .11) * (0.7 + g.rng() * .6) / Math.max(1, W / BASE_W); }
  const gy = H - 40, top = gy - gh.h, left = gh.x - gh.w * 0.48, right = gh.x + gh.w * 0.48;
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i];
    it.y += it.vy * dt; it.x += it.vx * dt;
    if (it.type === "candy" || it.type === "gold") it.rot = it.rot0 + Math.sin(g.t * 2.5 + it.phase) * 0.2; else it.rot += it.vr * dt;
    if (it.type === "bat") { it.x += Math.sin(g.t * 3 + it.phase) * 40 * dt; if (it.x < 15 || it.x > W - 15) it.vx *= -1; }
    const m = (it.type === "candy" || it.type === "gold") ? it.s * 1.6 : it.s * 0.4;
    const hit = it.x > left - m && it.x < right + m && it.y > top && it.y < gy + 6;
    if (hit) {
      catchItem(g, it, ev); g.items.splice(i, 1);
      if (g.ended) return ev;
      continue;
    }
    if (it.y > H + 30) {
      g.items.splice(i, 1);
      if (it.type === "candy" || it.type === "gold") {
        if (g.combo >= 5) ev.push({type: "miss", x: it.x});
        g.combo = 0;
      }
    }
  }
  return ev;
}

export function topStack(g) {
  return Object.entries(g.stack).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
}

// Simula una partida completa a partir de la semilla, el ancho y los movimientos codificados.
export function simulate(seed, w, rle) {
  const g = createGame(seed, w);
  let ticks = 0;
  for (let i = 0; i < rle.length && !g.ended; i += 2) {
    const inp = decodeInput(rle[i]);
    for (let n = 0; n < rle[i + 1] && !g.ended; n++) { stepGame(g, inp); ticks++; }
  }
  return {ended: g.ended, reason: g.endReason, ticks, score: Math.min(MAX_SCORE, g.score), candies: g.candies, maxCombo: g.maxCombo, stack: topStack(g)};
}
