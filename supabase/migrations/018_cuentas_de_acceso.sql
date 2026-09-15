-- Cada usuario de FOREMAN con su cuenta de acceso en Supabase Auth.
--
-- El PIN se verifica ahora en el servidor, y si es correcto se abre una sesión
-- de Supabase Auth. Esta columna liga al usuario con esa cuenta; se llena sola
-- la primera vez que cada uno entra. Se puede correr en cualquier momento:
-- no cambia nada de lo que ya funciona.

alter table public.usuarios add column if not exists auth_user_id uuid unique;
