-- 070 · La lista de proveedores se llena con lo que ya se compró.
--
-- La tabla existe desde la 016 pero solo la alimentaba el módulo de
-- presupuestos, así que el autocompletado arrancaría casi vacío: sugeriría
-- nada y la gente seguiría tecleando, que es de donde salen "Ferretería Kiwy",
-- "kiwy" y "FERRETERIA KYWI" como tres proveedores distintos.
--
-- Acá se la siembra con todo lo que ya se le compró a alguien: los gastos de
-- caja chica, las facturas del control de obra, las compras concretadas y las
-- proformas que subieron los residentes. Son cientos de nombres reales, que es
-- justo lo que hace que la primera sugerencia sirva.
--
-- No se deduplica nada en esta migración, a propósito. "Comercial Kiwy" y
-- "Ferretería Kiwy" pueden ser dos negocios de dos hermanos, y juntarlos con
-- un UPDATE masivo mete la plata de uno adentro del otro sin que nadie lo
-- mire. La app los detecta y los muestra; unirlos lo decide una persona.
--
-- El RUC se toma cuando lo hay: es la identidad de verdad y lo que permite
-- que la próxima comparación sea exacta en vez de parecida.

insert into public.proveedores (nombre, ruc)
select nombre, max(ruc) as ruc
  from (
    select btrim(proveedor) as nombre, nullif(btrim(ruc), '') as ruc
      from public.cajas_gastos
     where coalesce(btrim(proveedor), '') <> ''

    union all

    select btrim(razon_social), nullif(btrim(ruc), '')
      from public.obra_facturas
     where coalesce(btrim(razon_social), '') <> ''

    union all

    select btrim(proveedor), null
      from public.compras_solicitudes
     where coalesce(btrim(proveedor), '') <> ''

    union all

    select btrim(proveedor), null
      from public.compras_adjuntos
     where coalesce(btrim(proveedor), '') <> ''
  ) as todo
 group by nombre
on conflict (nombre) do nothing;

-- Buscar por RUC tiene que ser barato: es la comparación que corre cada vez
-- que NOVA lee una factura o una proforma.
create index if not exists proveedores_por_ruc on public.proveedores (ruc);
