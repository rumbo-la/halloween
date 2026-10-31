// Emite una partida: semilla y ancho quedan registrados en la tabla games para verificarla al terminar.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { clampW } from "./game-core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const w = clampW(body.w);
  const device = typeof body.device_id === "string" ? body.device_id.slice(0, 64) : null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Límite suave: 30 partidas iniciadas por dispositivo cada 10 minutos.
  if (device) {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await sb.from("games").select("id", { count: "exact", head: true }).eq("device_id", device).gte("started_at", since);
    if ((count ?? 0) >= 30) return json({ error: "rate_limited" }, 429);
  }
  const seed = new Int32Array(crypto.getRandomValues(new Uint32Array(1)).buffer)[0];
  const { data, error } = await sb.from("games").insert({ seed, w, device_id: device }).select("id, seed, w").single();
  if (error || !data) return json({ error: "db_error" }, 500);
  return json({ game_id: data.id, seed: data.seed, w: data.w });
});
