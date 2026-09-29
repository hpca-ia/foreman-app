-- 058 · La caja chica sabe contra qué parte del presupuesto se gasta.
--
-- Una caja se abre para algo: la caja del conductor que compra materiales de
-- albañilería, la del residente para acabados. Hoy eso vive en la cabeza de
-- quien la abrió, y cada gasto hay que volver a clasificarlo a mano contra su
-- agrupación —treinta veces al mes, y basta que uno se salte para que el
-- capítulo no cuadre a fin de mes.
--
-- Se dice una vez, al abrir la caja, y cada gasto nace ya apuntado ahí. Se
-- puede cambiar gasto por gasto cuando haga falta: es un valor por defecto,
-- no un candado.
--
--   capitulo           · el capítulo del presupuesto de la obra
--   obra_actividad_id  · o la agrupación, que es como se controla cuando los
--                        rubros se trabajan agrupados

alter table public.cajas_chicas add column if not exists capitulo          text;
alter table public.cajas_chicas add column if not exists obra_actividad_id bigint;
