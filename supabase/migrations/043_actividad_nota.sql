-- 043 · Una nota en cada actividad.
--
-- Al abrir una actividad se ve qué se hizo: quién la marcó, cuándo, si está
-- esperando a alguien y qué tarea salió de ella. Falta lo que solo sabe quien
-- la trabajó: "el municipio pidió otra copia", "el cliente aprobó por
-- WhatsApp". Eso va acá y se lee con la actividad, no en una bitácora aparte.

alter table public.lead_etapa_items add column if not exists nota text;
