-- 093 · Qué hay adentro de cada barra, que no son rubros.
--
-- Una barra del cronograma dice "ESTRUCTURA METÁLICA · montaje, 40 días".
-- Adentro de esos 40 días hay replanteo, nivelación de placas, izaje, torque
-- de pernos, soldadura de rigidizadores, pruebas. Nada de eso es un rubro del
-- presupuesto —el presupuesto cobra el montaje, no el torque— y sin embargo es
-- exactamente lo que se hace, lo que se programa y lo que se supervisa.
--
-- Hoy ese nivel vive en la cabeza del residente. Por eso el plan semanal
-- arranca en blanco todas las semanas: el cronograma le puede decir QUÉ
-- capítulo toca, pero no QUÉ HAY QUE HACER, y la distancia entre las dos cosas
-- la llena alguien escribiendo a mano los mismos quince renglones.
--
-- NOVA lo puede proponer: tiene el capítulo, sus rubros, sus cantidades y la
-- duración que ella misma calculó. Es lo que ya sabe y no estaba escribiendo.
--
-- Como texto y no como tabla: son cinco o seis renglones por barra, se leen
-- juntos, se corrigen juntos y nunca se consultan por separado. Una tabla acá
-- sería una llave foránea y tres pantallas más para guardar una lista.

alter table public.cronograma_actividades add column if not exists incluye text[];

comment on column public.cronograma_actividades.incluye is
  'Los trabajos que componen esta barra y NO son rubros del presupuesto: replanteo, pruebas, curado. Alimentan el plan semanal.';
