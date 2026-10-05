-- 077 · Lo que NOVA aprendió de las correcciones.
--
-- NOVA propone el cronograma valorado y alguien lo corrige. Hoy esa corrección
-- se pierde: en la obra siguiente vuelve a proponer lo mismo y hay que volver
-- a corregirlo. Eso convence a cualquiera de que la herramienta no aprende, y
-- deja de usarse — con razón.
--
-- Acá se guarda lo corregido como un patrón: "ventanería de aluminio" se paga
-- 50/30/20 con el anticipo cuatro meses antes de instalar. En la próxima obra
-- ese patrón entra en la consulta, y NOVA arranca sabiendo lo que esta oficina
-- ya decidió.
--
-- NO ES ENTRENAR UN MODELO, y conviene no confundirlo: es llevar un cuaderno y
-- leerlo antes de opinar. La ventaja es que se puede mirar, corregir y borrar
-- —una memoria que no se puede inspeccionar es una herramienta que falla sin
-- que nadie sepa por qué.
--
-- `veces` es lo que le da peso: un patrón confirmado seis veces pesa más que
-- uno de una obra sola, que pudo ser la excepción de ese proyecto.
--
-- Y `oficina` en vez de por proyecto a propósito: lo que se aprende de cómo se
-- paga una ventanería sirve en todas las obras, que es justamente la razón de
-- guardarlo.

create table if not exists public.nova_memoria (
  id          bigserial primary key,
  -- De qué sabe este apunte. Por ahora "valorado"; el día que NOVA aprenda de
  -- otra cosa —leer facturas, armar el cronograma— entra acá sin otra tabla.
  tema        text not null default 'valorado',
  -- Las palabras del rubro que lo hacen reconocible: "ventaneria aluminio".
  patron      text not null,
  perfil      text,                      -- importacion | fabricacion | contrato | ejecucion
  -- La forma del pago: [{"mes_relativo":0,"pct":50},…], contada desde el
  -- primer pago y no desde el mes 1 de la obra. Una ventanería se paga igual
  -- empiece en marzo o en septiembre; lo que no cambia es la distancia entre
  -- el anticipo y la instalación.
  pagos       jsonb,
  -- Cuántos meses antes de instalar sale el primer pago.
  anticipacion int,
  nota        text,                      -- por qué, en palabras
  ejemplo     text,                      -- el rubro que lo originó
  veces       int not null default 1,
  activo      boolean not null default true,
  creado_por  bigint, creado_nombre text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists memoria_por_tema on public.nova_memoria (tema, activo);

drop trigger if exists memoria_tocar on public.nova_memoria;
create trigger memoria_tocar before update on public.nova_memoria
  for each row execute function public.compras_tocar();

alter table public.nova_memoria enable row level security;
drop policy if exists "equipo foreman" on public.nova_memoria;
create policy "equipo foreman" on public.nova_memoria
  for all to authenticated using (true) with check (true);
