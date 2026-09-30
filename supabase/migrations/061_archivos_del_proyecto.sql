-- 061 · Los archivos del proyecto.
--
-- Los planos, los CAD, los PDF del cliente, las fotos del terreno. Hoy están
-- repartidos entre Dropbox, el correo y el WhatsApp de quien los recibió, y
-- cuando alguien pregunta "¿cuál es la última versión de la planta?" la
-- respuesta honesta es "fijate en el correo".
--
-- FOREMAN ya guarda archivos —facturas, fotos del libro, respaldos de
-- gastos— pero todos cuelgan de otra cosa: de una factura, de un día de obra,
-- de una solicitud. Faltaba el cajón del proyecto, donde va lo que no es de
-- ningún trámite en particular y sin embargo todo el mundo necesita.
--
-- Cuelga del proyecto y no de la obra a propósito: los planos existen desde
-- mucho antes de que haya obra, y el día que la hay tienen que seguir siendo
-- los mismos.

create table if not exists public.proyecto_archivos (
  id           bigserial primary key,
  lead_id      bigint not null references public.leads(id) on delete cascade,
  storage_path text not null,
  nombre       text not null,
  -- La carpeta es texto libre y no una tabla: la oficina las inventa sobre la
  -- marcha —"Planos aprobados", "Municipio", "Fotos del terreno"— y obligarla
  -- a crear la carpeta antes de subir el archivo termina con todo en la raíz.
  carpeta      text,
  descripcion  text,
  tipo         text,                  -- cad | pdf | imagen | hoja | otro
  tamano       bigint,
  subido_por   bigint,
  subido_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists proyecto_archivos_lead on public.proyecto_archivos (lead_id, created_at desc);
create index if not exists proyecto_archivos_carpeta on public.proyecto_archivos (lead_id, carpeta);

alter table public.proyecto_archivos enable row level security;
drop policy if exists "equipo foreman" on public.proyecto_archivos;
create policy "equipo foreman" on public.proyecto_archivos for all to authenticated using (true) with check (true);
