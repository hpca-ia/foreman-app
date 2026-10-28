-- 130 · Un gasto de caja chica pagado con una nota de crédito.
--
-- KYWI nos devolvió $105,06 en dos notas de crédito y con eso se pagaron dos
-- compras posteriores; el resto salió del efectivo de la caja. En la caja eso
-- se veía como si el vale hubiera vuelto en billetes y las compras se hubieran
-- pagado enteras en efectivo: el total daba igual —por eso nunca saltó un
-- descuadre— pero ninguna de las dos líneas decía lo que pasó, y en
-- Proveedores el vale seguía figurando a favor cuando ya se había gastado.
--
-- Acá queda dicho: cuánto de este gasto se pagó con un vale y con cuál. Lo que
-- se pagó con el vale NO salió de la caja, y el vale deja de estar disponible
-- por ese monto.

alter table public.cajas_gastos
  add column if not exists nota_credito_id  bigint references public.obra_facturas(id) on delete set null,
  add column if not exists pagado_con_nota  numeric(12,2);

create index if not exists cajas_gastos_nota_credito_idx
  on public.cajas_gastos(nota_credito_id) where nota_credito_id is not null;

comment on column public.cajas_gastos.pagado_con_nota is
  'Cuánto de este gasto se pagó con una nota de crédito. Ese monto no salió del efectivo de la caja.';
comment on column public.cajas_gastos.nota_credito_id is
  'La nota de crédito con la que se pagó: el gasto de caja chica que la registró, por su factura en el control.';
