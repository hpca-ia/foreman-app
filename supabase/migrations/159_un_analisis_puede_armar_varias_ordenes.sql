-- 159 · Un análisis puede armar varias órdenes, de a partes.
--
-- Una proforma de treinta renglones no se resuelve en una sola orden. Se
-- decide lo eléctrico y se manda, porque el cliente lo necesita el lunes;
-- quedan diez renglones de albañilería que hay que hablar con el residente, y
-- esos salen en otra orden la semana que viene. Así se trabaja.
--
-- Pero armar la orden cerraba el análisis entero: pasaba a "resuelto" y con eso
-- desaparecían los botones de decidir, de anotar, de buscarle el rubro a un
-- renglón en el presupuesto. Los diez que quedaban se volvían de lectura, y la
-- única salida era no armar nada hasta tener todo decidido —que con treinta
-- renglones y dos personas opinando es nunca— o armar una orden con lo que
-- hubiera y perder el resto.
--
-- Cada renglón guarda en qué orden salió. Lo que ya se mandó no se vuelve a
-- mandar —ese es el único motivo por el que hacía falta cerrar algo— y el resto
-- del análisis sigue vivo: se decide, se anota y se arma la orden siguiente
-- cuando esté.

alter table public.obra_analisis_lineas add column if not exists orden_cambio_id bigint
  references public.ordenes_cambio(id) on delete set null;

create index if not exists obra_analisis_lineas_orden on public.obra_analisis_lineas (orden_cambio_id);

comment on column public.obra_analisis_lineas.orden_cambio_id is
  'En qué orden de cambio salió este renglón. Lo que ya se mandó no se vuelve a mandar, y el resto del análisis sigue abierto para armar la orden siguiente.';
