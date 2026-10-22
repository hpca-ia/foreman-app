-- 121 · En el cuadro de revisión, quién aprueba y quién solo se entera.
--
-- No es lo mismo. El que aprueba recibe su enlace y la orden no se aplica al
-- presupuesto hasta que firma; el otro recibe una copia para estar al tanto.
-- Mandarle el botón de aprobar a quien no tiene que aprobar es pedirle que
-- decida algo que no le toca —y alguien lo va a apretar—.
--
-- Por omisión aprueba: en el cuadro de revisión de una orden de cambio, la
-- gente que está puesta ahí está puesta para firmar.

alter table public.orden_cambio_aprobaciones
  add column if not exists aprueba boolean not null default true;

comment on column public.orden_cambio_aprobaciones.aprueba is
  'true: recibe su enlace y su firma es necesaria. false: recibe copia, sin botón.';
