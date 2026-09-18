-- Los honorarios de un presupuesto dejan de ser un solo porcentaje.
--
-- Hay obras que cobran honorarios de administración, otras de diseño
-- arquitectónico, otras los dos y otras ninguno; unos van como porcentaje del
-- costo directo y otros como monto fijo. Cada presupuesto guarda su lista:
--   [{ "nombre": "Honorarios de administración", "tipo": "pct", "valor": 10 },
--    { "nombre": "Honorarios de diseño arquitectónico", "tipo": "monto", "valor": 5000 }]
alter table public.presupuestos add column if not exists honorarios jsonb;

-- Los que ya tenían un porcentaje lo conservan, con el nombre de siempre.
update public.presupuestos
   set honorarios = jsonb_build_array(jsonb_build_object('nombre', 'Honorarios', 'tipo', 'pct', 'valor', honorarios_pct))
 where honorarios is null and coalesce(honorarios_pct, 0) > 0;
