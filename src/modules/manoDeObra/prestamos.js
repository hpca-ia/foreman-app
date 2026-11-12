// LOS PRÉSTAMOS: SE ANOTAN UNA VEZ Y SE DESCUENTAN ROL A ROL.
//
// «Si le damos un préstamo se le va descontando mes a mes» (Hernán,
// 11/11/2026). Hasta acá el rol tenía un casillero «Préstamos» que se llenaba
// a mano cada vez, y cuánto se prestó y cuánto falta no estaba en ningún lado.
//
// Cómo queda:
//
//   · El préstamo dice a quién, cuánto, y CUÁNTO SE DESCUENTA POR ROL.
//   · Cada rol propone solo esa cuota —o lo que quede, si es menos— para cada
//     préstamo vivo de la persona. No hay que acordarse.
//   · Se puede corregir ese rol: escribir 0 si este mes no se le descuenta, u
//     otro monto si paga más. Lo que se escriba se reparte entre sus préstamos
//     empezando por el más viejo.
//   · Al cerrar el rol queda anotada la cuota de cada préstamo; si el rol se
//     reabre, la cuota se va con él y el saldo vuelve.
//
// EL PRÉSTAMO SIGUE A LA PERSONA POR SU CÉDULA. En la obra la misma persona
// figura en varias filas —cada reingreso es una nueva—, así que atarlo a la
// fila lo perdería en el primer reingreso.
//
// Sin base ni pantalla: se puede probar (pruebas/prestamosDelRol.test.mjs).

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const dia = f => String(f || "").slice(0, 10);

/** La cédula como se compara: solo sus números. */
export const cedulaLimpia = c => String(c || "").replace(/\D/g, "");

/** ¿Este préstamo es de esta persona? Por cédula; sin cédula, por su fila. */
export function esDeLaPersona(prestamo, persona) {
  const a = cedulaLimpia(prestamo?.cedula), b = cedulaLimpia(persona?.cedula);
  if (a && b) return a === b;
  return prestamo?.personal_id != null && persona?.id != null && String(prestamo.personal_id) === String(persona.id);
}

/**
 * En qué está un préstamo.
 * @returns { pagado, saldo, cuotas, faltan, terminado }
 *   `cuotas` cuántas veces se le descontó; `faltan` cuántos roles le quedan a
 *   este ritmo.
 */
export function estadoDelPrestamo(prestamo, cuotas = []) {
  const suyas = cuotas.filter(c => String(c.prestamo_id) === String(prestamo.id));
  const pagado = r2(suyas.reduce((t, c) => t + n(c.monto), 0));
  const saldo = Math.max(0, r2(n(prestamo.monto) - pagado));
  return {
    pagado, saldo, cuotas: suyas.length,
    // Medio centavo de margen: 100 en cuotas de 50 son dos roles, no tres.
    faltan: saldo > 0 && n(prestamo.cuota) > 0 ? Math.ceil((saldo - 0.005) / n(prestamo.cuota)) : 0,
    terminado: saldo <= 0,
  };
}

/** Los préstamos con su estado, el más viejo primero. Los anulados no cuentan. */
export function conEstado(prestamos = [], cuotas = []) {
  return prestamos.filter(p => !p.anulado)
    .map(p => ({ ...p, ...estadoDelPrestamo(p, cuotas) }))
    .sort((a, b) => dia(a.fecha).localeCompare(dia(b.fecha)) || n(a.id) - n(b.id));
}

/** Los préstamos de una persona que todavía debe, dados hasta ese día. */
function vivosDe(persona, prestamos, cuotas, hasta) {
  return conEstado(prestamos, cuotas)
    .filter(p => esDeLaPersona(p, persona) && p.saldo > 0 && (!hasta || dia(p.fecha) <= dia(hasta)));
}

/**
 * Lo que se le descuenta a una persona en un rol.
 *
 * @param escrito  lo que se escribió a mano para este rol: vacío = la cuota de
 *                 siempre; un número (también 0) = eso
 * @param hasta    el último día del rol: un préstamo dado después no entra
 * @returns { auto, aplicado, partes, sobra, saldo, saldoDespues, manual, tiene }
 *   `auto`      lo que saldría sin tocar nada
 *   `aplicado`  lo que de verdad baja la deuda en este rol
 *   `partes`    [{ prestamo_id, monto, saldoDespues }], una por préstamo tocado
 *   `sobra`     lo escrito de más, por encima de todo lo que debe
 */
export function descuentoDelRol({ persona, prestamos = [], cuotas = [], escrito = "", hasta = null }) {
  const vivos = vivosDe(persona, prestamos, cuotas, hasta);
  const saldo = r2(vivos.reduce((t, p) => t + p.saldo, 0));
  const auto = r2(vivos.reduce((t, p) => t + Math.min(n(p.cuota), p.saldo), 0));
  const manual = !(escrito === "" || escrito == null);

  let partes;
  let sobra = 0;
  if (!manual) {
    partes = vivos.map(p => ({ prestamo_id: p.id, monto: r2(Math.min(n(p.cuota), p.saldo)) }));
  } else {
    // Lo escrito se reparte empezando por el préstamo más viejo.
    let queda = Math.max(0, r2(n(escrito)));
    partes = [];
    vivos.forEach(p => {
      const va = r2(Math.min(queda, p.saldo));
      if (va > 0) partes.push({ prestamo_id: p.id, monto: va });
      queda = r2(queda - va);
    });
    sobra = queda;
  }
  partes = partes.filter(x => x.monto > 0).map(x => {
    const p = vivos.find(v => v.id === x.prestamo_id);
    return { ...x, saldoDespues: r2(p.saldo - x.monto) };
  });
  const aplicado = r2(partes.reduce((t, x) => t + x.monto, 0));
  return { auto, aplicado, partes, sobra, saldo, saldoDespues: r2(saldo - aplicado), manual, tiene: vivos.length > 0 };
}

/**
 * Los descuentos del rol con la cuota de los préstamos puesta sola.
 *
 * @param descuentos  lo escrito a mano en la pantalla: { [personaId]: { prestamos, anticipos… } }
 * @returns { extras, detalle }
 *   `extras`   lo mismo, con `prestamos` resuelto para cada persona: es lo que
 *              se le pasa a calcularNomina
 *   `detalle`  { [personaId]: descuentoDelRol } de quien tiene préstamos
 */
export function extrasConPrestamos({ personal = [], descuentos = {}, prestamos = [], cuotas = [], hasta = null }) {
  const extras = { ...descuentos };
  const detalle = {};
  personal.forEach(p => {
    const escrito = descuentos[p.id]?.prestamos ?? "";
    const d = descuentoDelRol({ persona: p, prestamos, cuotas, escrito, hasta });
    if (!d.tiene) return;
    detalle[p.id] = d;
    // Sin escribir nada va la cuota; escrito, va lo escrito tal cual —también
    // lo que sobre—, porque eso es lo que se le va a descontar del sueldo.
    if (!d.manual) extras[p.id] = { ...descuentos[p.id], prestamos: d.auto };
  });
  return { extras, detalle };
}

/**
 * Las cuotas que se guardan al cerrar el rol: una por préstamo descontado.
 *
 * @param lineas  las líneas del rol ya guardadas: [{ id, personal_id }]
 */
export function cuotasParaGuardar({ lineas = [], detalle = {}, rolId, fecha, quien = null }) {
  const filas = [];
  lineas.forEach(l => {
    (detalle[l.personal_id]?.partes || []).forEach(x => filas.push({
      prestamo_id: x.prestamo_id, rol_id: rolId, rol_linea_id: l.id, fecha: dia(fecha), monto: x.monto,
      creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
    }));
  });
  return filas;
}

/**
 * El préstamo que se guarda. La cuota se escribe, o sale de en cuántos roles
 * se quiere cobrar.
 *
 * @returns { fila } o { error }
 */
export function nuevoPrestamo({ persona, lead = null, fecha, monto, cuota = "", roles = "", motivo = "", quien = null }) {
  if (!persona?.id) return { error: "Elegí a quién se le presta." };
  const m = r2(n(monto));
  if (!(m > 0)) return { error: "Escribí cuánto se le presta." };
  if (!dia(fecha)) return { error: "Poné la fecha en que se le dio." };
  const enRoles = Math.floor(n(roles));
  // En N roles: la cuota se redondea hacia arriba al centavo, así termina en
  // esos N y no deja un centavo colgado para un rol más.
  const c = n(cuota) > 0 ? r2(n(cuota)) : enRoles > 0 ? Math.ceil(r2((m / enRoles) * 100) - 1e-6) / 100 : 0;
  if (!(c > 0)) return { error: "Escribí cuánto se le descuenta en cada rol, o en cuántos roles lo paga." };
  if (c > m) return { error: "La cuota no puede ser más que el préstamo." };
  return {
    fila: {
      lead_id: lead?.id ?? null, personal_id: persona.id, cedula: cedulaLimpia(persona.cedula) || null, nombre: persona.nombre || "",
      fecha: dia(fecha), monto: m, cuota: c, motivo: String(motivo || "").trim() || null, anulado: false,
      creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
    },
  };
}

/** Un abono a mano: lo que pagó por fuera del rol. */
export function nuevoAbono({ prestamo, cuotas = [], fecha, monto, nota = "", quien = null }) {
  const m = r2(n(monto));
  if (!(m > 0)) return { error: "Escribí cuánto abonó." };
  if (!dia(fecha)) return { error: "Poné la fecha del abono." };
  const { saldo } = estadoDelPrestamo(prestamo, cuotas);
  if (m > saldo + 0.005) return { error: `Debe $${saldo.toFixed(2)}: el abono no puede ser más que eso.` };
  return {
    fila: {
      prestamo_id: prestamo.id, rol_id: null, rol_linea_id: null, fecha: dia(fecha), monto: m,
      nota: String(nota || "").trim() || "Abono a mano", creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
    },
  };
}
