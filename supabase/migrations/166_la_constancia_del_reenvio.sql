-- LA CONSTANCIA DEL REENVÍO.
--
-- Cada envío de una orden de cambio quedaba anotado, pero al insistir los
-- destinatarios iban vacíos —los firmantes viajaban aparte— y nada decía que
-- había sido una insistencia. "Queda registrado el envío" era cierto y no se
-- podía ver en ningún lado.
alter table public.orden_cambio_envios
  add column if not exists motivo text,      -- envio · insistencia
  add column if not exists cuerpo text;      -- lo que decía el correo
comment on column public.orden_cambio_envios.motivo is 'envio: la primera vez; insistencia: el mismo correo, otra vez, a quien no contestó';
