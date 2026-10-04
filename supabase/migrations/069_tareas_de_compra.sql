-- 069 · Una compra en el tablero se ve como una compra.
--
-- Los avisos del circuito de compras —"aprobar", "comprar", "recibir"— se
-- crean como tareas, que está bien: así aparecen en el tablero de quien le
-- toca, le llega el correo y entran al resumen de la mañana, sin inventar un
-- segundo sistema de alertas que después nadie mira.
--
-- Pero se creaban con tipo "Gestión", así que caían en "Gestiones de
-- proyectos" entre el trámite del municipio y la llamada al cliente, y la
-- columna ESTADO decía "En proceso": cierto y completamente inútil. Lo que
-- hace falta saber de un aviso de compra es en qué paso está la compra.
--
-- `compra_estado` guarda ese paso en la tarea misma y no se lee de la
-- solicitud con un join: el tablero trae cientos de tareas y una consulta más
-- por fila lo haría gatear. Se puede guardar porque no cambia: cada paso crea
-- su propia tarea y cierra la anterior, así que el estado de esa tarea es
-- fijo desde que nace.
--
-- `compra_id` es para volver: desde el tablero al pedido, que es lo que uno
-- quiere hacer apenas lee "esperando tu visto".

alter table public.tasks add column if not exists compra_id     bigint;
alter table public.tasks add column if not exists compra_estado text;

create index if not exists tasks_por_compra on public.tasks (compra_id);

-- Las que ya existen: se reconocen por su nota, que es como las escribe el
-- módulo desde el primer día. Sin esto, los avisos de compra que ya están en
-- el tablero de alguien seguirían diciendo "Gestión · En proceso" para siempre.
update public.tasks t
   set compra_id = s.id,
       compra_estado = coalesce(t.compra_estado, s.estado),
       type = 'Compra'
  from public.compras_solicitudes s
 where t.compra_id is null
   and t.notes like 'Gestión de compras · %'
   and s.tarea_id = t.id;
