-- 199 · Construcción también pasa por Plan masa y Anteproyecto.
--
-- Hernán, 27/11/2026: «hay proyectos en construcción que pueden estar con
-- tareas en presupuesto y tareas en diseño». Se le preguntó si Construcción
-- sumaba las dos etapas de diseño que ya tiene Diseño y construcción; el
-- 28/11 dijo que sí.
--
-- Construcción queda en el mismo orden que Diseño y construcción:
--
--   Contacto · Levantamiento · Plan masa · Anteproyecto · Ingenierías ·
--   Presupuesto · Propuesta enviada · Negociación
--
-- Los tres de construcción que se persiguen —RES BG, MINDKIDS y Megalabs,
-- los tres en Presupuesto— siguen donde están, y ninguna tarea cambia de
-- etapa: solo aparecen dos columnas más en el tablero y dos lugares más en el
-- camino de la ficha, adonde soltar lo que sea de diseño.
--
-- Se puede correr más de una vez: lo que ya pasó no vuelve a pasar.

-- ── 1. Las dos etapas nuevas ───────────────────────────────────────────────
-- Con el mismo nombre y color que en Diseño y construcción: al cambiar un
-- proyecto de un tipo al otro cae en la que se llama igual.
insert into public.pipeline_etapas (id, nombre, orden, color, principal, tunel, activa) values
  ('con_plan_masa',    'Plan masa',    30, '#5B8FA8', true, 'construccion', true),
  ('con_anteproyecto', 'Anteproyecto', 40, '#4A7C8C', true, 'construccion', true)
on conflict (id) do nothing;

-- ── 2. Las que venían después se corren dos lugares ───────────────────────
-- De diez en diez, como las numera Ajustes → Etapas. Solo las que siguen
-- donde las dejó la 171: si alguien ya las ordenó a mano, lo suyo vale.
update public.pipeline_etapas e
   set orden = n.despues
  from (values ('con_ingenierias', 30, 50),
               ('con_presupuesto', 40, 60),
               ('con_propuesta',   50, 70),
               ('con_negociacion', 60, 80)) as n (id, antes, despues)
 where e.id = n.id
   and e.orden = n.antes;
