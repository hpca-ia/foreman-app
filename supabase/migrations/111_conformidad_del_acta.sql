-- 111 · La conformidad de cada asistente, con su enlace propio.
--
-- Hoy el acta se manda y listo. Si alguien no está de acuerdo tiene que
-- responder el correo, y si está de acuerdo no hace nada — que es exactamente
-- el problema: el silencio no se puede distinguir de "no lo leyó", y tres
-- meses después "se lo mandamos" no prueba nada.
--
-- Cada asistente recibe un enlace propio. Lo abre sin cuenta —el cliente y la
-- fiscalización no tienen una, y pedirles que se registren es garantizar que
-- no entren— lee el acta y da conformidad, o escribe una observación.
--
-- Queda QUIÉN, CUÁNDO y DESDE DÓNDE. Eso es una firma electrónica con rastro:
-- bastante más difícil de discutir que "te lo mandé por correo", que es lo
-- único que hay hoy.
--
-- La llave es larga y al azar, una por asistente y por acta: abre ESA acta
-- para ESA persona y nada más. No hay forma de pedir otra, porque el que
-- consulta no nombra qué quiere ver —lo nombra la llave—.

alter table public.acta_asistentes
  add column if not exists token text;
alter table public.acta_asistentes
  add column if not exists conforme_at   timestamptz;
alter table public.acta_asistentes
  add column if not exists conforme_ip   text;
alter table public.acta_asistentes
  add column if not exists observacion   text;
alter table public.acta_asistentes
  add column if not exists observacion_at timestamptz;
alter table public.acta_asistentes
  add column if not exists visto_at      timestamptz;

create unique index if not exists acta_asistentes_token on public.acta_asistentes (token) where token is not null;

comment on column public.acta_asistentes.token is
  'La llave de su enlace de conformidad. Abre esa acta para esa persona y nada más.';
comment on column public.acta_asistentes.conforme_at is
  'Cuándo dio conformidad. Con la IP, es el rastro que convierte el envío en una firma.';
comment on column public.acta_asistentes.visto_at is
  'Cuándo abrió el enlace. Distingue "no contestó" de "ni la miró".';
