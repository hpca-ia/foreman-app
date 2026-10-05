-- 075 · Mano de obra: asistencia, rol de pagos, y el gasto al control.
--
-- Hoy esto vive en un Excel con cuatro hojas que se pasan de mano en mano: el
-- residente anota la asistencia en papel, alguien la pasa a la hoja, las
-- fórmulas arman el rol, y el gasto de la mano de obra —que en una obra es
-- entre el 25 y el 40 por ciento— entra al control de obra tarde o no entra.
--
-- Es un módulo nuevo, pero no uno aislado: le sirve a tres personas distintas
-- y por eso no puede colgar de ninguna.
--
--   · AL RESIDENTE le sirve la asistencia, que es lo único que él sabe y que
--     tiene que anotar el mismo día. Un parte de asistencia reconstruido el
--     viernes es una invención con buena intención.
--   · AL LIBRO DE OBRA le sirve como dato: cuánta gente hubo cada día es la
--     mitad de lo que se discute cuando hay un atraso.
--   · A LA ADMINISTRACIÓN le sirve el rol, que es lo que se paga.
--   · AL CONTROL DE OBRA le sirve el gasto, una vez pagado.
--
-- La asistencia se guarda POR DÍA Y POR PERSONA, no por quincena. Un total de
-- la quincena no se puede auditar: cuando alguien reclama que le faltó un día,
-- hay que creerle o no creerle. Con el día anotado se mira y se corrige.

create table if not exists public.obra_personal (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  obra_id         bigint,
  nombre          text not null,
  cedula          text,
  cargo           text,
  fecha_ingreso   date,
  fecha_salida    date,
  salario_mensual numeric(12,2) not null default 0,
  acumula_fondos  boolean not null default false,
  activo          boolean not null default true,
  nota            text,
  created_at      timestamptz not null default now()
);
create index if not exists personal_por_obra on public.obra_personal (lead_id, activo);

create table if not exists public.obra_asistencia (
  id           bigserial primary key,
  obra_id      bigint,
  lead_id      bigint not null references public.leads(id) on delete cascade,
  personal_id  bigint not null references public.obra_personal(id) on delete cascade,
  fecha        date not null,
  -- 1 día entero, 0.5 medio, 0 faltó. Que exista el medio día es lo que evita
  -- la discusión de fin de mes sobre el jueves que se fue a las once.
  dias         numeric(4,2) not null default 1,
  he25         numeric(6,2) not null default 0,
  he50         numeric(6,2) not null default 0,
  he75         numeric(6,2) not null default 0,
  he100        numeric(6,2) not null default 0,
  transporte   numeric(4,2) not null default 0,
  alimentacion numeric(4,2) not null default 0,
  nota         text,
  anotado_por  bigint,
  created_at   timestamptz not null default now(),
  unique (personal_id, fecha)
);
create index if not exists asistencia_por_dia on public.obra_asistencia (lead_id, fecha);

-- El rol de un período. Al cerrarlo, los números se congelan en las líneas:
-- si se recalculara siempre, cambiar el salario de alguien en junio
-- reescribiría su recibo de marzo, que ya cobró y firmó.
create table if not exists public.obra_roles (
  id             bigserial primary key,
  lead_id        bigint not null references public.leads(id) on delete cascade,
  obra_id        bigint,
  desde          date not null,
  hasta          date not null,
  estado         text not null default 'borrador',   -- borrador | cerrado | pagado
  -- Los parámetros con los que se calculó, guardados con el rol: el básico y
  -- los porcentajes cambian todos los años, y un recibo viejo tiene que poder
  -- explicarse con los números de su año.
  parametros     jsonb,
  total          numeric(14,2) not null default 0,
  a_pagar        numeric(14,2) not null default 0,
  pagado_at      timestamptz,
  factura_id     bigint,        -- el gasto que entró al control de obra
  cerrado_por    bigint, cerrado_nombre text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists roles_por_obra on public.obra_roles (lead_id, desde);

create table if not exists public.obra_rol_lineas (
  id            bigserial primary key,
  rol_id        bigint not null references public.obra_roles(id) on delete cascade,
  personal_id   bigint,
  nombre        text,
  cargo         text,
  salario_mensual numeric(12,2),
  dias          numeric(6,2),
  he25 numeric(6,2), he50 numeric(6,2), he75 numeric(6,2), he100 numeric(6,2),
  -- Lo que se le descuenta a esta persona en este rol. Se escribe a mano
  -- porque no sale de ningún lado: lo sabe quien lleva la caja.
  anticipos      numeric(12,2) not null default 0,
  prestamos      numeric(12,2) not null default 0,
  quirografarios numeric(12,2) not null default 0,
  multas         numeric(12,2) not null default 0,
  -- El resultado congelado al cerrar.
  calculo        jsonb,
  total          numeric(12,2) not null default 0,
  a_pagar        numeric(12,2) not null default 0
);
create index if not exists rol_lineas_por_rol on public.obra_rol_lineas (rol_id);

-- Los parámetros vigentes de la oficina. Uno solo, el de hoy; los de los roles
-- viejos viven congelados en cada rol.
alter table public.ajustes_oficina add column if not exists nomina_sbu            numeric(10,2);
alter table public.ajustes_oficina add column if not exists nomina_horas_mes      int;
alter table public.ajustes_oficina add column if not exists nomina_dias_mes       int;
alter table public.ajustes_oficina add column if not exists nomina_aporte_pct     numeric(6,3);
alter table public.ajustes_oficina add column if not exists nomina_fondos_pct     numeric(6,3);
alter table public.ajustes_oficina add column if not exists nomina_transporte     numeric(10,2);
alter table public.ajustes_oficina add column if not exists nomina_alimentacion   numeric(10,2);

do $$
declare t text;
begin
  foreach t in array array['obra_personal','obra_asistencia','obra_roles','obra_rol_lineas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
