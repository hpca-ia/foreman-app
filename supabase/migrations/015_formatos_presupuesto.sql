-- Formatos de presupuesto que FOREMAN ya sabe leer.
--
-- Cada oficina, cliente o contratista arma su Excel distinto. La primera vez
-- NOVA reconoce qué columna es cuál, o la persona que importa la corrige.
-- Cuando la obra se crea, ese mapa se guarda junto con los títulos de columna
-- del Excel. Si después llega otro presupuesto con los mismos títulos, se lee
-- con el mapa guardado, sin volver a adivinar. Así la lectura mejora con el
-- uso: lo que alguien corrigió una vez queda aprendido para todos.

create table if not exists public.formatos_presupuesto (
  id              bigserial primary key,
  firma           text        not null unique,   -- títulos de columna normalizados, con su posición
  encabezados     jsonb,                          -- los títulos tal como venían, para mostrarlos
  mapa            jsonb       not null,           -- qué columna es cuál (índices desde 0)
  veces           int         not null default 1, -- cuántas obras se importaron con este formato
  ejemplo_archivo text,                           -- el nombre del primer Excel que lo usó
  creado_por      bigint,
  created_at      timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);
