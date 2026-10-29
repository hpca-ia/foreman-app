-- 136 · Hasta cuándo cubre lo que se cotizó.
--
-- Una orden de cambio casi siempre es un trabajo: se hace y se termina. Pero
-- algunas son un ALQUILER —el generador por quince días, el andamio por un mes,
-- la bomba mientras dure la fundición— y esas tienen fecha de vencimiento: el
-- día dieciséis el generador sigue en la obra, el proveedor sigue facturando, y
-- la orden que lo cubría se quedó en quince.
--
-- Eso no se descubre solo. Se descubre cuando llega la factura del mes
-- siguiente por un alquiler que nadie autorizó, o peor: no se descubre, se paga
-- y se come el margen de la orden entera. Es la clase de plata que se pierde
-- sin que nadie haga nada mal.
--
-- Entonces la orden dice hasta cuándo cubre, y FOREMAN avisa antes y después.
--
-- `cubre_cerrado_at` es "ya se devolvió": se deja de avisar sin tener que
-- borrar la fecha, que es el dato que después explica por qué se cobró eso.

alter table public.ordenes_cambio
  add column if not exists cubre_desde      date,
  add column if not exists cubre_hasta      date,
  add column if not exists cubre_que        text,
  add column if not exists cubre_cerrado_at timestamptz;

create index if not exists ordenes_cambio_cubre_hasta
  on public.ordenes_cambio(cubre_hasta) where cubre_hasta is not null and cubre_cerrado_at is null;

comment on column public.ordenes_cambio.cubre_hasta is
  'Último día que cubre lo cotizado. Pasado ese día, lo que siga costando no está en ninguna orden: hay que extenderla o devolver lo alquilado.';
comment on column public.ordenes_cambio.cubre_que is
  'Qué es lo que tiene plazo: "alquiler del generador 20KVA". Es lo que se lee en el aviso.';
comment on column public.ordenes_cambio.cubre_cerrado_at is
  'Cuándo se devolvió o terminó. Deja de avisar sin borrar las fechas, que son las que después explican el cobro.';
