-- 171 · El pipeline es lo que se persigue: un tipo, una etapa, y una fecha.
--
-- Hasta acá cada proyecto llevaba una fila por etapa (`lead_etapas`), cada una
-- con su estado, y un «estamos acá» que se podía marcar en varias a la vez:
-- Plaza Lagos figuraba en tres etapas, el Aéreo en dos, y en cuatro de nueve
-- proyectos la etapa del listado no era la que decía adentro. Además el
-- pipeline mezclaba lo que se persigue con lo que ya se está construyendo: el
-- Aéreo aparecía en «Documentación» con 161 facturas cargadas.
--
-- Queda así (ver docs/reingenieria-pipeline-tareas.md, fase 2):
--
--   · Un lead tiene un TIPO —Diseño, Construcción, o Diseño y construcción—
--     en `leads.tunel`, y está en UNA etapa, en `leads.etapa`: una de las de
--     su tipo, elegida de un desplegable.
--   · El catálogo (`pipeline_etapas`) pasa a tener solo etapas de perseguir,
--     por tipo. Las de ejecutar —obra gris, acabados, entrega— se apagan: lo
--     aprobado sale del pipeline y se lleva en Control.
--   · Un lead puede estar ESPERANDO RESPUESTA DEL CLIENTE, con el día en que
--     FOREMAN lo recuerda: tres columnas nuevas en `leads`.
--
-- NO SE BORRA NADA. `lead_etapas` queda como está, de respaldo; la aplicación
-- deja de leerla y de escribirla. Las etapas viejas del catálogo se apagan, no
-- se borran: las tareas hechas las siguen nombrando.
--
-- Se puede correr más de una vez: lo que ya pasó no vuelve a pasar.

-- ── 1. Esperando respuesta del cliente ────────────────────────────────────
-- Desde cuándo espera, qué se espera, y qué día hay que volver a mirarlo.
-- Vacías las tres: no está esperando.
alter table public.leads add column if not exists espera_desde date;
alter table public.leads add column if not exists espera_que text;
alter table public.leads add column if not exists recordar_el date;

comment on column public.leads.tunel is 'El TIPO de lead: diseno · construccion · diseno_construccion. «lead» = todavía no se le puso tipo.';
comment on column public.leads.etapa is 'La etapa en la que está: una de pipeline_etapas de su tipo. Una sola.';
comment on column public.leads.espera_desde is 'Desde qué día espera respuesta del cliente. Vacío: no está esperando.';
comment on column public.leads.espera_que is 'Qué se espera del cliente.';
comment on column public.leads.recordar_el is 'El día en que FOREMAN recuerda insistirle al cliente.';

-- ── 2. El catálogo: las etapas de perseguir, por tipo ─────────────────────
-- Es la propuesta de arranque; se ajusta en Ajustes → Etapas.
insert into public.pipeline_etapas (id, nombre, orden, color, principal, tunel, activa) values
  ('dis_contacto',      'Contacto',                10, '#8B92A5', true, 'diseno', true),
  ('dis_levantamiento', 'Levantamiento',           20, '#7A9E9F', true, 'diseno', true),
  ('dis_plan_masa',     'Plan masa',               30, '#5B8FA8', true, 'diseno', true),
  ('dis_anteproyecto',  'Anteproyecto',            40, '#4A7C8C', true, 'diseno', true),
  ('dis_propuesta',     'Propuesta de honorarios', 50, '#3D6B7D', true, 'diseno', true),
  ('dis_negociacion',   'Negociación',             60, '#2E5A6B', true, 'diseno', true),
  ('con_contacto',      'Contacto',                10, '#8B92A5', true, 'construccion', true),
  ('con_levantamiento', 'Levantamiento',           20, '#7A9E9F', true, 'construccion', true),
  ('con_propuesta',     'Propuesta enviada',       50, '#3D6B7D', true, 'construccion', true),
  ('con_negociacion',   'Negociación',             60, '#2E5A6B', true, 'construccion', true),
  ('dyc_contacto',      'Contacto',                10, '#8B92A5', true, 'diseno_construccion', true),
  ('dyc_levantamiento', 'Levantamiento',           20, '#7A9E9F', true, 'diseno_construccion', true),
  ('dyc_plan_masa',     'Plan masa',               30, '#5B8FA8', true, 'diseno_construccion', true),
  ('dyc_anteproyecto',  'Anteproyecto',            40, '#4A7C8C', true, 'diseno_construccion', true),
  ('dyc_ingenierias',   'Ingenierías',             50, '#2E5A6B', true, 'diseno_construccion', true),
  ('dyc_presupuesto',   'Presupuesto',             60, '#5B8FA8', true, 'diseno_construccion', true),
  ('dyc_propuesta',     'Propuesta enviada',       70, '#3D6B7D', true, 'diseno_construccion', true),
  ('dyc_negociacion',   'Negociación',             80, '#2E5A6B', true, 'diseno_construccion', true)
on conflict (id) do nothing;

-- Dos de Construcción ya existían y se quedan, en su lugar nuevo.
insert into public.pipeline_etapas (id, nombre, orden, color, principal, tunel, activa) values
  ('con_ingenierias', 'Ingenierías', 30, '#2E5A6B', true, 'construccion', true),
  ('con_presupuesto', 'Presupuesto', 40, '#5B8FA8', true, 'construccion', true)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden, principal = true, activa = true;

-- Las de antes se apagan: las del tubo «lead», las de «arquitectura», y las de
-- ejecutar una obra. Siguen en la tabla porque las tareas hechas las nombran.
update public.pipeline_etapas set activa = false
 where activa
   and (tunel not in ('diseno', 'construccion', 'diseno_construccion')
     or (tunel = 'construccion' and id not in
          ('con_contacto', 'con_levantamiento', 'con_ingenierias', 'con_presupuesto', 'con_propuesta', 'con_negociacion')));

-- ── 3. Los siete que se persiguen: su tipo y su etapa ─────────────────────
-- El tipo lo dijo Hernán el 11/11/2026. La etapa es la que tenía abierta cada
-- uno; se cambia desde su tarjeta con un toque.
--
--   13 RES BG                   Construcción            · Ingenierías
--   14 Plaza Comercial Puembo   Diseño                  · Negociación
--   17 RES ZULETA               Diseño                  · Plan masa
--   18 CHRONIX                  Diseño y construcción   · Presupuesto
--   21 MINDKIDS                 Construcción            · Presupuesto
--   22 Concurso PRONACA         Diseño                  · Anteproyecto
--   25 Grupo Global             Diseño y construcción   · Anteproyecto
--
-- Solo toca al que todavía no está en una etapa del catálogo nuevo: si ya se
-- lo movió a mano, lo suyo vale.
with destino (id, tunel, etapa) as (values
  (13::bigint, 'construccion',        'con_ingenierias'),
  (14,         'diseno',              'dis_negociacion'),
  (17,         'diseno',              'dis_plan_masa'),
  (18,         'diseno_construccion', 'dyc_presupuesto'),
  (21,         'construccion',        'con_presupuesto'),
  (22,         'diseno',              'dis_anteproyecto'),
  (25,         'diseno_construccion', 'dyc_anteproyecto')
), movidos as (
  update public.leads l
     set tunel = d.tunel, etapa = d.etapa
    from destino d
   where l.id = d.id
     and l.resultado is null
     and not exists (select 1 from public.pipeline_etapas e where e.id = l.etapa and e.activa and e.tunel = l.tunel)
  returning l.id, l.tunel, l.etapa
)
insert into public.lead_movimientos (lead_id, tipo, automatico, detalle)
select m.id, 'nota', true,
       'El pipeline cambió: queda como '
       || case m.tunel when 'diseno' then 'Diseño' when 'construccion' then 'Construcción' else 'Diseño y construcción' end
       || ', en ' || e.nombre || '.'
  from movidos m join public.pipeline_etapas e on e.id = m.etapa;

-- Lo aprobado no es un lead: sale del pipeline y no espera a nadie.
update public.leads set es_lead = false where resultado = 'ganado' and es_lead;

-- ── 4. Las tareas llevan de etiqueta la etapa nueva ───────────────────────
-- La tarea guarda en qué etapa se escribió. Las que nombraban una etapa vieja
-- pasan a la que se llama igual en el tipo de su lead —«Plan masa» del tubo
-- viejo a «Plan masa» de Diseño—. Las que no tienen equivalente («Reunión con
-- cliente», «Documentación») se quedan con la suya, que sigue teniendo nombre.
--
-- Sin tocar `updated_at`: cambiar una etiqueta no es trabajar en la tarea, y
-- si lo tocara el correo de mañana diría que hoy se cerraron todas.
alter table public.tasks disable trigger tasks_tocar;

update public.tasks t
   set etapa_id = n.id
  from public.leads l, public.pipeline_etapas v, public.pipeline_etapas n
 where t.lead_id = l.id
   and v.id = t.etapa_id
   and n.tunel = l.tunel and n.activa
   and n.id <> v.id
   and lower(translate(n.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = lower(translate(v.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));

alter table public.tasks enable trigger tasks_tocar;
