-- 116 · El papel con el que se hizo la cuenta.
--
-- Un beneficio es una afirmación sobre plata: "esto se compró $400 abajo de lo
-- presupuestado". Tres meses después, cuando el proveedor factura otra cosa o
-- dice que esa proforma nunca existió, lo único que sostiene la afirmación es
-- el archivo con el que se hizo la cuenta.
--
-- Se guarda el archivo tal como se subió —el Excel, el PDF, la foto— y no una
-- interpretación de él. Lo que se discute con el proveedor es su papel, no
-- nuestra lectura de su papel.

alter table public.obra_beneficios
  add column if not exists archivo_path text;
alter table public.obra_beneficios
  add column if not exists archivo_nombre text;

comment on column public.obra_beneficios.archivo_path is
  'Ruta en el depósito task-files de la proforma con la que se cargó este beneficio. El respaldo para discutir con el proveedor.';
