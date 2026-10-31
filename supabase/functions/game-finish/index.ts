// Verifica una partida: vuelve a simularla con la semilla emitida y los movimientos enviados,
// calcula el puntaje real y lo registra. El cliente no puede insertar puntajes por su cuenta.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { simulate, validRLE, TICK } from "./game-core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 3 * 60 * 60 * 1000; // una partida emitida vence a las 3 horas
const TOLERANCE_MS = 2000;             // margen entre el tiempo real y el simulado

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const gameId = String(body.game_id ?? "");
  if (!UUID_RE.test(gameId)) return json({ error: "bad_game" }, 400);
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (!name) return json({ error: "bad_name" }, 400);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: game, error: gErr } = await sb.from("games")
    .select("id, seed, w, device_id, started_at, used_at").eq("id", gameId).maybeSingle();
  if (gErr) return json({ error: "db_error" }, 500);
  if (!game) return json({ error: "game_not_found" }, 404);
  if (game.used_at) return json({ error: "already_used" }, 409);
  const started = Date.parse(game.started_at), now = Date.now();
  if (now - started > MAX_AGE_MS) return json({ error: "expired" }, 410);

  const inputs = body.inputs;
  if (!validRLE(inputs, game.w)) return json({ error: "replay_invalid" }, 422);
  const sim = simulate(game.seed, game.w, inputs as number[]);
  if (!sim.ended) return json({ error: "not_finished" }, 422);
  if (now - started < sim.ticks * TICK * 1000 - TOLERANCE_MS) return json({ error: "too_fast" }, 422);

  const pattern = email.replace(/[\\%_]/g, (m) => "\\" + m);
  const { data: prev } = await sb.from("scores").select("score").ilike("email", pattern)
    .order("score", { ascending: false }).limit(1).maybeSingle();
  const best: number | null = prev ? prev.score : null;

  // El trigger scores_keep_best conserva una sola fila por correo y fija created_at.
  const { error: iErr } = await sb.from("scores").insert({
    name, email, score: sim.score, candies: sim.candies, max_combo: sim.maxCombo,
    stack: sim.stack, reason: sim.reason, device_id: game.device_id,
  });
  if (iErr) return json({ error: "db_error", detail: iErr.message }, 500);
  await sb.from("games").update({ used_at: new Date().toISOString(), score: sim.score }).eq("id", gameId);

  const saved = best == null || sim.score > best;
  return json({ ok: true, saved, score: sim.score, best: Math.max(best ?? 0, sim.score),
    candies: sim.candies, max_combo: sim.maxCombo, stack: sim.stack, reason: sim.reason, ticks: sim.ticks });
});
