import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, Check, Upload, Sparkles } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { abrirArchivo } from "../../lib/archivos";
import { leerDocumentoDeCompra } from "./leerProforma";
import { TIPOS_PENDIENTE, abiertos, faltaElPapel, puedeResolver, aQuienSeLePuede } from "./pendientes.js";
import { pendientesDe, facturaDelControl, residentesDe, dejarPendiente, registrarPapel, resolverPendiente } from "./datosDePendientes";

// LO QUE LE FALTA A UNA COMPRA YA HECHA (Hernán, 28/11/2026, sobre la N° 6:
// «aún no me llega la factura... que salga que tiene algo pendiente»).
//
// Va arriba de todo, debajo de los pasos: una compra recibida con la factura
// por llegar no está cerrada, y eso se tiene que ver sin bajar al historial.
// Cada pendiente se cierra a mano, pero los de factura y devolución solo con el
// papel que NOVA leyó (y la factura, registrada en el control).

const fecha = x => new Date(x).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
const mini = { ...inputStyle, fontSize: 12, padding: "6px 8px" };

function UnPendiente({ p, solicitud, factura, currentUser, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");
  const archivo = useRef(null);
  const puede = puedeResolver(p, factura);

  async function subir(f) {
    if (!f) return;
    setOcupado(true); setError("");
    const leido = await leerDocumentoDeCompra(f).catch(e => ({ error: e.message }));
    const r = await registrarPapel(solicitud, p, { archivo: f, leido }, currentUser);
    setOcupado(false);
    if (r.error) setError(r.error);
    onCambio();
  }

  async function resolver() {
    setOcupado(true); setError("");
    const r = await resolverPendiente(solicitud, p, { nota, quien: currentUser, factura });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    onCambio();
  }

  const leido = p.doc_leido || {};
  return (
    <div className="pendiente-de-compra" style={{ borderTop: `1px solid ${colors.warningBorder}`, paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontSize: 12.5, color: colors.ink }}>
        <strong>{TIPOS_PENDIENTE[p.tipo]?.label}</strong>
        {p.para_nombre && <> · lo resuelve <strong>{p.para_nombre}</strong></>}
        <span style={{ color: colors.muted }}> · {p.creado_nombre || "—"}, {fecha(p.created_at)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: colors.ink, margin: "2px 0 6px" }}>{p.texto}</div>

      {p.doc_leido_at && (
        <div style={{ fontSize: 11.5, color: colors.inkSoft, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <Sparkles size={11} color={colors.brand} />
          <span>NOVA leyó{" "}
            <button onClick={() => abrirArchivo(p.doc_path, { nombre: p.doc_nombre })}
              style={{ background: "none", border: "none", padding: 0, color: colors.brand, cursor: "pointer", fontSize: 11.5, fontFamily: colors.font, textDecoration: "underline" }}>
              {p.doc_nombre || "el papel"}
            </button>
            {": "}{[leido.proveedor, leido.numero, leido.monto != null && `$${Number(leido.monto).toFixed(2)}`].filter(Boolean).join(" · ")}
            {p.tipo === "factura" && p.factura_id && " · registrada en el control"}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        {p.tipo !== "otro" && (
          <>
            <input ref={archivo} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; subir(f); }} />
            <Button size="sm" variant={p.doc_leido_at ? "outline" : "primary"} disabled={ocupado} onClick={() => archivo.current?.click()}>
              <Upload size={12} /> {ocupado ? "NOVA está leyendo…" : p.doc_leido_at ? "Subir otro papel" : p.tipo === "factura" ? "Subir la factura" : "Subir el papel de la devolución"}
            </Button>
          </>
        )}
        <input value={nota} onChange={e => setNota(e.target.value)} placeholder={p.tipo === "otro" ? "Cómo se resolvió" : "Nota al resolver (opcional)"}
          style={{ ...mini, flex: 1, minWidth: 160 }} />
        <Button size="sm" variant={puede.ok ? "primary" : "outline"} disabled={ocupado || !puede.ok}
          title={puede.ok ? "" : puede.porque} onClick={resolver}>
          <Check size={12} /> Resuelto
        </Button>
      </div>
      {!puede.ok && !error && <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{puede.porque}</div>}
      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function PendientesDeCompra({ solicitud, users = [], currentUser, onHistorial, onCambio }) {
  const [pendientes, setPendientes] = useState([]);
  const [factura, setFactura] = useState(null);
  const [residentes, setResidentes] = useState([]);
  const [nuevo, setNuevo] = useState(null); // { tipo, texto, para }
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [ps, f] = await Promise.all([pendientesDe(solicitud.id), facturaDelControl(solicitud.factura_id)]);
    setPendientes(ps); setFactura(f);
  }, [solicitud.id, solicitud.factura_id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { residentesDe(solicitud.lead_id).then(setResidentes).catch(() => {}); }, [solicitud.lead_id]);

  const cambio = useCallback(async () => { await cargar(); onHistorial?.(); onCambio?.(); }, [cargar, onHistorial, onCambio]);

  const abiertas = abiertos(pendientes);
  const falta = faltaElPapel(solicitud, factura);
  const candidatos = aQuienSeLePuede(users, { solicitud, residentesIds: residentes });

  function empezar(tipo = falta ? "factura" : "otro") {
    setError("");
    setNuevo({ tipo, texto: tipo === "factura" && falta ? "No ha llegado la factura." : "", para: String(candidatos[0]?.id || "") });
  }

  async function dejar() {
    setOcupado(true); setError("");
    const para = candidatos.find(u => String(u.id) === String(nuevo.para));
    const r = await dejarPendiente(solicitud, { tipo: nuevo.tipo, texto: nuevo.texto, para, quien: currentUser });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setNuevo(null);
    cambio();
  }

  const hay = abiertas.length > 0 || falta;
  const caja = {
    background: hay ? colors.warningSoft : colors.bg,
    border: `1px solid ${hay ? colors.warningBorder : colors.neutralSoft}`, borderRadius: 9, padding: "10px 12px", marginBottom: 12,
  };

  return (
    <div className="pendientes-de-compra" style={caja}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {hay && <AlertTriangle size={14} color={colors.warning} />}
        <div style={{ fontSize: 12.5, fontWeight: 700, color: hay ? colors.ink : colors.muted, flex: 1, minWidth: 160 }}>
          {abiertas.length ? `Tiene ${abiertas.length === 1 ? "algo pendiente" : `${abiertas.length} pendientes`}`
            : falta ? falta
            : "Sin pendientes"}
        </div>
        {!nuevo && (
          <Button size="sm" variant="outline" onClick={() => empezar()}>Dejar pendiente</Button>
        )}
      </div>
      {falta && !abiertas.some(p => p.tipo === "factura") && (
        <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 3 }}>
          FOREMAN lo ve solo: {falta.charAt(0).toLowerCase() + falta.slice(1)}. Dejá un pendiente de factura para que alguien la consiga.
        </div>
      )}

      {abiertas.map(p => (
        <UnPendiente key={p.id} p={p} solicitud={solicitud} factura={factura} currentUser={currentUser} onCambio={cambio} />
      ))}

      {nuevo && (
        <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 8, marginTop: 8, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(TIPOS_PENDIENTE).map(([id, t]) => (
              <button key={id} onClick={() => setNuevo(n => ({ ...n, tipo: id }))}
                style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                  border: `1px solid ${nuevo.tipo === id ? colors.brand : colors.border}`,
                  background: nuevo.tipo === id ? colors.brandSoft : "#fff", color: nuevo.tipo === id ? colors.brand : colors.inkSoft }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: colors.muted }}>{TIPOS_PENDIENTE[nuevo.tipo].ayuda}</div>
          <textarea value={nuevo.texto} onChange={e => setNuevo(n => ({ ...n, texto: e.target.value }))} rows={2}
            placeholder={nuevo.tipo === "devolucion" ? "Qué se devuelve y por qué" : "Qué falta"} style={{ ...mini, resize: "vertical" }} />
          <label style={{ fontSize: 11.5, color: colors.inkSoft, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            Lo resuelve
            <select value={nuevo.para} onChange={e => setNuevo(n => ({ ...n, para: e.target.value }))} style={{ ...mini, width: "auto", minWidth: 160 }}>
              {candidatos.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.nombre}{Number(u.id) === Number(solicitud.solicitante_id) ? " (la pidió)" : residentes.includes(Number(u.id)) ? " (residente)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 11, color: colors.muted }}>
            Le queda como tarea. El correo les llega también a los de esta compra y a los residentes del proyecto.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" disabled={ocupado || !nuevo.texto.trim() || !nuevo.para} onClick={dejar}>
              {ocupado ? "Guardando…" : "Dejar pendiente y avisar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setNuevo(null); setError(""); }}>Cancelar</Button>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
