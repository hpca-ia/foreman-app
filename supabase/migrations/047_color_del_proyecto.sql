-- 047 · El color vive con el proyecto.
--
-- El color era del proyecto de Ajustes, y los del pipeline —que son la mayoría,
-- y ahora los de verdad— no tenían ninguno: aparecían todos grises. Con esto el
-- color viaja con el proyecto, se elija desde donde se elija.

alter table public.leads add column if not exists color text;

-- Los que ya estaban empatados heredan el color que tenían en Ajustes, para que
-- nadie tenga que volver a elegirlo.
update public.leads l
set color = p.color
from public.proyectos p
where p.lead_id = l.id and l.color is null and p.color is not null;
