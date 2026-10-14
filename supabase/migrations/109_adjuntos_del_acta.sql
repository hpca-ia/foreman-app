-- 109 · Los anexos del acta.
--
-- Las fotos son lo que se vio en obra ese día. Los anexos son otra cosa: el
-- plano sobre el que se decidió, la proforma que se discutió, el informe de
-- laboratorio, el PDF que mandó el proveedor y que explica por qué se atrasa.
--
-- Un acta que dice "se aprueba el cambio según el plano presentado" y no lleva
-- el plano adjunto no sirve para nada tres meses después: nadie va a poder
-- decir CUÁL plano, y la decisión queda tan floja como si no se hubiera
-- escrito. El documento que respalda el acuerdo viaja con el acuerdo.
--
-- Van aparte de las fotos porque se usan distinto: una foto se mira, un anexo
-- se abre y se guarda. Mezclarlos deja una galería con rectángulos grises que
-- no se pueden ver y archivos que nadie encuentra.

create table if not exists public.acta_adjuntos (
  id           bigserial primary key,
  acta_id      bigint not null references public.obra_actas(id) on delete cascade,
  storage_path text not null,
  nombre       text not null,
  tipo         text,
  bytes        bigint,
  descripcion  text,
  orden        integer not null default 0,
  autor_id     bigint, autor_nombre text,
  created_at   timestamptz not null default now()
);
create index if not exists acta_adjuntos_por_acta on public.acta_adjuntos (acta_id, orden);

do $$
begin
  execute 'alter table public.acta_adjuntos enable row level security';
  execute 'drop policy if exists "equipo foreman" on public.acta_adjuntos';
  execute 'create policy "equipo foreman" on public.acta_adjuntos for all to authenticated using (true) with check (true)';
end $$;
