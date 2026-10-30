-- 144 · El libro de la jornada anterior se escribe hasta el mediodía.
--
-- Hay obras que se trabajan de noche. El residente que fundió hasta las dos de
-- la mañana no puede tener que escribir el libro antes de irse a dormir: lo
-- escribe cuando se levanta, y eso sigue siendo el mismo día de trabajo visto
-- desde el papel.
--
-- Y ACÁ HABÍA ADEMÁS UN DESACUERDO ENTRE LA APLICACIÓN Y LA BASE.
--
-- La jornada de obra va de 6 a 6 —eso vive en la aplicación desde hace tiempo,
-- justamente para que lo que pasa de noche caiga en el día que le corresponde—
-- pero este disparador cierra todo día anterior a HOY, a secas. O sea que a la
-- una de la mañana la pantalla decía "jornada del día anterior, abierta" y la
-- base rechazaba cada renglón con "El libro de ese día ya está cerrado". Lo
-- que no se puede escribir cuando pasa termina escrito de memoria dos días
-- después, que es lo único que un libro de obra no puede permitirse.
--
-- La regla, una sola y en los dos lados: se escribe la jornada en curso, y la
-- anterior hasta las 12:00 del mediodía. Un día cerrado a mano sigue cerrado, y
-- uno reabierto a propósito sigue reabierto: eso no lo toca esto.

create or replace function public.libro_del_dia_abierto() returns trigger
language plpgsql as $$
declare
  ahora timestamp := now() at time zone 'America/Guayaquil';
  cerrado boolean;
begin
  select d.estado <> 'abierto'
      -- Más viejo que ayer: cerrado, sin vueltas.
      or d.fecha < (ahora::date - 1)
      -- Ayer: abierto hasta el mediodía de hoy.
      or (d.fecha = (ahora::date - 1) and extract(hour from ahora) >= 12)
    into cerrado
  from public.libro_obra_dias d where d.id = new.dia_id;
  if cerrado then
    raise exception 'El libro de ese día ya está cerrado. La jornada anterior se escribe hasta las 12:00.';
  end if;
  return new;
end $$;
