-- 180 · Un día reabierto se vuelve a poder escribir.
--
-- La 098 le había puesto al candado del libro su excepción: un día pasado no
-- se toca, SALVO que alguien lo haya reabierto a propósito, con su motivo y su
-- nombre. La 144 —la que deja escribir la jornada anterior hasta el mediodía—
-- reescribió la función entera y esa excepción se quedó afuera. Su propio
-- comentario decía «uno reabierto a propósito sigue reabierto: eso no lo toca
-- esto», y la función que instaló lo tocaba.
--
-- Desde que corrió, el 30 de octubre, reabrir un día cambia el estado y la
-- pantalla lo muestra «Reabierto», con sus casillas, pero la base rechaza cada
-- renglón y cada foto con «El libro de ese día ya está cerrado» —a quien sea,
-- también a quien lo reabrió—. Y rechaza además la observación que deja
-- escrito el motivo de la reapertura. El 12 de noviembre había once días del
-- Aeropuerto reabiertos y ninguno se podía completar.
--
-- La regla, entera, en un solo lugar:
--
--   · Un día que no está 'abierto' —cerrado o aprobado— no se escribe.
--   · Uno abierto y REABIERTO se escribe, sea de la fecha que sea, hasta que
--     se lo vuelva a cerrar. `reabierto_at` queda cargado después de cerrarlo
--     —es historia, no un permiso—, pero ahí manda el estado.
--   · Uno abierto y sin reabrir se escribe el mismo día, y la jornada anterior
--     hasta las 12:00 del mediodía.
--
-- No toca ninguna fila: cambia solo la función del disparador. Se puede correr
-- más de una vez.

create or replace function public.libro_del_dia_abierto() returns trigger
language plpgsql as $$
declare
  ahora timestamp := now() at time zone 'America/Guayaquil';
  cerrado boolean;
begin
  select d.estado <> 'abierto'
      -- Sin reabrir, manda la fecha.
      or (d.reabierto_at is null and (
            -- Más viejo que ayer: cerrado, sin vueltas.
            d.fecha < (ahora::date - 1)
            -- Ayer: abierto hasta el mediodía de hoy.
            or (d.fecha = (ahora::date - 1) and extract(hour from ahora) >= 12)))
    into cerrado
  from public.libro_obra_dias d where d.id = new.dia_id;
  if cerrado then
    raise exception 'El libro de ese día está cerrado. La jornada anterior se escribe hasta las 12:00; para completar un día más viejo hay que reabrirlo.';
  end if;
  return new;
end $$;
