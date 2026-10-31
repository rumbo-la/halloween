// Genera web/index.html (versión alojable con Supabase) a partir de dulce-rumbo.html (versión claude.ai).
// Uso: node build-web.mjs [SUPABASE_URL] [SUPABASE_ANON_KEY]
import fs from "node:fs";
const [,, URL_ARG, KEY_ARG, SITE_ARG] = process.argv;
const SITE = (SITE_ARG || "https://halloween.rumbo.la").replace(/\/$/, "");
let html = fs.readFileSync("dulce-rumbo.html", "utf8");

// El núcleo del juego (game-core.js) se copia tal cual dentro del HTML (sin "export") para que
// el navegador y la Edge Function game-finish simulen exactamente lo mismo.
{
  const core = fs.readFileSync("game-core.js", "utf8").replace(/^export /gm, "");
  const m1 = "/* ---------- núcleo del juego (copiado de game-core.js por build-web.mjs, no editar aquí) ---------- */\n";
  const m2 = "/* ---------- fin del núcleo ---------- */";
  const i1 = html.indexOf(m1), i2 = html.indexOf(m2);
  if (i1 < 0 || i2 < 0) throw new Error("No encuentro los marcadores del núcleo en dulce-rumbo.html");
  html = html.slice(0, i1 + m1.length) + core + html.slice(i2);
  fs.writeFileSync("dulce-rumbo.html", html);
  for (const fn of ["game-start", "game-finish"]) fs.copyFileSync("game-core.js", `supabase/functions/${fn}/game-core.js`);
}

const start = html.indexOf("/* ---------- ranking compartido (db) ---------- */");
const end = html.indexOf("/* ---------- panel del ranking ---------- */");
if (start < 0 || end < 0) throw new Error("No encuentro el bloque del ranking");

const SUPA = `/* ---------- ranking compartido (Supabase) ---------- */
const SUPABASE_URL = "${URL_ARG || "__SUPABASE_URL__"}";
const SUPABASE_ANON_KEY = "${KEY_ARG || "__SUPABASE_ANON_KEY__"}";
const FN_URL = SUPABASE_URL + "/functions/v1/";
const dbState = {db: undefined, uid: null, canWrite: null, resolved: false, rows: []};
// Identificador anónimo por dispositivo, solo para resaltar tus filas en el ranking.
dbState.uid = store.get("dr_device") || (() => {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  store.set("dr_device", id); return id;
})();
const boardList = $("boardList"), boardEmpty = $("boardEmpty"), boardStatus = $("boardStatus");

function renderBoard() {
  const rows = dbState.rows;
  boardList.replaceChildren();
  boardEmpty.hidden = rows.length > 0;
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    if (dbState.uid && r.uid === dbState.uid) li.classList.add("me");
    const pos = document.createElement("span"); pos.className = "pos"; pos.textContent = i + 1;
    const who = document.createElement("div"); who.className = "who";
    const name = document.createElement("span"); name.className = "name"; name.textContent = (r.name || "Anónimo") + (dbState.uid && r.uid === dbState.uid ? " (tú)" : "");
    const meta = document.createElement("span"); meta.className = "meta";
    const stack = Array.isArray(r.stack) ? r.stack.slice(0, 3).map(v => String(v).slice(0, 12)).join(", ") : "";
    meta.textContent = \`\${r.candies ?? 0} caramelos | combo \${r.maxCombo ?? 0}\${stack ? " | " + stack : ""}\${r.at ? " | " + fmtTime(r.at) : ""}\`;
    who.append(name, meta);
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.score ?? 0;
    li.append(pos, who, pts); boardList.append(li);
  });
}
function fmtTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return "";
  return d.toLocaleTimeString("es-PE", {hour: "2-digit", minute: "2-digit"});
}
function cleanName(v) { return (v || "").replace(/\\s+/g, " ").trim().slice(0, 20); }

let sb = null;
async function callFn(name, body) {
  const r = await fetch(FN_URL + name, {method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY}, body: JSON.stringify(body)});
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) { const err = new Error((data && data.error) || ("HTTP " + r.status)); err.code = data && data.error; err.status = r.status; throw err; }
  return data;
}
// La partida la emite el servidor: la semilla y el ancho quedan registrados para verificarla al terminar.
async function beginSession(w) {
  if (!sb) return null;
  const d = await callFn("game-start", {w, device_id: dbState.uid});
  return {gameId: d.game_id, seed: d.seed, W: d.w, offline: false};
}
async function loadBoard() {
  if (!sb) return;
  const {data, error} = await sb.from("scores_public")
    .select("name,score,candies,max_combo,stack,created_at,device_id")
    .order("score", {ascending: false}).order("created_at", {ascending: true}).limit(20);
  if (error) { boardStatus.textContent = "Sin conexión"; boardStatus.classList.remove("live"); return; }
  dbState.rows = data.map(r => ({name: r.name, score: r.score, candies: r.candies, maxCombo: r.max_combo, stack: r.stack, at: r.created_at, uid: r.device_id}));
  renderBoard();
  boardStatus.textContent = "En vivo"; boardStatus.classList.add("live");
}
(() => {
  if (!window.supabase || SUPABASE_URL.startsWith("__")) {
    dbState.db = null; dbState.resolved = true; boardStatus.textContent = "Sin configurar";
    $("writeHint").textContent = "Falta configurar Supabase en este archivo."; return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  dbState.db = sb; dbState.resolved = true; dbState.canWrite = true;
  loadBoard();
  setInterval(() => { if (!document.hidden) loadBoard(); }, 10000); // la tabla no es legible por el cliente (protege el correo), así que se sondea la vista
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadBoard(); });
})();

$("endForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!sb) { note("El ranking compartido no está disponible.", "err"); return; }
  if (!session || !session.gameId) { note("Esta partida se jugó sin conexión con el ranking y no se puede registrar. Juega otra vez.", "err"); return; }
  const name = cleanName(saveName.value);
  if (!name) { note("Escribe un nombre para aparecer en el ranking.", "err"); saveName.focus(); return; }
  store.set("dr_name", name); nameInput.value = name;
  const btn = $("saveBtn"); btn.disabled = true; btn.textContent = "Verificando…";
  let res;
  try {
    // El servidor vuelve a jugar la partida con la semilla y los movimientos: el puntaje que cuenta es el que calcula él.
    res = await callFn("game-finish", {game_id: session.gameId, name, email: playerEmail(), inputs: encodeRLE(replay)});
  } catch (err) {
    btn.disabled = false; btn.textContent = "Guardar puntaje";
    const c = err.code || "";
    if (c === "game_not_found" || c === "already_used" || c === "expired") note("Esta partida ya fue registrada o venció. Juega otra vez.", "err");
    else if (c === "replay_invalid" || c === "not_finished" || c === "too_fast") note("No pudimos verificar la partida. Juega otra vez.", "err");
    else if (c === "rate_limited") note("Demasiadas partidas seguidas. Espera unos minutos.", "err");
    else note("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", "err");
    return;
  }
  session.gameId = null; // una partida emitida se registra una sola vez
  if (res.score !== state.score) $("endScore").textContent = res.score;
  btn.textContent = "Guardado"; $("saveField").hidden = true; btn.hidden = true;
  await loadBoard();
  if (!res.saved) note(\`Tu mejor puntaje sigue siendo \${res.best}. El ranking muestra solo tu mejor marca por correo.\`, "ok");
  else {
    const place = dbState.rows.findIndex(r => r.uid === dbState.uid && r.score === res.score) + 1;
    note(place ? \`¡Guardado y verificado! Vas en el puesto \${place} del ranking.\` : "¡Guardado y verificado! Sigue jugando para entrar al top 20.", "ok");
  }
  setTimeout(openDrawer, 400);
});

`;
html = html.slice(0, start) + SUPA + html.slice(end);

// Esqueleto de documento completo + supabase-js desde CDN (UMD, global "supabase")
const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Dulce Rumbo: el juego de Halloween de Rumbo. Atrapa los caramelos de tu stack y registra tu puntaje.">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#382EDC">
<meta property="og:site_name" content="Rumbo">
<meta property="og:title" content="Dulce Rumbo, el juego de Halloween de Rumbo">
<meta property="og:description" content="Que tu noche tome el rumbo más dulce. Guía al fantasma, atrapa los caramelos de tu stack y registra tu puntaje en el ranking.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og-image.jpg">
<meta property="og:image:secure_url" content="${SITE}/og-image.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1080">
<meta property="og:image:alt" content="Fantasma de Rumbo con caramelos y calabazas. Que tu noche tome el rumbo más dulce.">
<meta property="og:locale" content="es_PE">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Dulce Rumbo, el juego de Halloween de Rumbo">
<meta name="twitter:description" content="Que tu noche tome el rumbo más dulce. Atrapa los caramelos de tu stack y registra tu puntaje.">
<meta name="twitter:image" content="${SITE}/og-image.jpg">
<link rel="canonical" href="${SITE}/">
<style>html{color-scheme:dark}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"></script>
</head>
<body>
`;
html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "");
fs.writeFileSync("web/index.html", head + html + "\n</body>\n</html>\n");
// Los MP3 viven solo en web/ (la versión claude.ai se publica con los archivos de web/)
console.log("web/index.html generado", URL_ARG ? "con claves" : "con marcadores __SUPABASE_URL__ / __SUPABASE_ANON_KEY__");
