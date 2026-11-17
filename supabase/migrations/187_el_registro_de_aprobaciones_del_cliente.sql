-- 187 · El registro de aprobaciones del cliente.
--
-- Hernán, 17/11/2026: «en este proyecto quiero implementar aprobaciones de los
-- clientes... residente o nosotros subimos información, planos, presupuestos,
-- y estos los aprueba el cliente. Esta colección de aprobaciones es un
-- sustento y justificación. ¿Cómo lo manejamos? ¿Desde dónde?». Y cuando el
-- cliente aprueba: «que quede en el registro».
--
-- Desde la 186 un punto del checklist se le puede pedir aprobar al cliente,
-- pero de eso quedaba solo el estado de AHORA en la tarea: al volver a pedirle
-- —porque cambió el plano— la respuesta anterior se borraba de ahí y quedaba
-- en una línea del historial. Para que sirva de sustento hace falta la
-- colección entera: cada vez que se le pidió, qué tenía para mirar, qué
-- contestó y cuándo.
--
-- Una fila por cada pedido:
--
--   · de qué proyecto y de qué punto, y cómo se llamaba el punto al pedirla
--     —el título puede cambiar después; lo que se aprobó, no—;
--   · quién la pidió y cuándo, y a quién se le avisó (`avisos`);
--   · qué contestó —'aprobado' u 'observado'—, cuándo, qué escribió y desde
--     qué dirección;
--   · `archivos`: LO QUE TENÍA PARA MIRAR AL CONTESTAR, copiado en ese
--     momento. Si después se sube otra versión, la aprobación sigue diciendo
--     qué archivo aprobó;
--   · `retirada_at`: si el pedido se retiró sin respuesta («ya no hace falta»).
--
-- Si el punto se borra, la fila queda: lo aprobado no se pierde con la tarea.
--
-- LO QUE YA SE HAYA PEDIDO ENTRA AL REGISTRO. Desde la 186 se puede pedir una
-- aprobación, y lo que se pida —o el cliente conteste— antes de correr esta
-- migración no tendría fila. Al final se anota una por cada punto que hoy la
-- esté pidiendo, con lo que la tarea sabe: cuándo se pidió (de la bitácora),
-- qué contestó, y los archivos que el cliente tenía en ese punto al contestar.
-- Al escribir esto no había ninguno. Solo agrega filas a la tabla nueva.
--
-- No cambia ningún dato existente. Se puede correr más de una vez.

create table if not exists public.aprobaciones_cliente (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  task_id         bigint references public.tasks(id) on delete set null,
  titulo          text not null,
  descripcion     text,
  pedida_at       timestamptz not null default now(),
  pedida_por      bigint,
  pedida_nombre   text,
  avisos          jsonb not null default '[]'::jsonb,
  respuesta       text,
  respuesta_at    timestamptz,
  respuesta_nota  text,
  respuesta_ip    text,
  archivos        jsonb not null default '[]'::jsonb,
  retirada_at     timestamptz,
  retirada_nombre text,
  created_at      timestamptz not null default now(),
  constraint aprobaciones_cliente_respuesta_valida
    check (respuesta is null or respuesta in ('aprobado', 'observado'))
);

-- La colección de un proyecto, en orden; y el pedido abierto de un punto.
create index if not exists aprobaciones_cliente_del_proyecto
  on public.aprobaciones_cliente (lead_id, pedida_at);
create index if not exists aprobaciones_cliente_abierta
  on public.aprobaciones_cliente (task_id) where respuesta is null and retirada_at is null;

alter table public.aprobaciones_cliente enable row level security;
drop policy if exists "equipo foreman" on public.aprobaciones_cliente;
create policy "equipo foreman" on public.aprobaciones_cliente for all to authenticated using (true) with check (true);

-- Lo pedido antes de que existiera el registro: una fila por punto que hoy
-- pide aprobación y todavía no tiene ninguna.
insert into public.aprobaciones_cliente
  (lead_id, task_id, titulo, descripcion, pedida_at, pedida_nombre, respuesta, respuesta_at, respuesta_nota, archivos)
select t.lead_id, t.id, t.title, t.cliente_descripcion,
       coalesce(m.created_at, t.cliente_respuesta_at, now()),
       m.autor_nombre,
       t.cliente_respuesta, t.cliente_respuesta_at, t.cliente_respuesta_nota,
       case when t.cliente_respuesta is null then '[]'::jsonb else coalesce((
         select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'tamano', a.tamano, 'storage_path', a.storage_path, 'subido_at', a.created_at) order by a.created_at)
           from public.proyecto_archivos a
          where a.task_id = t.id and a.visible_cliente and a.created_at <= t.cliente_respuesta_at), '[]'::jsonb) end
  from public.tasks t
  left join lateral (
    select mv.created_at, mv.autor_nombre from public.lead_movimientos mv
     where mv.task_id = t.id and mv.detalle like 'Le pidió al cliente que apruebe %'
     order by mv.created_at desc limit 1) m on true
 where t.cliente_aprueba and t.lead_id is not null
   and not exists (select 1 from public.aprobaciones_cliente r where r.task_id = t.id);

comment on table public.aprobaciones_cliente is
  'El registro de lo que se le pidió aprobar al cliente desde su enlace: una fila por pedido, con lo que contestó y los archivos que tenía para mirar.';
comment on column public.aprobaciones_cliente.archivos is
  'Los archivos que el cliente tenía en ese punto al contestar, copiados en ese momento: [{ id, nombre, tamano, storage_path, subido_at }].';
comment on column public.aprobaciones_cliente.avisos is
  'A quién se le avisó del pedido y cuándo: [{ a: [nombres], correos: [..], cuando, quien }].';
