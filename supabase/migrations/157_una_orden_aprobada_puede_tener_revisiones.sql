-- 157 · Una orden aprobada puede cambiar: OC-01 → OC-01.1 → OC-01.2
--
-- Un adicional aprobado no siempre queda quieto. Se aprueba el piso de
-- hormigón, se empieza a picar y aparecen cuarenta metros más; o el cliente
-- pide otro acabado sobre el cambio que ya aceptó. Eso no es una orden nueva
-- —es la misma conversación, sobre el mismo trabajo— y tampoco es un error que
-- haya que anular: la orden original se ejecutó o estuvo vigente, y lo que
-- pasa es que se revisa.
--
-- En obra eso se llama OC-01.1, y después OC-01.2. El número guarda la
-- historia: cualquiera que vea "OC-01.2" sabe que hubo dos versiones antes y
-- las puede ir a buscar, y el cliente reconoce que es el mismo cambio que ya
-- había firmado.
--
-- ANULAR Y REVISAR NO SON LO MISMO, y la diferencia es lo que se le dice al
-- cliente. Una orden anulada no existió: fue un error y se emite otra. Una
-- orden revisada sí existió y sigue siendo la misma, con otro alcance.
--
-- EN EL CONTROL MANDA LA ÚLTIMA. Cuando la revisión se aprueba, los rubros de
-- la versión anterior salen y entran los suyos: si quedaran las dos, el
-- contrato vigente sumaría el mismo trabajo dos veces. La versión vieja no se
-- borra —queda con su PDF y sus firmas, que es lo que se firmó ese día— pero
-- deja de contar.

alter table public.ordenes_cambio add column if not exists revision_de bigint
  references public.ordenes_cambio(id) on delete set null;
alter table public.ordenes_cambio add column if not exists reemplazada_at timestamptz;

create index if not exists ordenes_cambio_revision on public.ordenes_cambio (revision_de);

comment on column public.ordenes_cambio.revision_de is
  'De qué orden es revisión. La OC-01.1 es revisión de la OC-01: mismo trabajo, otro alcance. Distinto de reemplaza_a, que apunta a una orden ANULADA —esa no existió—.';
comment on column public.ordenes_cambio.reemplazada_at is
  'Cuándo una revisión posterior tomó su lugar. La orden sigue existiendo con su PDF y sus firmas, pero sus rubros salieron del control: si contaran las dos, el contrato sumaría el mismo trabajo dos veces.';
