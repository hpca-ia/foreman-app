-- 165 · Los totales del papel se guardan, tal como están escritos.
--
-- La comparación mostraba el total de cada cotización, pero era el NUESTRO: la
-- suma de los renglones que se leyeron. Cuando la lectura se come un renglón
-- —o cuando se traga el importe escrito en letras al pie y lo cuenta como uno—
-- ese número no tiene nada que ver con el papel, y no hay forma de notarlo
-- porque el papel no está a la vista para contrastarlo.
--
-- Lo que el proveedor escribió al pie —subtotal, descuento, IVA, total— es un
-- dato del documento y se guarda como tal. Al lado de lo leído, cualquiera ve
-- en un segundo si la lectura sirve, sin abrir el PDF.

alter table public.obra_analisis add column if not exists totales   jsonb;
alter table public.obra_analisis add column if not exists totales_b jsonb;

comment on column public.obra_analisis.totales is
  'Lo que dice el pie del papel: { subtotal, iva, total }. Tal como está escrito, sin calcular: es contra esto que se comprueba la lectura.';
