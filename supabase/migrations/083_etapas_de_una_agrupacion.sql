-- 083 · Una agrupación puede tener varias etapas, y cada una su plata.
--
-- Una ventanería importada no es una cosa que pasa en un momento: se anticipa
-- en marzo, se fabrica, llega en julio y se instala en agosto. Son tres
-- momentos en el tiempo y tres momentos de plata, y no coinciden entre sí.
--
-- En el cronograma de barras eso ya se podía: son tres actividades de la misma
-- agrupación. Lo que faltaba era decir CUÁNTO de la plata de esa agrupación va
-- en cada una. Sin eso, el cronograma sabe cuándo pasa cada etapa y el
-- valorado no puede usarlo: tiene que repartir el total por su cuenta y los dos
-- terminan diciendo cosas distintas sobre la misma ventanería.
--
-- `peso_pct` es la parte de la plata de su agrupación que le toca a esta
-- actividad. Las de una agrupación suman 100. En porcentaje y no en monto por
-- lo mismo de siempre: si entra una orden de cambio y la agrupación cambia de
-- precio, el reparto sigue valiendo.
--
-- Con esto el valorado se puede DERIVAR del cronograma: cada actividad pone su
-- plata en los meses en que ocurre. Dejan de ser dos documentos que hay que
-- mantener de acuerdo y pasan a ser dos vistas de lo mismo.

alter table public.cronograma_actividades add column if not exists peso_pct numeric(6,2);
-- Qué clase de etapa es, para leerla y para que NOVA la reconozca después.
alter table public.cronograma_actividades add column if not exists etapa text;
  -- anticipo | fabricacion | entrega | instalacion | ejecucion
