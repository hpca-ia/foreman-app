-- 046 · Un proyecto, una sola vez.
--
-- Hoy "proyecto" significa cuatro cosas: el del pipeline (`leads`), el de
-- Ajustes (`proyectos`), la obra (`obras`) y el nombre escrito a mano en una
-- caja chica. El mismo edificio existe varias veces y no se cruza: el
-- presupuesto de Plaza Lagos no aparece en su proyecto, la caja chica no sabe
-- de qué proyecto viene, y el filtro del tablero solo ve los de Ajustes.
--
-- El proyecto de verdad es el del pipeline: es el único que tiene etapas,
-- gestiones, bitácora, gente de afuera y accesos. Todo lo demás pasa a colgar
-- de él por id, no por nombre.
--
-- Esta migración NO borra ni cambia nada: solo abre la columna donde se guarda
-- ese vínculo. El empate se hace después, proyecto por proyecto, desde Ajustes
-- → Proyectos, confirmando cada par a mano. Un script adivinando por nombre
-- juntaría "Casa HC" con "Casa HC 2" y eso no se desarma.

alter table public.proyectos    add column if not exists lead_id bigint references public.leads(id) on delete set null;
alter table public.presupuestos add column if not exists lead_id bigint references public.leads(id) on delete set null;

-- Estas dos pueden no existir todavía en una instalación nueva.
do $$
begin
  if to_regclass('public.obras') is not null then
    alter table public.obras add column if not exists lead_id bigint references public.leads(id) on delete set null;
    create index if not exists obras_lead on public.obras (lead_id);
  end if;
  if to_regclass('public.cajas_chicas') is not null then
    alter table public.cajas_chicas add column if not exists lead_id bigint references public.leads(id) on delete set null;
    create index if not exists cajas_chicas_lead on public.cajas_chicas (lead_id);
  end if;
end $$;

create index if not exists proyectos_lead    on public.proyectos (lead_id);
create index if not exists presupuestos_lead on public.presupuestos (lead_id);

-- El camino de vuelta ya existía a medias: al "Pasar a obra", el lead guarda
-- `obra_id`. Con esto se cierra el círculo y se puede ir de cualquier lado a
-- cualquier lado sin comparar nombres.
update public.obras o
set lead_id = l.id
from public.leads l
where l.obra_id = o.id and o.lead_id is null;
