-- 089 · La semana que viene, escrita antes.
--
-- El Libro de Obra registra lo que PASÓ. Esto registra lo que VA A PASAR, y es
-- el mismo día visto desde el otro lado: la misma obra, la misma fecha, la
-- misma persona que lo llena, y casi las mismas categorías —personal,
-- materiales, actividades—.
--
-- Por eso no es un módulo aparte. Un módulo aparte competiría con el libro por
-- la atención del residente, y el día terminaría escrito dos veces en dos
-- lugares que nadie compara. Acá cuelga del mismo proyecto y de la misma
-- fecha, y la pantalla del día muestra las dos mitades juntas.
--
-- Y ESA COMPARACIÓN ES TODO EL VALOR. Un plan que nadie contrasta con lo que
-- pasó es una lista de buenas intenciones. Lo que se planificó y NO se hizo
-- —con su motivo— es el dato que un mes después explica un atraso, y el que
-- hoy no existe en ningún lado: se discute de memoria.
--
-- Las tareas se marcan hechas, y al marcarlas escriben solas la entrada en el
-- libro de ese día. El residente llena una vez lo que hoy llena dos veces, y
-- el libro queda escrito aunque nadie se siente a redactarlo.

create table if not exists public.obra_plan_dias (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  fecha           date   not null,
  -- Los campos que acompañan al día. Todos opcionales: un día normal no tiene
  -- permisos especiales ni horario distinto, y obligar a llenarlos haría que
  -- se llene cualquier cosa.
  horario         text,   -- "7h00 a 17h00, almuerzo 12h30"
  consideraciones text,   -- lo que hay que tener en cuenta ese día
  permisos        text,   -- trabajos en altura, caliente, espacios confinados
  personal        text,   -- quién entra: cuadrillas, subcontratos, visitas
  created_by      bigint,
  created_nombre  text,
  created_at      timestamptz not null default now(),
  -- Un plan por proyecto y por día, sostenido por la base: dos planes del
  -- mismo día serían dos versiones de lo que hay que hacer.
  unique (lead_id, fecha)
);
create index if not exists plan_dias_proyecto on public.obra_plan_dias (lead_id, fecha);

-- Lo que se va a hacer y lo que hay que tener ese día. Una sola tabla con un
-- tipo, porque se comportan igual: se escriben antes, se marcan cuando pasan,
-- y lo que no pasó necesita decir por qué.
create table if not exists public.obra_plan_items (
  id             bigserial primary key,
  plan_dia_id    bigint not null references public.obra_plan_dias(id) on delete cascade,
  tipo           text   not null default 'tarea',   -- tarea | material
  texto          text   not null,
  orden          int    not null default 0,
  -- De dónde salió. El cronograma ya sabe qué actividades caen esa semana, así
  -- que el plan no arranca en blanco; y una tarea que viene de una barra puede
  -- decir después cuánto se avanzó de ella.
  cronograma_actividad_id bigint,
  obra_actividad_id       bigint,
  -- Si el material ya tiene pedido de compra, se sigue por ahí en vez de
  -- escribir "pedir cemento" en dos sistemas.
  solicitud_id   bigint,
  hecha          boolean not null default false,
  hecha_at       timestamptz,
  hecha_por      bigint,
  hecha_nombre   text,
  -- POR QUÉ NO SE HIZO. Es el campo más importante de la tabla: una tarea sin
  -- marcar y sin motivo es un dato perdido, y es justo el que hace falta
  -- cuando hay que justificar una semana.
  motivo         text,
  -- La entrada del libro que se escribió al marcarla hecha, para no duplicar
  -- si alguien la desmarca y la vuelve a marcar.
  libro_entrada_id bigint,
  created_at     timestamptz not null default now()
);
create index if not exists plan_items_dia on public.obra_plan_items (plan_dia_id, tipo, orden);

do $$
declare t text;
begin
  foreach t in array array['obra_plan_dias','obra_plan_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
