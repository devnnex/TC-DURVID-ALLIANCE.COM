-- Ejecutar en SQL Editor de un proyecto Supabase NUEVO, como rol postgres.
-- La lógica original usa pgcrypto para PIN y realtime.send para avisos.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    raise exception 'Falta realtime.send. Habilita Realtime en este proyecto Supabase.';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Falta la publicación supabase_realtime.';
  end if;
end $$;
