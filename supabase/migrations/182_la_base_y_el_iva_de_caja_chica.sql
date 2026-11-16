-- 182 · La base y el IVA de las facturas de caja chica, sacados de sus renglones.
--
-- Caja chica leía solo el total y lo guardaba en el control como «base 15%»
-- con el IVA en cero: las 163 facturas que entraron por ahí estaban así. Al
-- control de gastos no le cambiaba nada —cuenta el total—, pero el libro de
-- facturas decía que no se pagó IVA, y los renglones que lee NOVA, que vienen
-- sin IVA, parecían quedarse cortos: Hernán lo vio el 16/11/2026 en la de Kywi
-- del Aeropuerto, $124,63 + IVA $18,69 = $143,32, «dice que hay un faltante...
-- no es así, es el IVA».
--
-- Desde ahora caja chica guarda la base y el IVA del papel. Esto arregla las
-- que ya estaban, con los renglones que NOVA ya leyó de cada una, sin volver a
-- leer nada. Decide la aritmética, no la lectura:
--
--   · Cada renglón va a su tarifa: la que leyó NOVA; si no leyó ninguna, 15%.
--   · Las bases más su IVA (15% y 5%) tienen que dar el total de la factura,
--     con dos centavos de tolerancia por los redondeos del proveedor.
--   · El centavo que sobre va al IVA: base más IVA da el total exacto, que es
--     lo que se pagó.
--
-- La que no cuadra —una propina, un renglón que no se leyó, una tarifa rara—
-- queda como estaba. El 16/11/2026 se corregían 118, todas del Aeropuerto:
-- $3.538,50 en facturas con $320,71 de IVA. Quedaban 45 como estaban.
--
-- Solo toca facturas de caja chica que siguen «base 15% = total, IVA 0»: una
-- que alguien ya corrigió en el control no se toca. No cambia ningún total ni
-- ninguna asignación. Se puede correr más de una vez.

with r as (
  select i.factura_id,
    abs(round(sum(case when coalesce(i.iva_tasa, 15) = 15 then i.total else 0 end)::numeric, 2)) as s15,
    abs(round(sum(case when i.iva_tasa = 5 then i.total else 0 end)::numeric, 2)) as s5,
    abs(round(sum(case when i.iva_tasa = 0 then i.total else 0 end)::numeric, 2)) as s0,
    count(*) filter (where i.iva_tasa is not null and i.iva_tasa not in (0, 5, 15)) as raras
  from public.obra_factura_items i
  group by i.factura_id
), c as (
  select f.id, sign(f.total) as signo, abs(f.total)::numeric as t, r.s0, r.s5, r.s15
  from public.obra_facturas f
  join r on r.factura_id = f.id
  where f.origen = 'caja_chica'
    and f.total <> 0
    and coalesce(f.iva, 0) = 0
    and coalesce(f.subtotal_0, 0) = 0
    and coalesce(f.subtotal_5, 0) = 0
    and abs(coalesce(f.subtotal_15, 0) - f.total) <= 0.01
    and r.raras = 0
    and r.s0 + r.s5 + r.s15 > 0
    and abs(round(r.s15 * 1.15 + r.s5 * 1.05 + r.s0, 2) - abs(f.total)) <= 0.02
)
update public.obra_facturas f set
  subtotal_0  = c.signo * c.s0,
  subtotal_5  = c.signo * c.s5,
  subtotal_15 = c.signo * c.s15,
  iva         = c.signo * round(c.t - c.s0 - c.s5 - c.s15, 2)
from c
where c.id = f.id;
