-- 031 · Los grupos de rubros repetidos que ya se decidió dejar separados.
--
-- Al revisar un presupuesto, FOREMAN agrupa los rubros que parecen repetidos.
-- Cuando se decide que dos de esos no son el mismo trabajo, esa decisión tiene
-- que quedarse: sin esta columna se guarda solo en el navegador de quien la
-- tomó, y en otro equipo vuelven a aparecer.
--
-- Guarda una lista de claves de grupo, cada una los ids de los rubros del
-- grupo: ["124-988", "1301-1422-1500"].

alter table public.presupuestos add column if not exists separados jsonb;
