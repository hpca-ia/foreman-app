-- 173 · Quién sigue cada compromiso de un acta.
--
-- En el acta el responsable se escribe como se habla en la reunión: «HCARQ»,
-- «DINERS», «Área mecánica». Empresas y frentes, no personas, y por eso ningún
-- compromiso estaba en la bandeja de nadie: dependía de que alguien se
-- acordara en la reunión siguiente.
--
-- Ahora se ELIGE quién lo sigue, aparte de quién figura:
--
--   · alguien del equipo (`asignado_a`, que ya existía): recibe su tarea al
--     dar el visto;
--   · un tercero (`tercero`, que es lo nuevo): nadie del equipo lo hace, pero
--     queda en «Espero de otros» de quien lleva el proyecto, para reclamarlo;
--   · ninguno de los dos: todavía no se decidió, y el compromiso vive solo en
--     el acta.
--
-- Ver docs/reingenieria-pipeline-tareas.md, fase 5. No toca ninguna fila que
-- ya exista: es una columna nueva, en falso para todas. Quién sigue cada uno
-- de los abiertos lo decide Hernán en la pantalla de Actas.
--
-- Se puede correr más de una vez.

alter table public.acta_compromisos add column if not exists tercero boolean not null default false;

comment on column public.acta_compromisos.tercero is 'Lo sigue un tercero (cliente, fiscalización, proveedor): queda en «Espero de otros» de quien lleva el proyecto.';
comment on column public.acta_compromisos.asignado_a is 'Quién del equipo lo sigue: recibe su tarea al dar el visto. Vacío y sin `tercero`: todavía no se decidió.';
