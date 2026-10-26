-- Ejecutar después de 03_propinas.sql.
-- La app carga logos y portadas en brand-assets/brand/ con la anon key.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists tc_brand_select on storage.objects;
drop policy if exists tc_brand_insert on storage.objects;
drop policy if exists tc_brand_update on storage.objects;
drop policy if exists tc_brand_delete on storage.objects;

create policy tc_brand_select on storage.objects
for select to anon
using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'brand'
       and public.app_can_access_section('brand'));

create policy tc_brand_insert on storage.objects
for insert to anon
with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'brand'
            and public.app_can_access_section('brand'));

create policy tc_brand_update on storage.objects
for update to anon
using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'brand'
       and public.app_can_access_section('brand'))
with check (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'brand'
            and public.app_can_access_section('brand'));

create policy tc_brand_delete on storage.objects
for delete to anon
using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'brand'
       and public.app_is_boss());

do $$
declare table_name text;
begin
  foreach table_name in array array['service_requests', 'table_sessions', 'session_items', 'chat_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

commit;
