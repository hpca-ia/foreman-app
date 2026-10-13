-- 102 · Los hitos: los momentos de la obra que no duran.
--
-- Un anticipo no dura tres días: pasa un día. La medición del mes, la entrega
-- de la planta baja, el cambio de etapa del proyecto, la llegada del
-- contenedor, la inspección de bomberos: son MOMENTOS, no trabajos.
--
-- Hasta ahora había que meterlos como actividades de un día, y eso los
-- mezclaba con el trabajo: aparecían con su casilla de días —que no quiere
-- decir nada—, se les podía pedir que se partan en partes, y en la barra se
-- veían como un trabajo cortito en vez de como una fecha. Lo peor es que al
-- mirar el cronograma no se distinguían, y son justamente lo que uno busca
-- cuando lo abre: cuándo cobro, cuándo entrego, cuándo me miden.
--
-- Un hito ocupa UN día en el calendario, no cero. Es a propósito: con cero
-- días, "empieza" y "termina" dejan de tener un día en común y toda la
-- aritmética de fechas —la ruta crítica, el colchón, el traslape— tendría que
-- aprender un caso especial que no le hace falta a nadie. Un hito es el día en
-- que pasa algo, y eso es un día.
--
-- Lo que cambia es cómo se trata: no se le pide duración, no se parte, se
-- dibuja como un rombo y se puede clavar a una fecha fija.

alter table public.cronograma_actividades
  add column if not exists es_hito boolean not null default false;

comment on column public.cronograma_actividades.es_hito is
  'Un momento de la obra, no un trabajo: anticipo, medición, entrega, inspección.';
