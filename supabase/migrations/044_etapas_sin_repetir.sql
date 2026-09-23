-- 044 · Un hito, una sola vez por proyecto.
--
-- Las etapas de un tubo en orden se ponen solas al abrir el proyecto. Si dos
-- llamadas corrían a la vez —abrir y cerrar rápido, o la app en dos pestañas—
-- las dos leían "faltan" y las dos insertaban, y el proyecto quedaba con dos
-- "Obra gris". La app ya no lo hace; esto lo vuelve imposible, que es distinto.
--
-- Primero se van las repetidas que nunca se usaron: se conserva la que tiene
-- actividades, y si ninguna tiene, la más vieja.

with ordenadas as (
  select e.id, e.lead_id, e.etapa_id,
         row_number() over (
           partition by e.lead_id, e.etapa_id
           order by (select count(*) from public.lead_etapa_items i where i.lead_etapa_id = e.id) desc, e.id
         ) as puesto
  from public.lead_etapas e
)
delete from public.lead_etapas
where id in (select id from ordenadas where puesto > 1)
  and not exists (select 1 from public.lead_etapa_items i where i.lead_etapa_id = lead_etapas.id);

create unique index if not exists lead_etapas_una_por_proyecto
  on public.lead_etapas (lead_id, etapa_id);
