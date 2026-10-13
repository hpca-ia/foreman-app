-- 100 · El rendimiento, guardado como número y no como frase.
--
-- NOVA ya aprendía de las duraciones corregidas a mano, pero lo que aprendía
-- quedaba en dos lugares equivocados: los días en `anticipacion` —que es la
-- columna de "cuántos meses antes se paga el anticipo"— y el rendimiento
-- dentro de `nota`, en texto libre.
--
-- Eso tenía dos consecuencias. La primera es que al dictarle la memoria a NOVA
-- salía escrito "el primer pago 35 meses antes de instalar" donde el apunte
-- decía "35 días hábiles": el molde era el del valorado. La segunda, peor, es
-- que el dato bueno —cuántos m2 por día rinde esto— no se podía leer de vuelta
-- sin volver a parsear una frase que el propio programa había escrito.
--
-- Acá va como número: la cantidad que había, la unidad, los días que llevó y
-- lo que rindió por día. Es lo único que viaja de una obra a la siguiente —los
-- días no, porque la obra que viene tiene otros metros— y es lo que hace que
-- la segunda obra arranque con duraciones que ya se parecen a la verdad.
--
--   {"cantidad": 450, "unidad": "m2", "dias": 25, "rinde": 18}

alter table public.nova_memoria add column if not exists rendimiento jsonb;

comment on column public.nova_memoria.rendimiento is
  'Lo medido en una obra real: {cantidad, unidad, dias, rinde}. Solo en tema=cronograma.';

-- Los apuntes se leen por tema y ordenados por insistencia, en cada consulta a
-- NOVA. Con el índice, traer los 40 de cronograma no mira los del valorado.
create index if not exists nova_memoria_por_tema
  on public.nova_memoria (tema, activo, veces desc);
