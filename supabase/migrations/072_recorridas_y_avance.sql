-- 072 · La recorrida como lo que es: un día, una vuelta, una lista.
--
-- Hoy una observación cuelga del proyecto y tiene una fecha suelta. Pero en la
-- obra nadie anota observaciones sueltas: se camina la obra un martes, con el
-- cliente o sin él, y de esa vuelta salen once. Esas once son una cosa —se
-- discuten juntas, se mandan juntas, se cierran juntas— y el sistema no tenía
-- dónde ponerlas.
--
-- Sin la recorrida, "¿qué salió de la visita del 12?" se contesta filtrando
-- por fecha y confiando en que nadie cargó otra cosa ese día. Y "mandale al
-- cliente lo de la visita" no se puede contestar: no hay un "lo de la visita".
--
-- EL TIPO IMPORTA Y NO ES DECORACIÓN. Una recorrida interna es interna: ahí se
-- dicen cosas —"esto lo hizo mal el albañil nuevo"— que no se le muestran al
-- cliente. Una recorrida con el cliente es un acta: lo que se anotó, lo vio
-- él. Mezclarlas es cómo una nota interna termina en el correo del cliente, y
-- de eso no se vuelve.
--
-- Por eso `visible_cliente` de cada observación arranca del tipo de su
-- recorrida en vez de ser una casilla que alguien se acuerda de marcar.

create table if not exists public.obra_recorridas (
  id             bigserial primary key,
  lead_id        bigint not null references public.leads(id) on delete cascade,
  obra_id        bigint,
  fecha          date not null default current_date,
  tipo           text not null default 'interna',   -- interna | cliente
  nota           text,
  participantes  text,                              -- quiénes caminaron la obra
  cerrada_at     timestamptz,                       -- ya no se le agregan más
  created_by     bigint,
  created_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists recorridas_por_proyecto on public.obra_recorridas (lead_id, fecha);

alter table public.obra_observaciones add column if not exists recorrida_id bigint;
create index if not exists obs_por_recorrida on public.obra_observaciones (recorrida_id);

-- Lo que ya está anotado también salió de alguna vuelta: una recorrida por
-- cada día en que se cargó algo en cada proyecto. No es una invención, es lo
-- que pasó —se caminó la obra ese día—, y sin esto todas las observaciones
-- viejas quedarían fuera de la única vista que va a tener el módulo.
insert into public.obra_recorridas (lead_id, obra_id, fecha, tipo, nota)
select o.lead_id, min(o.obra_id), o.fecha_visto,
       case when bool_or(o.origen = 'cliente') then 'cliente' else 'interna' end,
       'Recorrida reconstruida de las observaciones de ese día'
  from public.obra_observaciones o
 where o.recorrida_id is null
 group by o.lead_id, o.fecha_visto;

update public.obra_observaciones o
   set recorrida_id = r.id
  from public.obra_recorridas r
 where o.recorrida_id is null
   and r.lead_id = o.lead_id
   and r.fecha = o.fecha_visto;

-- ── Lo que el cliente dice de una observación ────────────────────────────
--
-- Que la vea no alcanza: lo que cierra una observación de una recorrida con el
-- cliente es que él diga que quedó bien. Hoy eso pasa por teléfono y no queda
-- en ningún lado, así que seis meses después "yo nunca aprobé eso" no se puede
-- contestar.
alter table public.obra_observaciones add column if not exists cliente_visto_at  timestamptz;
alter table public.obra_observaciones add column if not exists cliente_conforme  boolean;
alter table public.obra_observaciones add column if not exists cliente_nota      text;

-- ── Las fotos de avance ──────────────────────────────────────────────────
--
-- No son observaciones: una observación es algo que está mal y hay que
-- arreglar. Esto es lo contrario —cómo va la obra— y el cliente lo pide todas
-- las semanas. Hoy se manda por WhatsApp y se pierde; acá queda con su fecha,
-- en orden, y arma solo el historial del avance.
create table if not exists public.obra_avance_fotos (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  obra_id         bigint,
  fecha           date not null default current_date,
  titulo          text,
  descripcion     text,
  storage_path    text not null,
  visible_cliente boolean not null default true,
  subido_por      bigint,
  subido_nombre   text,
  created_at      timestamptz not null default now()
);
create index if not exists avance_por_proyecto on public.obra_avance_fotos (lead_id, fecha);

do $$
declare t text;
begin
  foreach t in array array['obra_recorridas','obra_avance_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
