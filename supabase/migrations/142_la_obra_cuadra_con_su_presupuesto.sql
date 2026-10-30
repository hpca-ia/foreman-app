-- 142 · La obra cuadra con su presupuesto, al centavo.
--
-- El presupuesto del aeropuerto termina en $172.127,27 y la obra decía
-- $172.127,24. En Plaza Lagos el mismo error va para el otro lado: $198.873,71
-- contra $198.873,72, un centavo de más.
--
-- No es un detalle. Ese es el número que se compara contra el contrato, y uno
-- que no cuadra obliga a explicar algo que no tiene explicación —"son tres
-- centavos de redondeo"— cada vez que alguien lo mira.
--
-- De dónde salen: el presupuesto calcula el IVA UNA VEZ sobre el subtotal, y la
-- obra lo calculaba rubro por rubro, redondeando a dos decimales ciento sesenta
-- y cuatro veces. La suma de los redondeos no es el redondeo de la suma, nunca.
--
-- Se arregla como lo arregla cualquier sistema que factura: repartiendo la
-- diferencia. Los centavos van al rubro más grande de la obra, que es donde
-- menos se notan y donde son más defendibles: tres centavos sobre un rubro de
-- diez mil. De acá en adelante la aplicación lo hace sola al activar una obra.

with papel as (
  select o.id as obra_id,
         -- El total del presupuesto, que es el documento. Si sus rubros ya
         -- traían el IVA adentro, el papel es su subtotal.
         case when p.total > 0 then p.total else p.subtotal end as total
    from public.obras o
    join public.presupuestos p on p.id = o.presupuesto_id
),
obra as (
  select r.obra_id, round(sum(r.total_base), 2) as suma
    from public.obra_rubros r
   where r.origen is distinct from 'orden_cambio'
     and r.anulado_por_oc is null
   group by r.obra_id
),
falta as (
  select p.obra_id, round(p.total - o.suma, 2) as centavos
    from papel p join obra o on o.obra_id = p.obra_id
   where round(p.total - o.suma, 2) <> 0
     -- Una diferencia de más de un dólar no es redondeo: es otra cosa, y
     -- taparla con un ajuste sería esconder el problema de verdad.
     and abs(round(p.total - o.suma, 2)) <= 1
),
elegido as (
  select distinct on (f.obra_id) f.obra_id, r.id as rubro_id, f.centavos
    from falta f
    join public.obra_rubros r
      on r.obra_id = f.obra_id
     and r.origen is distinct from 'orden_cambio'
     and r.anulado_por_oc is null
   order by f.obra_id, abs(r.total_base) desc, r.id
)
update public.obra_rubros r
   set total_base = round(r.total_base + e.centavos, 2)
  from elegido e
 where r.id = e.rubro_id;
