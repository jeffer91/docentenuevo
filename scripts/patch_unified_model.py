from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"No se encontró bloque esperado en {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Panel general: el avance deja de depender de H1-H6 y usa el catálogo activo.
# ---------------------------------------------------------------------------
replace_once(
    "app/siacd-app-v3.tsx",
    "  progress: number;\n  status: \"En acompañamiento\" | \"Con brechas\" | \"Pendiente de aprobación\" | \"Aprobado\" | \"Certificado\";\n  currentHito: string;\n  criticalGaps: number;\n  hitosExecuted: number;",
    "  progress: number;\n  resolvedCriteria: number;\n  totalCriteria: number;\n  compliance: number;\n  status: \"En acompañamiento\" | \"Con brechas\" | \"Pendiente de aprobación\" | \"Aprobado\" | \"Certificado\";\n  currentHito: string;\n  criticalGaps: number;\n  hitosExecuted: number;",
)

replace_once(
    "app/siacd-app-v3.tsx",
    "type CoordinatorInput = {\n  id?: string;\n  name: string;\n  active: boolean;\n};",
    "type CoordinatorInput = {\n  id?: string;\n  name: string;\n  active: boolean;\n};\n\ntype IndicatorRow = {\n  expedient_id: string;\n  phase: \"areas\" | \"before\" | \"during\" | \"after\";\n  progress: number;\n  operational_resolved: number;\n  operational_total: number;\n  operational_percent: number;\n  critical_gaps: number;\n};\n\nconst phaseName: Record<IndicatorRow[\"phase\"], string> = {\n  areas: \"Áreas\",\n  before: \"Antes\",\n  during: \"Durante\",\n  after: \"Después\",\n};",
)

old_map = '''function mapExpedient(row: Record<string, unknown>): Teacher {
  const teacher = relation(row.teachers);
  const career = relation(row.careers);
  const period = relation(row.academic_periods);
  const hitos = Array.isArray(row.hito_schedules) ? (row.hito_schedules as Record<string, unknown>[]) : [];
  const executed = hitos.filter((item) => Boolean(item.executed_on));
  const ranges = Array.isArray(row.expedient_schedules)
    ? [...(row.expedient_schedules as Record<string, unknown>[])].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    : [];
  const status = mapStatus(String(row.status ?? "draft"));
  const progress = status === "Certificado" ? 100 : Math.round((executed.length / 6) * 100);
  const nextHito = Math.min(6, executed.length + 1);

  return {
    id: String(row.id),
    teacherId: String(teacher?.id ?? ""),
    nationalId: String(teacher?.national_id ?? ""),
    coordinatorId: String(row.coordinator_staff_id ?? ""),
    name: String(teacher?.full_name ?? "Sin nombre"),
    email: String(teacher?.institutional_email ?? ""),
    careerId: String(career?.id ?? ""),
    career: relationName(row.careers),
    subject: String(row.subject_names ?? "Sin asignatura"),
    modality: String(row.modality ?? "Sin modalidad"),
    period: String(period?.name ?? "Sin período"),
    entryDate: String(teacher?.started_institution_on ?? ""),
    activitiesStartDate: String(row.activities_start_on ?? ""),
    plannedCloseDate: String(row.planned_close_on ?? ""),
    scheduleRanges: ranges.map((item) => `${String(item.start_time ?? "").slice(0, 5)} a ${String(item.end_time ?? "").slice(0, 5)}`),
    progress,
    status,
    currentHito: status === "Certificado"
      ? "Proceso finalizado"
      : executed.length === 6
        ? "H6 · Cierre completado"
        : `H${nextHito} · pendiente`,
    criticalGaps: Number(row.critical_gaps ?? 0),
    hitosExecuted: executed.length,
  };
}'''
new_map = '''function mapExpedient(row: Record<string, unknown>, metric?: IndicatorRow): Teacher {
  const teacher = relation(row.teachers);
  const career = relation(row.careers);
  const period = relation(row.academic_periods);
  const hitos = Array.isArray(row.hito_schedules) ? (row.hito_schedules as Record<string, unknown>[]) : [];
  const executed = hitos.filter((item) => Boolean(item.executed_on));
  const ranges = Array.isArray(row.expedient_schedules)
    ? [...(row.expedient_schedules as Record<string, unknown>[])].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    : [];
  const status = mapStatus(String(row.status ?? "draft"));
  const resolvedCriteria = Number(metric?.operational_resolved ?? 0);
  const totalCriteria = Number(metric?.operational_total ?? 0);
  const progress = status === "Certificado"
    ? 100
    : Number(metric?.progress ?? (executed.length ? Math.round((executed.length / 6) * 100) : 0));
  const compliance = Number(metric?.operational_percent ?? 0);
  const currentStage = status === "Certificado"
    ? "Proceso finalizado"
    : metric
      ? `${phaseName[metric.phase]} · ${resolvedCriteria}/${totalCriteria}`
      : "Áreas · pendiente";

  return {
    id: String(row.id),
    teacherId: String(teacher?.id ?? ""),
    nationalId: String(teacher?.national_id ?? ""),
    coordinatorId: String(row.coordinator_staff_id ?? ""),
    name: String(teacher?.full_name ?? "Sin nombre"),
    email: String(teacher?.institutional_email ?? ""),
    careerId: String(career?.id ?? ""),
    career: relationName(row.careers),
    subject: String(row.subject_names ?? "Sin asignatura"),
    modality: String(row.modality ?? "Sin modalidad"),
    period: String(period?.name ?? "Sin período"),
    entryDate: String(teacher?.started_institution_on ?? ""),
    activitiesStartDate: String(row.activities_start_on ?? ""),
    plannedCloseDate: String(row.planned_close_on ?? ""),
    scheduleRanges: ranges.map((item) => `${String(item.start_time ?? "").slice(0, 5)} a ${String(item.end_time ?? "").slice(0, 5)}`),
    progress,
    resolvedCriteria,
    totalCriteria,
    compliance,
    status,
    currentHito: currentStage,
    criticalGaps: Number(metric?.critical_gaps ?? row.critical_gaps ?? 0),
    hitosExecuted: executed.length,
  };
}'''
replace_once("app/siacd-app-v3.tsx", old_map, new_map)

replace_once(
    "app/siacd-app-v3.tsx",
    '  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);\n  const [teachers, setTeachers] = useState<Teacher[]>([]);',
    '  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);\n  const [activeCriteriaCount, setActiveCriteriaCount] = useState(0);\n  const [teachers, setTeachers] = useState<Teacher[]>([]);',
)

replace_once(
    "app/siacd-app-v3.tsx",
    '''    const [staffResult, careerResult, periodResult] = await Promise.all([
      supabase.from("siacd_staff").select("id, full_name, role, active, siacd_staff_careers(career_id)").order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
    ]);''',
    '''    const [staffResult, careerResult, periodResult, criterionResult] = await Promise.all([
      supabase.from("siacd_staff").select("id, full_name, role, active, siacd_staff_careers(career_id)").order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
      supabase.from("competency_definitions").select("id", { count: "exact", head: true }).eq("active", true),
    ]);''',
)
replace_once(
    "app/siacd-app-v3.tsx",
    '''    if (careerResult.error || periodResult.error) {
      setSchemaIssue(`No se pudieron cargar los catálogos: ${careerResult.error?.message ?? periodResult.error?.message}`);
      setLoading(false);
      return;
    }

    setStaff(((staffResult.data ?? []) as Record<string, unknown>[]).map(mapStaff));
    setCareers((careerResult.data ?? []) as CatalogOption[]);
    setPeriods((periodResult.data ?? []) as AcademicPeriod[]);''',
    '''    if (careerResult.error || periodResult.error || criterionResult.error) {
      setSchemaIssue(`No se pudieron cargar los catálogos: ${careerResult.error?.message ?? periodResult.error?.message ?? criterionResult.error?.message}`);
      setLoading(false);
      return;
    }

    setStaff(((staffResult.data ?? []) as Record<string, unknown>[]).map(mapStaff));
    setCareers((careerResult.data ?? []) as CatalogOption[]);
    setPeriods((periodResult.data ?? []) as AcademicPeriod[]);
    setActiveCriteriaCount(criterionResult.count ?? 0);''',
)

replace_once(
    "app/siacd-app-v3.tsx",
    '''    setTeachers(((data ?? []) as Record<string, unknown>[]).map(mapExpedient));
  }, [accessMode]);''',
    '''    const { data: indicatorData, error: indicatorError } = await supabase.rpc("staff_indicator_dashboard", {
      p_staff_id: accessMode === "coordinator" ? coordinatorId ?? null : null,
    });
    if (indicatorError) {
      setToast(`No se pudieron sincronizar los indicadores: ${indicatorError.message}`);
    }
    const indicatorRows = (!indicatorError && indicatorData && typeof indicatorData === "object"
      ? ((indicatorData as { rows?: IndicatorRow[] }).rows ?? [])
      : []) as IndicatorRow[];
    const indicatorMap = new Map(indicatorRows.map((item) => [item.expedient_id, item]));
    setTeachers(((data ?? []) as Record<string, unknown>[]).map((row) => mapExpedient(row, indicatorMap.get(String(row.id)))));
  }, [accessMode]);''',
)

replace_once(
    "app/siacd-app-v3.tsx",
    '{view === "settings" && accessMode === "admin" && <CatalogSummary careers={careers} periods={periods} staff={staff} />}',
    '{view === "settings" && accessMode === "admin" && <CatalogSummary careers={careers} periods={periods} staff={staff} criteriaCount={activeCriteriaCount} />}',
)

# Terminología visible del modelo nuevo.
for old, new in [
    ('schedule: ["Cronograma institucional", "Estado general de H1–H6 por docente"]', 'schedule: ["Cronograma institucional", "Estado general de Áreas, Antes, Durante y Después"]'),
    ('Abra un docente para trabajar ficha, cronograma, H1–H6, bitácora y plan de mejora.', 'Abra un docente para trabajar Áreas, Antes, Durante, Después, evidencias, informes e historial.'),
    ('note="Hitos ejecutados"', 'note="Criterios activos resueltos"'),
    ('<th>Hito</th>', '<th>Etapa</th>'),
    ('note="Promedio de H1–H6"', 'note="Promedio de criterios resueltos"'),
    ('`No se pudo crear H1–H6: ${hitosError.message}`', '`No se pudo crear la estructura técnica del expediente: ${hitosError.message}`'),
]:
    replace_once("app/siacd-app-v3.tsx", old, new)

old_schedule = '''function ScheduleOverview({ teachers, onOpen }: { teachers: Teacher[]; onOpen: (teacher: Teacher) => void }) {
  return <section className="section-card"><div className="panel-head"><div><h3>Avance de H1–H6</h3><p>La programación detallada se edita dentro de cada expediente.</p></div></div>{teachers.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Cédula</th><th>Docente</th><th>Carrera</th><th>Hitos ejecutados</th><th>Hito actual</th><th>Avance</th><th></th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td className="teacher-id-cell">{teacher.nationalId || "Pendiente"}</td><td><strong>{teacher.name}</strong></td><td>{teacher.career}</td><td>{teacher.hitosExecuted}/6</td><td>{teacher.currentHito}</td><td>{teacher.progress}%</td><td><button className="secondary-button" onClick={() => onOpen(teacher)}>Programar</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><p>No existen expedientes.</p></div>}</section>;
}'''
new_schedule = '''function ScheduleOverview({ teachers, onOpen }: { teachers: Teacher[]; onOpen: (teacher: Teacher) => void }) {
  return <section className="section-card"><div className="panel-head"><div><h3>Avance por etapa</h3><p>Áreas, Antes, Durante y Después se actualizan con los criterios activos del expediente.</p></div></div>{teachers.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Cédula</th><th>Docente</th><th>Carrera</th><th>Etapa actual</th><th>Criterios resueltos</th><th>Avance</th><th></th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td className="teacher-id-cell">{teacher.nationalId || "Pendiente"}</td><td><strong>{teacher.name}</strong></td><td>{teacher.career}</td><td>{teacher.currentHito}</td><td>{teacher.resolvedCriteria}/{teacher.totalCriteria}</td><td>{teacher.progress}%</td><td><button className="secondary-button" onClick={() => onOpen(teacher)}>Abrir</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><p>No existen expedientes.</p></div>}</section>;
}'''
replace_once("app/siacd-app-v3.tsx", old_schedule, new_schedule)

old_catalog = '''function CatalogSummary({ careers, periods, staff }: { careers: CatalogOption[]; periods: AcademicPeriod[]; staff: StaffMember[] }) {
  return <div className="metric-grid"><Metric icon={Settings} label="Carreras activas" value={String(careers.length)} note="Catálogo institucional" /><Metric icon={CalendarDays} label="Períodos activos" value={String(periods.length)} note={periods[0]?.name ?? "Sin períodos"} tone="gold" /><Metric icon={UserCog} label="Coordinadores" value={String(staff.filter((item) => item.role === "coordinator" && item.active).length)} note="Activos" tone="blue" /><Metric icon={FolderOpen} label="Criterios operativos" value="75" note="H1–H6" tone="red" /></div>;
}'''
new_catalog = '''function CatalogSummary({ careers, periods, staff, criteriaCount }: { careers: CatalogOption[]; periods: AcademicPeriod[]; staff: StaffMember[]; criteriaCount: number }) {
  return <div className="metric-grid"><Metric icon={Settings} label="Carreras activas" value={String(careers.length)} note="Catálogo institucional" /><Metric icon={CalendarDays} label="Períodos activos" value={String(periods.length)} note={periods[0]?.name ?? "Sin períodos"} tone="gold" /><Metric icon={UserCog} label="Coordinadores" value={String(staff.filter((item) => item.role === "coordinator" && item.active).length)} note="Activos" tone="blue" /><Metric icon={FolderOpen} label="Criterios activos" value={String(criteriaCount)} note="Áreas · Antes · Durante · Después" tone="red" /></div>;
}'''
replace_once("app/siacd-app-v3.tsx", old_catalog, new_catalog)

# ---------------------------------------------------------------------------
# Indicadores institucionales: cuatro etapas, sin 60/15/25 ni 75/17/21.
# ---------------------------------------------------------------------------
(ROOT / "app/institutional-indicators.tsx").write_text(r'''"use client";

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
''', encoding="utf-8")

# ---------------------------------------------------------------------------
# Indicadores del docente: misma fuente, cuatro etapas, sin resultado 60/15/25.
# ---------------------------------------------------------------------------
(ROOT / "app/teacher-indicators.tsx").write_text(r'''"use client";

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
''', encoding="utf-8")

# ---------------------------------------------------------------------------
# Expediente V6: trazabilidad del evaluador y BORRADOR por etapa incompleta.
# ---------------------------------------------------------------------------
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''  async function saveCriterion(def: CompetencyDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;''',
    '''  async function resolveEvaluatorStaffId() {
    if (accessMode === "coordinator") return teacher.coordinatorId || null;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
    return data?.id ? String(data.id) : null;
  }

  async function saveCriterion(def: CompetencyDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;''',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''    setSavingId(def.id);
    const resolved = current.not_applicable || current.score !== null;
    const { error } = await supabase.from("competency_scores").upsert({''',
    '''    setSavingId(def.id);
    const resolved = current.not_applicable || current.score !== null;
    const evaluatorStaffId = await resolveEvaluatorStaffId();
    const { error } = await supabase.from("competency_scores").upsert({''',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''      coordinator_observation: current.coordinator_observation || null,
      evaluated_by: null,
      evaluated_at: resolved ? new Date().toISOString() : null,''',
    '''      coordinator_observation: current.coordinator_observation || null,
      evaluated_by: null,
      evaluated_by_staff_id: evaluatorStaffId,
      evaluated_at: resolved ? new Date().toISOString() : null,''',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''      const allResolved = (Object.keys(phaseSummaries) as PhaseKey[]).every((phase) => phaseSummaries[phase].resolved === phaseSummaries[phase].total && phaseSummaries[phase].total > 0);
      const draft = isConsolidated && !allResolved;
      const version = documents.filter((item) => item.document_type === reportKey && item.status !== "void").length + 1;
      const code = verificationCode();''',
    '''      const allResolved = (Object.keys(phaseSummaries) as PhaseKey[]).every((phase) => phaseSummaries[phase].resolved === phaseSummaries[phase].total && phaseSummaries[phase].total > 0);
      const phaseResolved = definition.phase
        ? phaseSummaries[definition.phase].total > 0 && phaseSummaries[definition.phase].resolved === phaseSummaries[definition.phase].total
        : allResolved;
      const draft = !phaseResolved;
      const version = documents.filter((item) => item.document_type === reportKey && item.status !== "void").length + 1;
      const code = verificationCode();
      const evaluatorStaffId = await resolveEvaluatorStaffId();''',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '      metaLine("Coordinador", coordinatorName || "—");',
    '      metaLine("Responsable", accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "—");',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '          generated_by_staff_id: teacher.coordinatorId || null,',
    '          generated_by_staff_id: evaluatorStaffId,',
)
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''        if (draft) {
          sectionTitle("Estado del documento");
          text("BORRADOR: existen etapas con criterios pendientes. El informe consolidado puede consultarse, pero no debe considerarse cierre definitivo hasta completar Áreas, Antes, Durante y Después.", 9, true);
        }''',
    '''        if (draft) {
          sectionTitle("Estado del documento");
          text("BORRADOR: existen etapas con criterios pendientes. El informe consolidado puede consultarse, pero no debe considerarse cierre definitivo hasta completar Áreas, Antes, Durante y Después.", 9, true);
        }''',
)
# Para informes de etapa, añade aviso de borrador antes del pie.
replace_once(
    "app/expedient-workspace-v6.tsx",
    '''      ensure(12);
      y += 4;
      pdf.setDrawColor(180, 188, 196);''',
    '''      if (draft && definition.phase) {
        sectionTitle("Estado del documento");
        text(`BORRADOR: ${phaseLabels[definition.phase].title} todavía tiene criterios pendientes. Genere nuevamente el informe cuando la etapa esté completa para obtener la versión final.`, 9, true);
      }

      ensure(12);
      y += 4;
      pdf.setDrawColor(180, 188, 196);''',
)

# Código legado no activo: elimina el límite fijo de 75 para evitar inconsistencias si se reutiliza.
replace_once(
    "app/expedient-finalization.tsx",
    '  const resolvedOperationalEvaluated = Math.min(75, props.operationalEvaluated + notApplicableCount);',
    '  const resolvedOperationalEvaluated = props.operationalEvaluated + notApplicableCount;',
)

# Documentación del modelo activo.
readme = ROOT / "README.md"
text = readme.read_text(encoding="utf-8")
marker = "## Modelo activo de acompañamiento"
if marker not in text:
    text += '''\n\n## Modelo activo de acompañamiento\n\nLa fuente operativa vigente es el catálogo activo organizado en **Áreas → Antes → Durante → Después**. Los conteos son dinámicos y actualmente corresponden a 129 criterios activos. Las tablas y componentes de modelos anteriores se conservan únicamente para trazabilidad histórica y no participan en el cálculo institucional activo.\n\nLos cinco informes oficiales son: **Informe de Áreas, Informe Antes, Informe Durante, Informe Después e Informe Consolidado**. Cada informe se genera como **BORRADOR** mientras su etapa correspondiente tenga criterios pendientes; el Consolidado es borrador mientras exista cualquier etapa incompleta.\n'''
    readme.write_text(text, encoding="utf-8")

print("Parche aplicado correctamente")
