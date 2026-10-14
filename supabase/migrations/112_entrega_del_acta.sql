-- 112 · Si el acta no le llegó a alguien, que se sepa.
--
-- El acta sale y la pantalla dice "enviada a once". Once es cuántos correos se
-- pidieron, no cuántos llegaron: una dirección vieja, una casilla llena o un
-- dominio que rechaza al remitente rebotan minutos después del envío, cuando
-- ya nadie está mirando. Y un rebote que nadie ve no se descubre hasta la
-- reunión siguiente, cuando alguien dice que nunca la vio —y para entonces el
-- acta ya se dio por aceptada—.
--
-- Como va un correo por persona, cada envío se puede guardar en su fila: el
-- identificador que devuelve el servidor de correo, en qué quedó y cuándo se
-- preguntó. Con eso, "¿le llegó?" se contesta mirando, y no se contesta más de
-- memoria.

alter table public.acta_asistentes
  add column if not exists envio_id     text;
alter table public.acta_asistentes
  add column if not exists envio_estado text;
alter table public.acta_asistentes
  add column if not exists envio_at     timestamptz;

comment on column public.acta_asistentes.envio_id is
  'El identificador del correo en Resend. Sirve para volver a preguntar en qué quedó.';
comment on column public.acta_asistentes.envio_estado is
  'En qué quedó ese correo: sent, delivered, bounced, complained. Lo que se mira para saber si le llegó.';
