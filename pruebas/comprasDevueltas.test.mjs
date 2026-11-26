// Las compras devueltas: que vuelvan, que se puedan reactivar, comentar sin
// devolver, y el número con que se nombra una compra.
//
// Hernán, 26/11/2026: «Devolví una compra, residente envió otra cotización
// nueva, pero esta sigue como devuelta. Las compras deberían tener un número
// de ID para identificarlas. ¿Es posible solo comentar algo de la compra y no
// necesariamente devolver?... Yo la devolví por error, los admins deben poder
// activarla de nuevo».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  numeroDeCompra, tituloDelPaso, numeroBuscado, ultimaDevolucion, cotizacionesDesdeQueSeDevolvio, vuelveSolaAlSubir, puedeReactivar,
} from "../src/modules/compras/devueltas.js";

const codigoDe = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const LIZETH = 1790613991966, HERNAN = 1, JOHANNA = 2;
// La N° 37, como estaba en la base el 26/11/2026 (horas en UTC).
const N37 = { id: 37, estado: "requiere_info", solicitante_id: LIZETH, descripcion: "Cotización de sellado y pintura de pared de fondo" };
const HISTORIAL_37 = [
  { estado_anterior: null, estado_nuevo: "borrador", usuario_nombre: "Lizeth DLC", comentario: "", created_at: "2026-11-25T23:42:03.302Z" },
  { estado_anterior: "borrador", estado_nuevo: "pendiente_aprobacion", usuario_nombre: "Lizeth DLC", comentario: "el proveedor requiere un anticipo", created_at: "2026-11-25T23:42:33.106Z" },
  { estado_anterior: "pendiente_aprobacion", estado_nuevo: "requiere_info", usuario_nombre: "Hernan Cueva", comentario: "No esta bien cotizado", created_at: "2026-11-26T16:34:37.973Z" },
];
const ADJUNTOS_37 = [
  { id: 71, tipo: "cotizacion", monto: 931.5, created_at: "2026-11-25T23:42:09.074Z" },
  { id: 74, tipo: "cotizacion", monto: 903.9, created_at: "2026-11-26T18:03:56.072Z" },
];

test("LO QUE PASÓ: la devolvió a las 11:34, la residente subió otra cotización a las 13:03, y siguió devuelta", () => {
  // La devolución, con quién y por qué: es lo que se le dice arriba a quien tiene que corregirla.
  assert.deepEqual(ultimaDevolucion(HISTORIAL_37), { cuando: "2026-11-26T16:34:37.973Z", quien: "Hernan Cueva", comentario: "No esta bien cotizado" });
  // La cotización que llegó después: la 74. La 71 es la que se había devuelto.
  assert.deepEqual(cotizacionesDesdeQueSeDevolvio({ solicitud: N37, historial: HISTORIAL_37, adjuntos: ADJUNTOS_37 }).map(a => a.id), [74]);
  // AHORA: quien la pidió sube la cotización nueva, y vuelve sola a esperar el visto.
  assert.equal(vuelveSolaAlSubir({ solicitud: N37, usuarioId: LIZETH }), true);
  // Si la sube otra persona —compras, quien aprueba—, no: no está contestando por ella.
  assert.equal(vuelveSolaAlSubir({ solicitud: N37, usuarioId: JOHANNA }), false);
  assert.equal(vuelveSolaAlSubir({ solicitud: N37, usuarioId: HERNAN }), false);
  // Y solo una devuelta: subir una cotización a un borrador o a una que espera el visto no mueve nada.
  for (const estado of ["borrador", "pendiente_aprobacion", "aprobada", "comprada", "recibida"]) {
    assert.equal(vuelveSolaAlSubir({ solicitud: { ...N37, estado }, usuarioId: LIZETH }), false, estado);
  }
});

test("un comentario no es una devolución, y si se devolvió dos veces cuenta la última", () => {
  const conComentario = [...HISTORIAL_37,
    { estado_anterior: "requiere_info", estado_nuevo: "requiere_info", usuario_nombre: "Johanna", comentario: "Ya pedí la otra proforma", created_at: "2026-11-26T19:00:00.000Z" }];
  assert.equal(ultimaDevolucion(conComentario).cuando, "2026-11-26T16:34:37.973Z");
  // La cotización subida antes del comentario sigue siendo «nueva desde la devolución».
  assert.deepEqual(cotizacionesDesdeQueSeDevolvio({ solicitud: N37, historial: conComentario, adjuntos: ADJUNTOS_37 }).map(a => a.id), [74]);
  // Se reenvió y se volvió a devolver: lo que llegó antes de la segunda devolución ya se vio.
  const dosVeces = [...HISTORIAL_37,
    { estado_anterior: "requiere_info", estado_nuevo: "pendiente_aprobacion", usuario_nombre: "Lizeth DLC", created_at: "2026-11-26T18:04:00.000Z" },
    { estado_anterior: "pendiente_aprobacion", estado_nuevo: "requiere_info", usuario_nombre: "Hernan Cueva", comentario: "Falta el IVA", created_at: "2026-11-26T20:00:00.000Z" }];
  assert.deepEqual(ultimaDevolucion(dosVeces), { cuando: "2026-11-26T20:00:00.000Z", quien: "Hernan Cueva", comentario: "Falta el IVA" });
  assert.deepEqual(cotizacionesDesdeQueSeDevolvio({ solicitud: N37, historial: dosVeces, adjuntos: ADJUNTOS_37 }), []);
  // Un anexo —la foto, el plano— no es una cotización.
  assert.deepEqual(cotizacionesDesdeQueSeDevolvio({ solicitud: N37, historial: HISTORIAL_37, adjuntos: [{ id: 80, tipo: "respaldo", created_at: "2026-11-26T19:00:00.000Z" }] }), []);
  // Sin devolución en el historial, o si ya no está devuelta, no hay nada que marcar.
  assert.equal(ultimaDevolucion([]), null);
  assert.equal(ultimaDevolucion(null), null);
  assert.deepEqual(cotizacionesDesdeQueSeDevolvio({ solicitud: { ...N37, estado: "pendiente_aprobacion" }, historial: HISTORIAL_37, adjuntos: ADJUNTOS_37 }), []);
});

test("«LOS ADMINS DEBEN PODER ACTIVARLA DE NUEVO»: una devuelta la reactiva un administrador, y nadie más", () => {
  assert.equal(puedeReactivar({ solicitud: N37, esAdmin: true }), true);
  assert.equal(puedeReactivar({ solicitud: N37, esAdmin: false }), false);
  // Solo una devuelta se reactiva: lo demás tiene su propio paso.
  for (const estado of ["borrador", "pendiente_aprobacion", "aprobada", "comprada", "recibida", "anulada"]) {
    assert.equal(puedeReactivar({ solicitud: { ...N37, estado }, esAdmin: true }), false, estado);
  }
  // Los administradores son el Director y el asistente, como en todo FOREMAN.
  const roles = codigoDe("../src/lib/roles.js");
  assert.match(roles, /export const esAdmin = role => role === "owner" \|\| role === "assistant";/);
});

test("«UN NÚMERO DE ID PARA IDENTIFICARLAS»: el de la base, en la compra, en su tarea y en el buscador", () => {
  assert.equal(numeroDeCompra(N37), "N° 37");
  assert.equal(numeroDeCompra(null), "");
  // La tarea que le llega a cada uno lleva el número adelante: en el tablero y en el correo se sabe de cuál se habla.
  assert.equal(tituloDelPaso("Aprobar compra", N37), "Aprobar compra N° 37: Cotización de sellado y pintura de pared de fondo");
  assert.equal(tituloDelPaso("Completar la solicitud", { id: 35, descripcion: " Recubrimiento mesones de baños " }), "Completar la solicitud N° 35: Recubrimiento mesones de baños");
  // En el buscador se escribe como salga.
  for (const escrito of ["37", "#37", "N° 37", "n 37", "Nº37", "no. 37", " 37 "]) assert.equal(numeroBuscado(escrito), 37, escrito);
  // Lo que no es un número de compra se busca como siempre.
  for (const escrito of ["", "pintura", "37 sacos", "931.50", "kywi 37"]) assert.equal(numeroBuscado(escrito), null, escrito);
  // El servidor, cuando el visto se da desde el correo, arma el título igual.
  assert.match(codigoDe("../api/portal.js"), /`Comprar N° \$\{compra\.id\}: \$\{compra\.descripcion\}` : `Completar la solicitud N° \$\{compra\.id\}: \$\{compra\.descripcion\}`/);
});

test("la pantalla de la solicitud: el número, «Solo comentar» al lado de Aprobar y Devolver, y «Reactivar» para un administrador", () => {
  const p = codigoDe("../src/modules/compras/ModalSolicitud.jsx");
  assert.match(p, /Solicitud de compra <span className="numero-de-compra"[^>]*>\{numeroDeCompra\(viva\)\}<\/span>/);
  // LAS TRES SALIDAS DE QUIEN DA EL VISTO, juntas: aprobar, devolver, o solo comentar.
  assert.match(p, /<Check size=\{13\} \/> Aprobar<\/Button>\s+<Button variant="outline" onClick=\{devolver\} disabled=\{ocupado\}><X size=\{13\} \/> Devolver<\/Button>[\s\S]{0,200}<Button className="solo-comentar" variant="outline" onClick=\{comentar\}/);
  // Y el botón de comentar del cuadro está siempre, no recién al escribir.
  assert.doesNotMatch(p, /\{comentario\.trim\(\) && \(\s+<div style=\{\{ display: "flex", alignItems: "center", gap: 9, marginTop: 6/);
  assert.match(p, /<div className="comentar-sin-mover"[\s\S]{0,160}disabled=\{ocupado \|\| !comentario\.trim\(\)\} onClick=\{comentar\}/);
  assert.match(p, /"Para comentar sin devolverla, o para decir qué falta si la devolvés"/);
  // Comentar no mueve la compra: mismo estado de los dos lados en el historial.
  const datos = codigoDe("../src/modules/compras/compras.js");
  assert.match(datos, /const e = await anotar\(solicitud\.id, solicitud\.estado, solicitud\.estado, quien, limpio\);/);

  // SUBIR LA COTIZACIÓN NUEVA ES MANDARLA: después de subirla, si vuelve sola, va a esperar el visto.
  const alSubir = p.slice(p.indexOf("SUBIR LA COTIZACIÓN NUEVA ES MANDARLA"), p.indexOf("LAS QUE ESPERAN: elegidas antes"));
  assert.match(alSubir, /if \(vuelveSolaAlSubir\(\{ solicitud: sol, usuarioId: currentUser\?\.id \}\)\) \{/);
  assert.match(alSubir, /await moverA\(sol, "pendiente_aprobacion", \{\s+quien: currentUser, comentario: NOTA_AL_VOLVER_SOLA, paraQuien,/);
  // La ventana sigue abierta: toma el estado y la tarea nuevos, para que el paso siguiente no cierre la tarea vieja.
  assert.match(alSubir, /setViva\(v => \(\{ \.\.\.v, \.\.\.m\.campos \}\)\);/);
  assert.match(datos, /return \{ ok: true, campos \};/);

  // REACTIVAR: solo un administrador, sobre una devuelta que no es suya, y vuelve a esperar el visto.
  assert.match(p, /const reactiva = editando && puedeReactivar\(\{ solicitud: viva, esAdmin: esAdmin\(currentUser\?\.role\) \}\) && !esMia;/);
  assert.match(p, /\{reactiva && \(\s+<Button className="reactivar-devuelta" variant="primary" onClick=\{reactivar\}/);
  const reactivar = p.slice(p.indexOf("const reactivar = () => hacer"), p.indexOf("Compras devuelve el pedido, con la pregunta escrita."));
  assert.match(reactivar, /return moverA\(viva, "pendiente_aprobacion", \{/);
  // Quien la reactiva y da el visto no se manda un correo a sí mismo.
  assert.match(reactivar, /sinCorreo: String\(paraQuien\) === String\(currentUser\?\.id\),/);
  assert.match(datos, /if \(tarea\?\.id && estado === "pendiente_aprobacion" && sinCorreo\) \{/);
  // Por qué se devolvió se lee del historial: ese campo que se mostraba no existe en la base.
  assert.doesNotMatch(p, /comentario_devolucion/);

  // LA LISTA: el número en cada fila, se busca por él, y la devuelta con cotización nueva se marca.
  const lista = codigoDe("../src/modules/compras/ModuloCompras.jsx");
  assert.match(lista, /<span className="numero-de-compra"[^>]*>\{numeroDeCompra\(s\)\}<\/span>/);
  // El buscador guarda { texto, min, max }: el número se lee del texto.
  assert.match(lista, /const elNumero = numeroBuscado\(busca\?\.texto\);/);
  assert.match(lista, /const porNumero = elNumero == null \? \[\] : porEstado\.filter\(s => Number\(s\.id\) === elNumero\);/);
  assert.match(lista, /\{conNueva\.has\(s\.id\) && <div className="con-cotizacion-nueva"/);
});
