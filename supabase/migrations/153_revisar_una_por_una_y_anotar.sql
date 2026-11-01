-- 153 · Marcar lo revisado, y anotar al lado.
--
-- Analizar cincuenta diferencias no se hace de una sentada. Se hace en varios
-- ratos, entre llamadas, y casi siempre con otra persona: el residente, el
-- proveedor, el cliente. Y hay dos cosas que hoy no se pueden hacer:
--
-- MARCAR QUE YA LA MIRÉ. Decidir y revisar no son lo mismo. Hay renglones que
-- uno mira, entiende y deja pendientes a propósito —"esto lo hablo con Jorge el
-- lunes"— y en la pantalla se ven igual que los cincuenta que todavía no abrió
-- nadie. Al volver al día siguiente no hay forma de saber dónde se quedó, así
-- que se empieza de nuevo desde arriba, y por eso los últimos renglones de una
-- lista larga no los revisa nunca nadie.
--
-- ANOTAR POR QUÉ. La nota existía solo para dos decisiones —"ya estaba
-- incluido" y "lo pagamos nosotros"— y se pedía en una ventanita al marcar. Lo
-- que hace falta es poder escribir en cualquier renglón y en cualquier momento:
-- "el proveedor dice que el precio subió por el dólar", "preguntar si incluye
-- el andamio". Eso es lo que convierte una lista de números en una conversación
-- que se puede retomar, y es lo que se lee en la reunión.

alter table public.obra_analisis_lineas add column if not exists revisado_at     timestamptz;
alter table public.obra_analisis_lineas add column if not exists revisado_por    bigint;
alter table public.obra_analisis_lineas add column if not exists revisado_nombre text;

comment on column public.obra_analisis_lineas.revisado_at is
  'Cuándo alguien miró este renglón, aunque todavía no lo decida. Revisar y decidir son dos cosas: sin esto, volver al análisis al día siguiente obliga a empezar desde arriba.';
comment on column public.obra_analisis_lineas.nota is
  'Lo que se anotó sobre este renglón, en cualquier momento y con cualquier decisión: lo que dijo el proveedor, lo que falta preguntar, por qué se descartó.';
