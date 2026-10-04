// Buscar por proveedor y por monto. La misma pieza para caja chica y compras.
//
// La pregunta real no es "mostrame los gastos": es "¿cuánto se le compró a
// este proveedor?" o "¿qué compró el chofer en esa gasolinera?". Las dos se
// contestan con lo mismo —filtrar y sumar—, y lo que cierra la respuesta es la
// suma: una lista de doce filas no dice cuánto, hay que sumarla a mano.
//
// El texto busca en varios campos a la vez y no en uno elegido de un
// desplegable. Nadie sabe de antemano si "Disensa" quedó escrito en el
// proveedor o en la descripción, y obligar a elegir dónde buscar convierte una
// búsqueda en dos intentos.

/** Sin tildes y en minúsculas: "Papelería Ñandú" se encuentra tecleando "nandu". */
export const normal = s => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const n = v => Number(v) || 0;

/**
 * @param filas    los gastos o las solicitudes
 * @param filtro   { texto, min, max, desde, hasta }
 * @param campos   en qué campos buscar el texto
 */
export function filtrarGastos(filas = [], filtro = {}, campos = ["proveedor", "descripcion"]) {
  const texto = normal(filtro.texto);
  // Varias palabras tienen que estar todas, en cualquier campo y en cualquier
  // orden: "disensa cemento" encuentra el cemento de Disensa.
  const palabras = texto ? texto.split(/\s+/) : [];
  const min = filtro.min === "" || filtro.min == null ? null : n(filtro.min);
  const max = filtro.max === "" || filtro.max == null ? null : n(filtro.max);

  return filas.filter(f => {
    if (palabras.length) {
      const heno = campos.map(c => normal(f[c])).join(" ");
      if (!palabras.every(p => heno.includes(p))) return false;
    }
    const monto = n(f.monto ?? f.monto_estimado);
    if (min != null && monto < min) return false;
    if (max != null && monto > max) return false;
    if (filtro.desde && f.fecha && f.fecha < filtro.desde) return false;
    if (filtro.hasta && f.fecha && f.fecha > filtro.hasta) return false;
    return true;
  });
}

/**
 * Lo mismo, agrupado por proveedor y ordenado por plata.
 *
 * Es la respuesta a "¿a quién le estamos comprando?", que nadie puede contestar
 * hoy sin exportar a Excel. Los proveedores se juntan por su nombre
 * normalizado: "DISENSA", "Disensa" y "disensa " son uno solo, que es lo que
 * cualquiera daría por obvio y ninguna base de datos hace sola.
 */
export function porProveedor(filas = []) {
  const mapa = new Map();
  filas.forEach(f => {
    const nombre = String(f.proveedor || "").trim();
    const clave = normal(nombre) || "(sin proveedor)";
    if (!mapa.has(clave)) mapa.set(clave, { proveedor: nombre || "Sin proveedor", cuantos: 0, total: 0 });
    const g = mapa.get(clave);
    g.cuantos += 1;
    g.total += n(f.monto ?? f.monto_estimado);
  });
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/** Los nombres que ya existen, para ofrecerlos en vez de hacerlos tipear. */
export function proveedoresDe(filas = []) {
  const vistos = new Map();
  filas.forEach(f => {
    const nombre = String(f.proveedor || "").trim();
    if (nombre && !vistos.has(normal(nombre))) vistos.set(normal(nombre), nombre);
  });
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export const sumar = (filas = []) => filas.reduce((t, f) => t + n(f.monto ?? f.monto_estimado), 0);
