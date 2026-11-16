-- 183 · Quitar a alguien de las listas del proyecto, sin tocar los documentos.
--
-- La gente de un proyecto no se carga en un solo lugar: se arma sola de los de
-- siempre del acta, de quienes asistieron a las actas, de quienes firmaron
-- órdenes de cambio y de a quién se le mandó el libro de obra. Desde el
-- 16/11/2026 esa lista entera se ve en la ficha del proyecto, pestaña «Gente».
--
-- Lo que no se podía: sacar de ahí a quien solo figura en un documento ya
-- enviado. Una dirección mal escrita a la que se le mandó un libro, o alguien
-- que ya no está en la obra, seguía apareciendo en cada lista para mandar —la
-- del libro, la de las órdenes, la del plan— porque del acta, la orden o el
-- libro no se borra a nadie: son documentos.
--
-- Esta tabla es la lista de los que se quitaron. No borra nada: el que está
-- acá deja de ofrecerse para los envíos que vengan, y en los documentos ya
-- hechos sigue figurando igual. Se lo vuelve a poner desde la misma pestaña.
--
-- Manda lo cargado a mano: si a alguien que está acá se lo vuelve a cargar en
-- los de siempre o en la ficha, aparece de nuevo aunque su fila siga acá.
--
-- No cambia ningún dato existente. Se puede correr más de una vez.

create table if not exists public.proyecto_gente_oculta (
  lead_id       bigint not null references public.leads(id) on delete cascade,
  -- En minúsculas y sin espacios: es la identidad de la persona en las listas.
  email         text   not null,
  -- El nombre con que figuraba al quitarla, para reconocerla al volver a ponerla.
  nombre        text,
  oculto_por    bigint,
  oculto_nombre text,
  oculto_at     timestamptz not null default now(),
  primary key (lead_id, email),
  constraint proyecto_gente_oculta_email_limpio check (email = lower(btrim(email)) and email <> '')
);

alter table public.proyecto_gente_oculta enable row level security;
do $$ begin
  create policy "equipo foreman" on public.proyecto_gente_oculta for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.proyecto_gente_oculta is
  'A quién se quitó de las listas de un proyecto (ficha → Gente). No borra documentos: solo deja de ofrecerse para los envíos que vengan.';
