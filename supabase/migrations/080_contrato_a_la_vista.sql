-- 080 · Mostrarle o no al cliente a cuánto asciende el contrato.
--
-- Una orden de cambio cierra con un cuadro que dice: contrato original, más
-- las órdenes aprobadas, igual al nuevo total. Eso es correcto y a veces es
-- justo lo que no conviene mandar.
--
-- Una orden que BAJA el contrato —porque se sacó algo caro y se puso algo más
-- barato— es una buena noticia, y el cliente la lee como tal cuando ve la
-- diferencia sola. Puesto el total acumulado al lado, la conversación deja de
-- ser sobre este cambio y pasa a ser sobre cuánto lleva gastado, que es otra
-- discusión y casi nunca la que uno quería tener ese día.
--
-- Por orden y no por obra: depende de la situación, no del proyecto. La misma
-- obra puede querer mostrarlo en la primera orden y no en la cuarta.
--
-- Apagado por defecto, también a propósito. Lo que se manda es el cambio; el
-- estado del contrato se manda cuando alguien decide mandarlo. Un dato
-- delicado que sale solo es un dato que alguna vez sale cuando no debía.

alter table public.ordenes_cambio add column if not exists mostrar_contrato boolean not null default false;
