"use client";

import { Check, ChevronLeft, ClipboardList, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./siacd-block2.module.css";

type WorkspaceTab = "summary" | "schedule" | "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "log" | "improvement";

type HitoDefinition = {
  id: string;
  title: string;
  sequence: number;
  moment: string;
  purpose: string;
  final_weight: number;
};

type HitoSchedule = {
  hito_id: string;
  scheduled_on: string;
  executed_on: string;
  coordinator_validated: boolean;
};

type CompetencyDefinition = {
  id: string;
  hito_id: string;
  process: string;
  observable_competency: string;
  criticality: "Crítica" | "Importante" | "Deseable";
  expected_evidence: string;
  relative_weight: number;
};

type ScoreRecord = {
  competency_id: string;
  score: number | null;
  coordinator_observation: string;
  evaluated_at?: string | null;
};

type Followup = {
  id: string;
  happened_on: string;
  hito_id: string | null;
  followup_type: string;
  process: string | null;
  finding: string;
  agreed_action: string | null;
  commitment_due_on: string | null;
  responsible: string | null;
  teacher_conformity: boolean | null;
  evidence_reference: string | null;
};

type ImprovementAction = {
  id: string;
  competency_id: string | null;
  action_text: string;
  responsible: string;
  due_on: string | null;
  status: "pending" | "in_progress" | "completed" | "verified";
};

const tabLabels: Record<WorkspaceTab, string> = {
  summary: "Resumen",
  schedule: "Cronograma",
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
  H5: "H5",
  H6: "H6",
  log: "Bitácora",
  improvement: "Plan de mejora",
};

function scoreState(score: number | null) {
  if (score === null) return { label: "Pendiente", className: styles.pending };
  if (score >= 3) return { label: "Competente", className: styles.good };
  if (score === 2) return { label: "En acompañamiento", className: styles.warning };
  return { label: "Crítico", className: styles.danger };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpedientWorkspace({
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
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const [hitos, setHitos] = useState<HitoDefinition[]>([]);
  const [schedules, setSchedules] = useState<HitoSchedule[]>([]);
  const [competencies, setCompetencies] = useState<CompetencyDefinition[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreRecord>>({});
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [actions, setActions] = useState<ImprovementAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaIssue, setSchemaIssue] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaIssue("");

    const [hitoResult, scheduleResult, competencyResult, scoreResult, followupResult, actionResult] = await Promise.all([
      supabase.from("hito_definitions").select("id,title,sequence,moment,purpose,final_weight").in("id", ["H1","H2","H3","H4","H5","H6"]).order("sequence"),
      supabase.from("hito_schedules").select("hito_id,scheduled_on,executed_on,coordinator_validated").eq("expedient_id", teacher.id),
      supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,criticality,expected_evidence,relative_weight").eq("active", true),
      supabase.from("competency_scores").select("competency_id,score,coordinator_observation,evaluated_at").eq("expedient_id", teacher.id),
      supabase.from("followups").select("id,happened_on,hito_id,followup_type,process,finding,agreed_action,commitment_due_on,responsible,teacher_conformity,evidence_reference").eq("expedient_id", teacher.id).order("happened_on", { ascending: false }),
      supabase.from("improvement_actions").select("id,competency_id,action_text,responsible,due_on,status").eq("expedient_id", teacher.id).order("due_on", { ascending: true }),
    ]);

    if (competencyResult.error && competencyResult.error.message.toLowerCase().includes("column")) {
      setSchemaIssue("Falta aplicar la migración 202608180002_block2_expedient.sql.");
      setLoading(false);
      return;
    }
    if (followupResult.error && followupResult.error.message.toLowerCase().includes("evidence_reference")) {
      setSchemaIssue("Falta aplicar la migración 202608180002_block2_expedient.sql.");
      setLoading(false);
      return;
    }

    const anyError = hitoResult.error || scheduleResult.error || competencyResult.error || scoreResult.error || followupResult.error || actionResult.error;
    if (anyError) {
      setMessage(`No se pudo cargar el expediente: ${anyError?.message ?? "error de base de datos"}`);
      setLoading(false);
      return;
    }

    setHitos((hitoResult.data ?? []) as HitoDefinition[]);
    setSchedules((scheduleResult.data ?? []).map((row) => ({
      hito_id: row.hito_id,
      scheduled_on: row.scheduled_on ?? "",
      executed_on: row.executed_on ?? "",
      coordinator_validated: Boolean(row.coordinator_validated),
    })));
    const competencyRows = (competencyResult.data ?? []) as CompetencyDefinition[];
    if (competencyRows.length < 75) {
      setSchemaIssue("Falta aplicar la migración 202608180002_block2_expedient.sql para cargar los 75 criterios H1–H6.");
    }
    setCompetencies(competencyRows);
    const scoreMap: Record<string, ScoreRecord> = {};
    for (const row of scoreResult.data ?? []) {
      scoreMap[row.competency_id] = {
        competency_id: row.competency_id,
        score: row.score === null ? null : Number(row.score),
        coordinator_observation: row.coordinator_observation ?? "",
        evaluated_at: row.evaluated_at,
      };
    }
    setScores(scoreMap);
    setFollowups((followupResult.data ?? []) as Followup[]);
    setActions((actionResult.data ?? []) as ImprovementAction[]);
    setLoading(false);
  }, [teacher.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const hitoSummary = useMemo(() => {
    const result: Record<string, { average: number | null; criticalGaps: number; completed: number; total: number; verdict: string }> = {};
    for (const hito of hitos) {
      const defs = competencies.filter((item) => item.hito_id === hito.id);
      let weighted = 0;
      let weight = 0;
      let criticalGaps = 0;
      let completed = 0;
      for (const def of defs) {
        const score = scores[def.id]?.score;
        if (score !== null && score !== undefined) {
          weighted += score * Number(def.relative_weight);
          weight += Number(def.relative_weight);
          completed += 1;
          if (def.criticality === "Crítica" && score < 3) criticalGaps += 1;
        }
      }
      const average = weight ? weighted / weight : null;
      const verdict = completed === 0 ? "SIN EVALUAR" : criticalGaps > 0 ? "REQUIERE ACOMPAÑAMIENTO" : (average ?? 0) >= 3 ? "HITO SUPERADO" : "EN DESARROLLO";
      result[hito.id] = { average, criticalGaps, completed, total: defs.length, verdict };
    }
    return result;
  }, [competencies, hitos, scores]);

  const totalCriticalGaps = useMemo(
    () => (Object.values(hitoSummary) as Array<{ criticalGaps: number }>).reduce((sum, item) => sum + item.criticalGaps, 0),
    [hitoSummary],
  );

  const evaluatedCount = useMemo(
    () => (Object.values(scores) as ScoreRecord[]).filter((item) => item.score !== null && item.score !== undefined).length,
    [scores],
  );

  const operationalPercent = useMemo(() => {
    let weighted = 0;
    let usedWeight = 0;
    for (const hito of hitos) {
      const summary = hitoSummary[hito.id];
      if (summary?.average !== null && summary?.average !== undefined) {
        weighted += (summary.average / 4) * Number(hito.final_weight);
        usedWeight += Number(hito.final_weight);
      }
    }
    return usedWeight ? Math.round((weighted / usedWeight) * 100) : 0;
  }, [hitos, hitoSummary]);

  async function updateExpedientMetrics(nextScores: Record<string, ScoreRecord>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let criticalGaps = 0;
    let operationalWeighted = 0;
    let hitoWeightUsed = 0;
    for (const hito of hitos) {
      const defs = competencies.filter((item) => item.hito_id === hito.id);
      let numerator = 0;
      let denominator = 0;
      for (const def of defs) {
        const score = nextScores[def.id]?.score;
        if (score !== null && score !== undefined) {
          numerator += score * Number(def.relative_weight);
          denominator += Number(def.relative_weight);
          if (def.criticality === "Crítica" && score < 3) criticalGaps += 1;
        }
      }
      if (denominator) {
        operationalWeighted += (numerator / denominator / 4) * Number(hito.final_weight);
        hitoWeightUsed += Number(hito.final_weight);
      }
    }
    const operationalScore = hitoWeightUsed ? operationalWeighted / hitoWeightUsed : null;
    const currentStatus = teacher.status === "Certificado" ? "certified" : teacher.status === "Aprobado" ? "approved" : null;
    const nextStatus = currentStatus ?? (criticalGaps > 0 ? "with_gaps" : "in_progress");
    await supabase.from("expedients").update({
      critical_gaps: criticalGaps,
      operational_score: operationalScore,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", teacher.id);
  }

  async function saveScore(definition: CompetencyDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const current = scores[definition.id] ?? { competency_id: definition.id, score: null, coordinator_observation: "" };
    setSavingId(definition.id);
    const { error } = await supabase.from("competency_scores").upsert(
      {
        expedient_id: teacher.id,
        competency_id: definition.id,
        score: current.score,
        coordinator_observation: current.coordinator_observation || null,
        evaluated_by: null,
        evaluated_at: current.score === null ? null : new Date().toISOString(),
      },
      { onConflict: "expedient_id,competency_id" },
    );
    if (error) {
      setMessage(`No se pudo guardar ${definition.id}: ${error.message}`);
      setSavingId("");
      return;
    }
    const nextScores = { ...scores, [definition.id]: current };
    await updateExpedientMetrics(nextScores);
    setMessage(`${definition.id} guardado`);
    setSavingId("");
    await onChanged();
  }

  async function saveHito(hitoId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const schedule = schedules.find((item) => item.hito_id === hitoId);
    if (!schedule) return;
    setSavingId(`hito-${hitoId}`);
    const { error } = await supabase.from("hito_schedules").update({
      scheduled_on: schedule.scheduled_on || null,
      executed_on: schedule.executed_on || null,
      coordinator_validated: schedule.coordinator_validated,
    }).eq("expedient_id", teacher.id).eq("hito_id", hitoId);
    if (error) setMessage(`No se pudo guardar ${hitoId}: ${error.message}`);
    else {
      setMessage(`${hitoId} actualizado`);
      await onChanged();
    }
    setSavingId("");
  }

  async function addFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("followups").insert({
      expedient_id: teacher.id,
      happened_on: String(form.get("happened_on")),
      hito_id: String(form.get("hito_id") || "") || null,
      followup_type: String(form.get("followup_type")),
      process: String(form.get("process") || "") || null,
      finding: String(form.get("finding")),
      agreed_action: String(form.get("agreed_action") || "") || null,
      commitment_due_on: String(form.get("commitment_due_on") || "") || null,
      evidence_reference: String(form.get("evidence_reference") || "") || null,
      responsible: String(form.get("responsible") || "") || null,
      teacher_conformity: form.get("teacher_conformity") === "on",
      created_by: null,
      created_by_staff_id: teacher.coordinatorId || null,
    });
    if (error) return setMessage(`No se pudo guardar la bitácora: ${error.message}`);
    setShowFollowupForm(false);
    setMessage("Seguimiento registrado");
    await load();
  }

  async function deleteFollowup(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !window.confirm("¿Eliminar este registro de bitácora?")) return;
    const { error } = await supabase.from("followups").delete().eq("id", id);
    if (error) setMessage(error.message);
    else { setMessage("Registro eliminado"); await load(); }
  }

  async function addAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("improvement_actions").insert({
      expedient_id: teacher.id,
      competency_id: String(form.get("competency_id") || "") || null,
      action_text: String(form.get("action_text")),
      responsible: String(form.get("responsible")),
      due_on: String(form.get("due_on") || "") || null,
      status: "pending",
    });
    if (error) return setMessage(`No se pudo crear la acción: ${error.message}`);
    setShowActionForm(false);
    setMessage("Acción de mejora creada");
    await load();
  }

  async function setActionStatus(action: ImprovementAction, status: ImprovementAction["status"]) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("improvement_actions").update({ status }).eq("id", action.id);
    if (error) setMessage(error.message); else await load();
  }

  async function deleteAction(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !window.confirm("¿Eliminar esta acción de mejora?")) return;
    const { error } = await supabase.from("improvement_actions").delete().eq("id", id);
    if (error) setMessage(error.message); else await load();
  }

  const lowCompetencies = useMemo(
    () => competencies.filter((def) => {
      const score = scores[def.id]?.score;
      return score !== null && score !== undefined && score < 3;
    }),
    [competencies, scores],
  );

  if (loading) return <div className={styles.backdrop}><div className={styles.loading}>Cargando expediente…</div></div>;

  return (
    <div className={styles.backdrop}>
      <section className={styles.workspace} role="dialog" aria-modal="true" aria-label={`Expediente de ${teacher.name}`}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar expediente"><ChevronLeft size={18} /></button>
            <div><div className={styles.eyebrow}>EXPEDIENTE DOCENTE · BLOQUE 2</div><h2>{teacher.name}</h2><p>{teacher.career} · {teacher.subject}</p></div>
          </div>
          <div className={styles.headerStats}>
            <span><strong>{evaluatedCount}</strong>/75 evaluados</span>
            <span><strong>{totalCriticalGaps}</strong> brechas críticas</span>
            <span><strong>{operationalPercent}%</strong> resultado operativo</span>
            <span className={styles.roleBadge}>{accessMode === "admin" ? "Administrador" : coordinatorName}</span>
          </div>
          <button className={styles.iconClose} onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        {schemaIssue && <div className={styles.schemaIssue}>{schemaIssue}</div>}
        {message && <div className={styles.message}>{message}</div>}

        <nav className={styles.tabs}>
          {(Object.keys(tabLabels) as WorkspaceTab[]).map((item) => (
            <button key={item} className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>
              {tabLabels[item]}
              {item.startsWith("H") && hitoSummary[item] ? <small>{hitoSummary[item].completed}/{hitoSummary[item].total}</small> : null}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {tab === "summary" && <SummaryTab teacher={teacher} coordinatorName={coordinatorName} hitos={hitos} summaries={hitoSummary} operationalPercent={operationalPercent} totalCriticalGaps={totalCriticalGaps} />}
          {tab === "schedule" && <ScheduleTab hitos={hitos} schedules={schedules} setSchedules={setSchedules} summaries={hitoSummary} savingId={savingId} onSave={saveHito} />}
          {(["H1","H2","H3","H4","H5","H6"] as WorkspaceTab[]).includes(tab) && (
            <HitoTab
              hitoId={tab}
              hito={hitos.find((item) => item.id === tab)}
              definitions={competencies.filter((item) => item.hito_id === tab).sort((a, b) => a.id.localeCompare(b.id))}
              scores={scores}
              setScores={setScores}
              summary={hitoSummary[tab]}
              savingId={savingId}
              onSave={saveScore}
            />
          )}
          {tab === "log" && <LogTab followups={followups} hitos={hitos} showForm={showFollowupForm} setShowForm={setShowFollowupForm} onAdd={addFollowup} onDelete={deleteFollowup} coordinatorName={coordinatorName} />}
          {tab === "improvement" && <ImprovementTab actions={actions} competencies={competencies} lowCompetencies={lowCompetencies} scores={scores} showForm={showActionForm} setShowForm={setShowActionForm} onAdd={addAction} onStatus={setActionStatus} onDelete={deleteAction} coordinatorName={coordinatorName} />}
        </div>
      </section>
    </div>
  );
}

function SummaryTab({ teacher, coordinatorName, hitos, summaries, operationalPercent, totalCriticalGaps }: { teacher: Teacher; coordinatorName: string; hitos: HitoDefinition[]; summaries: Record<string, { average:number|null;criticalGaps:number;completed:number;total:number;verdict:string }>; operationalPercent: number; totalCriticalGaps: number; }) {
  return <div className={styles.summaryGrid}>
    <section className={styles.card}><h3>Ficha del docente</h3><dl className={styles.definitionList}>
      <div><dt>Docente</dt><dd>{teacher.name}</dd></div><div><dt>Carrera</dt><dd>{teacher.career}</dd></div><div><dt>Asignatura(s)</dt><dd>{teacher.subject}</dd></div><div><dt>Modalidad</dt><dd>{teacher.modality}</dd></div><div><dt>Período</dt><dd>{teacher.period}</dd></div><div><dt>Coordinador</dt><dd>{coordinatorName}</dd></div><div><dt>Fecha de ingreso</dt><dd>{formatDate(teacher.entryDate)}</dd></div><div><dt>Inicio de actividades</dt><dd>{formatDate(teacher.activitiesStartDate)}</dd></div><div><dt>Cierre previsto</dt><dd>{formatDate(teacher.plannedCloseDate)}</dd></div><div><dt>Jornada(s)</dt><dd>{teacher.scheduleRanges.join(" · ") || "—"}</dd></div><div><dt>Correo</dt><dd>{teacher.email || "—"}</dd></div>
    </dl></section>
    <section className={styles.card}><h3>Resultado operativo</h3><div className={styles.bigNumber}>{operationalPercent}%</div><p className={styles.muted}>Cálculo parcial con los criterios H1–H6 ya evaluados.</p><div className={styles.kpiLine}><span>Brechas críticas</span><strong className={totalCriticalGaps ? styles.redText : styles.greenText}>{totalCriticalGaps}</strong></div><div className={styles.kpiLine}><span>Estado del expediente</span><strong>{teacher.status}</strong></div></section>
    <section className={`${styles.card} ${styles.wide}`}><h3>Resumen de H1–H6</h3><div className={styles.hitoCards}>{hitos.map((hito)=>{ const s=summaries[hito.id]??{average:null,criticalGaps:0,completed:0,total:0,verdict:"SIN EVALUAR"}; return <article key={hito.id} className={styles.hitoCard}><div><strong>{hito.id} · {hito.title}</strong><span>{hito.moment}</span></div><div className={styles.hitoNumbers}><b>{s.average===null?"—":s.average.toFixed(2)}</b><small>{s.completed}/{s.total} criterios</small></div><span className={s.criticalGaps?styles.dangerPill:s.completed===s.total&&s.total?styles.goodPill:styles.neutralPill}>{s.verdict}</span></article>; })}</div></section>
  </div>;
}

function ScheduleTab({ hitos, schedules, setSchedules, summaries, savingId, onSave }: { hitos:HitoDefinition[]; schedules:HitoSchedule[]; setSchedules:(value:HitoSchedule[] | ((current:HitoSchedule[])=>HitoSchedule[]))=>void; summaries:Record<string,{average:number|null;criticalGaps:number;completed:number;total:number;verdict:string}>; savingId:string; onSave:(hitoId:string)=>Promise<void>; }) {
  function patch(hitoId:string, values:Partial<HitoSchedule>) { setSchedules((current)=>current.map((row)=>row.hito_id===hitoId?{...row,...values}:row)); }
  return <section className={styles.card}><div className={styles.sectionHead}><div><h3>Cronograma H1–H6</h3><p>Fecha programada, ejecución y validación real del coordinador.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Hito</th><th>Momento</th><th>Fecha programada</th><th>Fecha ejecutada</th><th>Validado</th><th>Resultado</th><th></th></tr></thead><tbody>{hitos.map((hito)=>{ const row=schedules.find((item)=>item.hito_id===hito.id)??{hito_id:hito.id,scheduled_on:"",executed_on:"",coordinator_validated:false}; const summary=summaries[hito.id]; return <tr key={hito.id}><td><strong>{hito.id} · {hito.title}</strong><small>{hito.purpose}</small></td><td>{hito.moment}</td><td><input type="date" value={row.scheduled_on} onChange={(e)=>patch(hito.id,{scheduled_on:e.target.value})}/></td><td><input type="date" value={row.executed_on} onChange={(e)=>patch(hito.id,{executed_on:e.target.value})}/></td><td><label className={styles.checkLabel}><input type="checkbox" checked={row.coordinator_validated} onChange={(e)=>patch(hito.id,{coordinator_validated:e.target.checked})}/>{row.coordinator_validated?"Sí":"No"}</label></td><td>{summary?.verdict??"SIN EVALUAR"}</td><td><button className={styles.saveMini} onClick={()=>void onSave(hito.id)} disabled={savingId===`hito-${hito.id}`}><Save size={14}/>{savingId===`hito-${hito.id}`?"Guardando":"Guardar"}</button></td></tr>; })}</tbody></table></div></section>;
}

function HitoTab({ hitoId, hito, definitions, scores, setScores, summary, savingId, onSave }: { hitoId:WorkspaceTab; hito?:HitoDefinition; definitions:CompetencyDefinition[]; scores:Record<string,ScoreRecord>; setScores:(value:Record<string,ScoreRecord> | ((current:Record<string,ScoreRecord>)=>Record<string,ScoreRecord>))=>void; summary?:{average:number|null;criticalGaps:number;completed:number;total:number;verdict:string}; savingId:string; onSave:(definition:CompetencyDefinition)=>Promise<void>; }) {
  if (!hito || !definitions.length) return <div className={styles.empty}><ClipboardList size={28}/><h3>Sin criterios cargados</h3><p>Ejecute la migración del Bloque 2 para cargar las 75 competencias del Excel.</p></div>;
  return <><section className={styles.hitoHeader}><div><span>{hito.id}</span><div><h3>{hito.title}</h3><p>{hito.purpose}</p></div></div><div className={styles.hitoSummary}><strong>{summary?.average===null||summary?.average===undefined?"—":summary.average.toFixed(2)}</strong><small>Promedio</small><b>{summary?.criticalGaps??0} brechas críticas</b><em>{summary?.verdict??"SIN EVALUAR"}</em></div></section>
    <section className={styles.card}><div className={styles.tableWrap}><table className={`${styles.table} ${styles.criteriaTable}`}><thead><tr><th>ID</th><th>Proceso</th><th>Competencia observable</th><th>Criticidad</th><th>Evidencia esperada</th><th>Puntaje</th><th>Estado</th><th>Observación</th><th></th></tr></thead><tbody>{definitions.map((def)=>{ const current=scores[def.id]??{competency_id:def.id,score:null,coordinator_observation:""}; const state=scoreState(current.score); return <tr key={def.id}><td><strong>{def.id}</strong><small>Peso {def.relative_weight}</small></td><td>{def.process}</td><td className={styles.competencyText}>{def.observable_competency}</td><td><span className={def.criticality==="Crítica"?styles.critical:styles.neutral}>{def.criticality}</span></td><td>{def.expected_evidence||"—"}</td><td><select value={current.score===null?"":String(current.score)} onChange={(e)=>setScores((curr)=>({...curr,[def.id]:{...current,score:e.target.value===""?null:Number(e.target.value)}}))}><option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></td><td><span className={`${styles.statePill} ${state.className}`}>{state.label}</span></td><td><textarea rows={2} value={current.coordinator_observation} placeholder="Observación / conclusión" onChange={(e)=>setScores((curr)=>({...curr,[def.id]:{...current,coordinator_observation:e.target.value}}))}/></td><td><button className={styles.saveIcon} title={`Guardar ${def.id}`} onClick={()=>void onSave(def)} disabled={savingId===def.id}>{savingId===def.id?<Check size={15}/>:<Save size={15}/>}</button></td></tr>; })}</tbody></table></div></section></>;
}

function LogTab({ followups,hitos,showForm,setShowForm,onAdd,onDelete,coordinatorName }:{ followups:Followup[];hitos:HitoDefinition[];showForm:boolean;setShowForm:(value:boolean)=>void;onAdd:(event:FormEvent<HTMLFormElement>)=>Promise<void>;onDelete:(id:string)=>Promise<void>;coordinatorName:string; }) {
  return <section className={styles.card}><div className={styles.sectionHead}><div><h3>Bitácora de seguimiento</h3><p>Registro cronológico de intervenciones, hallazgos y compromisos.</p></div><button className={styles.primary} onClick={()=>setShowForm(!showForm)}><Plus size={14}/>{showForm?"Cerrar":"Nuevo seguimiento"}</button></div>
    {showForm&&<form className={styles.formGrid} onSubmit={onAdd}><label>Fecha<input name="happened_on" type="date" required defaultValue={today()}/></label><label>Hito<select name="hito_id"><option value="">General</option>{hitos.map((h)=><option key={h.id} value={h.id}>{h.id} · {h.title}</option>)}</select></label><label>Tipo de seguimiento<input name="followup_type" required placeholder="Revisión, tutoría, reunión..."/></label><label>Proceso / plataforma<input name="process" placeholder="EVA, SISACAD, Teams..."/></label><label className={styles.full}>Hallazgo o competencia verificada<textarea name="finding" required rows={3}/></label><label className={styles.full}>Compromiso / acción acordada<textarea name="agreed_action" rows={2}/></label><label>Fecha compromiso<input name="commitment_due_on" type="date"/></label><label>Responsable<input name="responsible" defaultValue={coordinatorName}/></label><label className={styles.full}>Evidencia / enlace / código<input name="evidence_reference" placeholder="URL, código o referencia"/></label><label className={styles.checkbox}><input type="checkbox" name="teacher_conformity"/>Conformidad del docente</label><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={()=>setShowForm(false)}>Cancelar</button><button className={styles.primary}><Save size={14}/>Guardar seguimiento</button></div></form>}
    {followups.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Fecha</th><th>Hito</th><th>Tipo</th><th>Hallazgo</th><th>Compromiso</th><th>Fecha compromiso</th><th>Evidencia</th><th>Conformidad</th><th></th></tr></thead><tbody>{followups.map((f)=><tr key={f.id}><td>{formatDate(f.happened_on)}</td><td>{f.hito_id??"General"}</td><td>{f.followup_type}<small>{f.process??""}</small></td><td>{f.finding}</td><td>{f.agreed_action??"—"}</td><td>{formatDate(f.commitment_due_on)}</td><td>{f.evidence_reference??"—"}</td><td>{f.teacher_conformity===null?"—":f.teacher_conformity?"Sí":"No"}</td><td><button className={styles.deleteIcon} onClick={()=>void onDelete(f.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>:<div className={styles.empty}><ClipboardList size={28}/><h3>Sin seguimientos</h3><p>Agregue el primer registro de bitácora.</p></div>}
  </section>;
}

function ImprovementTab({ actions,competencies,lowCompetencies,scores,showForm,setShowForm,onAdd,onStatus,onDelete,coordinatorName }:{ actions:ImprovementAction[];competencies:CompetencyDefinition[];lowCompetencies:CompetencyDefinition[];scores:Record<string,ScoreRecord>;showForm:boolean;setShowForm:(value:boolean)=>void;onAdd:(event:FormEvent<HTMLFormElement>)=>Promise<void>;onStatus:(action:ImprovementAction,status:ImprovementAction["status"])=>Promise<void>;onDelete:(id:string)=>Promise<void>;coordinatorName:string; }) {
  const defMap=Object.fromEntries(competencies.map((d)=>[d.id,d]));
  return <section className={styles.card}><div className={styles.sectionHead}><div><h3>Plan individual de mejora</h3><p>Las brechas se detectan con puntajes menores a 3. Incluye todos los criterios del Excel.</p></div><button className={styles.primary} disabled={!lowCompetencies.length} onClick={()=>setShowForm(!showForm)}><Plus size={14}/>{showForm?"Cerrar":"Nueva acción"}</button></div><div className={styles.breachStrip}><strong>{lowCompetencies.length}</strong><span>competencias con brecha evaluada</span>{lowCompetencies.length===0&&<em>No hay brechas con los puntajes actuales.</em>}</div>
    {showForm&&<form className={styles.formGrid} onSubmit={onAdd}><label className={styles.full}>Competencia con brecha<select name="competency_id" required>{lowCompetencies.map((d)=><option key={d.id} value={d.id}>{d.id} · {d.observable_competency}</option>)}</select></label><label className={styles.full}>Acción de mejora<textarea name="action_text" required rows={3}/></label><label>Responsable<input name="responsible" required defaultValue={coordinatorName}/></label><label>Fecha compromiso<input type="date" name="due_on"/></label><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={()=>setShowForm(false)}>Cancelar</button><button className={styles.primary}><Save size={14}/>Crear acción</button></div></form>}
    {actions.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Hito / ID</th><th>Competencia</th><th>Puntaje</th><th>Criticidad</th><th>Acción</th><th>Responsable</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>{actions.map((action)=>{ const def=action.competency_id?defMap[action.competency_id]??null:null; const score=action.competency_id?scores[action.competency_id]?.score:null; return <tr key={action.id}><td><strong>{def?.hito_id??"—"} · {action.competency_id??"General"}</strong></td><td>{def?.observable_competency??"Acción general"}</td><td>{score??"—"}</td><td>{def?.criticality??"—"}</td><td>{action.action_text}</td><td>{action.responsible}</td><td>{formatDate(action.due_on)}</td><td><select value={action.status} onChange={(e)=>void onStatus(action,e.target.value as ImprovementAction["status"])}><option value="pending">Pendiente</option><option value="in_progress">En proceso</option><option value="completed">Completada</option><option value="verified">Verificada</option></select></td><td><button className={styles.deleteIcon} onClick={()=>void onDelete(action.id)}><Trash2 size={14}/></button></td></tr>; })}</tbody></table></div>:<div className={styles.empty}><ClipboardList size={28}/><h3>Sin acciones de mejora</h3><p>Cuando exista una brecha, cree la acción correspondiente.</p></div>}
  </section>;
}
