-- 137 · Borrar un gasto de una orden no se lleva lo que ya se confirmó.
--
-- La 135 ató cada fila de beneficios a su gasto con ON DELETE CASCADE: borrar
-- el gasto borraba la fila, en el estado que estuviera. Eso contradice la
-- regla de los beneficios —LO CONFIRMADO NO SE TOCA: es una compra que ya
-- pasó—. Alguien que limpia un gasto mal cargado en la orden se llevaba, sin
-- saberlo, la compra confirmada de la obra.
--
-- Con SET NULL la fila confirmada se queda, sin el enlace. La previsto se va
-- igual: la sincronización de beneficios borra lo previsto de una orden que
-- ya no tiene ni partida ni gasto que lo pida.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.obra_beneficios'::regclass
      and c.contype = 'f'
      and a.attname = 'orden_cambio_gasto_id'
  loop
    execute format('alter table public.obra_beneficios drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.obra_beneficios
  add constraint obra_beneficios_orden_cambio_gasto_id_fkey
  foreign key (orden_cambio_gasto_id) references public.orden_cambio_gastos(id) on delete set null;
