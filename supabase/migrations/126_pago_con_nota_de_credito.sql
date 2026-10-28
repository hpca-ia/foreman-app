-- 126 · Qué nota de crédito se usó en este pago.
--
-- Una factura de $1.000 se paga $900 por transferencia y $100 con un vale que
-- el proveedor nos debía. Los dos son pagos —la factura queda saldada— pero
-- solo uno movió plata del banco: el otro gastó un crédito que teníamos a
-- favor, y ese crédito tiene que dejar de estar disponible.
--
-- Sin esta columna, el vale se marcaba usado a mano en otra pantalla y nadie
-- podía saber en qué factura se fue ni cuánto quedaba de él. Acá los dos lados
-- quedan atados: el pago dice de qué vale salió, y el vale sabe cuánto le
-- queda.

alter table public.obra_pagos
  add column if not exists nota_credito_id bigint references public.obra_facturas(id) on delete set null;

create index if not exists obra_pagos_nota_credito_idx
  on public.obra_pagos(nota_credito_id) where nota_credito_id is not null;

comment on column public.obra_pagos.nota_credito_id is
  'La nota de crédito con la que se pagó. Ese monto no salió del banco: salió del crédito a favor.';
