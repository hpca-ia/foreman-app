-- Los archivos dejan de tener dirección pública.
--
-- Hasta ahora, cualquiera con el enlace abría la foto de una factura, el
-- presupuesto original de una obra o un adjunto de una tarea, sin entrar a
-- FOREMAN. Desde acá el depósito es privado: la app pide un enlace temporal
-- para cada archivo, y solo se lo dan a quien tiene sesión.
--
-- El logo de la empresa es la excepción y va a un depósito público aparte:
-- aparece en correos y PDF, donde un enlace que caduca se vería roto, y no es
-- información de nadie.

update storage.buckets set public = false where id = 'task-files';

insert into storage.buckets (id, name, public)
values ('publico', 'publico', true)
on conflict (id) do update set public = true;

-- Una sola regla, como en las tablas: quien entró puede ver y subir. Las reglas
-- viejas se borran, que son las que dejaban entrar a cualquiera.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "equipo foreman archivos" on storage.objects
  for all to authenticated
  using (bucket_id in ('task-files', 'publico'))
  with check (bucket_id in ('task-files', 'publico'));

-- El logo se lee sin entrar; nada más.
create policy "logo publico" on storage.objects
  for select to anon
  using (bucket_id = 'publico');
