-- 140 · Los adicionales de una orden entran al control con IVA.
--
-- Cada documento en su base, y las dos están bien:
--
--   · EL CONTROL DE PRESUPUESTO maneja IVA. Sus rubros están cargados con el
--     impuesto adentro y es contra eso que se descuenta lo que se gasta.
--   · LA ORDEN DE CAMBIO se arma sin IVA: así se cotiza, así se mide su margen
--     y así va el documento que firma el cliente, con el IVA al pie.
--
-- Lo que estaba mal era el puente. Al aprobarse, la orden metía sus rubros al
-- control con el monto de la línea tal cual —sin IVA— mientras todo lo que
-- había alrededor lo tenía adentro. El adicional entraba un 15% corto, el
-- contrato vigente quedaba corto con él, y sumar los dos tipos de rubro daba un
-- número que no cuadra con ningún papel.
--
-- De acá en adelante entran con IVA. Y los que ya entraron se corrigen, porque
-- si no habría que compensarlos al dibujarlos —y una compensación que se olvida
-- de distinguir los viejos de los nuevos termina contando el impuesto dos
-- veces, que es peor que el error que vino a arreglar.
--
-- Lo que cambia hoy, exacto:
--   OC-01 Diners Aéreo      $10.877,06 → $12.508,62
--   OC-01 Diners Plaza Lagos $1.726,64 →  $1.985,64
--
-- La orden NO cambia: lo que ella dice sigue siendo $10.877,06 sin IVA, que es
-- lo que el cliente firmó. Lo que cambia es con cuánto entra al control.

update public.obra_rubros
   set total_base      = round(total_base * (1 + coalesce(iva_pct, 0) / 100), 2),
       precio_unitario = round(precio_unitario * (1 + coalesce(iva_pct, 0) / 100), 4)
 where origen = 'orden_cambio'
   and coalesce(iva_pct, 0) > 0
   -- Solo los que ya estaban: los que entren después de esta migración ya
   -- vienen con el IVA puesto por la aplicación.
   and created_at < now();
