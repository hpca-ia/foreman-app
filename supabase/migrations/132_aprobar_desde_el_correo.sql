-- 132 · Aprobar desde el correo, sin entrar a FOREMAN.
--
-- Una aprobación que necesita que alguien abra una aplicación, se acuerde de
-- la contraseña y busque la pantalla es una aprobación que espera dos días.
-- El que aprueba una compra o le da el visto a un acta casi siempre está
-- caminando por una obra con el teléfono en la mano: lo que tiene abierto es
-- el correo.
--
-- Entonces el correo lleva el documento adjunto —el PDF, la proforma— y dos
-- botones. Misma puerta y misma regla que la orden de cambio que aprueba el
-- cliente: una llave larga que nombra UNA fila y nada más, y toda la decisión
-- queda escrita con nombre, fecha y desde dónde.
--
-- QUIÉN SIGUE LO DECIDE QUIEN MANDA, NO EL SERVIDOR.
--
-- Al aprobar una compra le toca a compras; al devolverla, a quien la pidió. Esa
-- regla ya vive en la pantalla de la solicitud —sabe quién es el asistente de
-- compras y quién el gerente del proyecto— y escribirla otra vez en el servidor
-- serían dos verdades que se van a separar el día que cambie el equipo. Así que
-- se guarda acá, resuelta, cuando se manda el correo: el servidor ejecuta lo
-- que ya se decidió.

alter table public.tasks
  add column if not exists aprobacion_token    text,
  add column if not exists aprob_ok_para       bigint,
  add column if not exists aprob_no_para       bigint,
  add column if not exists aprobacion_envio_at timestamptz;

create unique index if not exists tasks_aprobacion_token_idx
  on public.tasks(aprobacion_token) where aprobacion_token is not null;

comment on column public.tasks.aprobacion_token is
  'La llave del enlace para aprobar desde el correo. Nombra esta tarea y nada más; se guarda la primera vez y no cambia, así un correo viejo sigue abriendo.';
comment on column public.tasks.aprob_ok_para is
  'A quién le toca si se aprueba. Lo resuelve la pantalla que manda el pedido, que es la que conoce al equipo.';
comment on column public.tasks.aprob_no_para is
  'A quién le toca si se devuelve: casi siempre quien lo pidió.';

-- ── EL ACTA ──────────────────────────────────────────────────────────────────
--
-- "Pedir el visto" dejaba el acta en `lista` y no avisaba a nadie: el director
-- se enteraba porque alguien se acordaba de escribirle. Ahora sale un correo
-- con el acta en PDF y dos botones, y desde la misma pantalla donde da el visto
-- puede mandarla a los involucrados.
--
-- El PDF lo arma el navegador —acá no hay librería de PDF ni las fotos
-- firmadas— así que se sube una vez al depósito y los dos correos lo adjuntan
-- desde ahí: el del visto y el que sale a los ocho asistentes.

alter table public.obra_actas
  add column if not exists visto_token     text,
  add column if not exists visto_pedido_at timestamptz,
  add column if not exists visto_nota      text,
  add column if not exists pdf_path        text;

create unique index if not exists obra_actas_visto_token_idx
  on public.obra_actas(visto_token) where visto_token is not null;

comment on column public.obra_actas.visto_token is
  'La llave del enlace para dar el visto desde el correo.';
comment on column public.obra_actas.visto_nota is
  'Lo que escribió quien la devolvió: qué hay que corregir antes de que salga.';
comment on column public.obra_actas.pdf_path is
  'El acta en PDF, en el depósito. La arma el navegador al pedir el visto y la adjuntan los dos correos.';
