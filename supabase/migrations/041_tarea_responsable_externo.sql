-- 041 · Una tarea puede ser de alguien de afuera.
--
-- Las actividades de una etapa no siempre las hace el equipo: el plano
-- estructural lo hace el ingeniero, la muestra la manda el proveedor, el
-- permiso lo tramita el cliente. Eso igual hay que anotarlo y seguirlo, aunque
-- esa persona no entre a FOREMAN.
--
-- Cuando el responsable es de afuera, la tarea no tiene usuario asignado y
-- lleva su nombre acá. Aparece en el proyecto y en las listas como de esa
-- persona, y quien la creó sigue siendo el que la empuja.

alter table public.tasks add column if not exists responsable_externo text;
