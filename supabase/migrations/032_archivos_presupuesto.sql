-- 032 · Los archivos originales de un presupuesto.
--
-- Hasta ahora, el Excel o el PDF que se subía se leía, se traducía a FOREMAN y
-- se descartaba. Eso deja sin respaldo justo lo que probaría qué se cotizó:
-- la proforma del proveedor, el presupuesto que mandó el cliente, la hoja de
-- cálculo con la que se armó todo.
--
-- Ahora cada archivo que entra queda guardado en el depósito privado y anotado
-- acá. "soltado_at" es para después: un archivo de un proyecto viejo, ya
-- copiado al respaldo de Dropbox, se puede soltar del depósito para no llenarlo
-- sin perder el registro de que existió y dónde está.

create table if not exists public.presupuesto_archivos (
  id                bigserial   primary key,
  presupuesto_id    bigint      not null references public.presupuestos(id) on delete cascade,
  tipo              text        not null default 'presupuesto',   -- presupuesto | cotizacion | otro
  nombre            text        not null,
  ruta              text        not null,
  bytes             bigint,
  subido_por        bigint,
  subido_por_nombre text,
  soltado_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists presupuesto_archivos_presupuesto on public.presupuesto_archivos (presupuesto_id, created_at desc);

alter table public.presupuesto_archivos enable row level security;
drop policy if exists "equipo foreman" on public.presupuesto_archivos;
create policy "equipo foreman" on public.presupuesto_archivos for all to authenticated using (true) with check (true);
