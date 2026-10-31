// Genera web/index.html (versión alojable con Supabase) a partir de dulce-rumbo.html (versión claude.ai).
// Uso: node build-web.mjs [SUPABASE_URL] [SUPABASE_ANON_KEY]
import fs from "node:fs";
const [,, URL_ARG, KEY_ARG, SITE_ARG] = process.argv;
const SITE = (SITE_ARG || "https://halloween.rumbo.la").replace(/\/$/, "");
let html = fs.readFileSync("dulce-rumbo.html", "utf8");

const start = html.indexOf("/* ---------- ranking compartido (db) ---------- */");
const end = html.indexOf("/* ---------- panel del ranking ---------- */");
if (start < 0 || end < 0) throw new Error("No encuentro el bloque del ranking");

const SUPA = `/* ---------- ranking compartido (Supabase) ---------- */
const SUPABASE_URL = "${URL_ARG || "__SUPABASE_URL__"}";
const SUPABASE_ANON_KEY = "${KEY_ARG || "__SUPABASE_ANON_KEY__"}";
const MAX_SCORE = 5000;
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
  const name = cleanName(saveName.value);
  if (!name) { note("Escribe un nombre para aparecer en el ranking.", "err"); saveName.focus(); return; }
  store.set("dr_name", name); nameInput.value = name;
  const btn = $("saveBtn"); btn.disabled = true; btn.textContent = "Guardando…";
  const row = {name, email: playerEmail(), score: Math.min(MAX_SCORE, state.score), candies: state.candies, max_combo: state.maxCombo, stack: state.topStack || [], reason: state.endReason, device_id: dbState.uid};
  const {error} = await sb.from("scores").insert(row);
  if (error) {
    btn.disabled = false; btn.textContent = "Guardar puntaje";
    if (error.code === "42501" || /row-level security/i.test(error.message)) note("El ranking rechazó este puntaje.", "err");
    else note("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", "err");
    return;
  }
  btn.textContent = "Guardado"; $("saveField").hidden = true; btn.hidden = true;
  await loadBoard();
  // El ranking conserva un solo puntaje por correo (el mejor); si el tuyo no subió, tu marca anterior sigue en pie.
  const mine = dbState.rows.find(r => r.uid === dbState.uid && r.score === Math.min(MAX_SCORE, state.score));
  const place = dbState.rows.findIndex(r => r === mine) + 1;
  if (mine) note(\`¡Guardado! Vas en el puesto \${place} del ranking.\`, "ok");
  else note("Guardado. El ranking conserva solo tu mejor puntaje por correo. Sigue jugando para entrar al top 20.", "ok");
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
