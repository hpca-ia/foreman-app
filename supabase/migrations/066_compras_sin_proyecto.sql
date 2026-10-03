-- 066 · Un pedido que no es de ninguna obra.
--
-- Se compra papel para la oficina, se paga el mantenimiento de la camioneta,
-- se repone una herramienta del taller. Nada de eso es de un proyecto, y hasta
-- ahora había que elegir uno igual: la compra entraba al control de la obra
-- que tocó en el selector y le ensuciaba un rubro con plata que no era suya.
--
-- `lead_id` deja de ser obligatorio. Nulo significa exactamente una cosa —no
-- es de ninguna obra— y no "todavía no lo eligieron": la pantalla obliga a
-- decidir entre un proyecto y "gasto de oficina" antes de guardar.
--
-- `destino` es para esos casos: en qué se carga cuando no hay rubro de obra
-- contra el cual apuntarlo. Texto libre y no una lista cerrada, porque las
-- categorías de la oficina las va a descubrir el uso y no nosotros ahora; el
-- día que se repitan tres veces las mismas cinco, se cierran.
--
-- El pedido sigue el mismo camino: lo aprueba quien aprueba, lo compra quien
-- compra. Lo único que cambia es que no desemboca en el control de una obra.

alter table public.compras_solicitudes alter column lead_id drop not null;
alter table public.compras_solicitudes add column if not exists destino text;
