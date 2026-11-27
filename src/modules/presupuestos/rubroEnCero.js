import { esNoCotiza } from "./estructura.js";

// EL RUBRO CON LA CANTIDAD O EL PRECIO EN CERO.
//
// Hernán, 27/11/2026: «En el presupuesto alértame valores de cantidad o precio
// en 0... punto rojo junto al rubro». Un rubro en cero no suma nada al total,
// y el total no avisa que le falta algo: entre trescientos renglones, el que
// quedó en cero no se ve.
//
// Cero o vacío, no negativo: un renglón en negativo es un descuento, puesto a
// propósito. Y lo que no se cotiza (la nota dice NO COTIZA) va sin precio a
// propósito: no se marca.

const vale = v => Number(v) || 0;

/** Lo que está en cero en este rubro: [], ["cantidad"], ["precio"] o los dos. */
export function loQueEstaEnCero(item) {
  if (!item || esNoCotiza(item)) return [];
  const enCero = [];
  if (vale(item.cantidad) === 0) enCero.push("cantidad");
  if (vale(item.precio_unitario) === 0) enCero.push("precio");
  return enCero;
}

/** Lo que dice el punto rojo. */
export function avisoDeCero(enCero) {
  if (!enCero?.length) return "";
  if (enCero.length === 2) return "Cantidad y precio en 0";
  return enCero[0] === "cantidad" ? "Cantidad en 0" : "Precio en 0";
}

/** Cuántos rubros de una lista tienen algo en cero. */
export const cuantosEnCero = items => (items || []).filter(i => loQueEstaEnCero(i).length > 0).length;
