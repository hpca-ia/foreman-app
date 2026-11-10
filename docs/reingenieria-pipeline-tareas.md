# Reingeniería de Pipeline y Tareas

Plan acordado con Hernán el 10/11/2026. FOREMAN está en pruebas: se puede
cambiar cómo trabajan las pantallas sin migrar hábitos de nadie.

## Por qué

Lo que Hernán ve, dicho por él:

- Las tareas del pipeline y las tareas son las mismas y están dos veces: confunde.
- El «estamos acá» marea: no dice dónde está de verdad el proyecto.
- El pipeline es lo que se persigue. Lo aprobado está en Control y no tiene
  nada que hacer en el pipeline, pero sí puede tener tareas.

Lo que dicen los datos (consultados el 10/11/2026):

| | |
|---|---|
| Actividades del pipeline | 41, y las 41 tienen una tarea gemela en `tasks`. Dos objetos para lo mismo, sincronizados a mano por el código. |
| «Estamos acá» | Se puede marcar en varias etapas a la vez: Plaza Lagos tiene 3, el Aéreo 2. En 4 de 9 proyectos la etapa del listado no es la marcada adentro. |
| Obras en el pipeline | El Aéreo figura en «Documentación» con Obra gris, Instalaciones y Acabados en pendiente, y tiene 161 facturas, 2 planillas y 4 órdenes de cambio. |
| Tareas | 23 abiertas, 16 vencidas. 11 son pasos de compras copiados. De las otras 12, 9 son de Hernán, todas «urgentes», 6 vencidas hace 15–36 días. |
| Leads | 6. Cuatro sin movimiento hace 18–41 días. Ninguno cerrado nunca como ganado o perdido. |
| Compromisos de actas | 75, 49 abiertos, 37 vencidos. Ninguno asignado a una persona (dicen «HCARQ», «DINERS») y ninguno aparece en Tareas. |
| Sin uso | Dependencias entre tareas, acompañantes, plantillas de actividades: 0 filas. Tabla vieja `proyectos`: 15 filas, ninguna tarea. |

## Cómo queda

Tres reglas, y todo lo demás sale de ellas.

1. **Un proyecto está en un solo lugar.** Mientras se persigue, en el
   Pipeline. Cuando se aprueba, sale del Pipeline y vive en Control. Si se
   pierde, se cierra con su motivo. (RES BG, con sus ingenierías en
   preparación, se persigue: es del Pipeline.)
2. **En el Pipeline, un proyecto está en una sola etapa.** Una, elegida de una
   lista corta. No hay etapas «en curso» en paralelo ni «estamos acá».
3. **Lo que hay que hacer es una tarea, y vive en un solo lugar.** Una tarea
   puede ser de un proyecto —del pipeline o aprobado— o de ninguno. Al abrir un
   proyecto se ven sus tareas: las mismas que en Tareas. No hay «actividades»
   ni «gestiones» aparte.

Y una cuarta, que sale de las anteriores: **lo que ya tiene su módulo no se
copia como tarea.** Una compra se sigue en Compras; en la bandeja aparece como
una línea que lleva ahí.

El eje sigue siendo la tabla `leads` —de ella cuelgan Control, Compras,
Cronograma, Libro y Actas—. No se renombra: se le simplifica lo que lleva
encima.

## Cómo se usa: se toca, no se llena

Hernán lo pidió aparte: que Pipeline y Tareas sean más interactivos y amables.
Vale para todas las fases; no es una fase más.

- **El pipeline es un tablero.** Una columna por etapa y una tarjeta por
  proyecto. Cambiar de etapa es arrastrar la tarjeta. Con una sola etapa por
  proyecto, el tablero por fin dice la verdad.
- **Aprobar o perder es soltar la tarjeta** en su casillero, al pie. Perder
  pide el motivo; aprobar ofrece crear la obra en Control.
- **Cada tarjeta dice su próximo paso** y cuándo vence. Si no tiene, lo dice
  en amarillo: «sin próximo paso».
- **Una tarea se completa con un toque** y se le cambia la fecha desde la
  misma fila: hoy, mañana, en una semana, ya no va. Sin abrir una ventana.
- **Se agrega escribiendo y Enter**, eligiendo el proyecto al lado. Lo demás
  —detalle, archivos, comentarios— está al abrirla, para quien lo necesite.
- **Todo se guarda solo**, con el estado dicho al lado, y lo que se cambia en
  un lugar se ve en el otro al instante: la tarea que se completa en Tareas
  deja de ser el próximo paso en la tarjeta del proyecto.
- **En el teléfono**, donde no se arrastra cómodo, la etapa se cambia tocando
  la tarjeta y eligiendo.

## Las fases

Cada fase se publica sola y se puede probar antes de seguir. Las migraciones
las prepara Claude y las corre Hernán (primero `npm run migrar` sin `--dale`).
Nada se borra hasta la última fase: las tablas viejas quedan de respaldo.

### Fase 1 — Una sola tarea

Lo que arregla: la duplicación, que es lo que más confunde.

- `tasks` gana lo poco que tenía la actividad y la tarea no: a qué etapa
  pertenecía (`etapa_id`, como etiqueta), si espera a un tercero (`espera`,
  `espera_nota`) y cuándo y quién la cerró.
- Migración: cada actividad le pasa esos datos a su tarea gemela. Son 41, todas
  con tarea; una apunta a una tarea que ya no existe y se recrea.
- La pantalla del proyecto lista `tasks` de ese proyecto. Deja de leer y de
  escribir `lead_etapa_items`.
- Se va todo el código de sincronización entre actividad y tarea.
- En Tareas, «Gestiones de proyectos» y «Tareas» pasan a ser un solo bloque.
- Error que se corrige de paso: el «Presupuesto enviado» deja de crear una
  tarea que nunca se cierra; queda como nota en la historia del proyecto.

Al terminar: marcar algo hecho en el proyecto o en Tareas es tocar la misma
fila. No hay dos listas.

### Fase 2 — El Pipeline es lo que se persigue

Lo que arregla: el «estamos acá» y los proyectos aprobados metidos en el
pipeline.

- Cada proyecto del pipeline tiene una etapa, en `leads.etapa`. Se cambia a
  mano, con un clic, a cualquier otra: no hay orden obligado, porque un
  proyecto puede presupuestar antes del plan masa.
- Etapas propuestas, editables en Ajustes (los nombres los define Hernán):
  Contacto · Levantamiento · Plan masa / Anteproyecto · Ingenierías ·
  Presupuesto · Propuesta enviada · Negociación.
  Salidas: **Aprobado** y **Perdido** (con motivo).
- Migración: los 7 proyectos que se persiguen quedan en la etapa que les
  corresponde. La lista exacta se le muestra a Hernán antes de correrla.
- El listado muestra, por proyecto: etapa, próximo paso (su tarea abierta más
  próxima) y fecha. Tres avisos y nada más: sin próximo paso, paso vencido,
  sin movimiento. El de «sin movimiento» hoy no salta nunca: mira nombres de
  etapas que ya no existen.
- Al aprobar, el proyecto sale del pipeline. Si es obra, se ofrece crearla en
  Control, como hoy.
- Se quitan los tres «túneles» y las etapas por proyecto (`lead_etapas`): con
  una sola etapa no hacen falta.

Al terminar: el pipeline tiene 7 proyectos, cada uno en un lugar, y las dos
obras de Diners ya no están ahí.

### Fase 3 — Proyectos aprobados

Lo que arregla: que un aprobado no tenga dónde verse fuera de Control.

- Una lista «En marcha» con los aprobados. Sin etapas a mano: una ficha que se
  arma sola con lo que los módulos ya saben —plata facturada y planillada,
  órdenes de cambio esperando firma, compras pendientes, tareas abiertas y
  vencidas, última entrada del libro—, y el botón a Control.
- Lo que hoy eran etapas de construcción que en realidad son gestiones
  —contrato, pólizas, cronograma— son tareas del proyecto.

Al terminar: se abre una obra y se ve en qué anda sin que nadie haya movido
nada a mano.

### Fase 4 — Tareas: una bandeja que se pueda creer

- Las compras dejan de crear tareas. En la bandeja aparece «Compras: 3 esperan
  tu visto · 7 por comprar», que lleva a Compras. **Antes de quitar la tarea
  hay que darle a Compras su propio aviso**: hoy el correo al que aprueba y al
  que compra sale porque existe esa tarea.
- Dos partes: «Me toca» y «Espero de otros» (lo que encargué, y lo que espera a
  un tercero).
- Lo vencido pide una decisión con un clic: nueva fecha, delegar, o «ya no
  va». No se queda en rojo.
- «Urgente» se quita: con todo urgente, nada lo es. Manda la fecha.
- La vista de tablero por columnas se quita: en los datos solo hay dos
  estados, abierta y hecha. Quedan lista y calendario.
- El correo de la mañana se arma con la misma bandeja.

### Fase 5 — Los compromisos de las actas

- En el acta, el responsable se elige: alguien del equipo o un tercero. Si es
  del equipo, al dar el visto se le crea su tarea —eso ya existe en el código,
  pero no se usa porque el campo es de texto libre—. Si es un tercero, aparece
  en «Espero de otros» de quien lleva el proyecto.
- Los 49 abiertos se reparten una vez, en una pantalla, a quién corresponda.

### Fase 6 — Limpieza

- Fuera lo que no se usa: dependencias entre tareas, acompañantes, plantillas
  de actividades, la tabla vieja `proyectos` y las pantallas que la
  emparejaban.
- Se borran `lead_etapas` y `lead_etapa_items`, que quedaron de respaldo.
- NOVA y los informes automáticos leen el modelo nuevo.
- La historia del proyecto deja de anotar cada paso de cada compra (hoy son 87
  de 264 renglones).

## Cómo se prueba cada fase

- Las reglas, con pruebas en `pruebas/`, como todo lo demás.
- Las pantallas, simuladas con los datos reales (el ingreso pide el PIN de
  Hernán): se arma el componente con jest y una base en memoria, y se recorre
  el caso entero.
- Las migraciones, primero como consulta de solo lectura que muestra qué va a
  cambiar, fila por fila. Después Hernán la corre.

## Lo que no se toca

Control de obra, Compras (salvo su aviso, en la fase 4), Presupuestos,
Cronograma, Libro de obra, Actas (salvo el responsable del compromiso, en la
fase 5), los permisos por proyecto y el portal del cliente.

## En qué va

- [ ] Fase 1 — Una sola tarea
- [ ] Fase 2 — El Pipeline es lo que se persigue
- [ ] Fase 3 — Proyectos aprobados
- [ ] Fase 4 — Tareas: una bandeja que se pueda creer
- [ ] Fase 5 — Los compromisos de las actas
- [ ] Fase 6 — Limpieza
