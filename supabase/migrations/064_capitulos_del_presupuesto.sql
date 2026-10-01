-- 064 · Los capítulos de un presupuesto, guardados.
--
-- Hasta ahora los capítulos no existían en ningún lado: se deducían del orden
-- de cada rubro (capítulo × 1000 + posición). Funciona mientras cada capítulo
-- tenga al menos un rubro, y se cae justo cuando no:
--
--   · Se crea un capítulo para empezar a llenarlo → como todavía no tiene
--     rubros, no hay de dónde deducirlo y desaparece en el primer refresco.
--   · Se vacía un capítulo moviendo sus rubros a otro → se borra solo.
--
-- Guardar la lista completa —nombre y orden— hace que el capítulo sea una cosa
-- del presupuesto y no una consecuencia de sus rubros. Va como jsonb en la
-- misma fila y no en una tabla aparte: es una lista corta que siempre se lee
-- entera junto con su presupuesto, y una tabla obligaría a una consulta más
-- para algo que nunca se consulta solo.
--
-- Lo de antes sigue sirviendo de respaldo: si esta columna está vacía —un
-- presupuesto viejo—, los capítulos se siguen deduciendo de los rubros.

alter table public.presupuestos add column if not exists capitulos jsonb;
