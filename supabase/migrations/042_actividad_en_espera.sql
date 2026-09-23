-- 042 · Actividades que están esperando a alguien.
--
-- No toda actividad es una tarea con fecha. "Solicitar el permiso" se hace una
-- vez y después se espera: no se sabe cuándo lo dan, no hay a quién ponerle la
-- fecha, y marcarla como hecha sería mentir —el permiso todavía no está—.
--
-- Por eso una actividad puede estar en espera: ya se hizo lo que dependía de
-- nosotros y ahora depende de un tercero. Se ve distinto de lo pendiente, que
-- es lo que sí hay que ponerse a hacer.

alter table public.lead_etapa_items add column if not exists espera      boolean not null default false;
alter table public.lead_etapa_items add column if not exists espera_nota text;
