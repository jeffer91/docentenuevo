"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, RefreshCw, ShieldCheck, TrendingUp, X, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./institutional-indicators.module.css";

type Phase = "areas" | "before" | "during" | "after";
type Summary = {
  expedients: number; teachers: number; criteria_total: number; areas: number; before: number; during: number; after: number;
  passed: number; failed: number; not_applicable: number; critical_gaps: number;
  pending_evidence: number; corrections: number; reviews_overdue: number; reviews_closed: number;
  certified: number; ready_to_certify: number; needs_attention: number;
  operational_average: number; improvement_average: number;
};

type Row = {
  expedient_id: string; teacher_name: string; career_id: string; career: string; period_id: string; period: string;
  phase: Phase; progress: number; operational_resolved: number; operational_total: number;
  operational_percent: number; passed: number; failed: number; not_applicable: number; critical_gaps: number;
  pending_evidence: number; corrections: number; reviews_closed: number; reviews_open: number; reviews_overdue: number;
  next_review: string | null; improvement_points: number | null;
  ready_to_certify: boolean; certified: boolean; classification: string;
};

type Data = { summary: Summary; rows: Row[] };

const emptySummary: Summary = {
  expedients:0, teachers:0, criteria_total:0, areas:0, before:0, during:0, after:0,
  passed:0, failed:0, not_applicable:0, critical_gaps:0, pending_evidence:0, corrections:0,
  reviews_overdue:0, reviews_closed:0, certified:0, ready_to_certify:0, needs_attention:0,
  operational_average:0, improvement_average:0,
};

function phaseLabel(value: Phase) {
  if (value === "areas") return "Áreas";
  if (value === "before") return "Antes";
  if (value === "during") return "Durante";
  return "Después";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day:"2-digit", month:"short" }).format(date);
}

function tone(value: string) {
  if (["Certificado", "Listo para cierre", "Cumple"].includes(value)) return styles.good;
  if (value === "Crítico") return styles.danger;
  if (value === "En mejora") return styles.warning;
  return styles.neutral;
}

export default function InstitutionalIndicators({ staffId, mode, onClose }: {
  staffId: string | null;
  mode: "coordinator" | "admin";
  onClose: () => void;
}) {
  const [data, setData] = useState<Data>({ summary: emptySummary, rows: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [career, setCareer] = useState("");
  const [period, setPeriod] = useState("");
  const [state, setState] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("staff_indicator_dashboard", { p_staff_id: staffId });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudieron cargar los indicadores del acompañamiento.");
      return;
    }
    setMessage("");
    setData(result as Data);
  }, [staffId]);

  useEffect(() => { void load(); }, [load]);

  const careers = useMemo(() => [...new Map(data.rows.map((row) => [row.career_id, row.career] as [string,string])).entries()], [data.rows]);
  const periods = useMemo(() => [...new Map(data.rows.map((row) => [row.period_id, row.period] as [string,string])).entries()], [data.rows]);
  const filtered = useMemo(() => data.rows.filter((row) =>
    (!career || row.career_id === career) && (!period || row.period_id === period) && (!state || row.classification === state)
  ), [data.rows, career, period, state]);
  const states = useMemo(() => [...new Set(data.rows.map((row) => row.classification))], [data.rows]);

  return <div className={styles.backdrop}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-label="Indicadores SIACD">
      <header className={styles.header}>
        <div><span>SIACD · MODELO ACTIVO</span><h2>{mode === "admin" ? "Indicadores institucionales" : "Indicadores de coordinación"}</h2><p>Áreas, Antes, Durante y Después · avance, cumplimiento, brechas, evidencias y evolución.</p></div>
        <div className={styles.headerActions}><button onClick={() => void load()}><RefreshCw size={16}/>Actualizar</button><button onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
      </header>

      {message && <div className={styles.message}>{message}</div>}
      {loading ? <div className={styles.loading}>Calculando indicadores…</div> : <>
        <div className={styles.metrics}>
          <Metric icon={BarChart3} label="Cumplimiento evaluado" value={`${data.summary.operational_average}%`} note={`${data.summary.criteria_total} criterios activos`} />
          <Metric icon={AlertTriangle} label="Requieren atención" value={String(data.summary.needs_attention)} note={`${data.summary.critical_gaps} brechas críticas`} danger={data.summary.needs_attention > 0} />
          <Metric icon={Clock3} label="Revisiones vencidas" value={String(data.summary.reviews_overdue)} note={`${data.summary.reviews_closed} cerradas`} danger={data.summary.reviews_overdue > 0} />
          <Metric icon={TrendingUp} label="Mejora promedio" value={`${data.summary.improvement_average >= 0 ? "+" : ""}${data.summary.improvement_average} pts`} note="Primera vs. última revisión" />
          <Metric icon={ShieldCheck} label="Listos para cierre" value={String(data.summary.ready_to_certify)} note={`${data.summary.certified} certificados`} />
        </div>

        <div className={styles.phaseGrid}>
          <div><strong>{data.summary.areas}</strong><span>Áreas</span></div>
          <div><strong>{data.summary.before}</strong><span>Antes</span></div>
          <div><strong>{data.summary.during}</strong><span>Durante</span></div>
          <div><strong>{data.summary.after}</strong><span>Después</span></div>
          <div><strong>{data.summary.passed}</strong><span>Cumplen</span></div>
          <div><strong>{data.summary.failed}</strong><span>Por mejorar</span></div>
          <div><strong>{data.summary.not_applicable}</strong><span>N/A</span></div>
        </div>

        <div className={styles.filters}>
          <select value={career} onChange={(event) => setCareer(event.target.value)}><option value="">Todas las carreras</option>{careers.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="">Todos los períodos</option>{periods.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select value={state} onChange={(event) => setState(event.target.value)}><option value="">Todos los estados</option>{states.map((item) => <option key={item}>{item}</option>)}</select>
          <span>{filtered.length} expediente{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Docente</th><th>Etapa</th><th>Avance / cumplimiento</th><th>Cumple / mejora</th><th>Brechas</th><th>Evidencias</th><th>Revisión</th><th>Evolución</th><th>Estado</th></tr></thead>
          <tbody>{filtered.map((row) => <tr key={row.expedient_id}>
            <td><strong>{row.teacher_name}</strong><small>{row.career} · {row.period}</small></td>
            <td><span className={styles.phase}>{phaseLabel(row.phase)}</span></td>
            <td><strong>{row.progress}% avance</strong><small>{row.operational_percent}% cumplimiento · {row.operational_resolved}/{row.operational_total}</small></td>
            <td><span className={styles.pass}><CheckCircle2 size={13}/>{row.passed}</span><span className={styles.fail}><XCircle size={13}/>{row.failed}</span>{row.not_applicable > 0 && <small>N/A {row.not_applicable}</small>}</td>
            <td><strong className={row.critical_gaps ? styles.redText : styles.greenText}>{row.critical_gaps}</strong></td>
            <td><strong>{row.pending_evidence + row.corrections}</strong><small>{row.corrections ? `${row.corrections} por corregir` : "pendientes"}</small></td>
            <td><strong>{row.reviews_overdue ? `${row.reviews_overdue} vencida${row.reviews_overdue === 1 ? "" : "s"}` : formatDate(row.next_review)}</strong><small>{row.reviews_closed} cerradas</small></td>
            <td><strong>{row.improvement_points === null ? "—" : `${row.improvement_points >= 0 ? "+" : ""}${row.improvement_points} pts`}</strong></td>
            <td><span className={`${styles.state} ${tone(row.classification)}`}>{row.classification}</span></td>
          </tr>)}</tbody>
        </table></div>
        {!filtered.length && <div className={styles.empty}>No hay expedientes con estos filtros.</div>}
      </>}
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, note, danger = false }: { icon: typeof BarChart3; label: string; value: string; note: string; danger?: boolean }) {
  return <article className={`${styles.metric} ${danger ? styles.metricDanger : ""}`}><span><Icon size={17}/>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
