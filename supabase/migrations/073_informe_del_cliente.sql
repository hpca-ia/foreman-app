-- 073 · Lo que se le manda al cliente para que lo apruebe.
--
-- Un plano de detalle, un cambio de material, el acabado elegido: cosas que
-- hoy se mandan por correo y se aprueban por WhatsApp con un "dale". Después,
-- cuando el piso llegó en el tono que no era, "yo aprobé el otro" contra "me
-- dijiste que sí" no se resuelve, porque el sí vive en un chat que nadie
-- guardó y al que el cliente tampoco tiene por qué volver.
--
-- Acá cada cosa que se manda es una fila: qué se mandó, cuándo, quién la miró
-- y qué contestó. Eso es lo que convierte una conversación en un respaldo.
--
-- TRES RESPUESTAS Y NO DOS. "Aprobado" y "rechazado" no alcanzan: la respuesta
-- más común de un cliente frente a un plano es "sí, pero…", y sin un lugar
-- para el "pero" esa respuesta se va al teléfono y se pierde. Por eso existe
-- "con observaciones", que no frena la obra pero deja escrito qué dijo.
--
-- `plano`, `documento` y `cambio` son el mismo mecanismo con distinto nombre:
-- lo que cambia es qué espera uno al mandarlo, y eso ayuda a leer la lista
-- seis meses después. No se guarda como tabla aparte porque el circuito —se
-- manda, se mira, se contesta— es idéntico para los tres.

create table if not exists public.proyecto_entregas (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  obra_id         bigint,
  tipo            text not null default 'documento',   -- plano | documento | cambio
  titulo          text not null,
  descripcion     text,
  storage_path    text,
  archivo_nombre  text,
  -- enviado · esperando que lo mire
  -- aprobado · dijo que sí
  -- observado · dijo que sí con reparos, o que no: la nota lo explica
  estado          text not null default 'enviado',
  enviado_at      timestamptz not null default now(),
  enviado_por     bigint,
  enviado_nombre  text,
  cliente_visto_at    timestamptz,
  cliente_respuesta_at timestamptz,
  cliente_nota    text,
  created_at      timestamptz not null default now()
);
create index if not exists entregas_por_proyecto on public.proyecto_entregas (lead_id, estado);

-- La descripción de una foto de avance. La columna ya existía desde la 072;
-- esto es por si esa migración corrió antes de que se agregara.
alter table public.obra_avance_fotos add column if not exists descripcion text;

-- ── La llave del portal ──────────────────────────────────────────────────
--
-- El cliente no tiene usuario de FOREMAN y no debería tenerlo: no es del
-- equipo, entra tres veces al mes y pedirle que recuerde una contraseña es
-- garantizar que no entre. Entra por un enlace con una llave larga.
--
-- Una llave por proyecto, no una por persona: el enlace se reenvía entre el
-- cliente, su mujer y su arquitecto, y eso está bien —todos ven lo mismo, que
-- es lo que ya les mandaríamos por correo. Lo que importa es que esa llave
-- abra UN proyecto y nada más, y que se pueda apagar.
--
-- `portal_activo` existe aparte de la llave para poder cerrar el portal sin
-- perderla: al terminar la obra se apaga, y si el cliente pide volver a ver
-- las fotos se prende de nuevo con el mismo enlace que ya tiene.
alter table public.leads add column if not exists portal_token  text;
alter table public.leads add column if not exists portal_activo boolean not null default false;
create unique index if not exists leads_portal_token on public.leads (portal_token) where portal_token is not null;

alter table public.proyecto_entregas enable row level security;
drop policy if exists "equipo foreman" on public.proyecto_entregas;
create policy "equipo foreman" on public.proyecto_entregas
  for all to authenticated using (true) with check (true);
