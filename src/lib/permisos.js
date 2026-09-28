import { supabase } from "./supabase";

// Catálogo de permisos. Es lo que el Director ve como lista de interruptores
// en Ajustes, así que los textos son los que él lee: nada de jerga.
export const GRUPOS_PERMISOS = [
  {
    titulo: "A qué módulos entra",
    permisos: [
      { id: "tareas.ver", label: "Tareas" },
      { id: "presupuestos.ver", label: "Presupuestos" },
      { id: "controlObra.ver", label: "Control de Obra" },
      { id: "cajaChica.ver", label: "Caja Chica" },
      { id: "compras.ver", label: "Compras", nota: "Pedir lo que hace falta en obra y seguir en qué va" },
      { id: "libro.ver", label: "Libro de Obra", nota: "El registro diario de la obra: quién estuvo, qué se hizo, qué llegó" },
      { id: "leads.ver", label: "Ver todos los proyectos", nota: "CUÁNTOS ve. Sin esto, solo los que le asignes en Ajustes → Proyectos. Lo que puede HACER en cada uno sale de su nivel ahí, no de acá" },
      { id: "ajustes.ver", label: "Ajustes", nota: "Usuarios, proyectos y datos de la empresa" },
    ],
  },
  {
    titulo: "Cuánto ve",
    permisos: [
      { id: "tareas.todas", label: "Las tareas de todos", nota: "Si no, solo las suyas" },
      { id: "obras.todas", label: "Todas las obras", nota: "Si no, solo las que tenga asignadas" },
      { id: "cajaChica.todas", label: "Todas las cajas chicas", nota: "Si no, solo la suya" },
      { id: "montos.ver", label: "Los montos del presupuesto", nota: "Sin esto puede asignar un gasto a un rubro, pero no ve cuánto tiene ese rubro" },
    ],
  },
  {
    titulo: "Qué puede hacer",
    permisos: [
      { id: "tareas.asignar", label: "Asignar tareas a otros" },
      { id: "tareas.fechas", label: "Mover fechas de tareas", nota: "Cambiar la fecha de una tarea, gestión o reunión ya creada. Sin esto la pone al crearla, pero después no la corre solo" },
      { id: "leads.editar", label: "Editar el pipeline", nota: "Crear proyectos, mover etapas y cargar gestiones. Sin esto los ve pero no los toca" },
      { id: "presupuestos.crear", label: "Crear y editar presupuestos" },
      { id: "obras.crear", label: "Activar una obra para controlarla" },
      { id: "compras.gestionar", label: "Comprar y facturar", nota: "Concretar la compra, subir la factura y asignarla a su rubro. Quien pide no compra" },
      { id: "facturas.registrar", label: "Registrar facturas y gastos" },
      { id: "planillas.cerrar", label: "Cerrar una planilla" },
      { id: "gastos.anular", label: "Anular facturas y gastos", nota: "Anular no borra: queda el registro de quién y por qué" },
      { id: "borrar.definitivo", label: "Borrar definitivamente", nota: "Solo cosas nunca usadas, como un presupuesto que quedó en borrador" },
    ],
  },
];

export const TODOS_LOS_PERMISOS = GRUPOS_PERMISOS.flatMap(g => g.permisos);

// El Director no aparece acá: siempre puede todo, por código. Si sus permisos
// fueran editables, un error de edición lo dejaría fuera de su propia app.
export const ROLES_EDITABLES = ["assistant", "gerente", "arquitecto", "arquitecto_jr", "residente"];

// Se usa mientras la tabla carga, y para sembrar permisos nuevos que todavía
// no existan en la base.
export const POR_DEFECTO = {
  assistant: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": true,
    "tareas.ver": true, "tareas.todas": true, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": true, "presupuestos.crear": true,
    "controlObra.ver": true, "obras.todas": true, "obras.crear": true,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "cajaChica.todas": true, "leads.ver": true, "leads.editar": false,
    "montos.ver": true, "gastos.anular": true, "ajustes.ver": true,
    "borrar.definitivo": false,
  },
  gerente: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.ver": true, "tareas.todas": false, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": false, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "cajaChica.todas": false, "leads.ver": true, "leads.editar": false,
    "montos.ver": true, "gastos.anular": true, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  // Arquitectura trabaja el proyecto antes de la obra: diseño, propuesta y
  // presupuesto. Del pipeline ve solo los proyectos que le tocan, no todo lo
  // comercial. Todo esto se puede cambiar en Ajustes.
  arquitecto: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.ver": true, "tareas.todas": false, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": true, "presupuestos.crear": true,
    "controlObra.ver": true, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": false, "cajaChica.todas": false, "leads.ver": false, "leads.editar": true,
    "montos.ver": true, "gastos.anular": false, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  // El Jr. dibuja y ejecuta lo suyo: no asigna trabajo a otros ni ve montos.
  arquitecto_jr: {
    "libro.ver": false,
    "compras.ver": false, "compras.gestionar": false,
    "tareas.ver": true, "tareas.todas": false, "tareas.asignar": false, "tareas.fechas": false,
    "presupuestos.ver": true, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": false, "cajaChica.todas": false, "leads.ver": false, "leads.editar": false,
    "montos.ver": false, "gastos.anular": false, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  residente: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.ver": true, "tareas.todas": false, "tareas.asignar": false, "tareas.fechas": false,
    "presupuestos.ver": false, "presupuestos.crear": false,
    "controlObra.ver": false, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": true, "cajaChica.todas": false, "leads.ver": false, "leads.editar": false,
    "montos.ver": false, "gastos.anular": false, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
};

/** Lee la tabla y devuelve { rol: { permiso: bool } }, completando con los
 *  valores por defecto lo que todavía no esté guardado. */
export async function cargarPermisos() {
  const mapa = {};
  ROLES_EDITABLES.forEach(r => { mapa[r] = { ...POR_DEFECTO[r] }; });
  const { data, error } = await supabase.from("permisos_rol").select("rol,permiso,activo");
  if (error) return mapa;              // sin conexión se trabaja con los de fábrica
  (data || []).forEach(({ rol, permiso, activo }) => {
    if (mapa[rol]) mapa[rol][permiso] = !!activo;
  });
  return mapa;
}

export async function guardarPermiso(rol, permiso, activo) {
  return supabase.from("permisos_rol").upsert({ rol, permiso, activo }, { onConflict: "rol,permiso" });
}

/**
 * Las excepciones por persona: { usuario_id: { permiso: bool } }.
 *
 * El rol alcanza para el caso general, no para la oficina de verdad: a Camila
 * hay que dejarla ver presupuestos sin volverla gerente. Lo que no esté acá lo
 * decide su rol.
 */
export async function cargarPermisosUsuario() {
  const { data, error } = await supabase.from("usuario_permisos").select("usuario_id,permiso,activo");
  if (error) return {};
  const mapa = {};
  (data || []).forEach(({ usuario_id, permiso, activo }) => {
    (mapa[usuario_id] = mapa[usuario_id] || {})[permiso] = !!activo;
  });
  return mapa;
}

/** Poner o quitar una excepción. `null` la borra: vuelve a mandar el rol. */
export async function guardarPermisoUsuario(usuarioId, permiso, activo) {
  if (activo === null) {
    return supabase.from("usuario_permisos").delete().eq("usuario_id", usuarioId).eq("permiso", permiso);
  }
  return supabase.from("usuario_permisos").upsert({ usuario_id: usuarioId, permiso, activo }, { onConflict: "usuario_id,permiso" });
}

/**
 * `puede("cajaChica.ver")` para el usuario en sesión.
 *
 * Manda lo que se le puso a esa persona; si no se le puso nada, manda su rol.
 * El Director siempre puede: si sus permisos fueran editables, un error de
 * edición lo dejaría fuera de su propia app.
 */
export function crearPuede(usuario, mapa, porUsuario = {}) {
  return permiso => {
    if (!usuario) return false;
    if (usuario.role === "owner") return true;
    const suyo = porUsuario?.[usuario.id]?.[permiso];
    if (suyo !== undefined) return suyo;
    return !!mapa?.[usuario.role]?.[permiso];
  };
}
