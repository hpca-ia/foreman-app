-- 036 · El enlace privado con el que cada quien ve sus tareas en su calendario.
--
-- Google Calendar, el calendario del iPhone y Outlook saben suscribirse a un
-- calendario por dirección web. FOREMAN publica una por persona, con sus
-- tareas y sus fechas, y así las ve donde ya mira su semana.
--
-- La dirección lleva una llave larga al azar, porque quien la tenga ve ese
-- calendario sin entrar a FOREMAN: es como una invitación. Si se filtra, se
-- borra la llave acá y la anterior deja de servir.

alter table public.usuarios add column if not exists calendario_token text;
create unique index if not exists usuarios_calendario_token on public.usuarios (calendario_token) where calendario_token is not null;
