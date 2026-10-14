-- 108 · El compromiso urgente.
--
-- En un acta todos los compromisos se ven iguales: una línea con un nombre y
-- una fecha. Pero no lo son. Hay uno que, si no se hace esta semana, para la
-- obra —el anticipo que destraba una fabricación, el plano que falta para que
-- entre la cuadrilla, la aprobación sin la cual nadie puede seguir— y hay seis
-- que pueden esperar sin que pase nada.
--
-- Quien estuvo en la reunión sabe cuál es. Quien lee el acta tres días después
-- no, y una lista de doce renglones iguales se atiende de arriba hacia abajo o
-- no se atiende. Marcarlo es la diferencia entre un acta que se lee y un acta
-- que se ejecuta.

alter table public.acta_compromisos
  add column if not exists urgente boolean not null default false;

comment on column public.acta_compromisos.urgente is
  'Si no se hace, para la obra. Se marca en la reunión y viaja en el acta y en el correo.';
