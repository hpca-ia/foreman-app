-- 104 · Que el cronograma se entere de las órdenes de cambio.
--
-- Una orden de cambio aprobada es trabajo nuevo con fecha de aprobación, un
-- monto y —muchas veces— un impacto en plazo que alguien ya escribió al
-- emitirla. Todo eso vive en Control de Obra y el cronograma no lo mira.
--
-- Lo que pasa entonces es lo de siempre: la obra sigue prometiendo la fecha
-- del contrato mientras acumula trabajo que nadie puso en el tiempo, y el
-- atraso aparece recién cuando ya no se puede justificar. Una ampliación de
-- plazo se pide con la orden en la mano y en el momento, no tres meses
-- después.
--
-- Hace falta UNA cosa sola para cerrar el circuito: saber si el cronograma ya
-- tomó esa orden o todavía no. Sin eso, o se avisa siempre —y el aviso se
-- vuelve parte del paisaje— o no se avisa nunca.

alter table public.ordenes_cambio
  add column if not exists crono_aplicada_at timestamptz;

comment on column public.ordenes_cambio.crono_aplicada_at is
  'Cuándo el cronograma absorbió esta orden. Nulo: todavía no, y se avisa.';
