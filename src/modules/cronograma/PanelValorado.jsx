import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Eye, EyeOff, Trash2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "../controlObra/calculos";
import { mesesDe, nombreMes, curva, suma, cierra, tramo, previstoContraReal, desembolsos } from "./valorado";
import { cargarValorado, armarDesdeObra, moverTramo, guardarCronograma, borrarValorado, ajustarPesos, guardarPesos,
  pendientesDeSumar, sumarAlValorado, valoradoDelCronograma } from "./valoradoDatos";
import { cargarPlan, leerPlazo } from "./plazo";
import { supabase } from "../../lib/supabase";

// El cronograma valorado de la obra.
//
// Una fila por rubro y una columna por mes, como el Excel. Lo que cambia es
// cómo se llena: en vez de escribir porcentajes se arrastra el tramo —de qué
// mes a qué mes va este rubro— y el reparto sale solo. Es lo que el Excel
// hace a mano con "=I16/2", en dos toques.
//
// Arriba, lo único que de verdad se mira todos los meses: lo previsto contra
// lo gastado. Esa diferencia es la respuesta a "¿vamos bien?", dicha en plata.

export default function PanelValorado({ lead, obra, facturas = [], currentUser, puedeEditar = true }) {
  const [cronograma, setCronograma] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [armando, setArmando] = useState(null);
  const [error, setError] = useState("");
  const [verCurva, setVerCurva] = useState(true);
  const [anticipo, setAnticipo] = useState("");
  // Lo que entró por órdenes de cambio después de armar el valorado.
  const [pendiente, setPendiente] = useState(null);
  const [pensando, setPensando] = useState(false);
  // El cronograma de barras del proyecto, si ya existe: de ahí sale el
  // valorado bien hecho, con las etapas en los meses en que de verdad caen.
  const [gantt, setGantt] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await cargarValorado(lead?.id);
    setCronograma(r.cronograma); setLineas(r.lineas); setSinTablas(r.sinTablas);
    setPendiente(r.cronograma ? await pendientesDeSumar(r.cronograma) : null);
    if (!r.cronograma) {
      const g = await cargarPlan(lead?.id);
      setGantt(g.actividades.some(a => a.obra_actividad_id) ? g : null);
    }
    setCargando(false);
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (sinTablas) {
    return <Aviso>Falta correr la migración 074 para usar el cronograma valorado.</Aviso>;
  }
  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "34px 0", fontSize: 13 }}>Cargando…</div>;

  if (!cronograma) {
    return (
      <div>
        {!armando ? (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14 }}>
            <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
              El cronograma valorado reparte el presupuesto entre los meses que dure la obra. Sirve para dos cosas:
              saber si <strong style={{ color: colors.ink }}>se está gastando acorde</strong> mes a mes, y decirle al
              cliente <strong style={{ color: colors.ink }}>cuándo tiene que desembolsar</strong>.
            </div>
            {/* EL ORDEN, dicho donde se decide. Es la pregunta que uno trae al
                abrir esta pantalla por primera vez. */}
            <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.55, marginBottom: 10,
              borderLeft: `2px solid ${colors.neutralSoft}`, paddingLeft: 9 }}>
              <strong style={{ color: colors.inkSoft }}>Primero el cronograma de barras, después éste.</strong> La
              plata sigue a la ejecución: solo se puede planillar lo que se construyó, así que las fechas mandan y el
              dinero cae donde ellas digan. Al revés no se puede — un porcentaje mensual no dice qué traba a qué ni
              qué no puede atrasarse. Lo único que vuelve del valorado al cronograma es cuánto puede poner el cliente
              por mes, y eso se acomoda allá moviendo lo que tiene colchón.
              {!gantt && <> Si todavía no hay barras, armalo del presupuesto y rehacelo cuando las haya.</>}
            </div>
            {!obra
              ? <div style={{ fontSize: 12.5, color: colors.warning }}>Este proyecto todavía no tiene obra activa: el valorado sale de sus rubros.</div>
              : puedeEditar && (
              <>
                {/* El camino bueno, cuando el Gantt ya existe.
                    El valorado y el cronograma de barras son dos vistas del
                    mismo plan. Armarlos por separado —cada uno preguntándole a
                    NOVA— garantiza que en algún momento digan cosas distintas
                    sobre la misma ventanería, y entonces hay que mantenerlos
                    de acuerdo a mano. Sacándolo de las barras, la plata cae en
                    los meses en que las actividades de verdad pasan. */}
                {gantt && (
                  <div style={{ background: colors.brandSoft, border: `1px solid ${colors.brand}30`,
                    borderRadius: 8, padding: 11, marginBottom: 9 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.55, marginBottom: 8 }}>
                      Este proyecto ya tiene <strong>cronograma de barras</strong> con{" "}
                      {gantt.actividades.filter(a => a.obra_actividad_id).length} actividades.
                      Sacá el valorado de ahí: la plata cae en los meses en que cada actividad pasa, y las etapas
                      —el anticipo de la ventanería en marzo, su instalación en agosto— quedan en su mes sin que
                      nadie las reparta a mano.
                    </div>
                    {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 7 }}>{error}</div>}
                    <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                      setError(""); setPensando(true);
                      const pl = await leerPlazo(lead?.id);
                      // La ventana la manda el cronograma, no el plazo: si hay
                      // un anticipo dos meses antes del día uno, esa plata
                      // existe y el valorado tiene que tener dónde ponerla.
                      const desde = (gantt.plan.inicio || "").slice(0, 7);
                      const [a1, m1] = desde.split("-").map(Number);
                      const [a2, m2] = (gantt.plan.fin || "").slice(0, 7).split("-").map(Number);
                      const abarca = a1 && a2 ? (a2 - a1) * 12 + (m2 - m1) + 1 : (pl.meses || 6);
                      const r = await valoradoDelCronograma({
                        lead, obra, actividadesPlan: gantt.actividades, cal: gantt.cal,
                        mesInicio: desde || new Date().toISOString().slice(0, 7),
                        meses: Math.max(1, abarca, pl.meses || 0), quien: currentUser,
                      });
                      setPensando(false);
                      if (r.error) { setError(r.error); return; }
                      if (r.sinActividad > 0 || r.descuadre) {
                        window.alert([
                          "El valorado quedó armado.",
                          r.sinActividad > 0 && `${r.sinActividad} ${r.sinActividad === 1 ? "agrupación" : "agrupaciones"} con plata no están en el cronograma de barras: entraron marcadas para revisar, repartidas en toda la obra.`,
                          r.descuadre && `OJO: suma ${fmt(Math.abs(r.descuadre))} ${r.descuadre > 0 ? "más" : "menos"} que el presupuesto. Revisá los pesos de las actividades.`,
                        ].filter(Boolean).join("\n\n"));
                      }
                      await cargar();
                    }}>{pensando ? "Armando…" : "Sacarlo del cronograma de barras"}</Button>
                  </div>
                )}
                <Button variant={gantt ? "outline" : "primary"} size="sm"
                  onClick={async () => {
                    // El plazo del proyecto, no uno nuevo: la obra dura lo que
                    // dura, y preguntarlo otra vez acá es invitar a que el
                    // valorado y el Gantt digan plazos distintos.
                    const pl = await leerPlazo(lead?.id);
                    setArmando({
                      mesInicio: (pl.inicio || new Date().toISOString()).slice(0, 7),
                      meses: pl.meses || 6,
                    });
                  }}>
                  {gantt ? "Armarlo aparte, del presupuesto" : "Armarlo del presupuesto"}
                </Button>
              </>
              )}
          </div>
        ) : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, display: "grid", gap: 9 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={lbl}>EMPIEZA EN</label>
                <input type="month" value={armando.mesInicio} onChange={e => setArmando(a => ({ ...a, mesInicio: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={lbl}>CUÁNTOS MESES DURA</label>
                <input type="number" min="1" max="60" value={armando.meses}
                  onChange={e => setArmando(a => ({ ...a, meses: Number(e.target.value) || 1 }))} style={inputStyle} />
              </div>
            </div>
            {/* UNA LÍNEA POR AGRUPACIÓN. Nunca por rubro.
                Antes se podía elegir, y "por rubro" venía marcado. Eso no era
                una preferencia: el control de obra se planilla por agrupación
                y el cronograma de barras se arma por agrupación, así que un
                valorado por rubro no se puede comparar con ninguno de los dos
                — tres documentos de la misma obra hablando de tres cosas. */}
            <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
              Una línea por <strong style={{ color: colors.inkSoft }}>agrupación del control de obra</strong>, en su
              mismo orden. Arranca con todo repartido parejo; desde ahí corregís lo que sabés distinto —la estructura
              adelante, los acabados al final— y lo que no toques igual suma el presupuesto entero.
            </div>
            {error && <div style={{ fontSize: 12, color: colors.danger }}>{error}</div>}

            {/* Un solo camino, y por agrupación.
                El que había de "que lo arme NOVA" trabajaba rubro por rubro
                —otra vez la mezcla— y lo que de verdad hace falta para un
                valorado inteligente es el cronograma de barras: ahí la plata
                cae en los meses en que cada agrupación de verdad ocurre, y
                eso NOVA sí lo arma bien porque son las mismas agrupaciones. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                setError(""); setPensando(true);
                const r = await armarDesdeObra({ lead, obra, ...armando, quien: currentUser });
                setPensando(false);
                if (r.error) { setError(r.error); return; }
                setArmando(null); await cargar();
                if (r.sinAgrupar > 0) {
                  window.alert(
                    `El valorado quedó armado con ${r.lineas} líneas.\n\n` +
                    `Hay ${fmt(r.sinAgrupar)} en rubros que todavía no están en ninguna agrupación: entraron en una ` +
                    "línea aparte marcada para revisar. Agrupalos en Control de Obra y rehacé el valorado.");
                }
              }}>{pensando ? "Armando…" : "Armarlo de las agrupaciones"}</Button>
              <Button variant="secondary" size="sm" onClick={() => setArmando(null)}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const meses = mesesDe(cronograma.mes_inicio, cronograma.meses);
  const conPesos = lineas.map(l => ({ ...l, pesos: ajustarPesos(l.pesos, cronograma.meses) }));
  const c = curva(conPesos, meses);
  const comparacion = previstoContraReal({ lineas: conPesos, meses, facturas, hasta: new Date().toISOString().slice(0, 10) });
  const desc = desembolsos({ lineas: conPesos, meses, anticipado: Number(anticipo) || 0 });
  const sinCerrar = conPesos.filter(l => !cierra(l.pesos));
  const totalPresupuesto = conPesos.reduce((t, l) => t + (Number(l.monto) || 0), 0);

  const maxBarra = Math.max(...comparacion.filas.map(f => Math.max(f.previstoAcum, f.realAcum)), 1);

  return (
    <div>
      {/* Lo único que se mira todos los meses. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
        <Tarjeta label="Presupuesto" valor={totalPresupuesto} />
        <Tarjeta label="Previsto al día de hoy" valor={comparacion.previsto} />
        <Tarjeta label="Gastado" valor={comparacion.real} color={colors.ink} />
        <Tarjeta label={comparacion.diferencia >= 0 ? "Gastado de más" : "Gastado de menos"}
          valor={Math.abs(comparacion.diferencia)}
          color={comparacion.diferencia > 0 ? colors.danger : colors.success} />
      </div>

      {/* Lo que una orden de cambio aprobada le hizo al valorado. Es la
          pregunta que nadie se acuerda de hacerse, y la que desalinea la
          curva sin que nada avise. */}
      {pendiente && (pendiente.rubros.length > 0 || pendiente.dias > 0) && (
        <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`,
          borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 7 }}>
            <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ lineHeight: 1.55 }}>
              {pendiente.rubros.length > 0 && (
                <div>
                  Entraron <strong>{pendiente.rubros.length}</strong> rubros por órdenes de cambio,
                  por <strong>${fmt(pendiente.monto)}</strong>, que todavía no están en la curva.
                  Mientras no se sumen, el cuadro de arriba compara el gasto de hoy contra el presupuesto viejo.
                </div>
              )}
              {pendiente.dias > 0 && (
                <div style={{ marginTop: pendiente.rubros.length ? 4 : 0 }}>
                  Las órdenes aprobadas suman <strong>{pendiente.dias} días</strong> de plazo
                  {cronograma.meses * 30 < pendiente.dias + 1 ? "" : ""} — unos {Math.ceil(pendiente.dias / 30)}{" "}
                  {Math.ceil(pendiente.dias / 30) === 1 ? "mes" : "meses"} más de obra.
                </div>
              )}
            </div>
          </div>
          {puedeEditar && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {pendiente.rubros.length > 0 && (
                <Button variant="primary" size="sm" onClick={async () => {
                  // Desde el mes en curso: una orden de cambio se ejecuta de
                  // ahora en adelante, no hacia atrás.
                  const hoyMes = new Date().toISOString().slice(0, 7);
                  const i = Math.max(0, meses.indexOf(hoyMes));
                  const err = await sumarAlValorado(cronograma, pendiente.rubros, i);
                  if (err) { setError(err); return; }
                  await cargar();
                }}>Sumarlos a la curva</Button>
              )}
              {pendiente.dias > 0 && (
                <Button variant="outline" size="sm" onClick={async () => {
                  const nuevos = cronograma.meses + Math.ceil(pendiente.dias / 30);
                  if (!window.confirm(`¿Extender el cronograma a ${nuevos} meses?\n\nEs lo que suman las órdenes aprobadas. Los porcentajes de cada rubro no se tocan: los meses nuevos quedan en cero y vos decidís qué cae ahí.`)) return;
                  await guardarCronograma(cronograma.id, { meses: nuevos });
                  await cargar();
                }}>Extender el plazo</Button>
              )}
            </div>
          )}
        </div>
      )}

      {sinCerrar.length > 0 && (
        <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`,
          borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            {sinCerrar.length} {sinCerrar.length === 1 ? "fila no cierra" : "filas no cierran"} en 100%:
            esa plata no está en la curva y el total de abajo no va a dar el presupuesto.
          </span>
        </div>
      )}

      {/* Previsto contra gastado, mes a mes. Es el gráfico que pide el cliente. */}
      {verCurva && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Previsto contra gastado</div>
            <span style={{ fontSize: 11, color: colors.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: colors.border, display: "inline-block" }} /> previsto
            </span>
            <span style={{ fontSize: 11, color: colors.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: colors.brand, display: "inline-block" }} /> gastado
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 132, overflowX: "auto", paddingBottom: 2 }}>
            {comparacion.filas.map(f => (
              <div key={f.mes} style={{ flex: "1 0 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
                title={`${nombreMes(f.mes)} · previsto $${fmt(f.previstoAcum)} · gastado $${fmt(f.realAcum)}`}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100, width: "100%", justifyContent: "center" }}>
                  <div style={{ width: "42%", height: `${(f.previstoAcum / maxBarra) * 100}%`, minHeight: 2,
                    background: colors.border, borderRadius: "3px 3px 0 0" }} />
                  <div style={{ width: "42%", height: `${(f.realAcum / maxBarra) * 100}%`, minHeight: f.futuro ? 0 : 2,
                    background: f.diferencia > 0 ? colors.danger : colors.brand, borderRadius: "3px 3px 0 0",
                    opacity: f.futuro ? 0.25 : 1 }} />
                </div>
                <div style={{ fontSize: 9.5, color: f.futuro ? colors.border : colors.muted, whiteSpace: "nowrap" }}>
                  {nombreMes(f.mes)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuándo tiene que poner el cliente. */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Cuándo desembolsa el cliente</div>
          <input type="number" value={anticipo} onChange={e => setAnticipo(e.target.value)}
            placeholder="Anticipo ya recibido" style={{ ...inputStyle, width: 170, padding: "6px 9px", fontSize: 12 }} />
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {desc.map(d => (
            <div key={d.mes} style={{ flex: "0 0 96px", background: colors.bg, borderRadius: 8, padding: "7px 9px" }}>
              <div style={{ fontSize: 9.5, color: colors.muted, fontWeight: 700 }}>{nombreMes(d.mes).toUpperCase()}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: d.aponer ? colors.ink : colors.success }}>${fmt(d.aponer)}</div>
              {d.cubreAnticipo > 0 && (
                <div style={{ fontSize: 9.5, color: colors.success }}>anticipo ${fmt(d.cubreAnticipo)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* La matriz. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>
          {lineas.length} {lineas.length === 1 ? "línea" : "líneas"} · {cronograma.meses} meses desde {nombreMes(cronograma.mes_inicio)}
        </div>
        <button onClick={() => setVerCurva(v => !v)} style={chico}>{verCurva ? "Ocultar el gráfico" : "Ver el gráfico"}</button>
        {puedeEditar && (
          <>
            <button onClick={async () => {
              const m = Number(window.prompt("¿Cuántos meses dura la obra?", cronograma.meses));
              if (!m || m < 1) return;
              await guardarCronograma(cronograma.id, { meses: m });
              await cargar();
            }} style={chico}>Cambiar la duración</button>
            <button onClick={async () => {
              await guardarCronograma(cronograma.id, { visible_cliente: !cronograma.visible_cliente });
              await cargar();
            }} style={{ ...chico, color: cronograma.visible_cliente ? colors.success : colors.muted }}>
              {cronograma.visible_cliente ? <><Eye size={11} /> El cliente lo ve</> : <><EyeOff size={11} /> El cliente no lo ve</>}
            </button>
            <button onClick={async () => {
              if (!window.confirm("¿Borrar el cronograma valorado y empezar de nuevo?")) return;
              await borrarValorado(cronograma.id); await cargar();
            }} style={{ ...chico, marginLeft: "auto" }}><Trash2 size={11} /> Borrar</button>
          </>
        )}
      </div>

      <div style={{ overflowX: "auto", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
        <div style={{ minWidth: 520 + meses.length * 58 }}>
          <div style={{ display: "grid", gridTemplateColumns: `minmax(220px,1fr) 104px repeat(${meses.length}, 58px)`,
            gap: 4, padding: "8px 12px", background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
            <span>RUBRO</span>
            <span style={{ textAlign: "right" }}>TOTAL</span>
            {meses.map(m => <span key={m} style={{ textAlign: "center" }}>{nombreMes(m).toUpperCase()}</span>)}
          </div>

          {conPesos.map(l => {
            const t = tramo(l.pesos);
            const mal = !cierra(l.pesos);
            return (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: `minmax(220px,1fr) 104px repeat(${meses.length}, 58px)`,
                gap: 4, padding: "6px 12px", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center", fontSize: 11.5 }}>
                <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.codigo && <span style={{ color: colors.muted, marginRight: 5 }}>{l.codigo}</span>}
                  {l.descripcion}
                  {l.revisar && (
                    <span title={l.orden_cambio_id
                      ? "Entró por una orden de cambio y se repartió en lo que queda de obra. Revisá en qué meses va."
                      : "Nadie dijo en qué meses va: está repartida en toda la obra. Su plata ya suma, pero el mes está sin decidir."}
                      style={{ background: colors.warningSoft, color: colors.warning, borderRadius: 9, padding: "1px 6px",
                        fontSize: 9, fontWeight: 700, marginLeft: 5 }}>revisar</span>
                  )}
                  {mal && <span title={`Suma ${suma(l.pesos)}%`} style={{ color: colors.warning, marginLeft: 5 }}>⚠</span>}
                </span>
                <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(l.monto)}</span>
                {meses.map((m, i) => {
                  const dentro = t && i >= t.desde && i <= t.hasta;
                  const pct = Number(l.pesos[i]) || 0;
                  return (
                    <button key={m} disabled={!puedeEditar}
                      title={pct ? `${pct}% · $${fmt((Number(l.monto) || 0) * pct / 100)}` : "Tocá el mes de inicio y después el de fin"}
                      onClick={async () => {
                        // Primer toque fija el inicio; el segundo, el fin. Es
                        // como se dibuja una barra con un dedo.
                        if (!t || i < t.desde || (t.desde !== t.hasta)) await moverTramo(l, i, i, cronograma.meses);
                        else await moverTramo(l, t.desde, i, cronograma.meses);
                        await cargar();
                      }}
                      onDoubleClick={async () => {
                        const v = window.prompt(`% del rubro en ${nombreMes(m)}`, pct);
                        if (v === null) return;
                        const pesos = [...l.pesos]; pesos[i] = Number(v) || 0;
                        await guardarPesos(l.id, pesos); await cargar();
                      }}
                      style={{ height: 24, borderRadius: 4, border: "none", cursor: puedeEditar ? "pointer" : "default",
                        background: dentro ? colors.brand : colors.neutralSoft,
                        color: dentro ? "#fff" : "transparent", fontSize: 9.5, fontWeight: 700, fontFamily: colors.font }}>
                      {pct ? `${Math.round(pct)}` : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div style={{ display: "grid", gridTemplateColumns: `minmax(220px,1fr) 104px repeat(${meses.length}, 58px)`,
            gap: 4, padding: "9px 12px", borderTop: `2px solid ${colors.border}`, background: colors.bg,
            fontSize: 11, fontWeight: 700, color: colors.ink }}>
            <span>TOTAL POR MES</span>
            <span style={{ textAlign: "right" }}>${fmt(totalPresupuesto)}</span>
            {c.map(x => <span key={x.mes} style={{ textAlign: "center", fontSize: 9.5 }}>${fmt(x.monto)}</span>)}
          </div>
        </div>
      </div>

      {puedeEditar && (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.5 }}>
          Tocá el mes en que empieza un rubro y después el mes en que termina: se reparte parejo entre esos.
          Doble clic en un mes para escribir el porcentaje a mano.
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
const chico = {
  background: "none", border: "none", padding: 0, color: colors.muted, fontSize: 11,
  fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 4,
};

const Aviso = ({ children }) => (
  <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft,
    border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>{children}</div>
);

function Tarjeta({ label, valor, color }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ fontSize: 9.5, color: colors.muted, fontWeight: 700, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || colors.ink, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );
}
