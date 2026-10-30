-- 147 · El ahorro no es una diferencia con el cliente.
--
-- Comparar una propuesta nueva contra el presupuesto encuentra rubros a otro
-- precio, y hasta ahora los dos lados eran el mismo hallazgo. No lo son, y no
-- se resuelven en el mismo lado:
--
--   · MÁS CARO que el costo cargado: se come nuestro margen, y la conversación
--     es con el proveedor. Si se decide cobrárselo al cliente, lleva precio.
--   · MÁS BARATO: no hay nada que cobrar ni que devolver. El cliente paga el
--     precio que firmó y nosotros compramos mejor. Eso es una EFICIENCIA, y su
--     lugar es Beneficios.
--
-- Mezclados en una sola lista, el ahorro se lee como un problema y se descarta
-- junto con el resto. Y los ahorros son justamente lo que nadie registra: las
-- malas noticias las busca todo el mundo, las buenas no, y son las que dicen
-- si la obra compra bien y dónde se puede gastar más.
--
-- Los dos valores viejos de 'otro_precio' —si quedó alguno de las pocas horas
-- que existió— se leen como el caso malo, que es el que su pantalla decía.

update public.obra_analisis_lineas set hallazgo = 'subio_precio' where hallazgo = 'otro_precio';

comment on column public.obra_analisis_lineas.hallazgo is
  'nuevo · mas_cantidad · menos_cantidad · subio_precio (lo cotizan por encima del costo cargado) · bajo_precio (por debajo: es eficiencia nuestra) · calza.';

comment on column public.obra_analisis_lineas.decision is
  'pendiente · cobrar (va a la orden de cambio) · incluido (ya estaba en el contrato) · nuestro (error nuestro, lo pagamos nosotros) · eficiencia (se compró por debajo: no se le cobra al cliente, se registra en Beneficios).';
