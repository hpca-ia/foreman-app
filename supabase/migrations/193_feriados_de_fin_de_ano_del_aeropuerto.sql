-- 193 · Aeropuerto: el 24 y el 25 de diciembre y el 1 de enero no se trabaja.
--
-- Hernán, 23/11/2026, ajustando el cronograma de Diners Aéreo GYE para que la
-- entrega entre hasta el 26 de diciembre: «no se trabaja ni 24 ni 25 ni 1ro».
--
-- El cronograma de esa obra tiene jornada de siete días y ningún feriado
-- cargado, así que ponía trabajos —la revisión de pendientes, la limpieza
-- final— justo en esos días, y prometía una entrega que cuenta con ellos.
--
-- Los días que no se trabaja van en `leads.crono_feriados`, que el cálculo ya
-- lee; lo que no hay todavía es una pantalla para cargarlos, y por eso entran
-- por acá. Se suman a los que hubiera, sin repetir. Se puede correr más de
-- una vez.

update public.leads
   set crono_feriados = (
     select jsonb_agg(dia order by dia)
       from (
         select distinct dia
           from jsonb_array_elements_text(
                  coalesce(crono_feriados, '[]'::jsonb) || '["2026-12-24", "2026-12-25", "2027-01-01"]'::jsonb
                ) as t(dia)
       ) sin_repetir
   )
 where id = 15;
