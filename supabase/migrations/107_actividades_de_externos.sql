-- 107 · Las actividades que no las hace la obra.
--
-- En casi toda obra hay trabajos que ejecuta otro: el proveedor de ascensores,
-- la empresa de aire acondicionado contratada directo por el cliente, la
-- fiscalización cuando hace una prueba, el municipio cuando inspecciona.
--
-- Ocupan tiempo en el cronograma —y muchas veces son las que la traban— pero
-- no son trabajo de la obra: no se les asigna cuadrilla, no se les reclama
-- rendimiento, y cuando se atrasan la responsabilidad es de otro. Mezcladas
-- con las propias, el cronograma dice que la obra tiene cuarenta frentes
-- abiertos cuando tiene treinta, y una demora ajena se lee como una demora
-- propia.
--
-- Se guarda QUIÉN la hace, no un sí o un no: "externo" no dice nada en una
-- reunión; "Ascensores Otis" sí, y es a quien hay que llamar.

alter table public.cronograma_actividades
  add column if not exists externo text;

comment on column public.cronograma_actividades.externo is
  'Quién la ejecuta cuando no es la obra: el proveedor, el contratista directo del cliente, el municipio.';
