-- 078 · El visto del Director antes de que la orden salga al cliente.
--
-- Hoy una orden de cambio va de borrador a "enviada al cliente" de un botón.
-- Quien la arma es el residente o quien está en obra, y lo que viaja es un
-- precio: una vez que el cliente lo vio, bajarlo es una negociación y subirlo
-- es imposible. Entre esas dos cosas falta un paso que en la oficina ya
-- existe, pero vive en un WhatsApp —"¿la mando?" / "dale"— que después nadie
-- encuentra.
--
-- Son tres caminos distintos y por eso se separan:
--
--   · PDF para mandar por mi cuenta. Algunos clientes quieren el papel por su
--     canal, y forzar el envío desde FOREMAN haría que se use por fuera.
--   · Pedir el visto. Queda esperando, con nombre y fecha cuando llega.
--   · Enviar al cliente. Solo tiene sentido con el visto puesto, o si quien
--     manda es el Director.
--
-- No se agrega un estado nuevo: `estado` ya cuenta dónde está la orden frente
-- al CLIENTE —borrador, enviada, aprobada, rechazada— y meter ahí un paso
-- interno mezcla dos conversaciones distintas en una sola columna. El visto es
-- una marca al costado, como el pago en una compra.

alter table public.ordenes_cambio add column if not exists visto_at         timestamptz;
alter table public.ordenes_cambio add column if not exists visto_por        bigint;
alter table public.ordenes_cambio add column if not exists visto_nombre     text;
alter table public.ordenes_cambio add column if not exists visto_comentario text;
-- Cuándo se pidió: sirve para saber hace cuánto está esperando, que es la
-- pregunta que uno se hace cuando la obra está frenada.
alter table public.ordenes_cambio add column if not exists visto_pedido_at  timestamptz;

-- ── Y la respuesta del cliente desde el portal ───────────────────────────
--
-- La orden le llega por correo con un enlace, entra sin contraseña, la lee con
-- sus fotos y sus partidas, y contesta. Eso reemplaza al "dale" por WhatsApp
-- que después nadie encuentra.
--
-- Su respuesta NO mete los rubros en el control de obra, y es a propósito. El
-- cliente dice que sí; llevar esa plata al presupuesto sigue siendo un acto de
-- la oficina, con alguien mirando que las partidas estén bien cargadas. Un
-- clic de alguien de afuera no debería mover el total de una obra sin que
-- nadie de adentro lo revise.
--
-- Se guarda aparte del `estado` por lo mismo: el estado lo mueve la oficina
-- cuando lleva la orden al control. Esto es la evidencia de que el cliente
-- aceptó, con su fecha.

alter table public.ordenes_cambio add column if not exists cliente_acepto    boolean;
alter table public.ordenes_cambio add column if not exists cliente_respondio_at timestamptz;
