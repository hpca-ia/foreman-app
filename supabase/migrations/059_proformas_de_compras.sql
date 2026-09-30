-- 059 · Varias proformas por solicitud, y una elegida.
--
-- Pedir una compra sin adjuntar nada obliga a quien aprueba a creer en la
-- palabra: "son 800 dólares" contra "¿de dónde salió ese número?". Y cuando de
-- verdad se cotiza, se cotiza con tres proveedores —ese es el trabajo— y hoy
-- esas tres proformas viven en el WhatsApp de quien las pidió.
--
-- La tabla de adjuntos ya existía (048) pero solo guardaba el archivo. Le
-- faltaba lo que hace que una proforma sea comparable con otra: de quién es y
-- cuánto cobra. Con eso, el que aprueba ve las tres al lado y elige una, y esa
-- elección queda escrita: seis meses después se puede contestar por qué se
-- compró al más caro.
--
-- Se extiende la tabla que ya está en vez de crear `compras_proformas`: una
-- proforma ES un adjunto de la solicitud, con más datos. Dos tablas de
-- archivos serían dos lugares donde buscar el mismo papel.

alter table public.compras_adjuntos add column if not exists proveedor text;
alter table public.compras_adjuntos add column if not exists monto     numeric(14,2);
alter table public.compras_adjuntos add column if not exists nota      text;
-- Contra qué rubro del presupuesto se cotizó. Se copia de la solicitud al
-- subirla: así la colección de proformas se puede leer por rubro —"¿a cómo nos
-- han cotizado el hormigón este año?"— sin tener que ir solicitud por solicitud.
alter table public.compras_adjuntos add column if not exists obra_rubro_id bigint;
alter table public.compras_adjuntos add column if not exists capitulo      text;

-- Cuál se aprobó. Vive en la solicitud y no en el adjunto porque es una sola
-- por solicitud: guardarlo como un booleano en cada proforma permitiría dos
-- elegidas, y eso no significa nada.
alter table public.compras_solicitudes add column if not exists proforma_id bigint;

create index if not exists compras_adjuntos_rubro on public.compras_adjuntos (obra_rubro_id);
create index if not exists compras_adjuntos_tipo  on public.compras_adjuntos (solicitud_id, tipo);
