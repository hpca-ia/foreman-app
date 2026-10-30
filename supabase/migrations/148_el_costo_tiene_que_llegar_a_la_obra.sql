-- 148 · El costo del rubro nunca llegó a la obra.
--
-- Beneficios no encontraba una sola eficiencia, y no era que no las hubiera:
-- no tenía con qué buscarlas. Un rubro del presupuesto tiene DOS números —lo
-- que cuesta (`presupuesto_items.precio_base`) y lo que el cliente paga
-- (`precio_unitario`)— y al activar la obra se copiaba solamente el segundo.
-- `obra_rubros` no tenía ni la columna.
--
-- Entonces todo lo que compara contra el costo —la proforma nueva, la
-- liquidación del proveedor, el ahorro de haber comprado mejor— medía contra
-- un campo que no existía y encontraba cero, sin decir nunca que el problema
-- era la falta del dato y no la falta del ahorro. Eso es lo peor que puede
-- hacer una pantalla: contestar "no hay nada" cuando la respuesta honesta es
-- "no lo sé".
--
-- El costo baja con el rubro, y de ahora en más viaja con él.
--
-- Va SIN IVA, como todos los costos: el precio del control lleva IVA porque es
-- lo que se le factura al cliente, pero medir un costo con IVA contra uno sin
-- IVA se lleva quince puntos de margen sin que nada lo diga.

alter table public.obra_rubros add column if not exists costo_unitario numeric;

-- Las obras que ya están andando: el costo estaba en su presupuesto, del otro
-- lado del `presupuesto_item_id`, esperando que alguien lo trajera.
update public.obra_rubros r
   set costo_unitario = i.precio_base
  from public.presupuesto_items i
 where i.id = r.presupuesto_item_id
   and r.costo_unitario is null
   and i.precio_base is not null
   and i.precio_base > 0;

comment on column public.obra_rubros.costo_unitario is
  'Lo que cuesta una unidad del rubro, sin IVA, como venía del presupuesto (precio_base). Contra esto se mide si se compró mejor o peor: sin este dato no hay eficiencia que calcular, y no saberlo no es lo mismo que que sea cero.';
