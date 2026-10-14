-- 110 · Del compromiso del acta a la tarea de quien lo tiene que hacer.
--
-- Un compromiso vive dentro del acta: se arrastra de una reunión a la
-- siguiente y sale en el PDF. Pero el tablero donde la gente mira lo que le
-- toca cada día es otro, y ahí no aparece. Entonces "Lizeth queda en pedir la
-- proforma para el viernes" depende de que Lizeth se acuerde, o de que alguien
-- se lo pregunte en la reunión que viene — que es cuando ya es tarde.
--
-- QUIÉN LO HACE NO SE PUEDE DEDUCIR DEL TEXTO. En un acta real el responsable
-- se escribe como "HCARQ", "Especialidades / Eléctrica", "Área Mecánica": son
-- empresas y frentes, no personas, y están bien así —es como se habla en la
-- reunión—. Por eso la asignación es explícita: además del responsable
-- escrito, se elige a quién del equipo se le pone la tarea. Vacío quiere decir
-- que lo hace alguien de afuera y no se crea nada: una tarea en el tablero de
-- nadie es ruido.
--
-- `tarea_id` ata los dos lados. Sirve para no crear la tarea dos veces si se
-- da el visto de nuevo, y para que el repaso de la próxima acta pueda decir
-- que ya se hizo sin que nadie lo marque dos veces.

alter table public.acta_compromisos
  add column if not exists asignado_a bigint;
alter table public.acta_compromisos
  add column if not exists tarea_id   bigint;

comment on column public.acta_compromisos.asignado_a is
  'A quién del equipo se le crea la tarea. Nulo: lo hace un externo y no se crea ninguna.';
comment on column public.acta_compromisos.tarea_id is
  'La tarea que se creó por este compromiso. Evita duplicarla y deja ver si ya se hizo.';
