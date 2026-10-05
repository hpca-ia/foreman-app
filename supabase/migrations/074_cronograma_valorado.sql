-- 074 · El cronograma valorado: cuánto se gasta cada mes.
--
-- Sale del presupuesto de la obra y se extiende los meses que dure. Cada rubro
-- reparte su total entre esos meses, y la suma de la fila es el rubro entero.
-- Es una guía, no una promesa: contra ella se compara lo planillado, y la
-- diferencia mes a mes es la única respuesta honesta a "¿vamos bien?" — no
-- cuántos metros se levantaron, sino si lo gastado se parece a lo previsto.
--
-- Para el cliente es otra cosa y más importante: le dice cuándo desembolsar.
-- Un cronograma de barras le avisa que la mampostería empieza en marzo; este
-- le dice que en marzo tiene que tener 48 mil. Lo segundo es lo que hace que
-- la plata llegue a tiempo.
--
-- SE GUARDA EN PORCENTAJES Y NO EN PLATA, aunque el Excel del que viene esté
-- en plata. El Excel pone =I16/2 en dos meses y queda atado al monto de ese
-- día; cuando entra una orden de cambio y el rubro pasa de 40 mil a 52, hay
-- que rehacer la fila a mano y nadie lo hace. Con porcentajes la curva se
-- corrige sola y sigue cerrando en el presupuesto vigente.
--
-- Los montos son CON IVA, igual que `obra_rubros.total_base` y que el Excel:
-- comparar un valorado sin IVA contra facturas con IVA infla el avance un 15%.

create table if not exists public.cronograma_valorado (
  id          bigserial primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  obra_id     bigint,
  nombre      text not null default 'Cronograma valorado',
  -- El primer mes, como "2026-03". Mes y no fecha: el valorado no promete días.
  mes_inicio  text not null,
  meses       int  not null default 6,
  -- Lo que ve el cliente en su portal. Apagado mientras se arma.
  visible_cliente boolean not null default false,
  created_by  bigint,
  created_nombre text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists valorado_por_proyecto on public.cronograma_valorado (lead_id);

-- Una línea por rubro, como en el Excel. Puede colgar en cambio de una
-- agrupación, para los valorados gruesos que se arman en una tarde.
create table if not exists public.cronograma_valorado_lineas (
  id            bigserial primary key,
  cronograma_id bigint not null references public.cronograma_valorado(id) on delete cascade,
  obra_rubro_id     bigint,
  obra_actividad_id bigint,
  -- Copiados al armar la línea: el valorado se lee solo, sin cruzar tablas, y
  -- sigue legible aunque después alguien renombre el rubro.
  codigo      text,
  descripcion text,
  capitulo    text,
  monto       numeric(14,2) not null default 0,
  -- Un porcentaje por mes: [50, 50] es mitad y mitad. La fila cierra en 100.
  pesos       jsonb not null default '[]'::jsonb,
  orden       int not null default 0
);
create index if not exists valorado_lineas on public.cronograma_valorado_lineas (cronograma_id, orden);

drop trigger if exists valorado_tocar on public.cronograma_valorado;
create trigger valorado_tocar before update on public.cronograma_valorado
  for each row execute function public.compras_tocar();

do $$
declare t text;
begin
  foreach t in array array['cronograma_valorado','cronograma_valorado_lineas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo foreman" on public.%I', t);
    execute format('create policy "equipo foreman" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
