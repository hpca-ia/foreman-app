import { supabase } from "./supabase";

// Catálogo de permisos. Es lo que el Director ve como lista de interruptores
// en Ajustes, así que los textos son los que él lee: nada de jerga.
//
// Estos interruptores son la PUERTA DEL EDIFICIO: deciden si alguien ve el
// botón de un módulo. A qué proyectos entra adentro de ese módulo —y si toca o
// solo mira— se decide en Ajustes → Proyectos, proyecto por proyecto. Prender
// "Presupuestos" acá no abre todos los presupuestos de la oficina: abre la
// pantalla, y adentro salen los de sus proyectos. La única excepción está
// abajo, "Entra a todos los proyectos".
export const GRUPOS_PERMISOS = [
  {
    titulo: "A qué módulos entra",
    permisos: [
      { id: "presupuestos.ver", label: "Presupuestos", nota: "Solo los de sus proyectos, con el nivel que le hayas dado en cada uno" },
      { id: "controlObra.ver", label: "Control de Obra", nota: "Solo las obras de sus proyectos" },
      { id: "cajaChica.ver", label: "Caja Chica" },
      { id: "compras.ver", label: "Compras", nota: "Pedir lo que hace falta en obra y seguir en qué va" },
      { id: "libro.ver", label: "Libro de Obra", nota: "El registro diario de la obra: quién estuvo, qué se hizo, qué llegó. Solo el de sus proyectos" },
      { id: "leads.ver", label: "Entra a todos los proyectos", nota: "Para gerentes: entra a todos con nivel de editar y no hay que asignarle ninguno. Apagado, entra solo a los que le des en Ajustes → Proyectos. Es lo único que cambia CUÁNTOS ve" },
      { id: "ajustes.ver", label: "Ajustes", nota: "Usuarios, proyectos y datos de la empresa" },
    ],
  },
  {
    titulo: "Cuánto ve",
    // Acá había cuatro interruptores y tres no hacían nada: "todas las obras",
    // "todas las cajas chicas" y "los montos del presupuesto" se prendían y la
    // app seguía igual. Un permiso que miente es peor que no tenerlo, y además
    // los dos primeros ya los contesta Ajustes → Proyectos.
    permisos: [
      { id: "tareas.todas", label: "Las tareas de todos", nota: "Si no, solo las suyas. También le abre todos los proyectos" },
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
    "tareas.todas": true, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": true, "presupuestos.crear": true,
    "controlObra.ver": true, "obras.crear": true,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "leads.ver": true, "leads.editar": false,
    "ajustes.ver": true,
    "borrar.definitivo": false,
  },
  gerente: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.todas": false, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": false, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.crear": false,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "leads.ver": true, "leads.editar": false,
    "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  // Arquitectura trabaja el proyecto antes de la obra: diseño, propuesta y
  // presupuesto. Del pipeline ve solo los proyectos que le tocan, no todo lo
  // comercial. Todo esto se puede cambiar en Ajustes.
  arquitecto: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.todas": false, "tareas.asignar": true, "tareas.fechas": true,
    "presupuestos.ver": true, "presupuestos.crear": true,
    "controlObra.ver": true, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": false, "leads.ver": false, "leads.editar": true,
    "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  // El Jr. dibuja y ejecuta lo suyo: no asigna trabajo a otros.
  arquitecto_jr: {
    "libro.ver": false,
    "compras.ver": false, "compras.gestionar": false,
    "tareas.todas": false, "tareas.asignar": false, "tareas.fechas": false,
    "presupuestos.ver": true, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": false, "leads.ver": false, "leads.editar": false,
    "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  // El residente vive en la obra: escribe el libro, registra las facturas y
  // pide materiales. El presupuesto de su obra lo consulta y no lo mueve —eso
  // se le da proyecto por proyecto, en Ajustes → Proyectos.
  residente: {
    "libro.ver": true,
    "compras.ver": true, "compras.gestionar": false,
    "tareas.todas": false, "tareas.asignar": false, "tareas.fechas": false,
    "presupuestos.ver": true, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.crear": false,
    "facturas.registrar": true, "planillas.cerrar": false,
    "cajaChica.ver": true, "leads.ver": false, "leads.editar": false,
    "ajustes.ver": false,
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
