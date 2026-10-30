-- 141 · La reducción es una línea de la orden, no un tachón en el presupuesto.
--
-- El presupuesto original es lo que se firmó y no se toca. Una orden de cambio
-- no lo edita: le suma sus adiciones y le resta sus reducciones, y las dos
-- cosas son líneas DE LA ORDEN.
--
-- Lo que hacía hasta ahora era otra cosa: la reducción iba a buscar el rubro
-- original del contrato y lo TACHABA. Tres problemas, y el tercero es el que se
-- ve:
--
--   · Editaba el presupuesto firmado. Ese documento tiene que poder leerse
--     dentro de dos años tal como se aprobó.
--   · Sacaba el rubro ENTERO aunque la orden redujera una parte. Reducir 20 m²
--     de 95 borraba los 95.
--   · Y en el control, el capítulo de la orden mostraba solo las adiciones. En
--     Diners Aéreo eso es ADICIONALES · OC-01 por $12.508,62 cuando esa orden
--     movió $3.849,94: la reducción estaba, pero como un rubro tachado en otro
--     capítulo, que nadie ata a la orden.
--
-- Ahora la reducción entra como un renglón más de la orden, en negativo y en el
-- mismo capítulo que sus adiciones. El total de la obra da lo mismo —no se
-- mueve un peso— pero por fin se puede leer: la orden dice lo que suma, lo que
-- resta, y lo que deja.

-- 1. El rubro que una orden había tachado vuelve al presupuesto, que es donde
--    siempre estuvo: lo que lo compensa es la línea en negativo de la orden.
update public.obra_rubros
   set anulado_por_oc = null
 where anulado_por_oc is not null;

-- 2. Y la reducción de esa orden entra como su propio renglón, en negativo y
--    con el IVA del control, igual que sus adiciones.
insert into public.obra_rubros
  (obra_id, numero, capitulo, capitulo_orden, orden, descripcion, unidad, cantidad,
   precio_unitario, total_base, iva_pct, origen, orden_cambio_id)
select o.obra_id,
       9000 + o.numero * 100 + 90,
       'ADICIONALES · ' || coalesce(o.codigo, 'OC-' || lpad(o.numero::text, 2, '0')),
       9000 + o.numero,
       9000000 + o.numero * 1000 + 90,
       '(–) ' || l.descripcion || '  ·  ' || coalesce(o.codigo, 'OC-' || lpad(o.numero::text, 2, '0')),
       coalesce(l.unidad, ''),
       l.cantidad,
       -round(l.precio_unitario * (1 + coalesce(r.iva_pct, 0) / 100), 4),
       -round(l.cantidad * l.precio_unitario * (1 + coalesce(r.iva_pct, 0) / 100), 2),
       coalesce(r.iva_pct, 0),
       'orden_cambio',
       o.id
  from public.orden_cambio_lineas l
  join public.ordenes_cambio o on o.id = l.orden_id
  join public.obra_rubros r on r.id = l.obra_rubro_id
 where l.tipo = 'quita'
   and l.obra_rubro_id is not null
   and o.estado = 'aprobada'
   and not exists (
     select 1 from public.obra_rubros x
      where x.orden_cambio_id = o.id and x.total_base < 0
   );

comment on column public.obra_rubros.anulado_por_oc is
  'Quedó de cuando una reducción tachaba el rubro original. Desde la 141 una reducción es una línea en negativo de la orden y el presupuesto firmado no se toca.';
