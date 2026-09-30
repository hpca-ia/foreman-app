-- 060 · Lo que se debe, y a quién.
--
-- Control de Obra sabe cuánto se gastó, pero no cuánto se PAGÓ, que no es lo
-- mismo. Una factura de 12.000 con un anticipo del 40% ya golpeó el rubro
-- entero y sin embargo quedan 7.200 por salir de caja; hoy eso vive en la
-- cabeza del que la negoció. Y al revés: una proforma aceptada compromete
-- plata que todavía no tiene factura, y a fin de mes nadie sabe cuántas hay.
--
-- Dos cosas, entonces:
--
--   1. QUÉ ES cada documento. Una proforma no es una factura: no da crédito
--      tributario y, sobre todo, alguien la tiene que convertir en factura.
--      Sin distinguirlas, "documentos pendientes de facturar" no se puede ni
--      preguntar.
--
--   2. CUÁNTO SE PAGÓ. Un documento puede pagarse en partes —anticipo,
--      avance, retención liberada al final— y cada pago tiene su fecha, su
--      forma y su comprobante. Guardar solo "pagado sí/no" pierde justo lo que
--      se necesita cuando el proveedor llama a preguntar.
--
-- El saldo no se guarda: sale de restar los pagos al total. Un saldo guardado
-- se desincroniza el día que alguien corrige un pago, y entonces hay dos
-- verdades y ninguna confiable.

-- Qué es este documento, y con qué factura se reemplazó si era una proforma.
alter table public.obra_facturas add column if not exists clase text not null default 'factura';
  -- factura | proforma
alter table public.obra_facturas add column if not exists facturada_con_id bigint;
  -- la factura que reemplazó a esta proforma, cuando llega
alter table public.obra_facturas add column if not exists proveedor_id bigint;
  -- el proveedor de la tabla `proveedores`, cuando se lo reconoce por RUC

create index if not exists obra_facturas_clase     on public.obra_facturas (obra_id, clase);
create index if not exists obra_facturas_ruc       on public.obra_facturas (ruc);
create index if not exists obra_facturas_proveedor on public.obra_facturas (proveedor_id);

-- Los pagos que se le hicieron a un documento. Varios por documento: casi
-- ninguna factura de obra se paga de una sola vez.
create table if not exists public.obra_pagos (
  id            bigserial primary key,
  factura_id    bigint not null references public.obra_facturas(id) on delete cascade,
  obra_id       bigint references public.obras(id) on delete cascade,
  fecha         date not null default current_date,
  monto         numeric(14,2) not null,
  forma         text,                      -- transferencia | cheque | efectivo | otro
  referencia    text,                      -- n° de cheque, comprobante, banco
  nota          text,
  registrado_por    bigint,
  registrado_nombre text,
  created_at    timestamptz not null default now()
);
create index if not exists obra_pagos_factura on public.obra_pagos (factura_id, fecha);
create index if not exists obra_pagos_obra    on public.obra_pagos (obra_id, fecha);

-- Un pago de cero no es un pago, y uno negativo es una nota de crédito que
-- todavía no sabemos manejar: mejor que no entre a que entre mal.
do $$
begin
  alter table public.obra_pagos drop constraint if exists obra_pagos_monto_positivo;
  alter table public.obra_pagos add constraint obra_pagos_monto_positivo check (monto > 0);
end $$;

alter table public.obra_pagos enable row level security;
drop policy if exists "equipo foreman" on public.obra_pagos;
create policy "equipo foreman" on public.obra_pagos for all to authenticated using (true) with check (true);

-- Lo que ya estaba cargado es una factura: era lo único que se podía cargar.
update public.obra_facturas set clase = 'factura' where clase is null;
