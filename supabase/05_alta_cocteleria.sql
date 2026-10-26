-- Ejecutar SOLO en el Supabase de Jespresso Olivia Coctelería.
-- Sustituir CAMBIAR_PIN por un PIN numérico privado de 6 a 12 dígitos.
set search_path to public, extensions;
do $$
declare initial_pin text := 'CAMBIAR_PIN';
begin
  if initial_pin !~ '^[0-9]{6,12}$' then
    raise exception 'Edita initial_pin: debe tener de 6 a 12 dígitos.';
  end if;
  insert into public.business_settings (business_name, subtitle, accent_color, currency)
  values ('Jespresso Olivia Coctelería', 'Coctelería', '#c99a50', 'COP')
  on conflict (is_primary) do nothing;
  insert into public.app_users (full_name, username, pin_hash, role, permissions)
  values ('Jefe principal', 'jefe', crypt(initial_pin, gen_salt('bf', 10)), 'boss', '[]'::jsonb)
  on conflict (username) do nothing;
end $$;
