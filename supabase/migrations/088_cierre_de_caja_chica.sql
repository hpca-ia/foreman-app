-- 088 · Cerrar una vuelta de caja chica.
--
-- Una caja chica no es una cuenta que corre para siempre: va por vueltas. Se
-- entrega un fondo, se gasta, se rinde, y recién entonces se repone. El abono
-- nuevo ES el acuse de que la vuelta anterior se rindió — por eso habilita el
-- cierre: nadie repone una caja que todavía no le rindieron.
--
-- Sin cierre, la caja es una lista que crece sin fin. Al mes cuatro nadie sabe
-- qué gastos ya se revisaron y cuáles no, el responsable no tiene con qué
-- probar que rindió, y una diferencia de hace tres meses se discute con el
-- listado entero abierto en la pantalla.
--
-- El cierre congela: estos gastos, hasta esta fecha, suman esto, y con el
-- fondo que había queda este saldo. Lo que venga después es otra vuelta.
--
-- No se borra nada ni se mueve plata: cerrar es ponerle una marca y una fecha
-- a lo que ya pasó. Los gastos siguen donde estaban, con su foto y su rubro;
-- lo único que cambia es que dejan de estar "por rendir".

create table if not exists public.cajas_cierres (
  id             bigserial primary key,
  caja_id        bigint not null,
  numero         int    not null default 1,
  -- Hasta qué día entra. Lo elige quien cierra: un gasto del viernes puede
  -- corresponder a la vuelta que se cierra el lunes.
  hasta          date   not null,
  -- La foto del momento. Guardada y no recalculada: si mañana alguien corrige
  -- un gasto viejo, la rendición que se firmó no puede cambiar sola.
  gastos         int           not null default 0,
  total_gastado  numeric(14,2) not null default 0,
  total_abonado  numeric(14,2) not null default 0,
  saldo          numeric(14,2) not null default 0,
  nota           text,
  cerrado_por    bigint,
  cerrado_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists cajas_cierres_caja on public.cajas_cierres (caja_id, numero);

-- A qué vuelta pertenece cada movimiento. Nulo es "todavía por rendir", que
-- es el estado normal de lo que se gastó esta semana.
alter table public.cajas_gastos    add column if not exists cierre_id bigint;
alter table public.cajas_anticipos add column if not exists cierre_id bigint;
create index if not exists cajas_gastos_cierre    on public.cajas_gastos (cierre_id);
create index if not exists cajas_anticipos_cierre on public.cajas_anticipos (cierre_id);

do $$
begin
  execute 'alter table public.cajas_cierres enable row level security';
  execute 'drop policy if exists "equipo foreman" on public.cajas_cierres';
  execute 'create policy "equipo foreman" on public.cajas_cierres for all to authenticated using (true) with check (true)';
end $$;
