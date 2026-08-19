"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, Plus, RefreshCw, RotateCcw, Save, X, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./review-cycle-workspace.module.css";

type CycleType = "institutional" | "corrective" | "extraordinary";
type CycleStatus = "planned" | "open" | "closed" | "cancelled";

type Criterion = {
  id: string;
  hito_id: string;
  process: string;
  label: string;
  criticality: "Crítica" | "Importante" | "Deseable";
  expected_evidence: string | null;
  relative_weight: number;
  current_score: number | null;
  current_not_applicable: boolean;
  current_observation: string | null;
};

type ReviewResult = {
  criterion_id: string;
  score: number | null;
  not_applicable: boolean;
  passed: boolean | null;
  observation: string | null;
  evaluated_at: string | null;
  label: string;
  criticality: string;
  process: string;
};

type ReviewCycle = {
  id: string;
  sequence: number;
  hito_id: string | null;
  cycle_type: CycleType;
  title: string;
  scheduled_on: string | null;
  opened_at: string | null;
  closed_at: string | null;
  status: CycleStatus;
  created_at: string;
  evaluated: number;
  passed: number;
  failed: number;
  not_applicable: number;
  percent: number | null;
  results: ReviewResult[];
};

type WorkspaceData = {
  criteria: Criterion[];
  cycles: ReviewCycle[];
  failed_current: number;
  not_applicable_current: number;
  open_cycles: number;
};

type DraftResult = {
  score: string;
  notApplicable: boolean;
  observation: string;
};

const hitoLabels: Record<string, string> = {
  H1: "H1 · Inducción",
  H2: "H2 · Preparación",
  H3: "H3 · Inicio",
  H4: "H4 · Seguimiento 1",
  H5: "H5 · Seguimiento 2",
  H6: "H6 · Cierre",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function typeLabel(value: CycleType) {
  if (value === "corrective") return "Correctiva";
  if (value === "extraordinary") return "Extraordinaria";
  return "Institucional";
}

function statusLabel(value: CycleStatus) {
  if (value === "planned") return "Programada";
  if (value === "open") return "En revisión";
  if (value === "closed") return "Cerrada";
  return "Cancelada";
}

function scoreLabel(score: number | null, na: boolean) {
  if (na) return "N/A";
  if (score === null) return "Pendiente";
  if (score >= 3) return "PASA";
  return "NO PASA";
}

export default function ReviewCycleWorkspace({
  teacher,
  accessMode,
  coordinatorName,
  onClose,
  onChanged,
}: {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [staffId, setStaffId] = useState(teacher.coordinatorId);
  const [data, setData] = useState<WorkspaceData>({ criteria: [], cycles: [], failed_current: 0, not_applicable_current: 0, open_cycles: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [hitoId, setHitoId] = useState("H1");
  const [cycleType, setCycleType] = useState<CycleType>("institutional");
  const [scheduledOn, setScheduledOn] = useState("");
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, DraftResult>>>({});
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});

  const criteriaForHito = useMemo(() => data.criteria.filter((item) => item.hito_id === hitoId), [data.criteria, hitoId]);

  const defaultCriteria = useCallback((nextHito: string, nextType: CycleType, explicit?: string[]) => {
    if (explicit) return explicit;
    const rows = data.criteria.filter((item) => item.hito_id === nextHito);
    if (nextType === "institutional") return rows.map((item) => item.id);
    return rows.filter((item) => !item.current_not_applicable && item.current_score !== null && item.current_score < 3).map((item) => item.id);
  }, [data.criteria]);

  const load = useCallback(async (resolvedStaffId?: string) => {
    const activeStaffId = resolvedStaffId || staffId;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !activeStaffId) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("staff_review_workspace", {
      p_expedient_id: teacher.id,
      p_staff_id: activeStaffId,
    });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudo cargar el centro de revisiones.");
      return;
    }
    const next = result as WorkspaceData;
    setData(next);
    setDateDrafts(Object.fromEntries(next.cycles.map((cycle) => [cycle.id, cycle.scheduled_on ?? ""])));
    setDrafts(Object.fromEntries(next.cycles.map((cycle) => [cycle.id, Object.fromEntries(cycle.results.map((item) => [item.criterion_id, {
      score: item.score === null ? "" : String(item.score),
      notApplicable: item.not_applicable,
      observation: item.observation ?? "",
    }]))])));
  }, [staffId, teacher.id]);

  useEffect(() => {
    async function resolveStaff() {
      if (accessMode !== "admin") {
        await load(teacher.coordinatorId);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: admin } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
      const resolved = admin?.id ? String(admin.id) : teacher.coordinatorId;
      setStaffId(resolved);
      await load(resolved);
    }
    void resolveStaff();
  }, [accessMode, load, teacher.coordinatorId]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3800);
    return () => window.clearTimeout(timer);
  }, [message]);

  function openCreate(nextHito = "H1", nextType: CycleType = "institutional", explicit?: string[]) {
    setHitoId(nextHito);
    setCycleType(nextType);
    setScheduledOn("");
    setTitle("");
    setSelectedIds(defaultCriteria(nextHito, nextType, explicit));
    setShowCreate(true);
  }

  function changeHito(value: string) {
    setHitoId(value);
    setSelectedIds(defaultCriteria(value, cycleType));
  }

  function changeType(value: CycleType) {
    setCycleType(value);
    setSelectedIds(defaultCriteria(hitoId, value));
  }

  function toggleCriterion(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    if (!scheduledOn) return setMessage("Seleccione la fecha de la revisión.");
    if (!selectedIds.length) return setMessage("Seleccione al menos un criterio.");
    setBusy("create");
    const { error } = await supabase.rpc("staff_create_review_cycle", {
      p_expedient_id: teacher.id,
      p_staff_id: staffId,
      p_hito_id: hitoId,
      p_scheduled_on: scheduledOn,
      p_cycle_type: cycleType,
      p_title: title.trim() || null,
      p_criterion_ids: selectedIds,
    });
    setBusy("");
    if (error) return setMessage(`No se pudo programar la revisión: ${error.message}`);
    setShowCreate(false);
    setMessage("Revisión programada.");
    await load();
  }

  async function openCycle(cycle: ReviewCycle) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    setBusy(cycle.id);
    const { error } = await supabase.rpc("staff_open_review_cycle", { p_cycle_id: cycle.id, p_staff_id: staffId });
    setBusy("");
    if (error) return setMessage(error.message);
    setMessage("Revisión abierta.");
    await load();
  }

  async function saveDate(cycle: ReviewCycle) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    const value = dateDrafts[cycle.id] ?? "";
    if (!value) return setMessage("Seleccione una fecha.");
    setBusy(`date-${cycle.id}`);
    const { error } = await supabase.rpc("staff_update_review_cycle_date", {
      p_cycle_id: cycle.id,
      p_staff_id: staffId,
      p_scheduled_on: value,
    });
    setBusy("");
    if (error) return setMessage(error.message);
    setMessage("Fecha actualizada.");
    await load();
  }

  function patchResult(cycleId: string, criterionId: string, patch: Partial<DraftResult>) {
    setDrafts((current) => ({
      ...current,
      [cycleId]: {
        ...(current[cycleId] ?? {}),
        [criterionId]: {
          score: "",
          notApplicable: false,
          observation: "",
          ...(current[cycleId]?.[criterionId] ?? {}),
          ...patch,
        },
      },
    }));
  }

  async function persistResults(cycle: ReviewCycle) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return false;
    const cycleDrafts = drafts[cycle.id] ?? {};
    const payload = cycle.results
      .map((item) => ({ criterion_id: item.criterion_id, ...(cycleDrafts[item.criterion_id] ?? { score: "", notApplicable: false, observation: "" }) }))
      .filter((item) => item.notApplicable || item.score !== "")
      .map((item) => ({
        criterion_id: item.criterion_id,
        score: item.notApplicable ? null : Number(item.score),
        not_applicable: item.notApplicable,
        observation: item.observation,
      }));
    if (!payload.length) {
      setMessage("Todavía no hay puntajes para guardar.");
      return false;
    }
    setBusy(`save-${cycle.id}`);
    const { error } = await supabase.rpc("staff_save_review_results", {
      p_cycle_id: cycle.id,
      p_staff_id: staffId,
      p_results: payload,
    });
    setBusy("");
    if (error) {
      setMessage(`No se pudieron guardar los puntajes: ${error.message}`);
      return false;
    }
    return true;
  }

  async function saveResults(cycle: ReviewCycle) {
    const ok = await persistResults(cycle);
    if (!ok) return;
    setMessage("Avance de la revisión guardado. El docente todavía no ve estos resultados.");
    await load();
  }

  async function closeCycle(cycle: ReviewCycle) {
    const cycleDrafts = drafts[cycle.id] ?? {};
    const incomplete = cycle.results.some((item) => {
      const draft = cycleDrafts[item.criterion_id] ?? { score: "", notApplicable: false };
      return !draft.notApplicable && draft.score === "";
    });
    if (incomplete) return setMessage("Para cerrar, todos los criterios deben tener puntaje o N/A.");
    const saved = await persistResults(cycle);
    if (!saved) return;
    if (!window.confirm("¿Cerrar esta revisión? Al cerrarla, el docente podrá ver los resultados.")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    setBusy(`close-${cycle.id}`);
    const { data: result, error } = await supabase.rpc("staff_close_review_cycle", { p_cycle_id: cycle.id, p_staff_id: staffId });
    setBusy("");
    if (error) return setMessage(`No se pudo cerrar: ${error.message}`);
    const summary = result as { percent?: number; passed?: number; failed?: number } | null;
    setMessage(`Revisión cerrada${summary?.percent === undefined ? "" : ` · ${summary.percent}% · ${summary.passed ?? 0} pasan · ${summary.failed ?? 0} no pasan`}.`);
    await load();
    await onChanged();
  }

  async function cancelCycle(cycle: ReviewCycle) {
    if (!window.confirm("¿Cancelar esta revisión? El historial quedará registrado.")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    setBusy(`cancel-${cycle.id}`);
    const { error } = await supabase.rpc("staff_cancel_review_cycle", { p_cycle_id: cycle.id, p_staff_id: staffId });
    setBusy("");
    if (error) return setMessage(error.message);
    setMessage("Revisión cancelada.");
    await load();
  }

  function repeatFailed(cycle: ReviewCycle) {
    if (!cycle.hito_id) return;
    const failed = cycle.results.filter((item) => item.passed === false).map((item) => item.criterion_id);
    if (!failed.length) return setMessage("Esta revisión no tiene criterios pendientes por repetir.");
    openCreate(cycle.hito_id, "corrective", failed);
  }

  return <div className={styles.backdrop}>
    <section className={styles.workspace} role="dialog" aria-modal="true" aria-label="Revisiones del acompañamiento">
      <header className={styles.header}>
        <div><span>CADENCIA DE ACOMPAÑAMIENTO</span><h2>Revisiones · {teacher.name}</h2><p>{teacher.career} · {teacher.subject} · {coordinatorName}</p></div>
        <button className={styles.close} onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.body}>
        <section className={styles.metrics}>
          <article><ClipboardCheck/><span>Revisiones</span><strong>{data.cycles.filter((item) => item.status !== "cancelled").length}</strong></article>
          <article><CalendarDays/><span>Programadas / abiertas</span><strong>{data.open_cycles}</strong></article>
          <article className={data.failed_current ? styles.warnMetric : ""}><XCircle/><span>No pasan actualmente</span><strong>{data.failed_current}</strong></article>
          <article><CheckCircle2/><span>N/A actuales</span><strong>{data.not_applicable_current}</strong></article>
        </section>

        <section className={styles.legend}>
          <strong>Escala:</strong><span>4 · Pasa destacado</span><span>3 · Pasa</span><span>2 · No pasa / parcial</span><span>1 · No pasa</span><span>0 · No evidenciado</span><span>N/A · No computa</span>
        </section>

        <div className={styles.toolbar}>
          <div><h3>Historial de revisiones</h3><p>Las revisiones cerradas no se sobrescriben.</p></div>
          <button className={styles.primary} onClick={() => openCreate()}><Plus size={15}/>Nueva revisión</button>
        </div>

        {showCreate && <form className={styles.createCard} onSubmit={createCycle}>
          <div className={styles.createHead}><div><h3>Programar revisión</h3><p>La fecha la define coordinación. Puede elegir exactamente qué criterios revisar.</p></div><button type="button" className={styles.iconButton} onClick={() => setShowCreate(false)}><X size={16}/></button></div>
          <div className={styles.formGrid}>
            <label>Hito<select value={hitoId} onChange={(event) => changeHito(event.target.value)}>{Object.entries(hitoLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Tipo<select value={cycleType} onChange={(event) => changeType(event.target.value as CycleType)}><option value="institutional">Institucional</option><option value="corrective">Correctiva</option><option value="extraordinary">Extraordinaria</option></select></label>
            <label>Fecha<input type="date" min={today()} value={scheduledOn} onChange={(event) => setScheduledOn(event.target.value)} required/></label>
            <label>Título opcional<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="El sistema puede generarlo"/></label>
          </div>
          <div className={styles.criteriaPicker}>
            <div><strong>Criterios de {hitoId}</strong><span>{selectedIds.length}/{criteriaForHito.length} seleccionados</span></div>
            <div className={styles.criteriaGrid}>{criteriaForHito.map((criterion) => {
              const failing = !criterion.current_not_applicable && criterion.current_score !== null && criterion.current_score < 3;
              return <label key={criterion.id} className={`${styles.criteriaChoice} ${selectedIds.includes(criterion.id) ? styles.selected : ""}`}><input type="checkbox" checked={selectedIds.includes(criterion.id)} onChange={() => toggleCriterion(criterion.id)}/><span><b>{criterion.id}</b>{criterion.label}<small>{criterion.criticality}{failing ? " · No pasó la última valoración" : ""}</small></span></label>;
            })}</div>
          </div>
          <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowCreate(false)}>Cancelar</button><button className={styles.primary} disabled={busy === "create"}>{busy === "create" ? "Programando…" : "Programar revisión"}</button></div>
        </form>}

        {loading ? <div className={styles.empty}>Cargando revisiones…</div> : data.cycles.length ? <div className={styles.cycleList}>{data.cycles.map((cycle) => {
          const cycleDrafts = drafts[cycle.id] ?? {};
          return <article key={cycle.id} className={`${styles.cycleCard} ${cycle.status === "cancelled" ? styles.cancelled : ""}`}>
            <header className={styles.cycleHeader}>
              <div><span>{cycle.hito_id ?? "General"} · {typeLabel(cycle.cycle_type)}</span><h3>{cycle.title}</h3><small>Revisión #{cycle.sequence} · {formatDate(cycle.scheduled_on)}</small></div>
              <div className={styles.cycleStatus}><span className={`${styles.status} ${styles[cycle.status]}`}>{statusLabel(cycle.status)}</span>{cycle.status === "closed" && <strong>{cycle.percent ?? "—"}%</strong>}</div>
            </header>

            {cycle.status !== "cancelled" && <div className={styles.cycleStats}><span><b>{cycle.results.length}</b>Criterios</span><span><b>{cycle.passed}</b>Pasan</span><span><b>{cycle.failed}</b>No pasan</span><span><b>{cycle.not_applicable}</b>N/A</span></div>}

            {(cycle.status === "planned" || cycle.status === "open") && <div className={styles.dateRow}><label>Fecha<input type="date" value={dateDrafts[cycle.id] ?? ""} onChange={(event) => setDateDrafts((current) => ({ ...current, [cycle.id]: event.target.value }))}/></label><button className={styles.secondary} onClick={() => void saveDate(cycle)} disabled={busy === `date-${cycle.id}`}><CalendarDays size={14}/>Guardar fecha</button></div>}

            {cycle.status === "open" && <div className={styles.resultTableWrap}><table className={styles.resultTable}><thead><tr><th>ID</th><th>Criterio</th><th>Puntaje</th><th>Resultado</th><th>Observación</th></tr></thead><tbody>{cycle.results.map((item) => {
              const draft = cycleDrafts[item.criterion_id] ?? { score: "", notApplicable: false, observation: "" };
              const numeric = draft.score === "" ? null : Number(draft.score);
              const result = scoreLabel(numeric, draft.notApplicable);
              return <tr key={item.criterion_id}><td><strong>{item.criterion_id}</strong><small>{item.criticality}</small></td><td>{item.label}<small>{item.process}</small></td><td><div className={styles.scoreControl}><select disabled={draft.notApplicable} value={draft.score} onChange={(event) => patchResult(cycle.id, item.criterion_id, { score: event.target.value })}><option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select><label><input type="checkbox" checked={draft.notApplicable} onChange={(event) => patchResult(cycle.id, item.criterion_id, { notApplicable: event.target.checked, score: event.target.checked ? "" : draft.score })}/>N/A</label></div></td><td><span className={`${styles.resultPill} ${result === "PASA" ? styles.pass : result === "NO PASA" ? styles.fail : styles.na}`}>{result}</span></td><td><textarea rows={2} value={draft.observation} onChange={(event) => patchResult(cycle.id, item.criterion_id, { observation: event.target.value })} placeholder="Retroalimentación"/></td></tr>;
            })}</tbody></table></div>}

            {cycle.status === "closed" && <div className={styles.closedResults}>{cycle.results.map((item) => <div key={item.criterion_id} className={styles.closedRow}><div><strong>{item.criterion_id}</strong><span>{item.label}</span></div><b>{item.not_applicable ? "N/A" : `${item.score}/4`}</b><span className={`${styles.resultPill} ${item.passed === true ? styles.pass : item.passed === false ? styles.fail : styles.na}`}>{item.not_applicable ? "N/A" : item.passed ? "PASA" : "NO PASA"}</span><p>{item.observation || "Sin observación"}</p></div>)}</div>}

            <footer className={styles.cycleActions}>
              {cycle.status === "planned" && <button className={styles.primary} onClick={() => void openCycle(cycle)} disabled={busy === cycle.id}><ClipboardCheck size={14}/>Abrir revisión</button>}
              {cycle.status === "open" && <><button className={styles.secondary} onClick={() => void saveResults(cycle)} disabled={busy === `save-${cycle.id}`}><Save size={14}/>Guardar avance</button><button className={styles.primary} onClick={() => void closeCycle(cycle)} disabled={busy === `close-${cycle.id}`}><CheckCircle2 size={14}/>Cerrar y publicar</button></>}
              {cycle.status === "closed" && cycle.failed > 0 && <button className={styles.secondary} onClick={() => repeatFailed(cycle)}><RotateCcw size={14}/>Revisar lo que no pasó</button>}
              {(cycle.status === "planned" || cycle.status === "open") && <button className={styles.dangerButton} onClick={() => void cancelCycle(cycle)} disabled={busy === `cancel-${cycle.id}`}><XCircle size={14}/>Cancelar revisión</button>}
            </footer>
          </article>;
        })}</div> : <div className={styles.empty}><RefreshCw size={24}/><h3>Sin revisiones todavía</h3><p>Programe la primera revisión para comenzar la cadencia.</p></div>}
      </div>
    </section>
  </div>;
}
