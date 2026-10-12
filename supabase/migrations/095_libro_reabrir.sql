-- 095 · Volver a abrir un día del libro, dejando dicho que se reabrió.
--
-- El libro se escribe el día que pasa, y eso es lo que lo hace valer: uno
-- rellenado tres semanas después no prueba nada. Por eso la app no dejaba
-- escribir en un día pasado.
--
-- Pero la obra no funciona así de limpio. El residente se queda sin señal, se
-- va a las siete sin cerrar, anota el personal y se olvida del hormigón que
-- llegó a las cinco. Si la única salida es dejar el día incompleto para
-- siempre, lo que se pierde es el registro entero —que es justo lo que se
-- quería proteger.
--
-- Entonces se reabre, Y SE DICE. Un libro que se puede editar después EN
-- SILENCIO no vale como registro: cualquiera podría escribir hoy lo que le
-- conviene y fecharlo en marzo. Lo que lo hace servir es que se vea qué se
-- escribió el día, qué se completó después, quién lo abrió y por qué.
--
-- Así una reapertura se puede explicar —"faltó cargar la entrega de hormigón,
-- la completó el residente al día siguiente"— y una sospechosa también se ve.

alter table public.libro_obra_dias add column if not exists reabierto_at     timestamptz;
alter table public.libro_obra_dias add column if not exists reabierto_por    bigint;
alter table public.libro_obra_dias add column if not exists reabierto_nombre text;
alter table public.libro_obra_dias add column if not exists reabierto_motivo text;
-- Cuántas veces. Una es un olvido; cinco es que el libro no se está llevando.
alter table public.libro_obra_dias add column if not exists reaperturas int not null default 0;

comment on column public.libro_obra_dias.reabierto_motivo is
  'Por qué se volvió a abrir este día. Obligatorio al reabrir: sin motivo, una reapertura no se puede distinguir de una corrección conveniente.';
