-- 098 · Un día reabierto se puede escribir de verdad.
--
-- La 095 agregó reabrir un día del libro. No alcanzaba: la base tiene su propio
-- candado —un trigger de la 054— que rechaza cualquier escritura cuando
--
--     el día no está 'abierto'  O  la fecha es anterior a hoy
--
-- y esa segunda condición se cumple SIEMPRE en un día pasado, lo reabran o no.
-- Así que reabrir cambiaba el estado y la base seguía rechazando todo: las
-- entradas, las fotos, y hasta la observación que deja escrito el motivo de la
-- reapertura. Se veía como "no se guarda nada".
--
-- El candado estaba bien pensado y no se saca: que el libro de ayer no se pueda
-- tocar es lo que lo hace valer como registro, y tenía que vivir en la base y
-- no en la pantalla, porque una regla que solo existe en la pantalla no es una
-- regla. Lo que le faltaba era la excepción: un día que alguien reabrió A
-- PROPÓSITO, con su motivo y su nombre.
--
-- Después de cerrarlo de nuevo, `reabierto_at` sigue cargado —es historia, no
-- un permiso— pero el estado vuelve a 'cerrado' y la primera condición cierra
-- la puerta igual.

create or replace function public.libro_del_dia_abierto() returns trigger
language plpgsql as $$
declare cerrado boolean;
begin
  select d.estado <> 'abierto'
      -- Un día pasado está cerrado, SALVO que alguien lo haya reabierto.
      or (d.fecha < ((now() at time zone 'America/Guayaquil')::date)
          and d.reabierto_at is null)
    into cerrado
  from public.libro_obra_dias d where d.id = new.dia_id;
  if cerrado then
    raise exception 'El libro de ese día está cerrado. Si hay que completarlo, reabrilo primero.';
  end if;
  return new;
end $$;
