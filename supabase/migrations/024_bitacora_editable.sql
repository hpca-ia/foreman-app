-- Qué anotó una persona y qué anotó el sistema.
--
-- La bitácora se llena de dos formas: a mano ("llamé a Diego, pide ver el
-- terreno el sábado") y sola, cuando el proyecto cambia de etapa o se agrega un
-- paso. Lo escrito a mano se puede corregir; lo que registró el sistema no,
-- porque si "pasó a Contrato el 12" se puede editar, deja de ser un registro y
-- pasa a ser un cuento.

alter table public.lead_movimientos
  add column if not exists automatico boolean not null default false;

-- Lo que ya existe y venía de un cambio de etapa es del sistema.
update public.lead_movimientos set automatico = true where tipo = 'etapa';
