-- El presupuesto original de cada obra, tal como vino.
--
-- Al importar, el presupuesto se parte en rubros y después en agrupaciones,
-- y ya no había forma de volver a ver el documento como lo mandó el cliente o
-- el contratista. Ahora se guarda el archivo y los totales que declaraba, para
-- poder mostrarlo tal cual y comparar contra lo que quedó en FOREMAN.
--
-- El IVA también queda registrado en la obra: el control se hace con IVA
-- porque las facturas lo traen, y hay que saber si la línea base se cargó con
-- IVA o si se le sumó al importar.

alter table public.obras add column if not exists archivo_presupuesto_url    text;
alter table public.obras add column if not exists archivo_presupuesto_nombre text;
alter table public.obras add column if not exists subtotal_excel             numeric(14,2);  -- el SUBTOTAL que decía el archivo
alter table public.obras add column if not exists total_excel                numeric(14,2);  -- el TOTAL que decía el archivo
alter table public.obras add column if not exists iva_incluido               boolean;        -- ¿el archivo ya traía IVA?
alter table public.obras add column if not exists iva_pct                    numeric(5,2);   -- IVA sumado al importar
