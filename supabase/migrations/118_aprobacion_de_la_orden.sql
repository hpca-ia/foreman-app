-- 118 · La orden de cambio se aprueba por correo, persona por persona.
--
-- Una orden de cambio es el documento con el que se cobra un trabajo que no
-- estaba en el contrato. Hasta ahora salía por correo a una lista y las tres
-- firmas —contratista, fiscalización, contratante— se escribían a mano en
-- FOREMAN: alguien de la oficina tecleaba el nombre del que había dicho que sí
-- por teléfono. Eso no es una aprobación, es una anotación.
--
-- Igual que el acta de reunión: cada uno recibe SU enlace, entra sin cuenta
-- —el fiscalizador y el cliente no tienen una, y pedirles que se registren
-- para aprobar un cambio es garantizar que no lo aprueben— y aprueba u objeta.
-- Queda quién, cuándo y desde dónde.
--
-- UNA LLAVE POR PERSONA, no una por orden: con una sola, cualquiera de los
-- cinco podría aprobar —o negar— en nombre de los otros cuatro, y la firma no
-- valdría para nada.

create table if not exists public.orden_cambio_aprobaciones (
  id              bigserial primary key,
  orden_id        bigint not null references public.ordenes_cambio(id) on delete cascade,
  nombre          text,
  email           text not null,
  -- contratista · fiscalizacion · contratante · otro. Es el papel con el que
  -- firma, y es lo que después se lee en el documento.
  rol             text,
  token           text unique,
  envio_id        text,
  envio_estado    text,
  envio_at        timestamptz,
  visto_at        timestamptz,
  aprobado_at     timestamptz,
  aprobado_ip     text,
  observacion     text,
  observacion_at  timestamptz,
  creado_por      bigint,
  creado_nombre   text,
  created_at      timestamptz not null default now()
);

create index if not exists oc_aprob_orden on public.orden_cambio_aprobaciones (orden_id);
create index if not exists oc_aprob_token on public.orden_cambio_aprobaciones (token);

alter table public.orden_cambio_aprobaciones enable row level security;
do $$ begin
  create policy "equipo foreman" on public.orden_cambio_aprobaciones for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.orden_cambio_aprobaciones is
  'Quién tiene que aprobar cada orden de cambio, si le llegó el correo y si aprobó u objetó.';
