-- 143 · Los honorarios entran al presupuesto y, con él, a la obra.
--
-- Al pie no viajan. A la obra van los RUBROS, y un honorario calculado al pie
-- no es un rubro: el contrato de Diners Aéreo entró al control por $172.127,27
-- cuando el presupuesto, con su 10% de administración, son $189.340,00.
-- Faltaban $17.212,73 que sí se le cobran al cliente y que ningún número de la
-- obra conocía — ni el avance, ni el saldo, ni lo que queda por planillar.
--
-- Acá se hace lo que de ahora en más hace el botón, para los presupuestos que
-- ya estaban: el honorario se convierte en un renglón de su propio capítulo,
-- deja de sumarse al pie —el mismo monto en dos lugares se cobra dos veces— y
-- baja a la obra como cualquier otro rubro, con el IVA del control.
--
-- El cliente paga lo mismo. Cambia dónde está, no cuánto es.

-- 1. El renglón, en su capítulo, calculado sobre el costo directo de verdad
--    (la suma de los rubros, no el subtotal guardado).
with base as (
  select p.id,
         coalesce(p.honorarios, case when coalesce(p.honorarios_pct, 0) > 0
           then jsonb_build_array(jsonb_build_object('nombre', 'Honorarios', 'tipo', 'pct', 'valor', p.honorarios_pct))
           else '[]'::jsonb end) as lineas,
         (select round(coalesce(sum(i.total), 0), 2) from public.presupuesto_items i where i.presupuesto_id = p.id) as directo,
         (select coalesce(max(i.orden), 0) from public.presupuesto_items i where i.presupuesto_id = p.id) as ultimo
    from public.presupuestos p
   where jsonb_typeof(coalesce(p.honorarios, '[]'::jsonb)) = 'array'
), lineas as (
  select b.id, b.directo, b.ultimo,
         h.valor as fila,
         row_number() over (partition by b.id order by h.orden) as k,
         coalesce(h.valor ->> 'nombre', 'Honorarios') as nombre,
         coalesce(h.valor ->> 'tipo', 'pct') as tipo,
         coalesce((h.valor ->> 'valor')::numeric, 0) as valor
    from base b, jsonb_array_elements(b.lineas) with ordinality as h(valor, orden)
   where b.directo > 0
)
insert into public.presupuesto_items
  (presupuesto_id, capitulo, descripcion, unidad, cantidad, precio_unitario, total, orden)
select l.id,
       'HONORARIOS',
       case when l.tipo = 'monto' then l.nombre
            else l.nombre || ' (' || rtrim(rtrim(trim(to_char(l.valor, 'FM999990.99')), '0'), '.') || ' %)' end,
       'glb', 1,
       round(case when l.tipo = 'monto' then l.valor else l.directo * l.valor / 100 end, 2),
       round(case when l.tipo = 'monto' then l.valor else l.directo * l.valor / 100 end, 2),
       l.ultimo + l.k
  from lineas l
 where round(case when l.tipo = 'monto' then l.valor else l.directo * l.valor / 100 end, 2) <> 0
   -- Si ya tiene su capítulo, no se duplica.
   and not exists (select 1 from public.presupuesto_items x
                    where x.presupuesto_id = l.id and x.capitulo = 'HONORARIOS');

-- 2. Y se van del pie, con los totales recalculados sobre el nuevo directo.
update public.presupuestos p
   set honorarios = '[]'::jsonb,
       honorarios_pct = 0,
       honorarios_monto = 0,
       subtotal = d.directo,
       iva_monto = round(d.directo * coalesce(p.iva_pct, 0) / 100, 2),
       total = round(d.directo * (1 + coalesce(p.iva_pct, 0) / 100), 2)
  from (select i.presupuesto_id, round(sum(i.total), 2) as directo
          from public.presupuesto_items i group by i.presupuesto_id) d
 where d.presupuesto_id = p.id
   and exists (select 1 from public.presupuesto_items x
                where x.presupuesto_id = p.id and x.capitulo = 'HONORARIOS')
   and (coalesce(p.honorarios_pct, 0) > 0 or jsonb_array_length(coalesce(p.honorarios, '[]'::jsonb)) > 0);

-- 3. Y a la obra, con el IVA del control, como cualquier otro rubro.
insert into public.obra_rubros
  (obra_id, numero, capitulo, capitulo_orden, orden, descripcion, unidad, cantidad,
   precio_unitario, total_base, iva_pct, presupuesto_item_id)
select o.id,
       (select coalesce(max(r.numero), 0) from public.obra_rubros r where r.obra_id = o.id) + row_number() over (partition by o.id order by i.orden),
       i.capitulo,
       (select coalesce(max(r.capitulo_orden), 0) from public.obra_rubros r where r.obra_id = o.id) + 1,
       (select coalesce(max(r.orden), 0) from public.obra_rubros r where r.obra_id = o.id) + row_number() over (partition by o.id order by i.orden),
       i.descripcion, i.unidad, i.cantidad,
       round(i.precio_unitario * (1 + coalesce(iva.pct, 0) / 100), 4),
       round(i.total * (1 + coalesce(iva.pct, 0) / 100), 2),
       coalesce(iva.pct, 0),
       i.id
  from public.obras o
  join public.presupuesto_items i on i.presupuesto_id = o.presupuesto_id and i.capitulo = 'HONORARIOS'
  left join lateral (
    select r.iva_pct as pct from public.obra_rubros r
     where r.obra_id = o.id and r.iva_pct is not null limit 1
  ) iva on true
 where not exists (
   select 1 from public.obra_rubros r where r.obra_id = o.id and r.presupuesto_item_id = i.id
 );
