-- 048 · Aprobaciones de compras.
--
-- Lo que hoy pasa por WhatsApp: el residente necesita cemento, le escribe al
-- gerente, el gerente dice que sí, Johanna compra, y tres semanas después nadie
-- sabe quién aprobó qué ni a qué rubro fue ese gasto.
--
-- El flujo completo, con su historial:
--   borrador → pendiente_aprobacion → (requiere_info ↺) → aprobada → comprada → recibida
--
-- Dos decisiones que se ven en el esquema:
--
--   · La solicitud cuelga del proyecto (`lead_id`), no de la obra: se pide
--     antes de que la obra exista, y se pide también en proyectos que nunca
--     llegan a tener control de obra.
--
--   · La compra no guarda su propio gasto: guarda el id de la factura que entró
--     a Control de Obra. Ahí se asigna a su rubro, como cualquier otra. Una
--     segunda tabla de gastos es una segunda verdad, y de ahí salen los
--     descuadres que este módulo viene a evitar.

create table if not exists public.compras_solicitudes (
  id            bigserial primary key,
  lead_id       bigint not null references public.leads(id) on delete cascade,
  obra_id       bigint,                       -- la obra, cuando ya está activa
  descripcion   text not null,
  justificacion text,
  necesita_para date,
  urgente       boolean not null default false,
  estado        text not null default 'borrador',
    -- borrador | pendiente_aprobacion | requiere_info | aprobada | comprada | recibida | anulada
  solicitante_id bigint, solicitante_nombre text,
  aprobador_id   bigint, aprobador_nombre text, aprobado_at timestamptz,
  -- La compra efectiva
  proveedor    text,
  monto        numeric(14,2),
  factura_id   bigint,                        -- la factura en Control de Obra
  comprado_por bigint, comprado_nombre text, comprado_at timestamptz,
  recibido_por bigint, recibido_nombre text, recibido_at timestamptz,
  -- A quién le toca ahora: la tarea de siempre, en el tablero de siempre
  tarea_id     bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists compras_por_proyecto on public.compras_solicitudes (lead_id, estado);
create index if not exists compras_por_estado   on public.compras_solicitudes (estado);

create table if not exists public.compras_adjuntos (
  id           bigserial primary key,
  solicitud_id bigint not null references public.compras_solicitudes(id) on delete cascade,
  tipo         text not null default 'respaldo',   -- respaldo | cotizacion | dibujo | factura
  storage_path text not null,
  nombre       text,
  subido_por   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists compras_adjuntos_sol on public.compras_adjuntos (solicitud_id);

-- Quién hizo qué y cuándo. Sin esto, "yo te la aprobé" contra "a mí nunca me
-- llegó" no se resuelve nunca.
create table if not exists public.compras_historial (
  id              bigserial primary key,
  solicitud_id    bigint not null references public.compras_solicitudes(id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  usuario_id      bigint, usuario_nombre text,
  comentario      text,
  created_at      timestamptz not null default now()
);
create index if not exists compras_historial_sol on public.compras_historial (solicitud_id, created_at);

-- Devolver una solicitud sin decir qué falta es devolverla dos veces: la regla
-- vive en la base para que ninguna pantalla pueda saltársela.
create or replace function public.compras_devolver_con_motivo() returns trigger
language plpgsql as $$
begin
  if new.estado_nuevo = 'requiere_info' and coalesce(btrim(new.comentario), '') = '' then
    raise exception 'Para devolver una solicitud hay que decir qué falta';
  end if;
  return new;
end $$;

drop trigger if exists compras_historial_motivo on public.compras_historial;
create trigger compras_historial_motivo before insert on public.compras_historial
  for each row execute function public.compras_devolver_con_motivo();

create or replace function public.compras_tocar() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists compras_solicitudes_tocar on public.compras_solicitudes;
create trigger compras_solicitudes_tocar before update on public.compras_solicitudes
  for each row execute function public.compras_tocar();

-- Mismo criterio que el resto de FOREMAN mientras la RLS por rol siga
-- pendiente: el equipo autenticado. Cuando se afine, este módulo entra en la
-- misma pasada y no con un criterio propio.
do $$
declare t text;
begin
  foreach t in array array['compras_solicitudes','compras_adjuntos','compras_historial'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
