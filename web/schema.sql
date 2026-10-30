-- Dulce Rumbo: puntajes y registro (nombre y correo) en Supabase
-- Aplicado en el proyecto ancokatjcscxdixzgult el 30 de octubre de 2026 (migraciones dulce_rumbo_scores y dulce_rumbo_scores_column_privileges)
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  score integer not null,
  candies integer not null default 0,
  max_combo integer not null default 0,
  stack text[] not null default '{}',
  reason text,
  device_id text
);
create index if not exists scores_score_idx on public.scores (score desc, created_at asc);

alter table public.scores enable row level security;

-- Permisos por columna: el cliente puede insertar y leer todo menos el correo.
revoke all on public.scores from anon, authenticated;
grant insert on public.scores to anon, authenticated;
grant select (id, created_at, name, score, candies, max_combo, stack, device_id) on public.scores to anon, authenticated;

drop policy if exists "scores_read" on public.scores;
create policy "scores_read" on public.scores for select to anon, authenticated using (true);

drop policy if exists "scores_insert" on public.scores;
create policy "scores_insert" on public.scores for insert to anon, authenticated
  with check (
    char_length(btrim(name)) between 1 and 20
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
    and char_length(email) <= 120
    and score between 0 and 5000
    and candies between 0 and 500
    and max_combo between 0 and 500
    and coalesce(array_length(stack, 1), 0) <= 3
    and coalesce(char_length(reason), 0) <= 20
    and coalesce(char_length(device_id), 0) <= 64
  );
-- Sin políticas de update ni delete: nadie altera ni borra filas desde el cliente.

-- Vista del ranking sin el correo (corre con los permisos de quien consulta)
create or replace view public.scores_public with (security_invoker = true) as
  select id, created_at, name, score, candies, max_combo, stack, device_id
  from public.scores;
grant select on public.scores_public to anon, authenticated;

-- Los correos se consultan desde el panel de Supabase o con la clave de servicio:
--   select name, email, max(score) as mejor from public.scores group by name, email order by mejor desc;
