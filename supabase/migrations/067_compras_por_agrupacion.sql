-- 067 · El pedido se apunta a una agrupación, no a un capítulo.
--
-- El capítulo es cómo se contrató la obra —el orden del presupuesto que firmó
-- el cliente— y la agrupación es cómo se ejecuta: "obra civil", "instalaciones",
-- lo que el residente tiene en la cabeza cuando pide algo. Son dos lecturas de
-- los mismos rubros, y una agrupación puede cruzar varios capítulos.
--
-- Pedir contra el capítulo obligaba a traducir: el que pide piensa "esto es de
-- instalaciones" y tenía que buscar en cuál de los capítulos del contrato cae
-- eso. Esa traducción la hacía a ojo y de ahí salían los pedidos cargados al
-- capítulo equivocado.
--
-- `capitulo` se queda y no se migra nada. Un pedido que apuntaba a un rubro
-- sigue sabiendo su capítulo por el rubro, y lo comprometido se calcula de las
-- dos formas según cómo se esté mirando el control. Reescribir el pasado para
-- que se parezca al presente es cómo se pierde el pasado.

alter table public.compras_solicitudes add column if not exists obra_actividad_id bigint;

create index if not exists compras_por_agrupacion
  on public.compras_solicitudes (obra_actividad_id);
