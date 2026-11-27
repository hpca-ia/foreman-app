-- 198 · Los cuatro temas de RES BG que quedaron partidos en dos, unidos.
--
-- El 24/11/2026, con el flujo de antes, tocar el ✓ de un punto lo cerraba y
-- preguntaba «¿Qué sigue?»: lo que se escribía nacía como OTRO punto. Hernán
-- lo usó en cuatro temas de RES BG (lead 13) para anotar en qué estaban, y
-- después tuvo que renombrar cada punto nuevo para devolverle el tema:
--
--   196 «FOGA»                     → 217 «FOGA STBY, gestionar reunion para consultas.»
--   135 «Revision de Electrica»    → 214 «Electrico Se debe ajustar de acuerdo a …»
--   136 «Revision de Sanitaria»    → 215 «Sanitario Base recibida para presupuesto»
--   137 «Revision de Estructural»  → 216 «Ingenieria Estructiral total recibida, se presupuesta»
--
-- Desde el 26/11 (commit 1c2de93) una actividad es un tema que avanza: no se
-- cierra para pasar al paso siguiente. El 27/11, ante la propuesta de unirlos,
-- dijo: «Une». Cada par queda en UNO, el original, con su nombre, sus
-- anotaciones, sus archivos y la aprobación del cliente (FOGA):
--
--   1. Lo que se escribió el 24/11 como paso siguiente —el texto tal cual se
--      escribió, sin el tema que se le agregó al renombrar— queda como
--      anotación del original, con su fecha y su autor, y la lee el cliente
--      igual que leía el punto.
--   2. Lo que colgara del duplicado pasa al original (hoy no cuelga nada).
--   3. El original vuelve a estar abierto: en curso, y FOGA en espera
--      («STBY»).
--   4. La bitácora de cada uno lo cuenta.
--   5. El duplicado se quita, como «Quitar» en la ficha. Su bitácora queda
--      en la del proyecto.
--
-- Solo toca los pares que siguen como el 27/11: el duplicado existe, es de RES
-- BG y nació el 24/11. Correrla dos veces no hace nada la segunda.

create temp table unir (original bigint, duplicado bigint, texto text, en_espera boolean) on commit drop;

insert into unir (original, duplicado, texto, en_espera) values
  (135, 214, 'Se debe ajustar de acuerdo a requerimeintos de diseño interior y diseño luminico. Lista la base de presupuesto', false),
  (136, 215, 'Base recibida para presupuesto', false),
  (137, 216, 'Ingenieria total recibida, se presupuesta', false),
  (196, 217, 'STBY, gestionar reunion para consultas.', true);

delete from unir u
 where not exists (
   select 1
     from public.tasks d
     join public.tasks o on o.id = u.original and o.lead_id = 13
    where d.id = u.duplicado and d.lead_id = 13 and d.created_at::date = date '2026-11-24'
 );

-- 1. Lo que decía el punto nuevo, como anotación del original.
insert into public.tarea_comentarios (task_id, texto, autor_id, autor_nombre, created_at, visible_cliente)
select u.original, u.texto, d.created_by,
       (select x.nombre from public.usuarios x where x.id = d.created_by),
       d.created_at, coalesce(d.visible_cliente, false)
  from unir u
  join public.tasks d on d.id = u.duplicado
 where not exists (select 1 from public.tarea_comentarios k where k.task_id = u.original and k.texto = u.texto);

-- 2. Lo que colgara del duplicado, al original.
update public.tarea_comentarios k set task_id = u.original from unir u where k.task_id = u.duplicado;
update public.proyecto_archivos a set task_id = u.original from unir u where a.task_id = u.duplicado;
update public.aprobaciones_cliente a set task_id = u.original from unir u where a.task_id = u.duplicado;

-- 3. El original, abierto otra vez; FOGA, en espera.
update public.tasks o
   set status = 'en-progreso', hecha_at = null, hecha_por = null,
       espera = (u.en_espera or coalesce(o.espera, false))
  from unir u
 where o.id = u.original;

-- 4. La bitácora de cada uno.
insert into public.lead_movimientos (lead_id, tipo, detalle, autor_id, autor_nombre, automatico, task_id)
select 13, 'actividad',
       format('"%s" se unió con "%s", el punto que nació aparte el 24 nov: lo que decía quedó anotado acá, y "%s" vuelve a estar %s.',
              o.title, d.title, o.title, case when u.en_espera then 'en espera' else 'en curso' end),
       null, null, true, u.original
  from unir u
  join public.tasks o on o.id = u.original
  join public.tasks d on d.id = u.duplicado;

-- 5. El duplicado se quita.
delete from public.tasks d using unir u where d.id = u.duplicado;
