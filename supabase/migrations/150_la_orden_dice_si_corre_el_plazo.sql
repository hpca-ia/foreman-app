-- 150 · La orden dice si corre el plazo, o dice que todavía no se sabe.
--
-- El impacto en el cronograma era un texto libre, y un texto vacío se leía como
-- "no hay impacto": el PDF imprimía "Sin impacto en el cronograma" cuando lo
-- único cierto era que nadie había contestado la pregunta.
--
-- Esa frase viaja firmada al cliente. El día que la obra se entregue tarde por
-- ese mismo adicional, el papel va a decir lo contrario de lo que pasó, y la
-- discusión la perdemos nosotros por algo que nunca afirmamos.
--
-- NO CONTESTADO Y "NO IMPACTA" NO SON LO MISMO, y la diferencia es de quién es
-- la culpa del atraso. "No impacta" es una afirmación de la obra: alguien lo
-- pensó y se hace cargo. El vacío es una pregunta sin hacer, y lo que hay que
-- mostrar ahí es la pregunta, no una respuesta inventada.
--
-- Tres estados: sí, no, y null —sin definir—, que es el que vale para todas las
-- órdenes que ya existen. Esas se siguen leyendo por lo que escribieron: la que
-- puso días o una nota estaba contestando que sí con lo que había.
--
-- La nota de siempre (`impacto_cronograma`) explica cualquiera de las dos
-- respuestas: por qué corre el plazo, o por qué no lo corre pudiendo.

alter table public.ordenes_cambio add column if not exists impacta_crono boolean;

comment on column public.ordenes_cambio.impacta_crono is
  'Si esta orden corre la fecha de entrega: true, false, o null cuando todavía nadie lo definió. Null no es "no impacta": es una pregunta sin contestar, y se muestra como tal.';
