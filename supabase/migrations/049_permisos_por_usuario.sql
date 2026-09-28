-- 049 · Permisos de una persona, no solo de su rol.
--
-- El rol alcanza para el caso general —un residente ve lo que ve un residente—
-- pero no para la oficina de verdad: a Camila hay que dejarla ver presupuestos
-- aunque sea arquitecta, y a un residente darle una obra y no las otras. Hasta
-- hoy eso obligaba a cambiarle el rol, y con el rol se le cambiaba todo lo
-- demás de golpe.
--
-- Acá va la excepción: una fila por persona y permiso. Lo que no esté acá lo
-- sigue decidiendo el rol, así que sumar una persona nueva no obliga a marcar
-- veinte casillas.

create table if not exists public.usuario_permisos (
  usuario_id bigint  not null,
  permiso    text    not null,
  activo     boolean not null,
  primary key (usuario_id, permiso)
);

alter table public.usuario_permisos enable row level security;
drop policy if exists "equipo foreman" on public.usuario_permisos;
create policy "equipo foreman" on public.usuario_permisos
  for all to authenticated using (true) with check (true);
