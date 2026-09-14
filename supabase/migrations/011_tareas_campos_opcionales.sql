-- Una tarea no tiene por qué tener proyecto, responsable o fecha para existir.
--
-- La tabla tasks exigía proyecto en toda tarea. Eso rompía tres cosas en
-- producción: crear una tarea "Sin proyecto" desde NOVA o desde el formulario
-- ("llamar al proveedor de vidrio" no es de ninguna obra), y guardar los pasos
-- de un lead, que por definición no pertenecen a un proyecto.
--
-- Soltar estas restricciones solo afloja: ninguna tarea existente cambia.
-- El título sí sigue siendo obligatorio.

alter table public.tasks alter column project_id  drop not null;
alter table public.tasks alter column assignee_id drop not null;
alter table public.tasks alter column due_date    drop not null;
alter table public.tasks alter column type        drop not null;
alter table public.tasks alter column notes       drop not null;
