-- 096 · Un presupuesto que se cobra por etapas.
--
-- Una obra grande casi nunca se contrata entera de una vez: se cierra la etapa
-- uno —obra gris, digamos— y la dos queda para cuando el cliente consiga la
-- plata o decida seguir. Hoy eso se resuelve haciendo DOS presupuestos, y ahí
-- empiezan los problemas: los rubros se duplican, los precios se desfasan entre
-- los dos archivos, y nadie puede ver el total de la obra completa sin sumar a
-- mano.
--
-- Con una etiqueta por rubro, el presupuesto es uno solo y se lee de las dos
-- maneras: el total de la obra, y cuánto cuesta cada etapa. Se cotiza completo
-- y se cobra por partes.
--
-- COMO TEXTO LIBRE y no como un número. En la práctica nadie dice "etapa 2":
-- dice "etapa 2 - acabados" o "ampliación". El nombre es parte de la
-- información y obligarlo a ser un número la tira.
--
-- Nulo es "sin etapa", que es lo correcto para la enorme mayoría de los
-- presupuestos: los que se cobran de una sola vez no tienen etapas y no deben
-- ver nada de esto.

alter table public.presupuesto_items add column if not exists etapa text;

create index if not exists presupuesto_items_etapa on public.presupuesto_items (presupuesto_id, etapa);

comment on column public.presupuesto_items.etapa is
  'En qué etapa de la obra entra este rubro. Texto libre: "Etapa 1 - obra gris". Nulo = el presupuesto no se cobra por etapas.';
