"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, TrendingUp, X, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-indicators.module.css";

type Phase = "areas" | "before" | "during" | "after";
type Row = {
  expedient_id:string; career:string; period:string; phase:Phase; progress:number;
  operational_resolved:number; operational_total:number; operational_percent:number;
  passed:number; failed:number; not_applicable:number; critical_gaps:number;
  pending_evidence:number; corrections:number; reviews_closed:number; next_review:string|null;
  improvement_points:number|null; ready_to_certify:boolean; certified:boolean; classification:string;
};

type Data = { rows: Row[] };

function phaseLabel(value: Phase) {
  if (value === "areas") return "Áreas";
  if (value === "before") return "Antes";
  if (value === "during") return "Durante";
  return "Después";
}
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
    <header className={styles.header}><div><span>MI ACOMPAÑAMIENTO</span><h2>Mis indicadores</h2><p>Áreas, Antes, Durante y Después · avance, resultados y pendientes.</p></div><div><button onClick={()=>void load()}><RefreshCw size={16}/></button><button onClick={onClose}><X size={18}/></button></div></header>
    {message && <div className={styles.message}>{message}</div>}
    {loading ? <div className={styles.loading}>Cargando indicadores…</div> : data.rows.length ? <div className={styles.body}>{data.rows.map(row=><article key={row.expedient_id} className={styles.card}>
      <div className={styles.cardHead}><div><h3>{row.career}</h3><p>{row.period}</p></div><span>{row.classification}</span></div>
      <div className={styles.big}><strong>{row.progress}%</strong><span>Avance del proceso</span></div>
      <div className={styles.grid}>
        <div><CheckCircle2 size={16}/><strong>{row.passed}</strong><span>Cumplen</span></div>
        <div><XCircle size={16}/><strong>{row.failed}</strong><span>Por mejorar</span></div>
        <div><strong>{row.not_applicable}</strong><span>N/A</span></div>
        <div><strong>{row.critical_gaps}</strong><span>Brechas críticas</span></div>
      </div>
      <div className={styles.details}><span>Etapa <b>{phaseLabel(row.phase)}</b></span><span>Criterios resueltos <b>{row.operational_resolved}/{row.operational_total}</b></span><span>Cumplimiento evaluado <b>{row.operational_percent}%</b></span><span>Evidencias pendientes <b>{row.pending_evidence + row.corrections}</b></span><span>Próxima revisión <b>{formatDate(row.next_review)}</b></span><span>Revisiones cerradas <b>{row.reviews_closed}</b></span></div>
      {row.improvement_points !== null && <div className={styles.trend}><TrendingUp size={15}/>Cambio entre primera y última revisión: <b>{row.improvement_points >= 0 ? "+" : ""}{row.improvement_points} puntos</b></div>}
    </article>)}</div> : <div className={styles.loading}>Todavía no hay indicadores disponibles.</div>}
  </section></div>;
}
