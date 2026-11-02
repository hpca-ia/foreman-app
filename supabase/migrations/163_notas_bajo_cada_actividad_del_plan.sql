-- 163 · Una nota bajo cada actividad del plan.
--
-- El plan dice QUÉ hay que hacer cada día, y eso alcanza para una lista pero
-- no para trabajar: "fundir losa del eje 4" no dice que el hormigón lo trae
-- Holcim a las siete, que hay que avisarle al vecino, ni que si llueve se
-- pasa al jueves. Eso se habla el lunes en la reunión, se lo acuerda alguien
-- de memoria, y el miércoles lo ejecuta otro que no estuvo.
--
-- Hoy lo único que se puede escribir en una tarea es el MOTIVO, y solo cuando
-- no se hizo: sirve para justificar hacia atrás y no para preparar hacia
-- adelante. Son dos campos distintos y se escriben en momentos distintos —la
-- nota al planificar, el motivo al cerrar la semana— y mezclarlos obligaría a
-- borrar lo que se había previsto para poder explicar lo que pasó.
--
-- La nota viaja al PDF y al correo con la tarea, que es lo que la vuelve útil:
-- el que la recibe no estuvo en la reunión.

alter table public.obra_plan_items add column if not exists nota text;

comment on column public.obra_plan_items.nota is
  'Lo que hay que saber para hacer esa tarea: a qué hora llega el material, quién la ejecuta, de qué depende. Se escribe al planificar. Distinto de `motivo`, que es por qué no se hizo y se escribe al cerrar la semana.';
