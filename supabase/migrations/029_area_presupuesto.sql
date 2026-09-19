-- El área del proyecto, escrita a mano, para dar el costo directo por m².
-- Es parte de cómo se vende: "sale a tanto el metro, antes de honorarios e
-- IVA". Con ella el presupuesto lo calcula y el documento lo dice en sus notas.
alter table public.presupuestos add column if not exists area_m2 numeric;
