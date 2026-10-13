-- 103 · Si este cronograma tiene que cubrir el presupuesto, o no.
--
-- Hay dos maneras legítimas de armar un cronograma y FOREMAN tiene las dos:
--
-- · CUBRIENDO EL PRESUPUESTO. Cada agrupación del control tiene su barra.
--   Hace falta cuando el cronograma va a sostener el valorado: si una
--   agrupación no está en el tiempo, su plata no se puede repartir en los
--   meses y el valorado queda con un agujero.
--
-- · COMO SE CONSTRUYE LA OBRA. Las etapas y los trabajos salen de leer la
--   obra, no el presupuesto. Un trabajo puede juntar tres agrupaciones, o
--   partir una, o no corresponder a ninguna —el desmontaje, el replanteo, las
--   pruebas, la limpieza—. Es el cronograma que se parece a la obra.
--
-- SIN SABER CUÁL DE LAS DOS ES, FOREMAN HACE DAÑO. El aviso de "el cronograma
-- y el control se separaron" se dispara cuando hay agrupaciones sin barra, y
-- en el segundo modo eso no es un desfase: es la decisión que se tomó. El
-- aviso quedaría prendido para siempre, y peor, ofrecería el botón de
-- "ponerlo al día", que agregaría una barra por cada agrupación que falta y
-- desarmaría el cronograma que alguien acaba de pensar.
--
-- Nulo quiere decir "no se sabe", que es el caso de todos los cronogramas
-- armados antes de esto: ahí se sigue tratando como antes, cubriendo, que es
-- como se armaron.

alter table public.leads add column if not exists crono_cubre boolean;

comment on column public.leads.crono_cubre is
  'true: cada agrupación del control tiene barra. false: el cronograma es libre. null: no se sabe.';
