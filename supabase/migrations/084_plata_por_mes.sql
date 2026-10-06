-- 084 · Cuánta plata puede poner el cliente por mes.
--
-- El cronograma dice cuándo se hace cada cosa, y de ahí sale cuánta plata hace
-- falta cada mes. Pero el cliente no desembolsa lo que el cronograma pide:
-- desembolsa lo que puede. Si el plan concentra 180 mil en el mes 3 y el
-- cliente pone 120, ese mes no se ejecuta como está escrito — se para la obra,
-- que es la peor manera de enterarse de que el cronograma era optimista.
--
-- Guardado acá y no en una pantalla porque es un hecho del proyecto, igual que
-- el plazo: lo sabe quien negoció el contrato y lo usan los dos cronogramas.
--
-- Vacío quiere decir "sin restricción", que es el caso de la mayoría de las
-- obras y por eso no tiene valor por defecto: poner un techo inventado haría
-- que la app empiece a mover actividades por una limitación que nadie dijo.

alter table public.leads add column if not exists crono_tope_mes numeric(14,2);
