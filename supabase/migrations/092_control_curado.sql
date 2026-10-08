-- 092 · El control se puede acomodar sin tocar el presupuesto aprobado.
--
-- Hoy el "Presupuesto original" y el control leen la MISMA tabla. Eso tiene una
-- consecuencia que no se ve hasta que uno quiere acomodar algo: esconder un
-- rubro inútil o moverlo de capítulo cambiaría también el documento que el
-- cliente aprobó y firmó. Y ese no se toca: es la referencia contra la que se
-- mide todo lo demás, y una obra que no puede mostrar el presupuesto tal como
-- se aprobó pierde la única defensa que tiene en una discusión de planillas.
--
-- Entonces se separan las dos lecturas sobre la misma fila: el capítulo con el
-- que NACIÓ queda guardado, y el otro es el de trabajo. El control usa el de
-- trabajo; el presupuesto original, el de nacimiento, y no mira `oculto`.

-- Rubros que estorban. Un presupuesto importado trae renglones en $0 —títulos
-- sueltos, partidas que quedaron sin precio, líneas de totales que se colaron—
-- y en una obra de ciento sesenta rubros son ruido que se lee todos los días.
--
-- SE ESCONDEN, NO SE BORRAN. Borrarlos sería perder lo que el presupuesto
-- decía, y además hay que poder traerlos de vuelta: hoy no sirven y el mes que
-- viene alguien pregunta por uno. Y como están en $0, esconderlos no mueve un
-- centavo de ningún total; por eso solo se permite esconder los que están en
-- cero y sin plata asignada.
alter table public.obra_rubros add column if not exists oculto boolean not null default false;

-- El capítulo con el que el rubro entró. Se llena una vez, con lo que hay hoy:
-- en todo lo existente el de trabajo y el original son el mismo, que es la
-- verdad —nadie movió nada todavía—.
alter table public.obra_rubros add column if not exists capitulo_original text;
alter table public.obra_rubros add column if not exists capitulo_orden_original int;

update public.obra_rubros
   set capitulo_original = capitulo,
       capitulo_orden_original = capitulo_orden
 where capitulo_original is null;

create index if not exists obra_rubros_oculto on public.obra_rubros (obra_id, oculto);

comment on column public.obra_rubros.oculto is
  'Escondido del control. El presupuesto original lo sigue mostrando. Solo para rubros en $0.';
comment on column public.obra_rubros.capitulo_original is
  'El capítulo con el que se aprobó. El presupuesto original lee éste; el control lee "capitulo".';
