-- 154 · El descuento ofrecido se anota, y hay que acordarse de pedirlo.
--
-- Muchas proformas suman los renglones y después restan abajo un "descuento
-- especial", un "descuento comercial" o un "dto. por volumen". Esa plata es
-- nuestra y es de lo más concreto que trae el papel: no depende de negociar
-- nada, ya está ofrecida por escrito.
--
-- Y SE PIERDE DOS VECES. La primera, al leer: la línea empieza con "descuento"
-- y el filtro que saca subtotales y totales la descartaba junto con ellos. La
-- segunda, al facturar: el proveedor manda la factura a precio de lista, nadie
-- se acuerda del descuento que había ofrecido en la proforma, y se paga de más.
--
-- Repartirlo entre los renglones —que fue el primer intento— arregla la mitad
-- mala: cada costo queda diciendo un precio que no figura en ningún papel, y el
-- descuento desaparece disuelto en cincuenta centavos por acá y treinta por
-- allá, justo cuando lo que hace falta es acordarse de pedirlo entero.
--
-- Entonces se guarda entero, con el análisis del que salió, y va a Beneficios
-- como lo que es: una rebaja ofrecida sobre el total de esa proforma.

alter table public.obra_analisis add column if not exists descuento numeric not null default 0;

comment on column public.obra_analisis.descuento is
  'El descuento especial que la proforma ofrece al pie, entero y sin repartir. Va a Beneficios como rebaja ofrecida y queda a la vista para acordarse de pedirlo cuando llegue la factura.';
