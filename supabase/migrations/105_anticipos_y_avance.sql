-- 105 · Un anticipo a proveedor no es obra hecha, y el avance es otra cosa.
--
-- DOS NÚMEROS QUE SE ESTABAN MINTIENDO ENTRE SÍ.
--
-- 1 · EL ANTICIPO. Cuando se le paga a un proveedor para que arranque una
--     fabricación o una importación, esa plata sale de la caja pero NO es obra
--     hecha: el material no llegó y nadie lo instaló. El control lo contaba
--     como invertido, así que la obra figuraba más adelantada de lo que está y
--     el saldo contra el presupuesto más chico de lo que es. En una obra con
--     ventanería o equipos importados eso son decenas de miles de dólares de
--     diferencia, justo en el renglón que uno mira para decidir si puede
--     comprometer algo más.
--
--     Un anticipo es una clase de documento, al lado de "factura" y
--     "proforma". Se liquida cuando llega lo que se anticipó: ahí deja de ser
--     anticipo y lo que cuenta es la factura final. Eso ya existe —
--     `facturada_con_id`— y se reusa.
--
-- 2 · EL AVANCE. El porcentaje del encabezado salía de la plata: invertido
--     sobre presupuesto. Eso es avance ECONÓMICO y es útil, pero no es lo que
--     alguien contesta cuando le preguntan cómo va la obra. Y sube cuando se
--     paga un anticipo, aunque no se haya movido un ladrillo.
--
--     Ahora cada rubro puede decir cuánto de ÉL está hecho, y de ahí sale el
--     avance de obra, pesado por lo que vale cada rubro. Los dos números van
--     separados en el encabezado: cuando se despegan, esa distancia es el
--     dato — se está gastando más rápido de lo que se construye, o al revés.

alter table public.obra_rubros
  add column if not exists avance_pct numeric(5,2) not null default 0;

comment on column public.obra_rubros.avance_pct is
  'Cuánto de este rubro está ejecutado en obra, 0 a 100. No tiene que ver con lo pagado.';

-- Quién lo cargó y cuándo: un avance es una afirmación sobre la obra y alguien
-- la hace. Sin eso, "dijeron que estaba al 80" no tiene dueño.
alter table public.obra_rubros add column if not exists avance_at     timestamptz;
alter table public.obra_rubros add column if not exists avance_por    bigint;
alter table public.obra_rubros add column if not exists avance_nombre text;
