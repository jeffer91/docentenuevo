"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, CheckCircle2, RefreshCw, TrendingUp, X, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-indicators.module.css";

type Row = {
  expedient_id:string; career:string; period:string; phase:"before"|"during"|"after";
  operational_resolved:number; operational_total:number; operational_percent:number;
  passed:number; failed:number; not_applicable:number; critical_gaps:number;
  pending_evidence:number; corrections:number; reviews_closed:number; next_review:string|null;
  improvement_points:number|null; final_percent:number|null; ready_to_certify:boolean; certified:boolean;
  classification:string;
};

type Data = { rows: Row[] };

function phaseLabel(value: Row["phase"]) { return value === "before" ? "Antes" : value === "during" ? "Durante" : "Después"; }
function formatDate(value:string|null) {
  if (!value) return "Sin fecha programada";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day:"2-digit", month:"long", year:"numeric" }).format(date);
}

export default function TeacherIndicators({ token, onClose }: { token:string; onClose:()=>void }) {
  const [data,setData] = useState<Data>({ rows:[] });
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState("");

  const load = useCallback(async()=>{
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token) return;
    setLoading(true);
    const { data:result, error } = await supabase.rpc("teacher_indicator_summary", { p_token:token });
    setLoading(false);
    if (error || !result) { setMessage("No se pudieron cargar tus indicadores."); return; }
    setData(result as Data);
  },[token]);

  useEffect(()=>{ void load(); },[load]);

  return <div className={styles.backdrop}><section className={styles.panel} role="dialog" aria-modal="true">
    <header className={styles.header}><div><span>MI ACOMPAÑAMIENTO</span><h2>Mis indicadores</h2><p>Resultados publicados, pendientes y evolución.</p></div><div><button onClick={()=>void load()}><RefreshCw size={16}/></button><button onClick={onClose}><X size={18}/></button></div></header>
    {message && <div className={styles.message}>{message}</div>}
    {loading ? <div className={styles.loading}>Cargando indicadores…</div> : data.rows.length ? <div className={styles.body}>{data.rows.map(row=><article key={row.expedient_id} className={styles.card}>
      <div className={styles.cardHead}><div><h3>{row.career}</h3><p>{row.period}</p></div><span>{row.classification}</span></div>
      <div className={styles.big}><strong>{row.operational_percent}%</strong><span>Resultado operativo</span></div>
      <div className={styles.grid}>
        <div><CheckCircle2 size={16}/><strong>{row.passed}</strong><span>Pasan</span></div>
        <div><XCircle size={16}/><strong>{row.failed}</strong><span>No pasan</span></div>
        <div><strong>{row.not_applicable}</strong><span>N/A</span></div>
        <div><strong>{row.critical_gaps}</strong><span>Brechas críticas</span></div>
      </div>
      <div className={styles.details}><span>Momento <b>{phaseLabel(row.phase)}</b></span><span>Criterios resueltos <b>{row.operational_resolved}/{row.operational_total}</b></span><span>Evidencias pendientes <b>{row.pending_evidence + row.corrections}</b></span><span>Próxima revisión <b>{formatDate(row.next_review)}</b></span><span>Revisiones cerradas <b>{row.reviews_closed}</b></span><span>Evolución <b>{row.improvement_points === null ? "—" : `${row.improvement_points >= 0 ? "+" : ""}${row.improvement_points} pts`}</b></span></div>
      {row.final_percent !== null && <div className={styles.final}><BarChart3 size={17}/><span>Resultado integrado</span><strong>{row.final_percent}%</strong></div>}
      {row.improvement_points !== null && <div className={styles.trend}><TrendingUp size={15}/>Cambio entre primera y última revisión: <b>{row.improvement_points >= 0 ? "+" : ""}{row.improvement_points} puntos</b></div>}
    </article>)}</div> : <div className={styles.loading}>Todavía no hay indicadores disponibles.</div>}
  </section></div>;
}
