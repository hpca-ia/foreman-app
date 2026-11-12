-- 177 · Préstamos a la gente de obra, que se descuentan rol a rol.
--
-- Hasta hoy el rol tenía un casillero «Préstamos» donde se escribía a mano
-- cuánto descontar en ese rol. Nadie guardaba cuánto se prestó ni cuánto
-- falta: eso vivía en la memoria de quien lleva la caja, y al tercer mes ya
-- no hay con qué contestarle al trabajador cuánto debe.
--
-- Ahora el préstamo se anota una vez —a quién, cuánto, cuánto se descuenta
-- por rol— y cada rol propone solo su cuota hasta que el saldo llega a cero.
--
--   obra_prestamos        el préstamo. Sigue a la PERSONA por su cédula, no a
--                         su fila de obra_personal: la misma persona figura en
--                         varias filas (cada reingreso es una nueva).
--   obra_prestamo_cuotas  lo que se fue descontando. Cada cuota cuelga del rol
--                         en que se descontó: si ese rol se reabre, la cuota se
--                         borra con él y el saldo vuelve. Sin rol es un abono a
--                         mano (pagó en efectivo, se liquidó al salir).
--
-- No toca ninguna tabla ni fila que ya exista. Se puede correr más de una vez.

create table if not exists public.obra_prestamos (
  id             bigserial primary key,
  -- En qué obra se dio. Si el proyecto se borra, la deuda no desaparece.
  lead_id        bigint references public.leads(id) on delete set null,
  personal_id    bigint references public.obra_personal(id) on delete set null,
  cedula         text,
  nombre         text not null,
  fecha          date not null,
  monto          numeric(12,2) not null check (monto > 0),
  -- Cuánto se descuenta en cada rol.
  cuota          numeric(12,2) not null check (cuota > 0),
  motivo         text,
  anulado        boolean not null default false,
  creado_por     bigint,
  creado_nombre  text,
  created_at     timestamptz not null default now()
);

create index if not exists prestamos_por_cedula on public.obra_prestamos (cedula);

create table if not exists public.obra_prestamo_cuotas (
  id             bigserial primary key,
  prestamo_id    bigint not null references public.obra_prestamos(id) on delete cascade,
  rol_id         bigint references public.obra_roles(id) on delete cascade,
  rol_linea_id   bigint references public.obra_rol_lineas(id) on delete cascade,
  fecha          date not null,
  monto          numeric(12,2) not null check (monto > 0),
  nota           text,
  creado_por     bigint,
  creado_nombre  text,
  created_at     timestamptz not null default now()
);

create index if not exists cuotas_por_prestamo on public.obra_prestamo_cuotas (prestamo_id);
create index if not exists cuotas_por_rol on public.obra_prestamo_cuotas (rol_id);

comment on table public.obra_prestamos is 'Préstamos a la gente de obra. Se descuentan rol a rol; siguen a la persona por su cédula.';
comment on table public.obra_prestamo_cuotas is 'Lo descontado de cada préstamo. Con rol_id, salió de ese rol; sin él, es un abono a mano.';

do $$
declare t text;
begin
  foreach t in array array['obra_prestamos','obra_prestamo_cuotas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
