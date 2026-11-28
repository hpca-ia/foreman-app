-- 203 · El comprobante de cada pago.
--
-- Hernán, 28/11/2026, al ver el expediente de una TR: los pagos registrados en
-- el control guardaban fecha, forma y referencia, pero no el papel —la
-- transferencia, la foto del cheque—. El comprobante solo existía cuando
-- alguien lo había subido en la orden de compra. «Sí, agrega subir».
--
-- Dos columnas en el pago: dónde está el archivo y cómo se llama. Sirve para
-- los pagos nuevos y para ponerle el comprobante a uno que ya está registrado.
--
-- No cambia ningún dato existente. Se puede correr más de una vez.

alter table public.obra_pagos add column if not exists archivo_url    text;
alter table public.obra_pagos add column if not exists archivo_nombre text;

comment on column public.obra_pagos.archivo_url is
  'El comprobante del pago (la transferencia, la foto del cheque): la ruta en el depósito. Va detrás en el expediente de la TR.';
