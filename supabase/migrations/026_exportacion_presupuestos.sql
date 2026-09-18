-- Lo que acompaña a un presupuesto cuando sale: notas de contrato, firma,
-- membrete. Hasta ahora vivía en cada navegador —en el teléfono y en la laptop
-- había que configurarlo dos veces, y cada persona tenía sus propias notas—.
-- Pasa a la base, para toda la oficina.

-- ── El catálogo de notas y condiciones ──
-- Lo llena la oficina: se agregan, se corrigen y se retiran. "marcada" dice si
-- viene elegida de entrada en un presupuesto nuevo. Retirar no borra: un
-- presupuesto ya exportado puede seguir citando esa nota.
create table if not exists public.notas_presupuesto (
  id             bigserial   primary key,
  grupo          text        not null default 'General',
  texto          text        not null,
  marcada        boolean     not null default false,
  orden          int         not null default 0,
  activa         boolean     not null default true,
  creado_por     bigint,
  created_at     timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists notas_presupuesto_orden on public.notas_presupuesto (grupo, orden);

alter table public.notas_presupuesto enable row level security;
drop policy if exists "equipo foreman" on public.notas_presupuesto;
create policy "equipo foreman" on public.notas_presupuesto
  for all to authenticated using (true) with check (true);

-- El punto de partida, solo si el catálogo está vacío: correr esto dos veces
-- no duplica nada, y lo que la oficina ya haya cambiado no se pisa.
insert into public.notas_presupuesto (grupo, texto, marcada, orden)
select grupo, texto, marcada, orden from (values
  ('Alcance y medidas', 'El presente presupuesto corresponde al proyecto completo y está abierto a revisión del cliente para su modificación antes de la firma del contrato.', true, 10),
  ('Alcance y medidas', 'Las cantidades son referenciales y se ajustarán a las medidas reales en obra. Se pagará lo efectivamente ejecutado, según mediciones aprobadas por ambas partes.', true, 20),
  ('Alcance y medidas', 'Los precios unitarios incluyen materiales, mano de obra, herramienta menor, equipo y transporte, salvo que el rubro indique lo contrario.', true, 30),
  ('Alcance y medidas', 'Todo trabajo no descrito en este presupuesto se considera adicional: se presupuestará por separado y se ejecutará solo con aprobación escrita del cliente.', true, 40),
  ('Alcance y medidas', 'Las marcas y especificaciones son referenciales. Un cambio de material solicitado por el cliente se valorará como diferencia de precio.', false, 50),
  ('Alcance y medidas', 'El presupuesto se basa en los planos y especificaciones entregados a la fecha. Cambios de diseño posteriores se presupuestarán aparte.', false, 60),
  ('Precios y forma de pago', 'Forma de pago: 50 % de anticipo a la firma del contrato y el saldo contra planillas de avance de obra.', true, 10),
  ('Precios y forma de pago', 'Las planillas de avance se presentarán cada quince días y se pagarán dentro de los ocho días siguientes a su aprobación.', false, 20),
  ('Precios y forma de pago', 'Si el costo de los materiales principales sube más de un 5 % durante la ejecución, los precios afectados podrán reajustarse con la debida justificación.', false, 30),
  ('Precios y forma de pago', 'De cada planilla se retendrá un 5 % como garantía de buena ejecución, que se devolverá a la entrega de la obra.', false, 40),
  ('Plazo y condiciones de obra', 'El plazo de ejecución se contará desde la entrega del anticipo y del sitio de trabajo, según el cronograma acordado.', false, 10),
  ('Plazo y condiciones de obra', 'El cliente entregará el sitio libre y con acceso, con puntos de agua y energía eléctrica disponibles para la obra.', true, 20),
  ('Plazo y condiciones de obra', 'No incluye permisos municipales, tasas, estudios técnicos ni acometidas de servicios, salvo que consten como rubro.', true, 30),
  ('Plazo y condiciones de obra', 'No incluye mobiliario, equipamiento, decoración ni obras exteriores que no estén descritas.', false, 40),
  ('Plazo y condiciones de obra', 'El desalojo de escombros se realiza hasta botaderos autorizados.', false, 50),
  ('Plazo y condiciones de obra', 'Los trabajos se realizarán en horario laboral de lunes a viernes. Trabajos fuera de ese horario, a pedido del cliente, tendrán un recargo.', false, 60),
  ('Garantía', 'Garantía de doce meses sobre la mano de obra, contados desde la entrega de la obra.', true, 10),
  ('Garantía', 'Los materiales y equipos tienen la garantía de su fabricante.', false, 20)
) as v(grupo, texto, marcada, orden)
where not exists (select 1 from public.notas_presupuesto);

-- ── Lo predeterminado de la oficina ──
-- Clave y valor: hoy guarda cómo sale un presupuesto (plantilla, membrete,
-- firma, validez, IVA); mañana, lo que haga falta sin otra migración.
create table if not exists public.ajustes_oficina (
  clave           text        primary key,
  valor           jsonb       not null,
  actualizado_por bigint,
  actualizado_at  timestamptz not null default now()
);

alter table public.ajustes_oficina enable row level security;
drop policy if exists "equipo foreman" on public.ajustes_oficina;
create policy "equipo foreman" on public.ajustes_oficina
  for all to authenticated using (true) with check (true);

-- ── Lo que eligió cada presupuesto al salir ──
-- Al volver a exportarlo sale igual que la última vez; la versión 2 tiene sus
-- propias notas y su propia firma, sin tocar las de la versión 1.
alter table public.presupuestos add column if not exists exportacion jsonb;
