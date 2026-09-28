-- 052 · El presupuesto puede ir aparte.
--
-- Un residente entra al proyecto a trabajar —carga facturas, mueve el control
-- de obra, lleva su caja chica— y aun así el presupuesto no se toca: lo mira y
-- nada más. Con un solo nivel por proyecto había que elegir entre darle todo o
-- dejarlo afuera de todo.
--
-- `nivel_presupuesto` en null significa "lo mismo que en el proyecto", que es
-- lo que ya venía pasando: nadie pierde ni gana permisos con esta migración.

alter table public.lead_accesos
  add column if not exists nivel_presupuesto text;   -- null = igual que el proyecto | ver
