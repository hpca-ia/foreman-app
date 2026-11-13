-- 181 · El historial de cada tarea.
--
-- Un punto del checklist de un lead es una gestión: «MADEVAL» quiere decir
-- contactarlos, fijar la reunión, tenerla y recibir la cotización. Para leer
-- después qué pasó con ESE punto hace falta que lo que la bitácora del
-- proyecto anota sola —se le encargó a alguien, se le puso fecha, quedó
-- esperando a un tercero, se hizo— sepa de qué tarea habla. Hasta ahora lo
-- decía solo en el texto, con el título entre comillas.
--
--   lead_movimientos.task_id   de qué tarea es el renglón, si es de una sola.
--
-- Si la tarea se borra el renglón queda en la bitácora del proyecto, que es
-- su historia; solo pierde el enlace.
--
-- LO QUE YA ESTABA ESCRITO se enlaza cuando el renglón nombra, entre comillas
-- o como «Hecho: …», a UNA sola tarea de ese proyecto. Si nombra a dos con el
-- mismo título, o a una que ya se borró, se deja sin enlazar: mejor un
-- historial corto que uno con renglones de otra tarea.
--
-- No borra ni cambia ningún texto. Se puede correr más de una vez.

alter table public.lead_movimientos
  add column if not exists task_id bigint references public.tasks(id) on delete set null;

comment on column public.lead_movimientos.task_id is
  'De qué tarea habla este renglón de la bitácora, cuando es de una sola. De ahí sale el historial de la tarea.';

create index if not exists lead_movimientos_task_id_idx
  on public.lead_movimientos (task_id) where task_id is not null;

update public.lead_movimientos m
   set task_id = x.task_id
  from (
    select mm.id, min(t.id) as task_id
      from public.lead_movimientos mm
      join public.tasks t
        on t.lead_id = mm.lead_id
       and t.compra_id is null
       and (position('"' || t.title || '"' in mm.detalle) > 0 or mm.detalle = 'Hecho: ' || t.title)
     where mm.task_id is null
       and mm.automatico
       and mm.tipo in ('actividad', 'nota')
     group by mm.id
    having count(*) = 1
  ) x
 where x.id = m.id;
