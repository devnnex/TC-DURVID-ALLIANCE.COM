-- Ejecutar tras el alta del negocio. Debe finalizar sin excepciones.
do $$
begin
  if not exists (select 1 from public.app_users where role = 'boss' and is_active) then
    raise exception 'Falta el usuario Jefe activo.';
  end if;
  if not exists (select 1 from public.business_settings where is_primary) then
    raise exception 'Falta la marca principal del negocio.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'brand-assets' and public) then
    raise exception 'Falta el bucket público brand-assets.';
  end if;
  if to_regprocedure('public.get_bootstrap_data(text,text)') is null
     or to_regprocedure('public.get_admin_snapshot(text)') is null
     or to_regprocedure('public.login(text,text)') is null
     or to_regprocedure('public.save_user(text,uuid,text,text,text,text,boolean,jsonb)') is null then
    raise exception 'Falta alguna función RPC esencial.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_tables'
      and policyname = 'staff_tables_insert'
  ) then
    raise exception 'Faltan las políticas de permisos por rol.';
  end if;
end $$;

select business_name, accent_color, tips_enabled, tip_percentage
from public.business_settings where is_primary;
select username, role, is_active from public.app_users order by username;
