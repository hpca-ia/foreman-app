-- 034 · Cuándo se envió un presupuesto, qué contestaron, y quién lo está
-- trabajando ahora mismo.
--
-- Un presupuesto enviado es un papel que está en manos del cliente: tiene que
-- poder mirarse dentro de un año tal como salió. Por eso se anota la fecha de
-- envío y a quién se mandó, y desde ahí no se toca más: lo que cambie va en la
-- versión siguiente.
--
-- La presencia es otra cosa: dos personas trabajando el mismo presupuesto se
-- pisan sin enterarse, porque gana el último que guarda. Cada quien anota que
-- lo está mirando y el otro lo ve al entrar. No es un candado —alguien deja la
-- pantalla abierta y se va— sino un aviso: la marca se vence sola.

alter table public.presupuestos add column if not exists enviado_at   timestamptz;
alter table public.presupuestos add column if not exists enviado_a    text;
alter table public.presupuestos add column if not exists enviado_por  text;
alter table public.presupuestos add column if not exists decidido_at  timestamptz;
alter table public.presupuestos add column if not exists decision_nota text;

-- estado: borrador | enviado | aprobado | no_aprobado
create table if not exists public.presupuesto_presencia (
  presupuesto_id bigint      not null references public.presupuestos(id) on delete cascade,
  usuario_id     bigint      not null,
  nombre         text,
  visto_at       timestamptz not null default now(),
  primary key (presupuesto_id, usuario_id)
);

alter table public.presupuesto_presencia enable row level security;
drop policy if exists "equipo foreman" on public.presupuesto_presencia;
create policy "equipo foreman" on public.presupuesto_presencia for all to authenticated using (true) with check (true);
