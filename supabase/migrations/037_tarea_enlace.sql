-- 037 · Un enlace de descarga en la tarea.
--
-- No todo lo que hace falta para una tarea es un archivo que se sube: muchas
-- veces es una carpeta de Dropbox, un plano en Drive o el enlace del proveedor.
-- Subirlo otra vez a FOREMAN sería duplicarlo; lo que hace falta es tenerlo a
-- mano desde la tarea.

alter table public.tasks add column if not exists enlace text;
