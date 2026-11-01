-- 155 · Lo que dice el papel, al lado de lo que dice el contrato.
--
-- Una diferencia de precio o de cantidad se muestra con la descripción DEL
-- RUBRO —es lo correcto: lo que cambió es el precio de ese rubro, no su
-- nombre— y el renglón de la proforma queda afuera de la pantalla. El efecto
-- es que uno lee "IMSTALACION DE ACOMETIDA ELECTRICA PROVISIONAL, TABLERO Y
-- LUMINARIAS", va a buscarlo a la cotización, y no está: ese texto es del
-- presupuesto propio.
--
-- Y cuando el emparejamiento además está mal —el alquiler mensual de un
-- tablero pegado a la instalación completa de la acometida— no hay forma de
-- darse cuenta, porque lo único que se ve en pantalla es el lado del contrato.
-- La pregunta "¿en qué parte de la cotización está esto?" no se puede
-- contestar sin abrir el PDF y leerlo entero.
--
-- Entonces cada diferencia guarda el renglón tal como lo escribió el
-- proveedor, con su cantidad y su unidad. Dos textos juntos y la comparación
-- se hace sola: "1 Mes de alquiler" contra "1 glb de instalación" no necesita
-- que nadie explique que ahí hay algo que no cierra.

alter table public.obra_analisis_lineas add column if not exists texto_papel text;
alter table public.obra_analisis_lineas add column if not exists unidad_papel text;
alter table public.obra_analisis_lineas add column if not exists cantidad_papel numeric;

comment on column public.obra_analisis_lineas.texto_papel is
  'El renglón tal como lo escribió el proveedor en su proforma. La descripción de la diferencia usa el nombre del rubro del contrato, así que sin esto no hay manera de ver contra qué se comparó ni de notar un emparejamiento equivocado.';
