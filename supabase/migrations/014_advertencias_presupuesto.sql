-- Lo que la revisión encontró en el Excel al importarlo.
--
-- Al importar un presupuesto se revisan sus sumas y su numeración: capítulos
-- mal numerados, filas donde cantidad × precio no da el total, subtotales que
-- no cuadran, filas que el propio Excel no suma. El presupuesto entra tal
-- cual; las advertencias se guardan con la obra para poder volver a verlas en
-- la pestaña Presupuesto, y no solo en el momento de importar.
--
-- Cada advertencia: { tipo, nivel ("error" | "aviso"), titulo, filas: [{ fila, texto }] }.

alter table public.obras add column if not exists advertencias jsonb;
