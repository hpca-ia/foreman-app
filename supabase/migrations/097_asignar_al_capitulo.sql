-- 097 · Cargar una factura al capítulo entero, sin repartirla.
--
-- Hoy una factura se asigna a un rubro —el monto va entero ahí— o a una
-- agrupación, y entonces se REPARTE A PRORRATA entre todos sus rubros. El
-- segundo caso es útil cuando de verdad no se sabe, pero muchas veces sí se
-- sabe algo intermedio: la factura es de ALBAÑILERÍA y no de un rubro en
-- particular.
--
-- Prorratear ahí es inventar precisión. La factura de $4.000 del maestro
-- albañil no es "$180 de mampostería, $310 de enlucido y $94 de mochetas":
-- es $4.000 de albañilería. Repartirla hace que cada rubro muestre un avance
-- que nadie puede explicar, y después alguien compara un rubro con su
-- presupuesto y el número no significa nada.
--
-- Con el capítulo como destino, el gasto suma donde corresponde —el capítulo— y
-- los rubros quedan en cero, que es la verdad: no se sabe cuánto fue de cada
-- uno. Un cero honesto vale más que un reparto inventado.

alter table public.obra_asignaciones add column if not exists capitulo text;

create index if not exists obra_asignaciones_capitulo on public.obra_asignaciones (capitulo);

comment on column public.obra_asignaciones.capitulo is
  'Destino alternativo a rubro o agrupación: el capítulo entero, sin repartir entre sus rubros.';
