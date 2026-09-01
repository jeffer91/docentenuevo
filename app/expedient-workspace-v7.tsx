"use client";

import {
  AlertTriangle,
  ChevronLeft,
  History,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import EvidenceReviewWorkspace from "./evidence-review-workspace";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import StaffCriterionEvaluationWorkspace from "./staff-criterion-evaluation-workspace";
import styles from "./expedient-workspace-v6.module.css";

type PhaseKey = "areas" | "before" | "during" | "after";
type MainTab = "summary" | PhaseKey | "history";
type HitoId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";

type CompetencyDefinition = {
  id: string;
  hito_id: HitoId;
  process: string;
  observable_competency: string;
  criticality: "Crítica" | "Importante" | "Deseable";
  expected_evidence: string | null;
  relative_weight: number;
};

type ScoreRecord = {
  competency_id: string;
  score: number | null;
  not_applicable: boolean;
  coordinator_observation: string;
  evaluated_at: string | null;
};

type Evidence = {
  id: string;
  hito_id: string | null;
  title: string;
  description: string | null;
  external_url: string | null;
  storage_path: string | null;
  happened_on: string | null;
  created_at: string;
};

type Followup = {
  id: string;
  happened_on: string;
  hito_id: string | null;
  followup_type: string;
  finding: string;
  agreed_action: string | null;
};

type PhaseSummary = {
  percent: number;
  progress: number;
  resolved: number;
  evaluated: number;
  total: number;
  applicable: number;
  criticalGaps: number;
  status: "No iniciado" | "En proceso" | "En mejora" | "Cumple";
};

const phaseHitos: Record<PhaseKey, HitoId[]> = {
  areas: ["H1"],
  before: ["H2"],
  during: ["H3", "H4", "H5"],
  after: ["H6"],
};

const phaseLabels: Record<PhaseKey, { title: string; description: string }> = {
  areas: { title: "Áreas", description: "Inducción institucional por las áreas responsables." },
  before: { title: "Antes", description: "Preparación y verificación previa al inicio de la asignatura." },
  during: { title: "Durante", description: "Seguimiento académico, unidades y observación de clase." },
  after: { title: "Después", description: "Cierre académico e informes finales del período." },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function phaseForHito(hitoId: string): PhaseKey | null {
  if (hitoId === "H1") return "areas";
  if (hitoId === "H2") return "before";
  if (["H3", "H4", "H5"].includes(hitoId)) return "during";
  if (hitoId === "H6") return "after";
  return null;
}

export default function ExpedientWorkspaceV7({ teacher, accessMode, coordinatorName, onClose, onChanged }: {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<MainTab>("summary");
  const [criteria, setCriteria] = useState<CompetencyDefinition[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreRecord>>({});
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [schemaWarning, setSchemaWarning] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaWarning("");

    const [criterionResult, scoreResult, evidenceResult, followupResult] = await Promise.all([
      supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,criticality,expected_evidence,relative_weight").eq("active", true).order("hito_id").order("id"),
      supabase.from("competency_scores").select("competency_id,score,not_applicable,coordinator_observation,evaluated_at").eq("expedient_id", teacher.id),
      supabase.from("evidences").select("id,hito_id,title,description,external_url,storage_path,happened_on,created_at").eq("expedient_id", teacher.id).order("created_at", { ascending: false }),
      supabase.from("followups").select("id,happened_on,hito_id,followup_type,finding,agreed_action").eq("expedient_id", teacher.id).order("happened_on", { ascending: false }),
    ]);

    const requiredError = criterionResult.error || scoreResult.error;
    if (requiredError) {
      setMessage(`No se pudo cargar el expediente: ${requiredError.message}`);
      setLoading(false);
      return;
    }

    const loadedCriteria = (criterionResult.data ?? []) as CompetencyDefinition[];
    if (!loadedCriteria.some((item) => item.id.startsWith("AR-"))) {
      setSchemaWarning("El catálogo activo de Supabase no corresponde todavía a Áreas, Antes, Durante y Después.");
    }
    setCriteria(loadedCriteria.map((item) => ({ ...item, relative_weight: Number(item.relative_weight) || 1 })));

    const scoreMap: Record<string, ScoreRecord> = {};
    for (const row of scoreResult.data ?? []) {
      scoreMap[row.competency_id] = {
        competency_id: row.competency_id,
        score: row.score === null ? null : Number(row.score),
        not_applicable: Boolean(row.not_applicable),
        coordinator_observation: row.coordinator_observation ?? "",
        evaluated_at: row.evaluated_at ?? null,
      };
    }
    setScores(scoreMap);
    setEvidences(evidenceResult.error ? [] : (evidenceResult.data ?? []) as Evidence[]);
    setFollowups(followupResult.error ? [] : (followupResult.data ?? []) as Followup[]);
    setLoading(false);
  }, [teacher.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const phaseSummaries = useMemo(() => {
    const result = {} as Record<PhaseKey, PhaseSummary>;
    for (const phase of Object.keys(phaseHitos) as PhaseKey[]) {
      const defs = criteria.filter((item) => phaseHitos[phase].includes(item.hito_id));
      let approved = 0;
      let evaluated = 0;
      let weighted = 0;
      let usedWeight = 0;
      let applicable = 0;
      let criticalGaps = 0;
      let lowScores = 0;
      for (const def of defs) {
        const record = scores[def.id];
        if (record?.not_applicable) {
          approved += 1;
          evaluated += 1;
          continue;
        }
        applicable += 1;
        if (record?.score !== null && record?.score !== undefined) {
          evaluated += 1;
          weighted += record.score * def.relative_weight;
          usedWeight += def.relative_weight;
          if (record.score >= 3) approved += 1;
          else lowScores += 1;
          if (def.criticality === "Crítica" && record.score < 3) criticalGaps += 1;
        }
      }
      const percent = usedWeight ? Math.round((weighted / usedWeight / 4) * 100) : 0;
      const progress = defs.length ? Math.round((approved / defs.length) * 100) : 0;
      const status: PhaseSummary["status"] = evaluated === 0
        ? "No iniciado"
        : approved === defs.length && defs.length > 0
          ? "Cumple"
          : lowScores > 0
            ? "En mejora"
            : "En proceso";
      result[phase] = { percent, progress, resolved: approved, evaluated, total: defs.length, applicable, criticalGaps, status };
    }
    return result;
  }, [criteria, scores]);

  const globalSummary = useMemo(() => {
    let weighted = 0;
    let usedWeight = 0;
    let approved = 0;
    let evaluated = 0;
    let total = 0;
    let criticalGaps = 0;
    for (const def of criteria) {
      total += 1;
      const record = scores[def.id];
      if (record?.not_applicable) {
        approved += 1;
        evaluated += 1;
        continue;
      }
      if (record?.score !== null && record?.score !== undefined) {
        evaluated += 1;
        if (record.score >= 3) approved += 1;
        weighted += record.score * def.relative_weight;
        usedWeight += def.relative_weight;
        if (def.criticality === "Crítica" && record.score < 3) criticalGaps += 1;
      }
    }
    return {
      percent: usedWeight ? Math.round((weighted / usedWeight / 4) * 100) : 0,
      progress: total ? Math.round((approved / total) * 100) : 0,
      resolved: approved,
      evaluated,
      total,
      criticalGaps,
    };
  }, [criteria, scores]);

  async function handleCriterionChanged() {
    await load();
    await onChanged();
  }

  if (loading) {
    return <div className={styles.backdrop}><div className={styles.loading}>Cargando expediente…</div></div>;
  }

  return <div className={styles.backdrop}>
    <section className={styles.workspace} role="dialog" aria-modal="true" aria-label={`Expediente de ${teacher.name}`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <button className={styles.backButton} onClick={onClose} aria-label="Cerrar expediente"><ChevronLeft size={18}/></button>
          <div><span className={styles.eyebrow}>EXPEDIENTE DOCENTE · ÁREAS / ANTES / DURANTE / DESPUÉS</span><h2>{teacher.name}</h2><p>{teacher.career} · {teacher.subject}</p></div>
        </div>
        <div className={styles.headerStats}>
          <span><b>{globalSummary.progress}%</b><small>aprobado</small></span>
          <span><b>{globalSummary.percent}%</b><small>cumplimiento</small></span>
          <span><b>{globalSummary.criticalGaps}</b><small>brechas</small></span>
          <span className={styles.role}>{accessMode === "admin" ? "Administrador" : coordinatorName}</span>
        </div>
        <button className={styles.iconClose} onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
      </header>

      {schemaWarning && <div className={styles.schemaWarning}><AlertTriangle size={16}/><span>{schemaWarning}</span></div>}
      {message && <div className={styles.message}>{message}</div>}

      <nav className={styles.mainNav}>
        <button className={tab === "summary" ? styles.active : ""} onClick={() => setTab("summary")}>Resumen</button>
        {(["areas", "before", "during", "after"] as PhaseKey[]).map((phase) => <button key={phase} className={tab === phase ? styles.active : ""} onClick={() => setTab(phase)}>{phaseLabels[phase].title}<span>{phaseSummaries[phase].progress}%</span></button>)}
        <button className={tab === "history" ? styles.active : ""} onClick={() => setTab("history")}><History size={14}/>Historial</button>
      </nav>

      <main className={styles.content}>
        {tab === "summary" && <SummaryView teacher={teacher} phaseSummaries={phaseSummaries} globalSummary={globalSummary} onOpen={setTab}/>} 

        {(["areas", "before", "during", "after"] as PhaseKey[]).includes(tab as PhaseKey) && <StaffCriterionEvaluationWorkspace teacher={teacher} phase={tab as PhaseKey} accessMode={accessMode} onChanged={handleCriterionChanged}/>} 

        {tab === "history" && <div className={styles.historyGrid}>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Bitácora reciente</h3><p>Seguimientos registrados durante el acompañamiento.</p></div></div>
            {followups.length === 0 ? <div className={styles.empty}>No existen seguimientos registrados.</div> : <div className={styles.followupList}>{followups.slice(0, 12).map((item) => <article key={item.id}><strong>{formatDate(item.happened_on)} · {item.hito_id ?? "General"}</strong><p>{item.finding}</p>{item.agreed_action && <small>Acción: {item.agreed_action}</small>}</article>)}</div>}
          </section>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Evidencias históricas / manuales</h3><p>Solicitudes creadas con el flujo anterior. Las evidencias de los 129 criterios se revisan ahora dentro de cada etapa.</p></div></div>
            <EvidenceReviewWorkspace teacher={teacher} coordinatorName={coordinatorName}/>
          </section>
        </div>}
      </main>
    </section>
  </div>;
}

function SummaryView({ teacher, phaseSummaries, globalSummary, onOpen }: {
  teacher: Teacher;
  phaseSummaries: Record<PhaseKey, PhaseSummary>;
  globalSummary: { percent: number; progress: number; resolved: number; evaluated: number; total: number; criticalGaps: number };
  onOpen: (tab: MainTab) => void;
}) {
  return <div className={styles.summaryRoot}>
    <section className={styles.profileCard}>
      <div><span>Docente</span><strong>{teacher.name}</strong></div>
      <div><span>Período</span><strong>{teacher.period}</strong></div>
      <div><span>Modalidad</span><strong>{teacher.modality || "—"}</strong></div>
      <div><span>Estado</span><strong>{teacher.status}</strong></div>
    </section>

    <section className={styles.globalCard}>
      <div><span>Criterios aprobados</span><strong>{globalSummary.progress}%</strong></div>
      <div className={styles.progressBar}><span style={{ width: `${globalSummary.progress}%` }}/></div>
      <p>{globalSummary.resolved}/{globalSummary.total} aprobados · {globalSummary.evaluated}/{globalSummary.total} evaluados · {globalSummary.criticalGaps} brechas críticas.</p>
    </section>

    <section className={styles.phaseCards}>
      {(["areas", "before", "during", "after"] as PhaseKey[]).map((phase) => {
        const item = phaseSummaries[phase];
        return <button key={phase} className={styles.phaseCard} onClick={() => onOpen(phase)}>
          <div className={styles.phaseCardHead}><div><span>{phaseLabels[phase].title}</span><small>{phaseLabels[phase].description}</small></div><strong>{item.progress}%</strong></div>
          <div className={styles.progressBar}><span style={{ width: `${item.progress}%` }}/></div>
          <div className={styles.phaseMeta}><span>{item.resolved}/{item.total} aprobados</span><span>{item.evaluated}/{item.total} evaluados</span><b>{item.status}</b></div>
        </button>;
      })}
    </section>

    <section className={styles.quickActions}>
      <button onClick={() => onOpen("history")}><History size={17}/>Revisar historial</button>
    </section>
  </div>;
}
