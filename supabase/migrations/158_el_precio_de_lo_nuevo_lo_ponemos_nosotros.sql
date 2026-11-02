-- 158 · El precio de lo nuevo lo ponemos nosotros.
--
-- Una diferencia que va a la orden de cambio necesita un precio, y de dónde
-- sale no es lo mismo según qué sea:
--
--   · SI EL RUBRO YA ESTÁ EN EL CONTRATO, el precio es el del contrato. No se
--     discute: el cliente lo firmó. Eso ya lo hace la aplicación sola.
--   · SI ES TRABAJO NUEVO, no hay precio acordado y hay que ponerle uno. Hasta
--     hoy la única forma era costo más un porcentaje igual para todos, y eso
--     casi nunca es lo que uno cobraría: un andamio y una instalación eléctrica
--     no llevan el mismo margen.
--
-- Y HAY UN TERCER CAMINO, que es el que se usa de verdad en obra: tomar el
-- precio de un rubro parecido que ya está en el contrato. Si el cliente aceptó
-- $12 el metro de resane, el resane del otro ambiente va a $12 —no a costo más
-- veinte— y además la orden se defiende sola: el precio ya lo había aceptado.
--
-- Se guarda el precio y de qué rubro se tomó, para poder explicarlo después:
-- "este precio es el del rubro 4.12, que usted ya aprobó" es una frase que
-- cierra una discusión, y sin el dato no se puede decir.

alter table public.obra_analisis_lineas add column if not exists precio_unitario numeric;
alter table public.obra_analisis_lineas add column if not exists precio_de_rubro bigint
  references public.obra_rubros(id) on delete set null;

comment on column public.obra_analisis_lineas.precio_unitario is
  'El precio al cliente que se le pone a esta diferencia en la orden de cambio. Vacío en lo que ya tiene precio en el contrato: ahí manda el del contrato.';
comment on column public.obra_analisis_lineas.precio_de_rubro is
  'De qué rubro del contrato se tomó ese precio, cuando se eligió uno parecido en vez de poner un número nuevo. Sirve para defender la orden: el cliente ya aceptó ese precio.';
