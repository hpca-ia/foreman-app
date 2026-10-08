-- 090 · El período del plan es una cosa, no un rango que se adivina.
--
-- La 089 guarda días sueltos y el histórico reconstruía la semana agrupando
-- por lunes. Eso funciona mientras la semana sea de lunes a sábado, y en obra
-- no lo es: se planifica de miércoles a martes, de lunes a domingo, de lunes a
-- lunes. Un plan de miércoles a martes cruza DOS lunes, así que se guardaba
-- partido en dos semanas y al volver a él traía la mitad. De ahí venía "el
-- plan no se puede regresar y editar": sí se podía, pero traía un pedazo.
--
-- Entonces el período se guarda: desde, hasta, y lo que es del plan entero y
-- no de un día.
--
-- OBSERVACIONES Y ADJUNTOS CUELGAN DE ACÁ, no del día. Un plano, la foto de
-- una consulta, el detalle que hay que mirar para ejecutar la semana: eso no
-- es del martes, es del plan. Y es la mitad que falta para que el plan sirva
-- como informe —hoy el que lo recibe tiene que pedir el plano por aparte, y el
-- plano que llega por aparte es el que después nadie encuentra.

create table if not exists public.obra_plan_periodos (
  id             bigserial primary key,
  lead_id        bigint not null references public.leads(id) on delete cascade,
  desde          date not null,
  hasta          date not null,
  -- Lo que no entra en ninguna casilla. Va al pie del informe, del PDF y del
  -- correo: consultas abiertas, lo que se acordó en obra, lo que hay que
  -- resolver antes del lunes.
  observaciones  text,
  created_by     bigint,
  created_nombre text,
  created_at     timestamptz not null default now(),
  -- Un plan por proyecto y por fecha de inicio. Dos planes que arrancan el
  -- mismo día serían dos versiones de la misma semana.
  unique (lead_id, desde)
);
create index if not exists plan_periodos_obra on public.obra_plan_periodos (lead_id, desde desc);

-- El día sabe de qué plan es. Nulo en lo que ya estaba escrito: el histórico
-- agrupa por lunes lo que no tiene período, y así lo viejo se sigue viendo.
alter table public.obra_plan_dias add column if not exists periodo_id bigint
  references public.obra_plan_periodos(id) on delete set null;
create index if not exists plan_dias_periodo on public.obra_plan_dias (periodo_id);

-- Planos, fotos, PDFs. El archivo va al depósito privado y acá queda su ruta,
-- igual que las fotos del libro.
create table if not exists public.obra_plan_archivos (
  id             bigserial primary key,
  periodo_id     bigint not null references public.obra_plan_periodos(id) on delete cascade,
  storage_path   text not null,
  nombre         text not null,
  tipo           text,            -- el mime, para saber si se puede dibujar
  tamano         bigint,
  descripcion    text,            -- "planta de cielo raso rev. C"
  subido_por     bigint,
  subido_nombre  text,
  created_at     timestamptz not null default now()
);
create index if not exists plan_archivos_periodo on public.obra_plan_archivos (periodo_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['obra_plan_periodos','obra_plan_archivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
