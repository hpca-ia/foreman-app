-- 091 · El plazo por fecha, y si se trabaja fin de semana.
--
-- El plazo se escribía en MESES: arranca el 3 de marzo y dura 8. Pero un
-- contrato de obra casi nunca dice eso —dice "hasta el 15 de noviembre"—, y
-- traducir esa fecha a meses a ojo mete días de diferencia justo en el número
-- contra el que se mide todo el cronograma. Ahora se puede escribir la fecha de
-- terminación y los meses salen de ella.
--
-- Los dos conviven: hay obras que se contratan a plazo ("ocho meses desde la
-- orden de inicio") y obras que se contratan a fecha. Manda la fecha cuando
-- está, porque es la que alguien escribió a mano.
--
-- Y LOS DÍAS QUE SE TRABAJAN. La columna `crono_laborables` ya existe —la usa
-- el motor del cronograma desde siempre— pero nunca hubo cómo cambiarla desde
-- la pantalla, así que toda obra quedaba en lunes a sábado. El `alter` de abajo
-- no hace nada donde ya está; lo que cambia es que ahora se puede escribir.
-- La diferencia no es cosmética —entre trabajar seis días y trabajar cinco hay
-- un 17% de calendario, y en una obra de ocho meses eso es más de un mes—. Se
-- guarda acá, en el proyecto, porque es una decisión de la obra y no de quien
-- mira la pantalla.

alter table public.leads add column if not exists crono_fin date;

-- Qué días de la semana se trabaja: 0 es domingo, 6 es sábado. Nulo significa
-- lo de siempre en obra acá —lunes a sábado—, que es lo que ya asumía el
-- motor; así ninguna obra existente cambia de fechas al correr esto.
alter table public.leads add column if not exists crono_laborables int[];

comment on column public.leads.crono_fin is
  'Fecha de terminación del contrato. Cuando está, manda sobre crono_meses.';
comment on column public.leads.crono_laborables is
  'Días de la semana que se trabaja, 0=domingo. Nulo = lunes a sábado.';
