-- 197 · El rubro del presupuesto que salió de una cotización elegida.
--
-- Hernán, 26/11/2026: «Son varias cotizaciones... pueden ser dos o tres de
-- cocinas o puertas o vidrios... una de ellas iría al presupuesto. La
-- comparativa se la categoriza por capítulos del presupuesto. Una vez escogida
-- una, los rubros de la proforma alimentarían el capítulo del presupuesto».
--
-- Cuando una cotización elegida alimenta un capítulo, cada renglón de la
-- proforma entra como un rubro. Ese rubro tiene que acordarse de qué fila de
-- la comparación salió: así, cuando llega otra versión de la cotización o se
-- vuelve a escoger, se actualiza ESE rubro en vez de entrar otro igual, y el
-- que deja de estar elegido se puede quitar sin tocar los demás.
--
--   · comparativa_fila   la fila —o las filas, separadas por coma, si el
--                        renglón de la empresa cubría varias— de la matriz de
--                        cotizaciones de donde salió el rubro. Null en los
--                        rubros que no vinieron de la comparativa, que son
--                        todos los que existen hoy.
--
-- Y se pone al día lo que dicen las columnas de las cotizaciones guardadas
-- (migración 194), que cambiaron de sentido: un renglón ya no apunta a rubros
-- del presupuesto, sino a un capítulo y a las filas de la comparación.
--
-- No cambia ningún rubro ni ninguna cotización. Se puede correr más de una vez.

alter table public.presupuesto_items
  add column if not exists comparativa_fila text;

create index if not exists presupuesto_items_de_la_comparativa
  on public.presupuesto_items (presupuesto_id) where comparativa_fila is not null;

comment on column public.presupuesto_items.comparativa_fila is
  'La fila (o las filas, separadas por coma) de la matriz de cotizaciones de donde salió este rubro al elegir una proforma. Null si el rubro no vino de la comparativa.';

comment on column public.presupuesto_cotizaciones.renglones is
  'Lo que cotizó la empresa: [{ descripcion, unidad, cantidad, precio_unitario, total, capitulo, filas }]. capitulo es el nombre del capítulo del presupuesto al que va; filas, las claves de las filas de la comparación en las que cae (varias si es una suma; ninguna si abre la suya).';
comment on column public.presupuesto_cotizaciones.elegidos is
  'Las filas de la comparación adjudicadas a esta cotización: [clave de fila].';
