-- 039 · No hay tareas "sin empezar".
--
-- Una tarea anotada es una tarea que ya está andando: nadie la escribe para
-- dejarla quieta. Los estados que se usan son En proceso, Pausada y
-- Completada; atrasada no se elige, sale de la fecha.
--
-- Las tareas de antes quedaron en "pendiente", que en pantalla se leía "Sin
-- empezar". Pasan a "en-progreso", que es lo que de verdad son.

update public.tasks set status = 'en-progreso' where status = 'pendiente';
