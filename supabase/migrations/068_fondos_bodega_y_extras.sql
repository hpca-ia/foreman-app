-- 068 · Tres piezas del mismo circuito: la plata del proyecto, lo que no se
-- presupuestó, y el material que llega a la obra.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1 · AGRUPACIONES EXTRAS — lo que se gasta y no estaba en el presupuesto
-- ─────────────────────────────────────────────────────────────────────────
--
-- Salarios, oficina, logística, imprevistos. Son gastos reales del proyecto
-- que ningún presupuesto contrató, y hoy no tienen dónde caer: el control solo
-- conoce las agrupaciones que salieron de los rubros. Ese gasto terminaba
-- empujado dentro de alguna agrupación del contrato —ensuciándola— o fuera del
-- control, que es peor: la obra parece ir mejor de lo que va.
--
-- Van como agrupaciones con `extra = true`: aparecen en todas las obras, su
-- presupuesto es cero y su saldo arranca en negativo apenas entra el primer
-- gasto. Eso NO es un error de cuadre, es el dato: esto se gastó sin estar
-- contratado. Mezclarlo con lo contratado es cómo se pierde esa distinción.
--
-- Separadas del contrato también porque el cliente lee el contrato: una
-- planilla que le cobra "gastos de oficina" dentro de ALBAÑILERÍA es un
-- problema distinto y mucho peor que uno de software.

alter table public.obra_actividades add column if not exists extra boolean not null default false;

-- Las cuatro de siempre, en cada obra que todavía no las tenga. Órdenes 9001+
-- para que queden al final, después de lo contratado.
insert into public.obra_actividades (obra_id, codigo, nombre, orden, origen, extra)
select o.id, x.codigo, x.nombre, x.orden, 'manual', true
  from public.obras o
 cross join (values
    ('X1', 'SALARIOS Y HONORARIOS',   9001),
    ('X2', 'GASTOS DE OFICINA',       9002),
    ('X3', 'LOGÍSTICA Y TRANSPORTE',  9003),
    ('X4', 'IMPREVISTOS Y VARIOS',    9004)
 ) as x(codigo, nombre, orden)
 where not exists (
   select 1 from public.obra_actividades a
    where a.obra_id = o.id and a.nombre = x.nombre
 );

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · LOS FONDOS DEL PROYECTO — el libro de bancos
-- ─────────────────────────────────────────────────────────────────────────
--
-- Hoy se sabe cuánto se gastó y contra qué. No se sabe con qué plata: cuánto
-- anticipó el cliente, cuánto queda en la caja del proyecto, y si lo que falta
-- por gastar entra en lo que falta por cobrar. Esa es la pregunta que se hace
-- un lunes a la mañana y hoy se contesta abriendo el banco.
--
-- LA DECISIÓN QUE IMPORTA: acá NO se vuelven a escribir los gastos.
--
--   Los egresos ya están contados en otro lado —las facturas de control de
--   obra y los gastos de caja chica— y el saldo se calcula restándolos. Una
--   segunda tabla de gastos sería una segunda verdad, y de ahí salen los
--   descuadres que todo este módulo viene a evitar: alguien carga la factura
--   en el control, otro la anota en el libro, y a fin de mes no cuadra ni el
--   banco ni la obra.
--
--   Esta tabla guarda solo lo que no tiene otra casa: lo que ENTRA (anticipos
--   del cliente, aportes) y lo que SALE sin pasar por una factura de obra
--   (una devolución al cliente, un traspaso a otra cuenta).
--
-- `monto` va con signo: positivo entra, negativo sale. Un solo campo y una
-- sola regla, en vez de dos columnas y la duda de cuál llenar.

create table if not exists public.proyecto_fondos (
  id             bigserial primary key,
  lead_id        bigint not null references public.leads(id) on delete cascade,
  obra_id        bigint,
  fecha          date not null default current_date,
  clase          text not null default 'anticipo',
    -- anticipo | aporte | planilla_cobrada | devolucion | traspaso
  concepto       text not null,
  monto          numeric(14,2) not null,     -- + entra · − sale
  forma_pago     text,                       -- transferencia | cheque | efectivo | tarjeta
  documento      text,                       -- n° de comprobante, cheque o transferencia
  archivo_url    text,
  archivo_nombre text,
  creado_por     bigint,
  creado_nombre  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists proyecto_fondos_lead on public.proyecto_fondos (lead_id, fecha);

drop trigger if exists proyecto_fondos_tocar on public.proyecto_fondos;
create trigger proyecto_fondos_tocar before update on public.proyecto_fondos
  for each row execute function public.compras_tocar();

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · BODEGA — lo que de verdad llegó a la obra
-- ─────────────────────────────────────────────────────────────────────────
--
-- Entre "se compró" y "se recibió" hay un hueco por donde se pierde material.
-- Se piden 200 sacos, llegan 180, nadie cuenta, la factura dice 200 y se paga
-- 200. El ingreso a bodega es el único momento en que alguien tiene el
-- material delante y puede decir cuánto llegó.
--
-- Por eso se guarda la cantidad esperada Y la recibida, en vez de un visto
-- bueno: un "sí, llegó" no sirve de nada tres semanas después, y es justo lo
-- que uno quiere poder mirar cuando el proveedor reclama.
--
-- Los SERVICIOS no se bodegan. Pintar una fachada o alquilar una grúa no entra
-- a ninguna bodega, y pedirle a alguien que "reciba" eso es enseñarle a
-- apretar un botón sin mirar — que es exactamente lo que vuelve inútil el
-- control. Por eso el pedido dice de qué clase es, y el que es servicio salta
-- este paso.

alter table public.compras_solicitudes add column if not exists clase text not null default 'material';
  -- material | servicio

create table if not exists public.bodega_ingresos (
  id              bigserial primary key,
  obra_id         bigint,
  lead_id         bigint,
  solicitud_id    bigint references public.compras_solicitudes(id) on delete set null,
  fecha           date not null default current_date,
  -- Contra qué papel se recibe: la factura, la proforma con la que se compró,
  -- o la guía de remisión. Sin esto, el conteo no se puede contrastar con nada.
  documento       text,
  factura_id      bigint,
  proforma_id     bigint,
  completo        boolean not null default false,
  nota            text,
  recibido_por    bigint,
  recibido_nombre text,
  created_at      timestamptz not null default now()
);
create index if not exists bodega_ingresos_obra on public.bodega_ingresos (obra_id);
create index if not exists bodega_ingresos_sol  on public.bodega_ingresos (solicitud_id);

create table if not exists public.bodega_items (
  id                bigserial primary key,
  ingreso_id        bigint not null references public.bodega_ingresos(id) on delete cascade,
  descripcion       text not null,
  unidad            text,
  cantidad_esperada numeric(14,3),
  cantidad_recibida numeric(14,3) not null default 0,
  precio_unitario   numeric(14,2),
  obra_rubro_id     bigint,
  nota              text
);
create index if not exists bodega_items_ingreso on public.bodega_items (ingreso_id);

-- Mismo criterio que el resto: el equipo autenticado.
do $$
declare t text;
begin
  foreach t in array array['proyecto_fondos','bodega_ingresos','bodega_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
