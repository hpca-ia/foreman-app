-- 192 · Hasta qué día se midió el avance de la obra.
--
-- El cronograma guardaba el plan y la línea base guardaba lo que se firmó,
-- pero no había dónde decir QUÉ SE HIZO: las columnas `avance_pct`,
-- `inicio_real` y `fin_real` de cada actividad existen desde la 076 y ninguna
-- pantalla las escribía. Por eso una obra atrasada mostraba tres versiones
-- guardadas que terminaban el mismo día.
--
-- Un avance sin fecha no dice nada: "va al 40 %" es bueno o malo según a qué
-- día. Esta es esa fecha, una por proyecto. Con ella el cronograma deja de ser
-- solo un plan: lo terminado queda donde ocurrió, lo que falta de lo empezado
-- se cuenta desde el día siguiente, y lo que no arrancó no puede arrancar
-- antes. Vacía, el cronograma se calcula como siempre.

alter table public.leads add column if not exists crono_corte date;

comment on column public.leads.crono_corte is
  'Fecha de corte del avance: hasta qué día, al cierre, se midió lo ejecutado. Null = el cronograma es solo el plan.';
