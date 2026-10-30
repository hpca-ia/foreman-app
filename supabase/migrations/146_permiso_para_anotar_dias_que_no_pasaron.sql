-- 146 · Permiso para anotar días que todavía no pasaron.
--
-- La asistencia es una firma: dice que esta persona trabajó este día. Anotar
-- por adelantado un día que todavía no pasó es firmar algo que no ocurrió, y
-- el día que haya que defender un rol de pagos —ante el trabajador, ante el
-- Ministerio— eso no se puede explicar.
--
-- Pero a veces hace falta, y por una razón legítima: el cierre de mes cae un
-- miércoles y el rol tiene que salir el jueves, con los dos días que faltan. La
-- respuesta no es prohibirlo ni dejarlo abierto: es que alguien lo autorice,
-- por los días que haga falta y nada más.
--
--   el residente lo pide  →  el gerente o el Director lo da, hasta tal día
--                         →  el residente llena esos días
--
-- Queda escrito quién lo pidió, quién lo dio, hasta cuándo y por qué. Un
-- permiso que vence solo no hay que acordarse de quitarlo, que es como se
-- convierten en permanentes los permisos temporales.

create table if not exists public.asistencia_permisos (
  id            bigserial primary key,
  lead_id       bigint not null references public.leads(id) on delete cascade,
  -- Hasta qué día se puede anotar por adelantado. Nunca "para siempre".
  hasta         date not null,
  motivo        text,
  -- pedido: espera autorización · dado: se puede anotar · negado
  estado        text not null default 'pedido',
  pedido_por    bigint, pedido_nombre text,
  pedido_at     timestamptz not null default now(),
  dado_por      bigint, dado_nombre text, dado_at timestamptz,
  respuesta     text
);
create index if not exists asistencia_permisos_lead on public.asistencia_permisos (lead_id, estado, hasta);

alter table public.asistencia_permisos enable row level security;
do $$ begin
  create policy "equipo foreman" on public.asistencia_permisos for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- LA REGLA VIVE EN LA BASE, no en la pantalla.
--
-- Una pantalla que esconde el campo se saltea con otra pantalla, y lo que se
-- discute después es la fila de la tabla, no el botón que la creó.
create or replace function public.asistencia_solo_lo_que_paso() returns trigger
language plpgsql as $$
declare
  hoy date := (now() at time zone 'America/Guayaquil')::date;
  hasta date;
begin
  if new.fecha <= hoy then
    return new;
  end if;
  select max(p.hasta) into hasta
    from public.asistencia_permisos p
   where p.lead_id = new.lead_id and p.estado = 'dado' and p.hasta >= new.fecha;
  if hasta is null then
    raise exception 'Ese día todavía no pasó. Para anotarlo por adelantado hace falta el permiso del gerente o del Director.';
  end if;
  return new;
end $$;

drop trigger if exists asistencia_solo_lo_que_paso on public.obra_asistencia;
create trigger asistencia_solo_lo_que_paso before insert or update on public.obra_asistencia
  for each row execute function public.asistencia_solo_lo_que_paso();

comment on table public.asistencia_permisos is
  'Autorización para anotar asistencia de días que todavía no pasaron: el cierre de mes que cae antes del fin de semana. La pide el residente y la da el gerente o el Director, por los días que haga falta.';
