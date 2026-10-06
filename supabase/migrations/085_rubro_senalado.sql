-- 085 · Señalar, dentro de un grupo, el rubro que de verdad está pendiente.
--
-- Las agrupaciones existen para no leer doscientas líneas: "lámparas" en vez
-- de cuarenta modelos de lámpara, uno por uno. Eso es lo correcto casi
-- siempre, y es por lo que se armaron.
--
-- El problema aparece cuando el grupo se atrasa por UNA cosa. Están todas las
-- lámparas instaladas menos una, y el cronograma dice "LÁMPARAS: pendiente".
-- Quien lo lee —y sobre todo el cliente— entiende que falta todo el rubro, que
-- es falso y es caro: genera una llamada, una reunión y una desconfianza que
-- no correspondían.
--
-- `crono_senalado` marca ese rubro. No lo saca del grupo ni le da barra propia:
-- la barra sigue siendo la del grupo, con su plata y sus fechas. Lo que cambia
-- es que el grupo deja de decir "pendiente" a secas y pasa a decir QUÉ falta.
--
-- `crono_nota` es por qué, en una línea: "llega en el embarque de noviembre".
-- Un pendiente sin motivo obliga a preguntar, y preguntar es justo lo que esto
-- viene a evitar.
--
-- Se señala a mano y no se calcula: cuál rubro está trabando de verdad lo sabe
-- quien estuvo en la obra, no una columna.

alter table public.obra_rubros add column if not exists crono_senalado boolean not null default false;
alter table public.obra_rubros add column if not exists crono_nota text;
create index if not exists obra_rubros_senalado on public.obra_rubros (obra_id) where crono_senalado;
