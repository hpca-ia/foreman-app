import { useEffect, useState, useCallback, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, HardHat } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import RevisionLectura from "./RevisionLectura";
import { fmt } from "./calculos";
import { agrupar, conIva, claveDe, dotacionContraPersonal, facturasPorLeer } from "./itemsComprados";
import { renglonesDeObra, personalDeObra } from "./renglones";

// Qué se compró en la obra, sumado, y la dotación contra la gente.
//
// Es la primera pieza de la bodega: lo que se compró. Contesta "¿cuántos
// cascos llevamos?" sin abrir sesenta PDFs, y avisa cuando lo comprado no
// tiene que ver con la gente que hay: diez trabajadores y veintitrés cascos
// es una pregunta que alguien tiene que hacer.
//
// Lee las facturas de planilla y las de caja chica por igual: las dos son
// filas de obra_facturas. Las que ya estaban cargadas antes de que esto
// existiera se leen con el botón de arriba, una por una.

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" }) : "");
const num = v => (Math.round(v * 100) / 100).toLocaleString("es-EC");
const caja = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 };

export default function PanelComprado({ obra, facturas = [], onCambio }) {
  const [renglones, setRenglones] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [gente, setGente] = useState({ total: 0, activos: 0 });
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);       // familia abierta
  const [buscar, setBuscar] = useState("");

  const cargar = useCallback(async () => {
    const [r, p] = await Promise.all([renglonesDeObra(obra.id), personalDeObra(obra.lead_id)]);
    setRenglones(r.renglones); setSinTablas(r.sinTablas); setGente(p); setCargando(false);
  }, [obra.id, obra.lead_id]);
  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(facturas.map(f => [String(f.id), f])), [facturas]);
  // CON IVA, cada renglón con su tarifa: es como lo cuenta el control y lo
  // que salió de la caja. Sin IVA, esta pantalla y el control nunca cuadran.
  const valorados = useMemo(() => conIva(renglones, facturas), [renglones, facturas]);
  const grupos = useMemo(() => agrupar(valorados), [valorados]);
  const dotacion = useMemo(() => dotacionContraPersonal(grupos, gente.total), [grupos, gente.total]);
  const porLeer = facturasPorLeer(facturas);
  const visibles = useMemo(() => {
    const q = claveDe(buscar);
    if (!q) return grupos;
    return grupos.filter(g => g.variantes.some(v => q.split(" ").every(p => v.clave.includes(p))));
  }, [grupos, buscar]);

  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 12.5 }}>Cargando…</div>;
  if (sinTablas) return <div style={{ ...caja, color: colors.warning, fontSize: 12.5 }}>Falta correr la migración 127 para ver lo que se compró.</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* CUÁNTO ESTÁ LEÍDO. Una suma sobre la mitad de los documentos parece
          una suma completa; hay que decir sobre cuántos se hizo. */}
      <RevisionLectura facturas={facturas} onLeido={async () => { await cargar(); onCambio?.(); }} />

      {/* LA DOTACIÓN CONTRA LA GENTE. */}
      {dotacion.length > 0 && (
        <div style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            <HardHat size={14} /> Dotación contra la gente
            <span style={{ fontWeight: 400, color: colors.muted }}>
              · {gente.total
                ? `${gente.total} ${gente.total === 1 ? "persona pasó" : "personas pasaron"} por la obra (${gente.activos} hoy)`
                : "no hay trabajadores cargados en Mano de obra: no hay contra qué comparar"}
            </span>
          </div>
          {dotacion.map(d => {
            const alerta = d.de_mas > 0;
            return (
              <div key={d.nombre} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 6, fontSize: 12.5,
                background: alerta ? colors.dangerSoft : "transparent", marginBottom: 2 }}>
                {alerta ? <AlertTriangle size={13} color={colors.danger} /> : <span style={{ width: 13 }} />}
                <span style={{ width: 90, fontWeight: 600 }}>{d.nombre}</span>
                <span style={{ flex: 1 }}>
                  {num(d.cantidad)} comprados
                  {gente.total > 0 && <span style={{ color: colors.muted }}> · se esperan {d.esperado}{d.porPersona > 1 ? ` (${d.porPersona} por persona)` : ""}</span>}
                </span>
                {alerta && <strong style={{ color: colors.danger }}>{num(d.de_mas)} de más</strong>}
                <span style={{ width: 80, textAlign: "right", color: colors.inkSoft }}>${fmt(d.total)}</span>
              </div>
            );
          })}
          {dotacion.some(d => d.de_mas > 0) && (
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 1.5 }}>
              De más no quiere decir robado: puede ser reposición, o gente de un subcontratista que no está en la nómina.
              Es la pregunta que hay que hacerle al residente.
            </div>
          )}
        </div>
      )}

      {/* TODO LO COMPRADO, por familia. */}
      <div style={caja}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>
            Qué se compró <span style={{ fontWeight: 400, color: colors.muted, fontSize: 11.5 }}>· valores con IVA</span>
          </div>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: casco, cemento, cuerda…"
            style={{ ...inputStyle, width: 220, fontSize: 12 }} />
        </div>
        {!grupos.length && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "10px 0" }}>
            Todavía no hay renglones leídos. {porLeer.length ? "Apretá “Leer los que faltan”." : ""}
          </div>
        )}
        {visibles.map(g => {
          const abierto = abierta === g.familia;
          return (
            <div key={g.familia} style={{ borderTop: `1px solid ${colors.border}` }}>
              <button onClick={() => setAbierta(abierto ? null : g.familia)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 2px", border: "none",
                  background: "transparent", cursor: "pointer", fontFamily: colors.font, fontSize: 12.5, textAlign: "left", color: colors.ink }}>
                {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span style={{ flex: 1, fontWeight: 600, textTransform: "capitalize" }}>{g.familia}</span>
                <span style={{ width: 120, textAlign: "right" }}>{num(g.cantidad)} {g.unidad}</span>
                <span style={{ width: 90, textAlign: "right", color: colors.muted, fontSize: 11.5 }}>{g.facturas} {g.facturas === 1 ? "factura" : "facturas"}</span>
                <span style={{ width: 90, textAlign: "right", fontWeight: 600 }}>${fmt(g.total)}</span>
              </button>
              {abierto && g.variantes.map(v => (
                <div key={v.clave} style={{ padding: "2px 0 8px 22px" }}>
                  <div style={{ display: "flex", fontSize: 12, color: colors.inkSoft }}>
                    <span style={{ flex: 1 }}>{v.descripcion}</span>
                    <span style={{ width: 120, textAlign: "right" }}>{num(v.cantidad)} {v.unidad}</span>
                    <span style={{ width: 90 }} />
                    <span style={{ width: 90, textAlign: "right" }}>${fmt(v.total)}</span>
                  </div>
                  {valorados.filter(r => (r.clave || claveDe(r.descripcion)) === v.clave).map(r => {
                    const f = porId.get(String(r.factura_id));
                    return (
                      <div key={r.id} style={{ display: "flex", fontSize: 11, color: colors.muted, paddingLeft: 12 }}>
                        <span style={{ flex: 1 }}>
                          {dia(f?.fecha)} · {f?.razon_social || "Sin proveedor"} {f?.numero_factura ? `· ${f.numero_factura}` : ""}
                          {f?.origen === "caja_chica" ? " · caja chica" : ""}
                        </span>
                        <span style={{ width: 120, textAlign: "right" }}>{num(Number(r.cantidad))} {r.unidad}</span>
                        <span style={{ width: 90 }} />
                        <span style={{ width: 90, textAlign: "right" }}>${fmt(Number(r.total))}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
