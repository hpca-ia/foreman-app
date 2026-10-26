-- 123 · El cronograma que se arma desde el presupuesto, antes de la obra.
--
-- El presupuesto se entrega con un cronograma, y ese se arma cuando todavía
-- no hay obra en el control: no hay agrupaciones de las que colgar las
-- barras. Lo que sí hay es el capítulo del presupuesto del que sale cada una.
--
-- `presupuesto_capitulo` es ese capítulo. Sirve para dos cosas:
--   · rearmar el cronograma reemplaza estas barras y deja las escritas a mano
--     —igual que hoy con las que cuelgan del control—;
--   · cuando la obra se active, dice de qué parte del presupuesto salió cada
--     barra, que es lo que hace falta para colgarla de su agrupación.
--
-- `leads.crono_presupuesto_id` es de qué presupuesto salió, cuando el
-- proyecto tiene varios (la v1, la v2, la que se aprobó).

alter table public.cronograma_actividades add column if not exists presupuesto_capitulo text;
alter table public.leads add column if not exists crono_presupuesto_id bigint
  references public.presupuestos(id) on delete set null;
