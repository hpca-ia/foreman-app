-- 113 · La revisión de la factura en el SRI, guardada con la factura.
--
-- Johanna y las residentes reciben facturas todo el día, y la revisión que
-- importa no es la de los números: es si el comprobante existe, si está
-- autorizado, si está a nombre de la empresa, y si el proveedor estaba
-- obligado a imprimir una leyenda que no imprimió. Eso hoy se hace entrando a
-- dos páginas del SRI, copiando el RUC, copiando la clave de acceso y
-- comparando a ojo —por factura—. Con cuarenta al mes no lo hace nadie, y las
-- que no se revisan son justo las que después el SRI no acepta como gasto.
--
-- Se guarda con la factura y no en un informe aparte porque la pregunta
-- aparece siempre en el mismo lugar: cuando alguien la va a pagar.

alter table public.obra_facturas
  -- Los 49 dígitos impresos debajo del código de barras. Es la llave de todo:
  -- con ella el SRI devuelve el XML autorizado, que es el documento legal —el
  -- papel es solo una representación impresa—.
  add column if not exists clave_acceso    text;
alter table public.obra_facturas
  -- ok · aviso · grave. Lo que se mira de un vistazo en la lista.
  add column if not exists sri_estado      text;
alter table public.obra_facturas
  add column if not exists sri_revisado_at timestamptz;
alter table public.obra_facturas
  -- Qué encontró, con el texto listo para leer. Se guarda entero: dentro de un
  -- año nadie va a volver a consultar al SRI por una factura de hoy.
  add column if not exists sri_hallazgos   jsonb;

create index if not exists obra_facturas_sri on public.obra_facturas (sri_estado) where sri_estado is not null;

comment on column public.obra_facturas.clave_acceso is
  'Los 49 dígitos del comprobante electrónico. Con esto el SRI devuelve el XML autorizado.';
comment on column public.obra_facturas.sri_estado is
  'ok, aviso o grave. Grave quiere decir que esa factura no sustenta el gasto.';
