-- Usuarios y proyectos pasan a la base.
--
-- Hasta ahora vivían en el navegador de cada equipo (localStorage): un
-- proyecto creado en la laptop no existía en el teléfono, y un usuario
-- agregado en un equipo no podía entrar desde otro. Ahora hay una sola lista
-- para todos.
--
-- Los id se conservan tal cual venían del navegador, para que las tareas que
-- ya apuntan a un proyecto o a una persona sigan apuntando bien. La app sube
-- lo que cada equipo tenía guardado la primera vez que abre con esta versión.

create table if not exists public.usuarios (
  id             bigint primary key,
  nombre         text        not null,
  rol            text        not null default 'residente',  -- owner | assistant | gerente | residente
  -- El PIN no se guarda: se guarda su huella (SHA-256). Un PIN de cuatro
  -- dígitos igual se puede adivinar probando las diez mil combinaciones, así
  -- que esto evita que se lea a simple vista, no reemplaza un ingreso de verdad.
  pin_hash       text,
  color          text,
  email          text,
  telefono       text,
  activo         boolean     not null default true,
  created_at     timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

-- Un proyecto no es necesariamente una obra: también hay tareas de
-- administración, mensajería o gerencia. Si es obra, se enlaza a ella.
create table if not exists public.proyectos (
  id          bigint primary key,
  nombre      text        not null,
  color       text,
  tipo        text        not null default 'otro',   -- obra | administracion | mensajeria | gerencia | otro
  obra_id     bigint,
  activo      boolean     not null default true,
  created_by  bigint,
  created_at  timestamptz not null default now()
);

-- Quién está en cada proyecto. Quien no es admin solo ve y elige los
-- proyectos donde es miembro; las tareas de otros no las ve aunque compartan
-- proyecto, para que no haya roces entre personas del mismo rango.
create table if not exists public.proyecto_miembros (
  proyecto_id bigint not null,
  usuario_id  bigint not null,
  primary key (proyecto_id, usuario_id)
);
create index if not exists proyecto_miembros_usuario on public.proyecto_miembros (usuario_id);

-- Solo los admins ven las tareas de todos. El Gerente venía con ese permiso
-- encendido; se apaga. Sigue siendo un interruptor en Ajustes → Permisos.
update public.permisos_rol set activo = false
where rol = 'gerente' and permiso = 'tareas.todas';

-- La creé en la migración 008 para los teléfonos de WhatsApp y nunca se usó:
-- el teléfono ahora vive en usuarios.
drop table if exists public.usuarios_contacto;
