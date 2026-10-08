import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { sincronizarCapitulos } from "./sincronizarCapitulos";
import Button from "../../components/ui/Button";
import { fmt, calcularControl, agrupar, totalesObra, repartirSolicitudes } from "./calculos";
import TablaControl from "./TablaControl";
import PanelFacturas from "./PanelFacturas";
import PanelPlanillas from "./PanelPlanillas";
import LibroFacturas from "./LibroFacturas";
import PanelDuplicados from "./PanelDuplicados";
import PanelActividades from "./PanelActividades";
import PresupuestoOriginal from "./PresupuestoOriginal";
import PanelCurar from "./PanelCurar";
import ExportarPlanilla from "./ExportarPlanilla";
import PanelOrdenesCambio from "./PanelOrdenesCambio";
import { comprometidoPorGrupo } from "./calculos";

// Las dos pantallas de plata bajan aparte. No es solo peso: quien no tiene el
// permiso no descarga el código, así que no hay forma de llegar a esa pantalla
// escribiendo una URL o tocando un estado desde la consola. Esconder un botón
// es cortesía; no mandar el código es la cerradura.
const PanelFondos = lazy(() => import("./PanelFondos"));
const PanelProveedores = lazy(() => import("./PanelProveedores"));
const Cargando = () => <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 12.5 }}>Cargando…</div>;

export default function VistaObra({ obra, currentUser, puede, onVolver }) {
  // La obra no tiene nombre propio: se llama como su proyecto, y el
  // presupuesto del que salió va de detalle. Se leen ahora y no se copian, así
  // renombrar cualquiera de los dos se ve acá sin tocar nada más.
  const [cadena, setCadena] = useState({ proyecto: null, presupuesto: null });
  // Las solicitudes de compra vivas de esta obra: lo que piden gastar y
  // todavía no es factura. Se muestra al lado del invertido, no sumado: una
  // cosa es lo que salió y otra lo que está por salir.
  const [solicitudes, setSolicitudes] = useState([]);
  const [solicitudesFuera, setSolicitudesFuera] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  useEffect(() => {
    if (!obra.lead_id && !obra.id) return;
    let vivo = true;
    // LAS DOS CONSULTAS, Y DESPUÉS SE UNEN.
    //
    // Antes iban en cadena con un `return` en el medio: se pedían las de la
    // obra y, SOLO si no había ninguna, las del proyecto. Con que un pedido
    // tuviera `obra_id`, los que colgaban solo del proyecto no se buscaban
    // nunca —y son la mayoría, porque una compra se pide contra el proyecto y
    // el `obra_id` recién se escribe al facturarla—.
    //
    // Así el control mostraba 1 pedido comprometido de $330 donde Compras
    // tenía 3 aprobados: los otros dos se habían pedido antes de que la obra
    // existiera y desaparecían sin dejar rastro. `solicitudesDeLaObra` decide
    // cuál es de quién.
    (async () => {
      const [a, b] = await Promise.all([
        obra.id ? supabase.from("compras_solicitudes").select("*").eq("obra_id", obra.id)
          : Promise.resolve({ data: [] }),
        obra.lead_id ? supabase.from("compras_solicitudes").select("*").eq("lead_id", obra.lead_id)
          : Promise.resolve({ data: [] }),
      ]);
      if (!vivo) return;
      // Con los dos campos sueltos y no con `obra`: el objeto cambia de
      // identidad en cada dibujo y tenerlo de dependencia dispararía las dos
      // consultas sin parar.
      const r = repartirSolicitudes(
        [...(a.data || []), ...(b.data || [])], { id: obra.id, lead_id: obra.lead_id });
      setSolicitudes(r.dentro);
      // Y las proformas de esos pedidos: ahí está la plata de verdad cuando
      // nadie llegó a elegir una, que es casi siempre.
      const ids = r.dentro.map(x => x.id);
      if (ids.length) {
        const { data: ad } = await supabase.from("compras_adjuntos")
          .select("id,solicitud_id,monto,proveedor,tipo").in("solicitud_id", ids);
        if (vivo) setAdjuntos(ad || []);
      } else if (vivo) setAdjuntos([]);
      // Lo que quedó afuera, para poder decirlo en pantalla. Un pedido que no
      // entra al control es plata que alguien pidió y que no está en ningún
      // número: desaparecer en silencio no es una opción.
      setSolicitudesFuera(r.fuera);
    })();
    return () => { vivo = false; };
  }, [obra.id, obra.lead_id]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: l }, { data: p }] = await Promise.all([
        obra.lead_id ? supabase.from("leads").select("nombre").eq("id", obra.lead_id).maybeSingle() : Promise.resolve({ data: null }),
        obra.presupuesto_id ? supabase.from("presupuestos").select("nombre").eq("id", obra.presupuesto_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (vivo) setCadena({ proyecto: l?.nombre || null, presupuesto: p?.nombre || null });
    })();
    return () => { vivo = false; };
  }, [obra.lead_id, obra.presupuesto_id]);

  const [tab, setTab] = useState("control");
  const [rubros, setRubros] = useState([]);
  const [planillas, setPlanillas] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [planillaSel, setPlanillaSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actividades, setActividades] = useState([]);
  const [agruparPor, setAgruparPor] = useState("capitulo");   // capitulo | actividad
  const [abierta, setAbierta] = useState(null);               // la planilla que se está mirando por dentro

  const cargar = useCallback(async () => {
    setCargando(true);
    // Los capítulos de la obra son los del presupuesto, siempre: si allá se
    // renombró o se reorganizó, acá se dice lo mismo. Mueve nombre y orden de
    // capítulo y ningún monto — la línea base no se toca.
    await sincronizarCapitulos(obra);
    const [{ data: r }, { data: p }, { data: f }, { data: act }] = await Promise.all([
      supabase.from("obra_rubros").select("*").eq("obra_id", obra.id).order("capitulo_orden").order("orden"),
      supabase.from("planillas").select("*").eq("obra_id", obra.id).order("numero"),
      supabase.from("obra_facturas").select("*").eq("obra_id", obra.id).order("fecha", { ascending: false }),
      supabase.from("obra_actividades").select("*").eq("obra_id", obra.id).order("orden"),
    ]);
    const numeroDePlanilla = {};
    (p || []).forEach(pl => { numeroDePlanilla[pl.id] = pl.numero; });
    const facturasConNumero = (f || []).map(x => ({ ...x, _planillaNumero: x.planilla_id ? numeroDePlanilla[x.planilla_id] ?? null : null }));

    let asig = [];
    if (facturasConNumero.length) {
      const { data } = await supabase.from("obra_asignaciones").select("*").in("factura_id", facturasConNumero.map(x => x.id));
      asig = data || [];
    }

    setRubros(r || []);
    setActividades(act || []);
    setPlanillas(p || []);
    setFacturas(facturasConNumero);
    setAsignaciones(asig);
    setPlanillaSel(prev => {
      if (prev && (p || []).some(x => x.id === prev)) return prev;
      const abierta = (p || []).find(x => x.estado === "abierta");
      return abierta?.id || (p || [])[(p || []).length - 1]?.id || null;
    });
    setCargando(false);
  }, [obra.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const planillaActual = planillas.find(p => p.id === planillaSel) || null;
  const porRubro = calcularControl({ rubros, facturas, asignaciones, planillaNumero: planillaActual?.numero ?? null });
  // El comprometido PRIMERO: los grupos lo necesitan para poder dibujar el
  // bloque de gasto fuera del presupuesto cuando lo único que hay ahí todavía
  // es una compra aprobada sin factura.
  const comprometido = comprometidoPorGrupo(solicitudes, rubros, adjuntos);
  const grupos = agrupar(rubros, porRubro, agruparPor, actividades, comprometido);
  const totales = totalesObra(grupos);

  // Las dos pantallas de plata. El Director siempre; los demás, si se lo
  // prendieron. `puede` ya devuelve true para el Director por código.
  const vePlata = puede ? puede("proveedores.ver") : true;
  const veCaja = puede ? puede("fondos.ver") : true;

  const tabS = a => ({ padding: "7px 14px", border: "none", borderBottom: a ? `2px solid ${colors.brand}` : "2px solid transparent", background: "transparent", color: a ? colors.brand : colors.inkSoft, fontSize: 12, fontWeight: a ? 600 : 400, cursor: "pointer", fontFamily: colors.font });

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Obras</Button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>{cadena.proyecto || obra.nombre}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>
            {!obra.lead_id && <span style={{ color: colors.warning }}>sin proyecto · </span>}
            {cadena.presupuesto && cadena.presupuesto !== (cadena.proyecto || obra.nombre) && <>{cadena.presupuesto} · </>}
            {obra.cliente_nombre || "Sin cliente"} · {rubros.length} rubros
          </div>
        </div>
        {planillas.length > 0 && (
          <select value={planillaSel || ""} onChange={e => { const id = Number(e.target.value); setPlanillaSel(id); setAbierta(a => (a ? id : a)); }}
            style={{ marginLeft: "auto", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "7px 12px", fontSize: 12, fontFamily: colors.font, color: colors.ink, cursor: "pointer" }}>
            {planillas.map(p => <option key={p.id} value={p.id}>{p.nombre || `Planilla N°${p.numero}`}{p.estado === "cerrada" ? " (cerrada)" : ""}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
        <Tarjeta label="Presupuesto" valor={totales.base} />
        <Tarjeta label="Acum. anterior" valor={totales.anterior} />
        <Tarjeta label="Este período" valor={totales.periodo} color={colors.brand} />
        <Tarjeta label="Invertido" valor={totales.acumulado} color={colors.ink} />
        <Tarjeta label="Saldo" valor={totales.saldo} color={totales.saldo < 0 ? colors.danger : colors.success} />
        <Tarjeta label="Avance" valor={totales.pct * 100} sufijo="%" moneda={false} color={colors.brand} />
      </div>

      <div className="obra-tabs">
        <button onClick={() => setTab("control")} style={tabS(tab === "control")}>Control</button>
        <button onClick={() => setTab("original")} style={tabS(tab === "original")}>Presupuesto</button>
        <button onClick={() => { setTab("planillas"); setAbierta(null); }} style={tabS(tab === "planillas")}>Planillas</button>
        <button onClick={() => setTab("facturas")} style={tabS(tab === "facturas")}>Facturas</button>
        {/* Entrar a la obra no es lo mismo que ver con qué plata se hace: un
            residente controla el avance sin tener por qué saber cuánto
            anticipó el cliente ni cuánto se le debe a cada proveedor. */}
        {vePlata && <button onClick={() => setTab("proveedores")} style={tabS(tab === "proveedores")}>Proveedores</button>}
        {veCaja && <button onClick={() => setTab("fondos")} style={tabS(tab === "fondos")}>Caja del proyecto</button>}
        <button onClick={() => setTab("ordenes")} style={tabS(tab === "ordenes")}>Órdenes de cambio</button>
        <button onClick={() => setTab("actividades")} style={tabS(tab === "actividades")}>Agrupaciones</button>
        <button onClick={() => setTab("duplicados")} style={tabS(tab === "duplicados")}>Duplicados</button>
        <button onClick={() => setTab("exportar")} style={tabS(tab === "exportar")}>Exportar</button>
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div> : (
        <>
          {tab === "control" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>AGRUPAR POR</span>
                <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3 }}>
                  {[["capitulo", "Capítulos"], ["actividad", "Agrupaciones"]].map(([v, l]) => (
                    <button key={v} onClick={() => setAgruparPor(v)}
                      style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                        background: agruparPor === v ? colors.surface : "transparent", color: agruparPor === v ? colors.brand : colors.inkSoft }}>{l}</button>
                  ))}
                </div>
                {/* El rubro guarda `actividad_id`; `actividad` no existe en la
                    fila, así que el aviso salía siempre —incluso con las
                    agrupaciones armadas y a la vista debajo—. */}
                {agruparPor === "actividad" && !rubros.some(r => r.actividad_id) && (
                  <span style={{ fontSize: 11, color: colors.warning }}>
                    Todavía no hay agrupaciones — créalas en la pestaña Agrupaciones.
                  </span>
                )}
              </div>
              <TablaControl grupos={grupos} porRubro={porRubro} totales={totales} modo={agruparPor}
                comprometido={comprometido} fuera={solicitudesFuera} obra={obra} />

              {/* Acomodar el control: sacar el ruido en $0 y armar capítulos.
                  Debajo de la tabla porque es mantenimiento, no lectura: uno
                  viene a mirar los números y de vez en cuando a ordenar. */}
              {/* Sin guardia propia, igual que Agrupaciones: en este módulo
                  quien entra al control lo edita. `puede` es una función —no
                  un booleano— así que ponerla acá habría sido una guardia que
                  siempre deja pasar, que es peor que ninguna. */}
              <PanelCurar obra={obra} rubros={rubros} porRubro={porRubro} onCambio={cargar} />

              {/* Lo que el Excel tenía en dos hojas y uno cruzaba a mano: arriba
                  en qué va cada rubro, abajo las facturas que lo movieron. */}
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
                <PanelFacturas puede={puede}
                  obra={obra} rubros={rubros} actividades={actividades} planillas={planillas} planillaActual={planillaActual}
                  facturas={facturas} asignaciones={asignaciones}
                  currentUser={currentUser} onCambio={cargar}
                />
              </div>
            </>
          )}
          {tab === "planillas" && (
            <PanelPlanillas puede={puede} obra={obra} planillas={planillas} facturas={facturas} asignaciones={asignaciones}
              planillaSel={planillaSel} onCambio={cargar}
              abierta={planillas.find(p => p.id === abierta) || null}
              onAbrir={p => { setPlanillaSel(p.id); setAbierta(p.id); }}
              onVolver={() => setAbierta(null)}>
              <PanelFacturas puede={puede}
                obra={obra} rubros={rubros} actividades={actividades} planillas={planillas}
                planillaActual={planillas.find(p => p.id === abierta) || null}
                facturas={facturas} asignaciones={asignaciones}
                currentUser={currentUser} onCambio={cargar} mostrarTitulo={false}
              />
            </PanelPlanillas>
          )}
          {tab === "facturas" && (
            <LibroFacturas obra={obra} rubros={rubros} actividades={actividades} planillas={planillas}
              facturas={facturas} asignaciones={asignaciones} currentUser={currentUser} onCambio={cargar} />
          )}
          {tab === "proveedores" && vePlata && (
            <Suspense fallback={<Cargando />}>
              <PanelProveedores obra={obra} facturas={facturas} currentUser={currentUser} puede={puede} onCambio={cargar} />
            </Suspense>
          )}
          {tab === "ordenes" && (
            <PanelOrdenesCambio obra={obra} proyecto={cadena.proyecto} rubros={rubros}
              currentUser={currentUser} puede={puede} onCambio={cargar} />
          )}
          {tab === "original" && <PresupuestoOriginal obra={obra} rubros={rubros} />}

          {tab === "fondos" && veCaja && (
            <Suspense fallback={<Cargando />}>
              <PanelFondos obra={obra} planillas={planillas} facturas={facturas} currentUser={currentUser} puede={puede} />
            </Suspense>
          )}

          {tab === "actividades" && <PanelActividades obra={obra} rubros={rubros} actividades={actividades} onCambio={cargar} />}
          {tab === "duplicados" && <PanelDuplicados obra={obra} planillas={planillas} onCambio={cargar} />}
          {tab === "exportar" && (
            <ExportarPlanilla obra={obra} planilla={planillaActual} planillas={planillas} grupos={grupos} porRubro={porRubro}
              totales={totales} facturas={facturas} asignaciones={asignaciones} rubros={rubros} />
          )}
        </>
      )}
    </div>
  );
}

function Tarjeta({ label, valor, color, sufijo = "", moneda = true }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || colors.inkSoft, marginTop: 3 }}>
        {moneda ? `$${fmt(valor)}` : `${Number(valor || 0).toFixed(1)}${sufijo}`}
      </div>
    </div>
  );
}
