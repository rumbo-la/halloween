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

-- ---------------------------------------------------------------------------
-- Un solo puntaje por jugador (correo): se conserva el mejor.
-- Los intentos superados pasan a scores_history (sin acceso desde el cliente).
-- ---------------------------------------------------------------------------
create table if not exists public.scores_history (
  id bigint,
  created_at timestamptz,
  name text,
  email text,
  score integer,
  candies integer,
  max_combo integer,
  stack text[],
  reason text,
  device_id text,
  archived_at timestamptz not null default now()
);
alter table public.scores_history enable row level security;
revoke all on public.scores_history from anon, authenticated;

create or replace function public.scores_keep_best()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := lower(trim(new.email));
  best integer;
begin
  select max(score) into best from public.scores where lower(trim(email)) = k;
  if best is not null and best >= new.score then
    return null; -- ya existe un puntaje igual o mayor: no se registra
  end if;
  with moved as (
    delete from public.scores where lower(trim(email)) = k returning *
  )
  insert into public.scores_history (id, created_at, name, email, score, candies, max_combo, stack, reason, device_id)
  select id, created_at, name, email, score, candies, max_combo, stack, reason, device_id from moved;
  return new;
end
$$;
revoke execute on function public.scores_keep_best() from public, anon, authenticated;

drop trigger if exists scores_keep_best on public.scores;
create trigger scores_keep_best before insert on public.scores
  for each row execute function public.scores_keep_best();

create index if not exists scores_email_key_idx on public.scores (lower(trim(email)));

-- Limpieza de duplicados existentes: queda el mejor puntaje por correo (ante empate, el más antiguo)
with ranked as (
  select id, row_number() over (partition by lower(trim(email)) order by score desc, created_at asc) as rn
  from public.scores
), moved as (
  delete from public.scores s using ranked r where s.id = r.id and r.rn > 1 returning s.*
)
insert into public.scores_history (id, created_at, name, email, score, candies, max_combo, stack, reason, device_id)
select id, created_at, name, email, score, candies, max_combo, stack, reason, device_id from moved;
