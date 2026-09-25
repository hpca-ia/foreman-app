-- 045 · La hora, para lo que se agenda.
--
-- Una reunión no es "el 9 de octubre": es el 9 a las tres. Con solo la fecha,
-- en el calendario caía como evento de todo el día y nadie sabía a qué hora
-- presentarse. La hora es opcional: la mayoría de las tareas no la necesita
-- —"entregar los planos el viernes" está bien así— y solo la lleva lo que se
-- agenda con alguien.
--
-- Va como texto "HH:MM" y no como timestamp a propósito: la tarea sigue siendo
-- del día, la hora es un dato más, y así una tarea vieja sin hora no cambia de
-- significado ni hay que convertir nada.

alter table public.tasks add column if not exists hora text;
