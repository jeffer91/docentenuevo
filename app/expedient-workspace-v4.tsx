"use client";

import { Check, ChevronLeft, ClipboardList, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ExpedientFinalization, { type FinalizationMode } from "./expedient-finalization";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./siacd-block2.module.css";
import phaseStyles from "./siacd-phase-workspace.module.css";

type MainTab = "summary" | "before" | "during" | "after" | "history";
type PanelKey = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "quality" | "complementary" | "evidence" | "documents" | "certification" | "schedule" | "log" | "improvement";
type ProcessPhase = "before" | "during" | "after";

type HitoDefinition = {
  id: string;
  title: string;
  sequence: number;
  moment: string;
  purpose: string;
  final_weight: number;
  phase: ProcessPhase | null;
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

type HitoSummary = {
  average: number | null;
  criticalGaps: number;
  completed: number;
  total: number;
  verdict: string;
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

type PhaseSummary = {
  percent: number;
  criticalGaps: number;
  completed: number;
  total: number;
  status: "No iniciado" | "En proceso" | "En mejora" | "Cumple";
};

const phaseHitos: Record<ProcessPhase, string[]> = {
  before: ["H1", "H2"],
  during: ["H3", "H4", "H5"],
  after: ["H6"],
};

const mainLabels: Record<MainTab, string> = {
  summary: "Resumen",
  before: "Antes",
  during: "Durante",
  after: "Después",
  history: "Historial",
};

const subPanels: Record<Exclude<MainTab, "summary">, Array<{ key: PanelKey; label: string }>> = {
  before: [
    { key: "H1", label: "H1 · Inducción" },
    { key: "H2", label: "H2 · Preparación" },
  ],
  during: [
    { key: "H3", label: "H3 · Inicio" },
    { key: "H4", label: "H4 · Seguimiento 1" },
    { key: "H5", label: "H5 · Seguimiento 2" },
    { key: "quality", label: "Calidad" },
  ],
  after: [
    { key: "H6", label: "H6 · Cierre" },
    { key: "complementary", label: "Complementaria" },
    { key: "documents", label: "Documentos" },
    { key: "certification", label: "Certificación" },
  ],
  history: [
    { key: "schedule", label: "Cronograma" },
    { key: "log", label: "Bitácora" },
    { key: "improvement", label: "Plan de mejora" },
    { key: "evidence", label: "Evidencias" },
  ],
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

function defaultPanel(tab: Exclude<MainTab, "summary">): PanelKey {
  return subPanels[tab][0].key;
}

export default function ExpedientWorkspace({ teacher, accessMode, coordinatorName, onClose, onChanged }: {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [mainTab, setMainTab] = useState<MainTab>("summary");
  const [panel, setPanel] = useState<PanelKey>("H1");
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
      supabase.from("hito_definitions").select("id,title,sequence,moment,purpose,final_weight,phase").in("id", ["H1","H2","H3","H4","H5","H6"]).order("sequence"),
      supabase.from("hito_schedules").select("hito_id,scheduled_on,executed_on,coordinator_validated").eq("expedient_id", teacher.id),
      supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,criticality,expected_evidence,relative_weight").eq("active", true),
      supabase.from("competency_scores").select("competency_id,score,coordinator_observation,evaluated_at").eq("expedient_id", teacher.id),
      supabase.from("followups").select("id,happened_on,hito_id,followup_type,process,finding,agreed_action,commitment_due_on,responsible,teacher_conformity,evidence_reference").eq("expedient_id", teacher.id).order("happened_on", { ascending: false }),
      supabase.from("improvement_actions").select("id,competency_id,action_text,responsible,due_on,status").eq("expedient_id", teacher.id).order("due_on", { ascending: true }),
    ]);

    const anyError = hitoResult.error || scheduleResult.error || competencyResult.error || scoreResult.error || followupResult.error || actionResult.error;
    if (anyError) {
      if (/phase|schema cache|column/i.test(anyError.message)) setSchemaIssue("Falta aplicar la migración del Bloque 2: fases Antes / Durante / Después.");
      else setMessage(`No se pudo cargar el expediente: ${anyError.message}`);
      setLoading(false);
      return;
    }

    const hitoRows = (hitoResult.data ?? []) as HitoDefinition[];
    setHitos(hitoRows.map((item) => ({
      ...item,
      phase: item.phase ?? (phaseHitos.before.includes(item.id) ? "before" : phaseHitos.during.includes(item.id) ? "during" : "after"),
    })));
    setSchedules((scheduleResult.data ?? []).map((row) => ({
      hito_id: row.hito_id,
      scheduled_on: row.scheduled_on ?? "",
      executed_on: row.executed_on ?? "",
      coordinator_validated: Boolean(row.coordinator_validated),
    })));
    setCompetencies((competencyResult.data ?? []) as CompetencyDefinition[]);

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
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const hitoSummary = useMemo(() => {
    const result: Record<string, HitoSummary> = {};
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

  const phaseSummary = useMemo(() => {
    const result = {} as Record<ProcessPhase, PhaseSummary>;
    for (const phase of ["before", "during", "after"] as ProcessPhase[]) {
      let weighted = 0;
      let usedWeight = 0;
      let criticalGaps = 0;
      let completed = 0;
      let total = 0;
      for (const id of phaseHitos[phase]) {
        const hito = hitos.find((item) => item.id === id);
        const summary = hitoSummary[id];
        if (!hito || !summary) continue;
        completed += summary.completed;
        total += summary.total;
        criticalGaps += summary.criticalGaps;
        if (summary.average !== null) {
          weighted += (summary.average / 4) * Number(hito.final_weight);
          usedWeight += Number(hito.final_weight);
        }
      }
      const percent = usedWeight ? Math.round((weighted / usedWeight) * 100) : 0;
      const status: PhaseSummary["status"] = completed === 0 ? "No iniciado" : criticalGaps > 0 ? "En mejora" : completed === total && total > 0 && percent >= 75 ? "Cumple" : "En proceso";
      result[phase] = { percent, criticalGaps, completed, total, status };
    }
    return result;
  }, [hitoSummary, hitos]);

  const evaluatedCount = useMemo(() => Object.values(scores).filter((item) => item.score !== null && item.score !== undefined).length, [scores]);
  const totalCriticalGaps = useMemo(() => Object.values(hitoSummary).reduce((sum, item) => sum + item.criticalGaps, 0), [hitoSummary]);
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
  }, [hitoSummary, hitos]);

  const lowCompetencies = useMemo(() => competencies.filter((def) => {
    const score = scores[def.id]?.score;
    return score !== null && score !== undefined && score < 3;
  }), [competencies, scores]);

  function openMain(tab: MainTab) {
    setMainTab(tab);
    if (tab !== "summary") setPanel(defaultPanel(tab));
  }

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
    const fixedStatus = teacher.status === "Certificado" ? "certified" : teacher.status === "Aprobado" ? "approved" : null;
    await supabase.from("expedients").update({
      critical_gaps: criticalGaps,
      operational_score: operationalScore,
      status: fixedStatus ?? (criticalGaps > 0 ? "with_gaps" : "in_progress"),
      updated_at: new Date().toISOString(),
    }).eq("id", teacher.id);
  }

  async function saveScore(definition: CompetencyDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const current = scores[definition.id] ?? { competency_id: definition.id, score: null, coordinator_observation: "" };
    setSavingId(definition.id);
    const { error } = await supabase.from("competency_scores").upsert({
      expedient_id: teacher.id,
      competency_id: definition.id,
      score: current.score,
      coordinator_observation: current.coordinator_observation || null,
      evaluated_by: null,
      evaluated_at: current.score === null ? null : new Date().toISOString(),
    }, { onConflict: "expedient_id,competency_id" });
    if (error) setMessage(`No se pudo guardar ${definition.id}: ${error.message}`);
    else {
      await updateExpedientMetrics({ ...scores, [definition.id]: current });
      setMessage(`${definition.id} guardado`);
      await onChanged();
    }
    setSavingId("");
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
    else await load();
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
    if (error) setMessage(error.message);
    else await load();
  }

  async function deleteAction(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !window.confirm("¿Eliminar esta acción de mejora?")) return;
    const { error } = await supabase.from("improvement_actions").delete().eq("id", id);
    if (error) setMessage(error.message);
    else await load();
  }

  if (loading) return <div className={styles.backdrop}><div className={styles.loading}>Cargando expediente…</div></div>;

  const activePhase = mainTab === "before" || mainTab === "during" || mainTab === "after" ? mainTab : null;
  const activePhaseSummary = activePhase ? phaseSummary[activePhase] : null;

  return (
    <div className={styles.backdrop}>
      <section className={styles.workspace} role="dialog" aria-modal="true" aria-label={`Expediente de ${teacher.name}`}>
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar expediente"><ChevronLeft size={18} /></button>
            <div><div className={styles.eyebrow}>EXPEDIENTE DOCENTE · ANTES / DURANTE / DESPUÉS</div><h2>{teacher.name}</h2><p>{teacher.career} · {teacher.subject}</p></div>
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

        <nav className={phaseStyles.mainNav}>
          {(Object.keys(mainLabels) as MainTab[]).map((item) => {
            const summary = item === "before" || item === "during" || item === "after" ? phaseSummary[item] : null;
            return <button key={item} className={mainTab === item ? phaseStyles.active : ""} onClick={() => openMain(item)}>{mainLabels[item]}{summary && <span>{summary.percent}%</span>}</button>;
          })}
        </nav>

        {mainTab !== "summary" && (
          <nav className={phaseStyles.subNav}>
            {subPanels[mainTab].map((item) => <button key={item.key} className={panel === item.key ? phaseStyles.active : ""} onClick={() => setPanel(item.key)}>{item.label}</button>)}
          </nav>
        )}

        <div className={styles.content}>
          {mainTab === "summary" && <SummaryView teacher={teacher} coordinatorName={coordinatorName} hitos={hitos} summaries={hitoSummary} phaseSummary={phaseSummary} operationalPercent={operationalPercent} totalCriticalGaps={totalCriticalGaps} onOpenPhase={openMain} />}

          {activePhase && activePhaseSummary && <PhaseIntro phase={activePhase} summary={activePhaseSummary} />}

          {(["H1","H2","H3","H4","H5","H6"] as PanelKey[]).includes(panel) && mainTab !== "summary" && (
            <HitoView hito={hitos.find((item) => item.id === panel)} definitions={competencies.filter((item) => item.hito_id === panel).sort((a, b) => a.id.localeCompare(b.id))} scores={scores} setScores={setScores} summary={hitoSummary[panel]} savingId={savingId} onSave={saveScore} />
          )}

          {panel === "schedule" && mainTab === "history" && <ScheduleView hitos={hitos} schedules={schedules} setSchedules={setSchedules} summaries={hitoSummary} savingId={savingId} onSave={saveHito} />}
          {panel === "log" && mainTab === "history" && <LogView followups={followups} hitos={hitos} showForm={showFollowupForm} setShowForm={setShowFollowupForm} onAdd={addFollowup} onDelete={deleteFollowup} coordinatorName={coordinatorName} />}
          {panel === "improvement" && mainTab === "history" && <ImprovementView actions={actions} competencies={competencies} lowCompetencies={lowCompetencies} scores={scores} showForm={showActionForm} setShowForm={setShowActionForm} onAdd={addAction} onStatus={setActionStatus} onDelete={deleteAction} coordinatorName={coordinatorName} />}

          {(["quality","complementary","evidence","documents","certification"] as FinalizationMode[]).includes(panel as FinalizationMode) && mainTab !== "summary" && (
            <ExpedientFinalization mode={panel as FinalizationMode} teacher={teacher} accessMode={accessMode} coordinatorName={coordinatorName} operationalPercent={operationalPercent} operationalEvaluated={evaluatedCount} operationalCriticalGaps={totalCriticalGaps} onChanged={onChanged} />
          )}
        </div>
      </section>
    </div>
  );
}

function PhaseIntro({ phase, summary }: { phase: ProcessPhase; summary: PhaseSummary }) {
  const labels = {
    before: ["Antes", "Preparación previa al inicio de la docencia"],
    during: ["Durante", "Inicio, seguimiento y calidad durante la docencia"],
    after: ["Después", "Cierre, documentación y certificación"],
  } as const;
  return <section className={phaseStyles.phaseIntro}><div><h3>{labels[phase][0]}</h3><p>{labels[phase][1]}</p></div><div className={phaseStyles.phaseIntroStats}><span>Avance <b>{summary.percent}%</b></span><span>Criterios <b>{summary.completed}/{summary.total}</b></span><span>Brechas <b>{summary.criticalGaps}</b></span><span>Estado <b>{summary.status}</b></span></div></section>;
}

function SummaryView({ teacher, coordinatorName, hitos, summaries, phaseSummary, operationalPercent, totalCriticalGaps, onOpenPhase }: {
  teacher: Teacher;
  coordinatorName: string;
  hitos: HitoDefinition[];
  summaries: Record<string, HitoSummary>;
  phaseSummary: Record<ProcessPhase, PhaseSummary>;
  operationalPercent: number;
  totalCriticalGaps: number;
  onOpenPhase: (tab: MainTab) => void;
}) {
  const phaseInfo: Array<{ key: ProcessPhase; title: string; subtitle: string }> = [
    { key: "before", title: "Antes", subtitle: "H1 Inducción + H2 Preparación" },
    { key: "during", title: "Durante", subtitle: "H3 Inicio + H4/H5 Seguimiento" },
    { key: "after", title: "Después", subtitle: "H6 Cierre y certificación" },
  ];
  function tone(status: PhaseSummary["status"]) {
    if (status === "Cumple") return phaseStyles.good;
    if (status === "En mejora") return phaseStyles.danger;
    if (status === "En proceso") return phaseStyles.warning;
    return phaseStyles.neutral;
  }
  return <div className={styles.summaryGrid}>
    <section className={styles.card}><h3>Ficha del docente</h3><dl className={styles.definitionList}>
      <div><dt>Docente</dt><dd>{teacher.name}</dd></div><div><dt>Carrera</dt><dd>{teacher.career}</dd></div><div><dt>Asignatura(s)</dt><dd>{teacher.subject}</dd></div><div><dt>Modalidad</dt><dd>{teacher.modality}</dd></div><div><dt>Período</dt><dd>{teacher.period}</dd></div><div><dt>Coordinador</dt><dd>{coordinatorName}</dd></div><div><dt>Fecha de ingreso</dt><dd>{formatDate(teacher.entryDate)}</dd></div><div><dt>Inicio de actividades</dt><dd>{formatDate(teacher.activitiesStartDate)}</dd></div><div><dt>Cierre previsto</dt><dd>{formatDate(teacher.plannedCloseDate)}</dd></div><div><dt>Jornada(s)</dt><dd>{teacher.scheduleRanges.join(" · ") || "—"}</dd></div><div><dt>Correo</dt><dd>{teacher.email || "—"}</dd></div>
    </dl></section>
    <section className={styles.card}><h3>Resultado operativo</h3><div className={styles.bigNumber}>{operationalPercent}%</div><p className={styles.muted}>Resultado parcial con los criterios ya evaluados.</p><div className={styles.kpiLine}><span>Brechas críticas</span><strong className={totalCriticalGaps ? styles.redText : styles.greenText}>{totalCriticalGaps}</strong></div><div className={styles.kpiLine}><span>Estado del expediente</span><strong>{teacher.status}</strong></div></section>

    <section className={`${phaseStyles.summaryPhaseWrap} ${styles.card}`}><h3>Proceso por momentos</h3><div className={phaseStyles.phaseGrid}>{phaseInfo.map((item) => {
      const summary = phaseSummary[item.key];
      return <button key={item.key} className={phaseStyles.phaseCard} onClick={() => onOpenPhase(item.key)}><header><div><h3>{item.title}</h3><p>{item.subtitle}</p></div><strong>{summary.percent}%</strong></header><div className={phaseStyles.phaseMeta}><span>Criterios<b>{summary.completed}/{summary.total}</b></span><span>Brechas críticas<b>{summary.criticalGaps}</b></span></div><span className={`${phaseStyles.phaseStatus} ${tone(summary.status)}`}>{summary.status}</span></button>;
    })}</div></section>

    <section className={`${styles.card} ${styles.wide}`}><h3>Detalle H1–H6</h3><div className={styles.hitoCards}>{hitos.map((hito) => {
      const s = summaries[hito.id] ?? { average:null,criticalGaps:0,completed:0,total:0,verdict:"SIN EVALUAR" };
      return <article key={hito.id} className={styles.hitoCard}><div><strong>{hito.id} · {hito.title}</strong><span>{hito.moment}</span></div><div className={styles.hitoNumbers}><b>{s.average === null ? "—" : s.average.toFixed(2)}</b><small>{s.completed}/{s.total} criterios</small></div><span className={s.criticalGaps ? styles.dangerPill : s.completed === s.total && s.total ? styles.goodPill : styles.neutralPill}>{s.verdict}</span></article>;
    })}</div></section>
  </div>;
}

function HitoView({ hito, definitions, scores, setScores, summary, savingId, onSave }: {
  hito?: HitoDefinition;
  definitions: CompetencyDefinition[];
  scores: Record<string, ScoreRecord>;
  setScores: (value: Record<string, ScoreRecord> | ((current: Record<string, ScoreRecord>) => Record<string, ScoreRecord>)) => void;
  summary?: HitoSummary;
  savingId: string;
  onSave: (definition: CompetencyDefinition) => Promise<void>;
}) {
  if (!hito || !definitions.length) return <div className={styles.empty}><ClipboardList size={28}/><h3>Sin criterios cargados</h3><p>No existen criterios para este hito.</p></div>;
  return <><section className={styles.hitoHeader}><div><span>{hito.id}</span><div><h3>{hito.title}</h3><p>{hito.purpose}</p></div></div><div className={styles.hitoSummary}><strong>{summary?.average === null || summary?.average === undefined ? "—" : summary.average.toFixed(2)}</strong><small>Promedio</small><b>{summary?.criticalGaps ?? 0} brechas críticas</b><em>{summary?.verdict ?? "SIN EVALUAR"}</em></div></section>
    <section className={styles.card}><div className={styles.tableWrap}><table className={`${styles.table} ${styles.criteriaTable}`}><thead><tr><th>ID</th><th>Proceso</th><th>Competencia observable</th><th>Criticidad</th><th>Evidencia esperada</th><th>Puntaje</th><th>Estado</th><th>Observación</th><th></th></tr></thead><tbody>{definitions.map((def) => {
      const current = scores[def.id] ?? { competency_id:def.id,score:null,coordinator_observation:"" };
      const state = scoreState(current.score);
      return <tr key={def.id}><td><strong>{def.id}</strong><small>Peso {def.relative_weight}</small></td><td>{def.process}</td><td className={styles.competencyText}>{def.observable_competency}</td><td><span className={def.criticality === "Crítica" ? styles.critical : styles.neutral}>{def.criticality}</span></td><td>{def.expected_evidence || "—"}</td><td><select value={current.score === null ? "" : String(current.score)} onChange={(event) => setScores((curr) => ({ ...curr, [def.id]: { ...current, score:event.target.value === "" ? null : Number(event.target.value) } }))}><option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></td><td><span className={`${styles.statePill} ${state.className}`}>{state.label}</span></td><td><textarea rows={2} value={current.coordinator_observation} placeholder="Observación / conclusión" onChange={(event) => setScores((curr) => ({ ...curr, [def.id]: { ...current, coordinator_observation:event.target.value } }))}/></td><td><button className={styles.saveIcon} title={`Guardar ${def.id}`} onClick={() => void onSave(def)} disabled={savingId === def.id}>{savingId === def.id ? <Check size={15}/> : <Save size={15}/>}</button></td></tr>;
    })}</tbody></table></div></section></>;
}

function ScheduleView({ hitos, schedules, setSchedules, summaries, savingId, onSave }: {
  hitos: HitoDefinition[];
  schedules: HitoSchedule[];
  setSchedules: (value: HitoSchedule[] | ((current: HitoSchedule[]) => HitoSchedule[])) => void;
  summaries: Record<string, HitoSummary>;
  savingId: string;
  onSave: (hitoId: string) => Promise<void>;
}) {
  function patch(hitoId: string, values: Partial<HitoSchedule>) {
    setSchedules((current) => current.map((row) => row.hito_id === hitoId ? { ...row, ...values } : row));
  }
  const phaseLabel = (phase: HitoDefinition["phase"]) => phase === "before" ? "Antes" : phase === "during" ? "Durante" : "Después";
  return <section className={styles.card}><div className={styles.sectionHead}><div><h3>Cronograma H1–H6</h3><p>Los hitos siguen siendo institucionales; ahora se muestran agrupados por momento.</p></div></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Momento</th><th>Hito</th><th>Fecha programada</th><th>Fecha ejecutada</th><th>Validado</th><th>Resultado</th><th></th></tr></thead><tbody>{hitos.map((hito) => {
    const row = schedules.find((item) => item.hito_id === hito.id) ?? { hito_id:hito.id,scheduled_on:"",executed_on:"",coordinator_validated:false };
    return <tr key={hito.id}><td><strong>{phaseLabel(hito.phase)}</strong><small>{hito.moment}</small></td><td><strong>{hito.id} · {hito.title}</strong><small>{hito.purpose}</small></td><td><input type="date" value={row.scheduled_on} onChange={(event) => patch(hito.id,{ scheduled_on:event.target.value })}/></td><td><input type="date" value={row.executed_on} onChange={(event) => patch(hito.id,{ executed_on:event.target.value })}/></td><td><label className={styles.checkLabel}><input type="checkbox" checked={row.coordinator_validated} onChange={(event) => patch(hito.id,{ coordinator_validated:event.target.checked })}/>{row.coordinator_validated ? "Sí" : "No"}</label></td><td>{summaries[hito.id]?.verdict ?? "SIN EVALUAR"}</td><td><button className={styles.saveMini} onClick={() => void onSave(hito.id)} disabled={savingId === `hito-${hito.id}`}><Save size={14}/>{savingId === `hito-${hito.id}` ? "Guardando" : "Guardar"}</button></td></tr>;
  })}</tbody></table></div></section>;
}

function LogView({ followups, hitos, showForm, setShowForm, onAdd, onDelete, coordinatorName }: {
  followups: Followup[];
  hitos: HitoDefinition[];
  showForm: boolean;
  setShowForm: (value: boolean) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  coordinatorName: string;
}) {
  return <><div className={phaseStyles.historyNote}>La bitácora conserva el historial transversal de Antes, Durante y Después.</div><section className={styles.card}><div className={styles.sectionHead}><div><h3>Bitácora de seguimiento</h3><p>Intervenciones, hallazgos y compromisos del acompañamiento.</p></div><button className={styles.primary} onClick={() => setShowForm(!showForm)}><Plus size={14}/>{showForm ? "Cerrar" : "Nuevo seguimiento"}</button></div>
    {showForm && <form className={styles.formGrid} onSubmit={onAdd}><label>Fecha<input name="happened_on" type="date" required defaultValue={today()}/></label><label>Hito<select name="hito_id"><option value="">General</option>{hitos.map((hito) => <option key={hito.id} value={hito.id}>{hito.id} · {hito.title}</option>)}</select></label><label>Tipo<input name="followup_type" required placeholder="Revisión, tutoría, reunión..."/></label><label>Proceso<input name="process" placeholder="EVA, SISACAD, Teams..."/></label><label className={styles.full}>Hallazgo<textarea name="finding" required rows={3}/></label><label className={styles.full}>Compromiso / acción<textarea name="agreed_action" rows={2}/></label><label>Fecha compromiso<input name="commitment_due_on" type="date"/></label><label>Responsable<input name="responsible" defaultValue={coordinatorName}/></label><label className={styles.full}>Evidencia / enlace<input name="evidence_reference"/></label><label className={styles.checkbox}><input type="checkbox" name="teacher_conformity"/>Conformidad del docente</label><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowForm(false)}>Cancelar</button><button className={styles.primary}><Save size={14}/>Guardar</button></div></form>}
    {followups.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Fecha</th><th>Hito</th><th>Tipo</th><th>Hallazgo</th><th>Compromiso</th><th>Responsable</th><th></th></tr></thead><tbody>{followups.map((item) => <tr key={item.id}><td>{formatDate(item.happened_on)}</td><td>{item.hito_id ?? "General"}</td><td>{item.followup_type}<small>{item.process ?? ""}</small></td><td>{item.finding}</td><td>{item.agreed_action ?? "—"}<small>{formatDate(item.commitment_due_on)}</small></td><td>{item.responsible ?? "—"}</td><td><button className={styles.deleteIcon} onClick={() => void onDelete(item.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div> : <div className={styles.empty}><ClipboardList size={28}/><h3>Sin seguimientos</h3><p>Aún no existen registros de bitácora.</p></div>}
  </section></>;
}

function ImprovementView({ actions, competencies, lowCompetencies, scores, showForm, setShowForm, onAdd, onStatus, onDelete, coordinatorName }: {
  actions: ImprovementAction[];
  competencies: CompetencyDefinition[];
  lowCompetencies: CompetencyDefinition[];
  scores: Record<string, ScoreRecord>;
  showForm: boolean;
  setShowForm: (value: boolean) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onStatus: (action: ImprovementAction, status: ImprovementAction["status"]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  coordinatorName: string;
}) {
  const defMap = Object.fromEntries(competencies.map((item) => [item.id, item]));
  return <section className={styles.card}><div className={styles.sectionHead}><div><h3>Plan de mejora</h3><p>Acciones vinculadas a brechas de cualquier momento del proceso.</p></div><button className={styles.primary} onClick={() => setShowForm(!showForm)}><Plus size={14}/>{showForm ? "Cerrar" : "Nueva acción"}</button></div>
    {lowCompetencies.length > 0 && <div className={styles.breachStrip}><strong>{lowCompetencies.length}</strong><span>criterios con puntaje menor a 3</span><em>Disponibles para acciones de mejora</em></div>}
    {showForm && <form className={styles.formGrid} onSubmit={onAdd}><label className={styles.full}>Criterio<select name="competency_id"><option value="">Acción general</option>{lowCompetencies.map((def) => <option key={def.id} value={def.id}>{def.hito_id} · {def.id} · {def.observable_competency}</option>)}</select></label><label className={styles.full}>Acción de mejora<textarea name="action_text" required rows={3}/></label><label>Responsable<input name="responsible" required defaultValue={coordinatorName}/></label><label>Fecha compromiso<input type="date" name="due_on"/></label><div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowForm(false)}>Cancelar</button><button className={styles.primary}><Save size={14}/>Crear acción</button></div></form>}
    {actions.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Hito / ID</th><th>Competencia</th><th>Puntaje</th><th>Acción</th><th>Responsable</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>{actions.map((action) => {
      const def = action.competency_id ? defMap[action.competency_id] ?? null : null;
      const score = action.competency_id ? scores[action.competency_id]?.score : null;
      return <tr key={action.id}><td><strong>{def?.hito_id ?? "—"} · {action.competency_id ?? "General"}</strong></td><td>{def?.observable_competency ?? "Acción general"}</td><td>{score ?? "—"}</td><td>{action.action_text}</td><td>{action.responsible}</td><td>{formatDate(action.due_on)}</td><td><select value={action.status} onChange={(event) => void onStatus(action,event.target.value as ImprovementAction["status"])}><option value="pending">Pendiente</option><option value="in_progress">En proceso</option><option value="completed">Completada</option><option value="verified">Verificada</option></select></td><td><button className={styles.deleteIcon} onClick={() => void onDelete(action.id)}><Trash2 size={14}/></button></td></tr>;
    })}</tbody></table></div> : <div className={styles.empty}><ClipboardList size={28}/><h3>Sin acciones de mejora</h3><p>Cuando exista una brecha, cree la acción correspondiente.</p></div>}
  </section>;
}
