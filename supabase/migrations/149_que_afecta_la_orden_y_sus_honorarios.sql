-- 149 · Qué afecta la orden de cambio, y los honorarios sobre ella.
--
-- QUÉ AFECTA. Una orden puede mover la plata, cambiar una especificación sin
-- mover un peso, correr el plazo, o las tres a la vez. Todas se leían igual
-- —"orden de cambio 03"— y el cliente tenía que abrir el PDF para enterarse de
-- si eso le costaba algo o le cambiaba la fecha de entrega. Es un arreglo, no
-- una elección: el cambio de especificación que además cuesta y además corre el
-- plazo son tres casillas, no una de tres.
--
-- Esto es otra pregunta que `tipo`, que dice POR QUÉ se origina —vicio oculto,
-- error de proyecto, pedido del cliente—. Una es la causa y la otra el efecto, y
-- confundirlas era parte del problema.
--
-- LOS HONORARIOS. El contrato dice que sobre la obra que administramos se cobra
-- un porcentaje. Un adicional es obra que se administra igual que el resto: hay
-- que comprarlo, dirigirlo y responder por él.
--
-- Y NO ENCARECE EL RUBRO. Repartir ese porcentaje dentro de los precios de las
-- partidas dejaría a cada rubro mintiendo sobre lo que cuesta —y ese precio es
-- justo contra el que después se compara una cotización— y escondería el
-- honorario donde tiene que estar a la vista: es la parte que el cliente acepta
-- aparte. Va como línea al pie, igual que el IVA, y al aprobarse entra al
-- control como un rubro del capítulo de HONORARIOS.
--
-- Si la orden es negativa el honorario también: se administra menos. Cobrar el
-- porcentaje cuando sube y no devolverlo cuando baja es quedarse con la mitad
-- buena de la regla.

alter table public.ordenes_cambio add column if not exists afecta text[] not null default '{}';
alter table public.ordenes_cambio add column if not exists honorarios_pct numeric;

comment on column public.ordenes_cambio.afecta is
  'Qué mueve esta orden: economica · especificacion · tiempo. Pueden ser varias. Distinto de tipo, que dice por qué se origina.';
comment on column public.ordenes_cambio.honorarios_pct is
  'El porcentaje de honorarios del contrato que se cobra sobre el NETO de la orden. Va como línea al pie y entra al control en el capítulo de HONORARIOS, nunca repartido en los precios de las partidas.';
