-- 087 · Qué rubros van en cada parte de un capítulo.
--
-- Un capítulo del control de obra se parte en varias barras cuando no ocurre
-- de una sola vez: "Instalaciones eléctricas" entra tres veces a la obra
-- —mangueras con la obra gris, cableado cuando está enlucido, aparatos al
-- final— y son tres momentos con meses de por medio.
--
-- Hasta ahora la plata de cada parte se decía en PORCENTAJE: 40, 40, 20. Ese
-- número hay que inventarlo, hay que acordarse de que las partes sumen 100, y
-- cuando entra una orden de cambio que toca un rubro suelto los porcentajes
-- quedan mintiendo sin que nadie lo note.
--
-- Pero el dato exacto ya existe: el capítulo tiene sus rubros y cada rubro
-- tiene su monto. Si se dice QUÉ RUBROS van en cada parte, la plata de la
-- parte es la suma de los suyos. No se inventa, no hay que cuadrar nada en
-- 100 —la suma de las partes es el capítulo por construcción— y una orden de
-- cambio que encarece un rubro mueve sola la parte donde ese rubro está.
--
-- `crono_actividad_id` apunta a la barra del cronograma donde va ese rubro.
-- Nulo quiere decir "donde vaya el capítulo entero", que es el caso normal:
-- la inmensa mayoría de los capítulos son una sola barra y nadie tiene que
-- tocar esto nunca.
--
-- Se pone a mano y por selección, no rubro por rubro con una fecha cada uno:
-- un capítulo de 38 rubros no se fecha treinta y ocho veces. Se marcan los
-- que van juntos y se mandan a su parte.

alter table public.obra_rubros add column if not exists crono_actividad_id bigint;
create index if not exists obra_rubros_crono_actividad on public.obra_rubros (crono_actividad_id);
