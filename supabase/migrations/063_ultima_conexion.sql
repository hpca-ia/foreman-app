-- 063 · Cuándo entró cada uno por última vez.
--
-- La sesión dura siete días, así que "está logueado" no dice nada: alguien
-- puede no abrir FOREMAN en toda la semana y seguir con sesión válida. Lo que
-- se quiere saber es otra cosa —quién lo está usando de verdad— y hoy no se
-- puede contestar.
--
-- Sirve para lo prosaico: antes de preguntar por WhatsApp "¿viste la tarea?",
-- mirar si esa persona abrió la app hoy. Y para darse cuenta de que alguien
-- del equipo no entra hace tres semanas, que casi siempre significa que algo
-- no le funciona y no lo dijo.
--
-- Se guarda una sola fecha, no un historial de sesiones: un registro de cada
-- entrada sería vigilancia, y lo que hace falta es saber si la herramienta se
-- está usando.

alter table public.usuarios add column if not exists ultima_conexion timestamptz;
