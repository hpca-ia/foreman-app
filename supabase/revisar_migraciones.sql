-- Qué migraciones están corridas en esta base.
--
-- Solo lee: no cambia nada. Se pega entera en el SQL Editor de Supabase y
-- devuelve una fila por migración, diciendo si está lista o si falta correrla.
-- Cada una se reconoce por lo que deja: una tabla, una columna o una política.

with migraciones(orden, migracion, ok) as (values
  (1,  '001 Control de obra',        to_regclass('public.obras') is not null and to_regclass('public.planillas') is not null
                                     and to_regclass('public.obra_rubros') is not null and to_regclass('public.obra_facturas') is not null
                                     and to_regclass('public.obra_factura_rubros') is not null),
  (2,  '002 Caja chica de obra',     exists (select 1 from information_schema.columns where table_schema='public' and table_name='cajas_gastos' and column_name='obra_factura_id')),
  (3,  '003 Facturas duplicadas',    exists (select 1 from information_schema.columns where table_schema='public' and table_name='obra_facturas' and column_name='archivo_hash')),
  (4,  '004 Actividades del rubro',  exists (select 1 from information_schema.columns where table_schema='public' and table_name='obra_rubros' and column_name='actividad')),
  (5,  '005 Permisos por rol',       to_regclass('public.permisos_rol') is not null
                                     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='obras' and column_name='gerente_id')),
  (6,  '006 Actividades y asignaciones', to_regclass('public.obra_actividades') is not null and to_regclass('public.obra_asignaciones') is not null),
  (7,  '007 Soltar tablas viejas',   to_regclass('public.control_obra_gastos') is null and to_regclass('public.control_obra_presupuesto') is null),
  (8,  '008 Leads',                  to_regclass('public.leads') is not null and to_regclass('public.lead_movimientos') is not null),
  (9,  '009 Equipo y proyectos',     to_regclass('public.usuarios') is not null and to_regclass('public.proyectos') is not null),
  (10, '010 Tareas privadas',        exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='privada')),
  (11, '011 Tareas con campos opcionales', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='due_date' and is_nullable='YES')),
  (12, '012 Ids grandes',            exists (select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='assignee_id' and data_type='bigint')),
  (13, '013 Presupuesto original de la obra', exists (select 1 from information_schema.columns where table_schema='public' and table_name='obras' and column_name='archivo_presupuesto_url')),
  (14, '014 Advertencias del presupuesto', exists (select 1 from information_schema.columns where table_schema='public' and table_name='obras' and column_name='advertencias')),
  (15, '015 Formatos de presupuesto', to_regclass('public.formatos_presupuesto') is not null),
  (16, '016 Origen de los precios',  to_regclass('public.proveedores') is not null
                                     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='precios_historial' and column_name='origen_tipo')),
  (17, '017 Utilidad y rubros distintos', to_regclass('public.rubros_distintos') is not null
                                     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='precios_historial' and column_name='utilidad_pct')),
  (18, '018 Cuentas de acceso',      exists (select 1 from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='auth_user_id')),
  (19, '019 Cerrar la base',         exists (select 1 from pg_policies where schemaname='public' and tablename='presupuestos' and policyname='equipo foreman')),
  (20, '020 Archivos privados',      exists (select 1 from storage.buckets where id='task-files' and public = false)
                                     and exists (select 1 from storage.buckets where id='publico' and public = true)),
  (21, '021 Pipeline',               to_regclass('public.pipeline_etapas') is not null and to_regclass('public.lead_etapas') is not null),
  (22, '022 Accesos del pipeline',   to_regclass('public.lead_accesos') is not null),
  (23, '023 Comentarios de tareas',  to_regclass('public.tarea_comentarios') is not null),
  (24, '024 Bitácora editable',      exists (select 1 from information_schema.columns where table_schema='public' and table_name='lead_movimientos' and column_name='automatico')),
  (25, '025 WhatsApp',               to_regclass('public.whatsapp_mensajes') is not null),
  (26, '026 Notas y exportación',    to_regclass('public.notas_presupuesto') is not null and to_regclass('public.ajustes_oficina') is not null
                                     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='exportacion')),
  (27, '027 Presupuesto a la base',  exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='en_base_at')
                                     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='precios_historial' and column_name='presupuesto_id')),
  (28, '028 Honorarios',             exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='honorarios')),
  (29, '029 Área en m2',             exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='area_m2')),
  (30, '030 Presupuestos pasados',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='archivado_at')),
  (31, '031 Repetidos separados',    exists (select 1 from information_schema.columns where table_schema='public' and table_name='presupuestos' and column_name='separados'))
)
select migracion, case when ok then 'lista' else 'FALTA CORRERLA' end as estado
from migraciones
order by orden;
