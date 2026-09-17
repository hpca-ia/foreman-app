-- NOVA contesta por WhatsApp.
--
-- Todo lo que se habla por ahí queda guardado, y no por prolijidad: sin esta
-- tabla NOVA contestaría dos veces el mismo mensaje (Meta reintenta el aviso
-- cuando la respuesta demora), no se acordaría de lo que se dijo hace dos
-- minutos —en WhatsApp uno escribe "ya está" y el "qué" quedó en el mensaje
-- anterior— y no habría cómo saber después quién le pidió qué.

create table if not exists public.whatsapp_mensajes (
  id           bigserial   primary key,
  -- El id que le pone Meta al mensaje. Es único a propósito: si el mismo aviso
  -- llega dos veces, el segundo choca contra este índice y se descarta.
  wa_id        text        unique,
  telefono     text        not null,
  usuario_id   bigint,
  usuario_nombre text,
  direccion    text        not null default 'entra',   -- entra | sale
  texto        text,
  created_at   timestamptz not null default now()
);

create index if not exists whatsapp_mensajes_tel_idx
  on public.whatsapp_mensajes (telefono, created_at desc);

-- Cerrada del todo: esto lo escribe y lo lee el servidor con la llave secreta.
-- Sin políticas, nadie que entre desde la app la ve —y ahí adentro están las
-- conversaciones de todos.
alter table public.whatsapp_mensajes enable row level security;

-- El teléfono es la credencial en WhatsApp: no hay clave que poner. Se busca
-- por él en cada mensaje, así que conviene que esté indexado.
create index if not exists usuarios_telefono_idx on public.usuarios (telefono);
