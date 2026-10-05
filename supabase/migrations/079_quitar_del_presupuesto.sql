-- 079 · Una orden de cambio que quita, quita del presupuesto.
--
-- Hasta hoy una línea de tipo "quita" se cargaba a mano y entraba al control
-- como un rubro nuevo con monto negativo, al final de la lista. El neto daba
-- bien, pero la lectura era mala en los dos sentidos:
--
--   · El rubro original seguía ahí, con su monto entero, como si se fuera a
--     hacer. Alguien que lee el presupuesto lo cuenta, lo planifica y lo
--     compra. La plata estaba corregida; la obra no se enteraba.
--   · Abajo aparecía "(–) Mampostería de bloque · OC-03" como si fuera otro
--     rubro, cuando es el mismo visto del otro lado.
--
-- Ahora la línea que quita APUNTA al rubro del presupuesto —se elige de la
-- lista, con su cantidad y su precio ya puestos— y al aprobarse ese rubro
-- queda marcado como anulado: se ve tachado, no suma, y dice por cuál orden
-- salió. Lo que se agrega sigue entrando al final, que es donde corresponde.
--
-- Se marca y no se borra, a propósito. Un presupuesto es un documento con
-- historia: el rubro estuvo contratado, y el día que alguien pregunte por qué
-- no se hizo la mampostería del eje 4, la respuesta tiene que estar a la
-- vista, con el número de la orden que la sacó.

alter table public.orden_cambio_lineas add column if not exists obra_rubro_id bigint;

alter table public.obra_rubros add column if not exists anulado_por_oc bigint;
create index if not exists rubros_anulados on public.obra_rubros (anulado_por_oc);
