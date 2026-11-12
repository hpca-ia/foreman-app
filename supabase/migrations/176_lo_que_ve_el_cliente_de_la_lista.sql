-- 176 · Qué tareas de un proyecto ve el cliente en su enlace.
--
-- Un lead que se está presupuestando tiene su checklist —cotizar ventanería,
-- cotizar cocina, control de iluminación— y el cliente pregunta en qué va.
-- Hasta hoy el enlace del cliente mostraba fotos, visitas y lo que hay para
-- aprobar: ninguna tarea.
--
-- La marca va tarea por tarea y nace apagada: una tarea es trabajo interno
-- hasta que alguien decide mostrarla. Lo que ve el cliente es qué dice y si
-- está lista; ni la nota, ni los comentarios, ni quién la tiene.
--
-- No toca ninguna fila que ya exista: es una columna nueva, en falso para
-- todas. Se puede correr más de una vez.

alter table public.tasks add column if not exists visible_cliente boolean not null default false;

comment on column public.tasks.visible_cliente is 'El cliente la ve en su enlace: solo el título y si está lista.';
