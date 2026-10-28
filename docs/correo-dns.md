# Que los correos de FOREMAN no caigan en no deseados

FOREMAN manda las actas, el libro de obra y las órdenes de cambio desde
`FOREMAN <notificaciones@hcastudio.com>`, a través de Resend.

Quien recibe un correo automático no decide si lo lee: lo decide el filtro de
su empresa. Y el filtro mira tres cosas antes que el texto — si el correo está
firmado por el dominio que dice ser (DKIM), si el servidor que lo mandó está
autorizado (SPF), y qué pide el dominio que se haga cuando algo de eso falla
(DMARC).

## Cómo está hoy (revisado el 28/10/2026)

| | Estado |
|---|---|
| **DKIM** | ✅ `resend._domainkey.hcastudio.com` existe y firma a nombre de hcastudio.com |
| **SPF** | ⚠️ el del dominio no incluye a Resend: `v=spf1 include:_spf.google.com +a +mx +ip4:50.87.253.137 +include:websitewelcome.com ~all` |
| **Subdominio de envío** | ❌ `send.hcastudio.com` no tiene registros |
| **DMARC** | ⚠️ `v=DMARC1; p=none;` — sin política y **sin reportes**: nadie se entera si alguien rechaza |

Medido sobre lo enviado: 24 actas entregadas, **0 rebotes y 0 quejas**; las 4
órdenes de cambio, abiertas. Hoy no hay un problema de entrega: hay riesgo de
que terminen en la carpeta equivocada, y ninguna manera de enterarse.

## Los tres cambios, en orden de lo que rinde

Todo se hace en **Bluehost → Domains → hcastudio.com → DNS**, salvo el paso 1
que empieza en Resend.

### 1. Los registros del subdominio de envío (SPF alineado)

En **Resend → Domains → hcastudio.com** aparecen dos registros para
`send.hcastudio.com` que todavía no están puestos. Son específicos de la cuenta
y de la región, así que hay que copiarlos de ahí tal cual. Tienen esta forma:

| Tipo | Nombre | Valor | Prioridad |
|---|---|---|---|
| MX | `send` | `feedback-smtp.<región>.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

> **No toques el SPF del dominio raíz.** Dos registros SPF en el mismo nombre
> hacen que SPF falle entero, que es peor que no tenerlo. El SPF nuevo va en
> `send`, que es un nombre distinto.

Con esto el correo pasa SPF **con tu dominio** y no solo con el de Resend.

### 2. DMARC con reportes

Reemplazar el TXT que ya existe en `_dmarc` (editar, no agregar otro):

| Tipo | Nombre | Valor |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@hcastudio.com; fo=1` |

`p=none` no bloquea nada: solo pide los informes. A partir de ahí llegan
resúmenes de Google, Microsoft y los demás diciendo cuántos correos pasaron y
cuántos no. **Esa casilla tiene que existir** — si no se quiere crear una,
poner una real (`hernan@hcastudio.com`).

Cuando un mes de informes venga limpio, subir a `p=quarantine`.

### 3. Mandar desde un subdominio (cuando haya tiempo)

Hoy los avisos automáticos comparten reputación con el correo que escriben las
personas desde Google Workspace. Si un cliente marca un aviso como spam, la
mancha es del dominio entero, incluido el correo personal.

Lo que corresponde es verificar en Resend un subdominio aparte
—`avisos.hcastudio.com`— y cambiar el remitente en `api/_correo.js`:

```js
from: "FOREMAN <notificaciones@avisos.hcastudio.com>",
```

Es un cambio de una línea, pero conviene hacerlo después de los dos anteriores
y avisando a los clientes, porque cambia la dirección que ya tienen agregada.

## Qué advertirles a los usuarios

Texto para mandarles al sumarlos a un proyecto:

> Les van a llegar correos de **FOREMAN \<notificaciones@hcastudio.com\>** con
> las actas, el libro de obra y las órdenes de cambio del proyecto.
>
> 1. **Agreguen esa dirección a sus contactos** antes del primer envío.
> 2. Si no les llega, revisen **Spam / Correo no deseado**. Si está ahí, usen
>    **"No es spam"** — no lo arrastren a Recibidos: marcarlo es lo que enseña
>    al filtro.
> 3. En Gmail: filtro de esa dirección con **"No enviar nunca a Spam"**.
>    En Outlook: agregarla a **Remitentes seguros**.
> 4. Con correo corporativo, pedirle a sistemas que ponga **hcastudio.com en
>    lista blanca**. Un bloqueo de Exchange no se arregla desde afuera.
> 5. **El enlace para aprobar es personal**: no reenviarlo, porque la firma
>    queda a nombre de quien lo abre.

El punto 4 es el único que resuelve un bloqueo corporativo.

## Lo que FOREMAN ya hace de su lado

- Cada envío queda registrado con su estado, y se le vuelve a preguntar a
  Resend qué pasó: un correo que rebotó o que alguien marcó como spam aparece
  como **"no le llegó"** en el cuadro de firmas de la orden y en la lista de
  asistentes del acta. Hoy no hay ninguno.
- Las actas, el libro, las compras, la revisión y las órdenes de cambio salen
  con **Responder-a** la persona que las manda, no a la casilla de avisos. Un
  correo que no se puede responder puntúa peor en cualquier filtro, y la
  respuesta del cliente tiene a dónde llegar.
