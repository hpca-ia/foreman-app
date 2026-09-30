-- 062 · Observaciones de obra.
--
-- Lo que se ve en la recorrida y hay que arreglar: el enchufe que quedó
-- torcido, la junta mal tomada, el vidrio rayado. Hoy eso se dice en la
-- reunión, alguien lo anota en un cuaderno y la mitad se olvida; la otra mitad
-- reaparece en la entrega, cuando corregirla cuesta el triple.
--
-- Tres cosas que este esquema toma en serio:
--
--  · UNA OBSERVACIÓN SE CIERRA CON UNA FOTO, no con la palabra de alguien. Por
--    eso las fotos tienen momento: la del problema y la de cómo quedó. "Ya lo
--    arreglé" sin foto es una promesa; con foto es un hecho verificable.
--
--  · DOS FECHAS QUE NO SON LA MISMA. Cuándo se vio —que es un dato duro, el
--    día de la recorrida— y para cuándo se comprometió a arreglarlo. Guardar
--    solo la segunda pierde la antigüedad, que es justo lo que se discute:
--    "esto lo vengo diciendo hace dos meses".
--
--  · NO ES EL LIBRO DE OBRA. El libro cuenta qué pasó cada día y se cierra;
--    una observación vive hasta que se resuelve, aunque pasen seis semanas.
--    Meterlas en el libro las enterraría en el día que se anotaron.
--
-- `visible_cliente` decide cuáles ve el cliente. Por defecto no: la recorrida
-- interna es interna, y se elige qué se comparte.

create table if not exists public.obra_observaciones (
  id            bigserial primary key,
  lead_id       bigint not null references public.leads(id) on delete cascade,
  obra_id       bigint,
  titulo        text not null,
  detalle       text,
  ubicacion     text,                    -- "Planta baja, eje 3", "Depto 402"
  estado        text not null default 'abierta',
    -- abierta | en_proceso | resuelta | verificada | anulada
  prioridad     text not null default 'media',   -- urgente | alta | media | baja
  origen        text not null default 'recorrida',  -- recorrida | dia_a_dia | cliente
  -- Cuándo se vio. No es created_at por si hay que cargarla al día siguiente:
  -- la antigüedad de una observación es lo que se discute.
  fecha_visto   date not null default current_date,
  -- Para cuándo se comprometió a arreglarla.
  fecha_limite  date,
  responsable_id      bigint,
  responsable_nombre  text,
  responsable_externo text,              -- el contratista, que no entra a FOREMAN
  resuelta_at    timestamptz,
  resuelta_por   bigint,
  resuelta_nombre text,
  verificada_at  timestamptz,
  verificada_por bigint,
  verificada_nombre text,
  cierre_nota    text,
  visible_cliente boolean not null default false,
  created_by     bigint,
  created_nombre text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists obs_por_proyecto on public.obra_observaciones (lead_id, estado);
create index if not exists obs_por_obra     on public.obra_observaciones (obra_id, estado);

-- Las fotos, con su momento: el problema y cómo quedó.
create table if not exists public.observacion_fotos (
  id             bigserial primary key,
  observacion_id bigint not null references public.obra_observaciones(id) on delete cascade,
  momento        text not null default 'problema',   -- problema | solucion
  storage_path   text not null,
  descripcion    text,
  autor_id       bigint,
  autor_nombre   text,
  created_at     timestamptz not null default now()
);
create index if not exists obs_fotos on public.observacion_fotos (observacion_id, momento);

-- Lo que se conversa sobre una observación, sin perderlo en WhatsApp.
create table if not exists public.observacion_notas (
  id             bigserial primary key,
  observacion_id bigint not null references public.obra_observaciones(id) on delete cascade,
  texto          text not null,
  autor_id       bigint,
  autor_nombre   text,
  -- Una nota del cliente se ve distinto de una nuestra: no es lo mismo que lo
  -- diga el fiscalizador a que lo diga el residente.
  de_cliente     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists obs_notas on public.observacion_notas (observacion_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['obra_observaciones','observacion_fotos','observacion_notas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
