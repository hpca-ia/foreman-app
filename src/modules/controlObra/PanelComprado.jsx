import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Sparkles, AlertTriangle, ChevronDown, ChevronRight, HardHat } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { agrupar, claveDe, dotacionContraPersonal, facturasPorLeer } from "./itemsComprados";
import { renglonesDeObra, personalDeObra, leerLasQueFaltan } from "./renglones";

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
  const [leyendo, setLeyendo] = useState(null);       // { hechas, de, fallas }
  const [fallas, setFallas] = useState([]);
  const [abierta, setAbierta] = useState(null);       // familia abierta
  const [buscar, setBuscar] = useState("");
  const [verSinPapel, setVerSinPapel] = useState(false);
  const parar = useRef(false);

  const cargar = useCallback(async () => {
    const [r, p] = await Promise.all([renglonesDeObra(obra.id), personalDeObra(obra.lead_id)]);
    setRenglones(r.renglones); setSinTablas(r.sinTablas); setGente(p); setCargando(false);
  }, [obra.id, obra.lead_id]);
  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(facturas.map(f => [String(f.id), f])), [facturas]);
  const grupos = useMemo(() => agrupar(renglones), [renglones]);
  const dotacion = useMemo(() => dotacionContraPersonal(grupos, gente.total), [grupos, gente.total]);
  const porLeer = facturasPorLeer(facturas);
  const conPapel = facturas.filter(f => f.archivo_url && f.clase !== "anticipo").length;
  const ilegibles = facturas.filter(f => f.renglones_estado === "ilegible").length;
  const noCuadran = facturas.filter(f => f.renglones_estado === "no_cuadra").length;
  const sinPapel = facturas.filter(f => !f.archivo_url);

  const visibles = useMemo(() => {
    const q = claveDe(buscar);
    if (!q) return grupos;
    return grupos.filter(g => g.variantes.some(v => q.split(" ").every(p => v.clave.includes(p))));
  }, [grupos, buscar]);

  async function leerTodas() {
    parar.current = false; setFallas([]);
    setLeyendo({ hechas: 0, de: porLeer.length, fallas: [] });
    const r = await leerLasQueFaltan(facturas, {
      alAvanzar: estado => setLeyendo({ ...estado }),
      seguir: () => !parar.current,
    });
    setFallas(r.fallas); setLeyendo(null);
    await cargar(); onCambio?.();
  }

  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 12.5 }}>Cargando…</div>;
  if (sinTablas) return <div style={{ ...caja, color: colors.warning, fontSize: 12.5 }}>Falta correr la migración 127 para ver lo que se compró.</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* CUÁNTO ESTÁ LEÍDO. Una suma sobre la mitad de las facturas parece una
          suma completa; hay que decir sobre cuántas se hizo. */}
      <div style={{ ...caja, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5 }}>
          <strong style={{ color: colors.ink }}>{conPapel - porLeer.length - ilegibles - noCuadran} de {conPapel}</strong> facturas con papel ya tienen sus renglones.
          {porLeer.length > 0 && <> Faltan <strong>{porLeer.length}</strong>.</>}
          {ilegibles > 0 && <> {ilegibles} no se pudieron leer (recibos a mano, fotos borrosas).</>}
          {noCuadran > 0 && <> {noCuadran} se leyeron con renglones que no cuadran con su total y quedaron fuera de la suma.</>}
          {sinPapel.length > 0 && (
            <> <button onClick={() => setVerSinPapel(v => !v)}
              style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: colors.font,
                fontSize: 12.5, color: colors.brand, textDecoration: "underline" }}>
              {sinPapel.length} no {sinPapel.length === 1 ? "tiene" : "tienen"} archivo
            </button> y no se pueden leer.</>
          )}
        </div>
        {leyendo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span>Leyendo {leyendo.hechas} de {leyendo.de}…</span>
            <Button variant="outline" size="sm" onClick={() => { parar.current = true; }}>Parar</Button>
          </div>
        ) : porLeer.length > 0 && (
          <Button size="sm" onClick={leerTodas}>
            <Sparkles size={12} /> Leer las {porLeer.length} que faltan
          </Button>
        )}
      </div>
      {/* LAS QUE NO TIENEN PAPEL. Decir "6 no tienen archivo" y no decir
          cuáles es mandar a alguien a revisar ochenta facturas. */}
      {verSinPapel && sinPapel.length > 0 && (
        <div style={{ ...caja, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin archivo</div>
          {sinPapel.map(f => (
            <div key={f.id} style={{ display: "flex", gap: 10, padding: "4px 0", borderTop: `1px solid ${colors.border}` }}>
              <span style={{ width: 70, color: colors.muted }}>{dia(f.fecha)}</span>
              <span style={{ flex: 1 }}>
                {f.razon_social || "Sin proveedor"}
                {f.numero_factura ? <span style={{ color: colors.muted }}> · {f.numero_factura}</span> : ""}
              </span>
              <span style={{ width: 90, color: colors.muted }}>{f.origen === "caja_chica" ? "caja chica" : "planilla"}</span>
              <span style={{ width: 80, textAlign: "right" }}>${fmt(Number(f.total))}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
            Para que entren a la cuenta, abrí cada una en Facturas y subí la foto o el PDF.
          </div>
        </div>
      )}
      {leyendo && (
        <div style={{ height: 4, background: colors.border, borderRadius: 2, margin: "-6px 0 12px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(leyendo.hechas / Math.max(1, leyendo.de)) * 100}%`, background: colors.brand, transition: "width .3s" }} />
        </div>
      )}
      {fallas.length > 0 && (
        <div style={{ ...caja, background: colors.warningSoft, borderColor: colors.warningBorder, fontSize: 12 }}>
          <strong>{fallas.length} no se pudieron leer esta vez</strong> y quedan para la próxima:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {fallas.slice(0, 8).map(({ factura, error }) => (
              <li key={factura.id}>{factura.razon_social || "Sin proveedor"} {factura.numero_factura || ""} — {error}</li>
            ))}
          </ul>
        </div>
      )}

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
          <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Qué se compró</div>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: casco, cemento, cuerda…"
            style={{ ...inputStyle, width: 220, fontSize: 12 }} />
        </div>
        {!grupos.length && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "10px 0" }}>
            Todavía no hay renglones leídos. {porLeer.length ? "Apretá “Leer las que faltan”." : ""}
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
                  {renglones.filter(r => (r.clave || claveDe(r.descripcion)) === v.clave).map(r => {
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
