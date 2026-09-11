-- Permisos por rol, editables desde Ajustes (solo el Director).
--
-- Antes los permisos estaban escritos en el código: cambiar qué podía hacer
-- un Gerente exigía tocar y desplegar la app. Ahora son datos.
--
-- El Director no se lee de esta tabla: siempre puede todo. Es a propósito —
-- si sus permisos fueran datos, un error de edición lo dejaría fuera de su
-- propia app sin manera de volver a entrar.

create table if not exists public.permisos_rol (
  rol     text    not null,          -- assistant | gerente | residente
  permiso text    not null,
  activo  boolean not null default false,
  primary key (rol, permiso)
);

-- Valores de arranque. Al abrir Ajustes por primera vez la app siembra los
-- que falten, así que agregar un permiso nuevo al catálogo no exige migrar.
insert into public.permisos_rol (rol, permiso, activo) values
  -- Admin: todo menos borrar definitivamente.
  ('assistant','tareas.ver',true),        ('assistant','tareas.todas',true),
  ('assistant','tareas.asignar',true),    ('assistant','presupuestos.ver',true),
  ('assistant','presupuestos.crear',true),('assistant','controlObra.ver',true),
  ('assistant','obras.todas',true),       ('assistant','obras.crear',true),
  ('assistant','facturas.registrar',true),('assistant','planillas.cerrar',true),
  ('assistant','cajaChica.ver',true),     ('assistant','cajaChica.todas',true),
  ('assistant','montos.ver',true),        ('assistant','gastos.anular',true),
  ('assistant','ajustes.ver',true),       ('assistant','borrar.definitivo',false),

  -- Gerente de Proyecto: manda en sus obras, no en la empresa.
  ('gerente','tareas.ver',true),          ('gerente','tareas.todas',true),
  ('gerente','tareas.asignar',true),      ('gerente','presupuestos.ver',false),
  ('gerente','presupuestos.crear',false), ('gerente','controlObra.ver',true),
  ('gerente','obras.todas',false),        ('gerente','obras.crear',false),
  ('gerente','facturas.registrar',true),  ('gerente','planillas.cerrar',true),
  ('gerente','cajaChica.ver',true),       ('gerente','cajaChica.todas',false),
  ('gerente','montos.ver',true),          ('gerente','gastos.anular',true),
  ('gerente','ajustes.ver',false),        ('gerente','borrar.definitivo',false),

  -- Residente: su caja chica y sus tareas. Nada de plata de la obra.
  ('residente','tareas.ver',true),        ('residente','tareas.todas',false),
  ('residente','tareas.asignar',false),   ('residente','presupuestos.ver',false),
  ('residente','presupuestos.crear',false),('residente','controlObra.ver',false),
  ('residente','obras.todas',false),      ('residente','obras.crear',false),
  ('residente','facturas.registrar',false),('residente','planillas.cerrar',false),
  ('residente','cajaChica.ver',true),     ('residente','cajaChica.todas',false),
  ('residente','montos.ver',false),       ('residente','gastos.anular',false),
  ('residente','ajustes.ver',false),      ('residente','borrar.definitivo',false)
on conflict (rol, permiso) do nothing;

-- A qué gerente pertenece la obra: sin esto, "ver solo mis obras" no tiene
-- de dónde saber cuáles son las suyas.
alter table public.obras add column if not exists gerente_id     bigint;
alter table public.obras add column if not exists gerente_nombre text;
