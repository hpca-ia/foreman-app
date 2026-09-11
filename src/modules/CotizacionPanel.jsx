import { useState } from "react";

export default function CotizacionPanel({ result, clientes, capitulosActivos, onCancelar, onImportar, fmt }) {
  const [capNombre, setCapNombre] = useState(result.proveedor||"COTIZACIÓN PROVEEDOR");
  const [utilidadGlobal, setUtilidadGlobal] = useState(0);
  const [rubros, setRubros] = useState(result.rubros?.filter(r=>r.descripcion?.trim())||[]);
  const [guardarBD, setGuardarBD] = useState(false);
  const [proveedor, setProveedor] = useState(result.proveedor||"");
  const [clienteNombre, setClienteNombre] = useState("");
  const [fecha, setFecha] = useState(new Date().getFullYear().toString());

  function aplicarUtilidadGlobal(pct) {
    setUtilidadGlobal(pct);
    setRubros(prev=>prev.map(r=>({
      ...r,
      precio_unitario_final: Number(r.precio_unitario) * (1 + pct/100)
    })));
  }

  function cambiarUtilidadRubro(idx, pct) {
    setRubros(prev=>prev.map((r,i)=>i===idx?{
      ...r,
      utilidad_pct: pct,
      precio_unitario_final: Number(r.precio_unitario) * (1 + pct/100)
    }:r));
  }

  const iS = {background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,color:"var(--ink)",padding:"5px 8px",fontSize:12,fontFamily:"var(--font)",outline:"none"};

  return (
    <div style={{background:"var(--success-soft)",border:"1.5px solid var(--success-border)",borderRadius:12,padding:16,marginBottom:14,fontFamily:"var(--font)"}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--success)",marginBottom:12}}>✓ NOVA encontró {rubros.length} rubros — configura antes de importar</div>

      {/* Nombre del capítulo */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div>
          <label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:3}}>Nombre del capítulo en el presupuesto</label>
          <input value={capNombre} onChange={e=>setCapNombre(e.target.value)} style={{...iS,width:"100%",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:3}}>Utilidad global a todos los rubros (%)</label>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={utilidadGlobal} onChange={e=>setUtilidadGlobal(e.target.value)} style={{...iS,width:70}}/>
            <button onClick={()=>aplicarUtilidadGlobal(Number(utilidadGlobal))} style={{background:"var(--success)",border:"none",borderRadius:6,padding:"5px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>Aplicar %</button>
          </div>
        </div>
      </div>

      {/* Rubros editables */}
      <div style={{maxHeight:220,overflowY:"auto",marginBottom:12,border:"1px solid var(--success-border)",borderRadius:8,background:"#fff"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"var(--success-soft)"}}>
            {["Descripción","Unidad","Cant","P.Original","Util%","P.Final","Total"].map(h=>(
              <th key={h} style={{padding:"5px 8px",textAlign:"left",color:"var(--success)",fontWeight:600,borderBottom:"1px solid var(--success-border)",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rubros.map((r,i)=>{
              const pFinal = r.precio_unitario_final||r.precio_unitario||0;
              const total = (r.cantidad||1)*pFinal;
              return(
                <tr key={i} style={{borderBottom:"1px solid var(--success-soft)"}}>
                  <td style={{padding:"4px 8px",color:"var(--ink)",maxWidth:180}}>{r.descripcion}</td>
                  <td style={{padding:"4px 8px",color:"var(--ink-soft)"}}>{r.unidad}</td>
                  <td style={{padding:"4px 8px",color:"var(--ink-soft)"}}>{r.cantidad}</td>
                  <td style={{padding:"4px 8px",color:"var(--ink-soft)"}}>${fmt(r.precio_unitario)}</td>
                  <td style={{padding:"4px 8px"}}>
                    <input type="number" value={r.utilidad_pct||0} onChange={e=>cambiarUtilidadRubro(i,Number(e.target.value))}
                      style={{...iS,width:50,textAlign:"right"}} placeholder="0"/>
                  </td>
                  <td style={{padding:"4px 8px",fontWeight:600,color:"var(--success)"}}>${fmt(pFinal)}</td>
                  <td style={{padding:"4px 8px",fontWeight:600,color:"var(--ink)"}}>${fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Guardar en BD */}
      <div style={{background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:10,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:guardarBD?10:0}}>
          <input type="checkbox" id="guardar-bd" checked={guardarBD} onChange={e=>setGuardarBD(e.target.checked)} style={{cursor:"pointer"}}/>
          <label htmlFor="guardar-bd" style={{fontSize:12,color:"var(--ink-soft)",cursor:"pointer",fontWeight:500}}>También guardar en base de datos de precios</label>
        </div>
        {guardarBD&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:8}}>
            <div>
              <label style={{fontSize:10,color:"var(--ink-soft)",display:"block",marginBottom:2}}>Proveedor</label>
              <input value={proveedor} onChange={e=>setProveedor(e.target.value)} placeholder="Nombre proveedor" style={{...iS,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:10,color:"var(--ink-soft)",display:"block",marginBottom:2}}>Cliente de referencia</label>
              <select value={clienteNombre} onChange={e=>setClienteNombre(e.target.value)} style={{...iS,width:"100%",boxSizing:"border-box"}}>
                <option value="">Sin cliente</option>
                {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,color:"var(--ink-soft)",display:"block",marginBottom:2}}>Año</label>
              <input value={fecha} onChange={e=>setFecha(e.target.value)} placeholder="2025" style={{...iS,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={onCancelar} style={{flex:1,background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:10,color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Cancelar</button>
        <button onClick={()=>onImportar(rubros,capNombre,utilidadGlobal,guardarBD,proveedor,clienteNombre,fecha)}
          style={{flex:2,background:"var(--success)",border:"none",borderRadius:8,padding:10,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          ✓ Importar {rubros.length} rubros al presupuesto
        </button>
      </div>
    </div>
  );
}
