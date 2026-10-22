-- 119 · Hasta cuándo hay para aprobar una orden de cambio.
--
-- Mientras una orden no se aprueba, el trabajo no se ejecuta y el plazo de la
-- obra corre igual. Esa espera no tiene dueño: el que la manda cree que es
-- urgente y el que la recibe no sabe que algo está parado esperándolo.
--
-- Una fecha límite convierte el silencio en algo que se puede reclamar: queda
-- escrita en el correo que recibe cada uno, en la página donde firma, y en la
-- lista de la obra, donde se ve cuáles ya se pasaron.

alter table public.ordenes_cambio
  add column if not exists fecha_limite_aprobacion date;

comment on column public.ordenes_cambio.fecha_limite_aprobacion is
  'Hasta cuándo hay para aprobarla. Pasada esa fecha, la obra está parada esperando una firma que nadie reclamó.';
