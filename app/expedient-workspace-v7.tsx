"use client";

import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileText,
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
type MainTab = "summary" | PhaseKey | "reports" | "history";
type HitoId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";
type ReportKey = "informe_induccion" | "informe_final";

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

type GeneratedDocument = {
  id: string;
  document_type: string;
  status: string;
  storage_path: string | null;
  verification_code: string | null;
  issued_on: string | null;
  generated_at: string;
  observation: string | null;
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

const sectionOrder: Record<PhaseKey, string[]> = {
  areas: ["Talento", "Software", "Calidad", "Bienestar Estudiantil"],
  before: ["Coordinador", "Teams", "Telegram", "PEA", "Adaptaciones", "EVA", "SISACAD"],
  during: ["General", "Adaptaciones", "Presentaciones", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4", "Observación de clase"],
  after: ["Cierre"],
};

const reportDefinitions: Array<{ key: ReportKey; title: string; description: string }> = [
  { key: "informe_induccion", title: "Informe de Inducción de los Procesos Académicos a Docente: Nuevos", description: "Integra H1 y H2: inducción institucional y preparación antes de la docencia." },
  { key: "informe_final", title: "Informe Final de Acompañamiento-Docente: Nuevos", description: "Integra el proceso completo de H1 a H6." },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function verificationCode() {
  return `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function evaluationLabel(record?: ScoreRecord) {
  if (!record || (record.score === null && !record.not_applicable)) return "Pendiente";
  if (record.not_applicable) return "No aplica";
  if ((record.score ?? 0) >= 3) return "Cumple";
  if (record.score === 2) return "En acompañamiento";
  return "Requiere mejora";
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
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [narratives, setNarratives] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<ReportKey | "">("");
  const [message, setMessage] = useState("");
  const [schemaWarning, setSchemaWarning] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaWarning("");

    const [criterionResult, scoreResult, evidenceResult, documentResult, narrativeResult, followupResult] = await Promise.all([
      supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,criticality,expected_evidence,relative_weight").eq("active", true).order("hito_id").order("id"),
      supabase.from("competency_scores").select("competency_id,score,not_applicable,coordinator_observation,evaluated_at").eq("expedient_id", teacher.id),
      supabase.from("evidences").select("id,hito_id,title,description,external_url,storage_path,happened_on,created_at").eq("expedient_id", teacher.id).order("created_at", { ascending: false }),
      supabase.from("generated_documents").select("id,document_type,status,storage_path,verification_code,issued_on,generated_at,observation").eq("expedient_id", teacher.id).order("generated_at", { ascending: false }),
      supabase.from("document_narratives").select("section_key,content").eq("expedient_id", teacher.id),
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
    setDocuments(documentResult.error ? [] : (documentResult.data ?? []) as GeneratedDocument[]);
    setNarratives(narrativeResult.error ? {} : Object.fromEntries((narrativeResult.data ?? []).map((row) => [row.section_key, row.content ?? ""])));
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

  async function resolveEvaluatorStaffId() {
    if (accessMode === "coordinator") return teacher.coordinatorId || null;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
    return data?.id ? String(data.id) : null;
  }

  async function openStored(path: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("siacd-evidence").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      setMessage(`No se pudo abrir el archivo: ${error?.message ?? "sin URL"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function criteriaForPhase(phase: PhaseKey) {
    return criteria.filter((item) => phaseHitos[phase].includes(item.hito_id));
  }

  function evidenceCountForPhase(phase: PhaseKey) {
    return evidences.filter((item) => item.hito_id && phaseHitos[phase].includes(item.hito_id as HitoId)).length;
  }

  async function generateReport(reportKey: ReportKey) {
    const definition = reportDefinitions.find((item) => item.key === reportKey)!;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setGenerating(reportKey);

    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      let y = 18;
      const margin = 16;
      const width = 178;
      const isConsolidated = reportKey === "informe_final";
      const allApproved = (Object.keys(phaseSummaries) as PhaseKey[]).every((phase) => phaseSummaries[phase].resolved === phaseSummaries[phase].total && phaseSummaries[phase].total > 0);
      const phaseApproved = reportKey === "informe_induccion"
        ? (["areas", "before"] as PhaseKey[]).every((phase) => phaseSummaries[phase].total > 0 && phaseSummaries[phase].resolved === phaseSummaries[phase].total)
        : allApproved;
      const draft = !phaseApproved;
      const version = documents.filter((item) => item.document_type === reportKey && item.status !== "void").length + 1;
      const code = verificationCode();
      const evaluatorStaffId = await resolveEvaluatorStaffId();

      const ensure = (needed = 12) => {
        if (y + needed > 276) {
          pdf.addPage();
          y = 18;
        }
      };
      const text = (value: string, size = 9, bold = false, indent = 0) => {
        ensure(8);
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(value || "—", width - indent);
        if (y + lines.length * 4.5 > 276) {
          pdf.addPage();
          y = 18;
        }
        pdf.text(lines, margin + indent, y);
        y += lines.length * 4.5 + 1.5;
      };
      const sectionTitle = (value: string) => {
        ensure(14);
        y += 3;
        pdf.setFillColor(238, 242, 246);
        pdf.rect(margin, y - 5, width, 9, "F");
        pdf.setTextColor(25, 42, 58);
        text(value, 11, true, 2);
        y += 1;
      };
      const metaLine = (label: string, value: string) => {
        ensure(7);
        pdf.setFontSize(8.5);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${label}:`, margin, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(pdf.splitTextToSize(value || "—", 130), margin + 42, y);
        y += 5;
      };

      pdf.setFillColor(7, 28, 52);
      pdf.rect(0, 0, 210, 28, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("SIACD", margin, 11);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.text("Sistema Integral de Acompañamiento Docente · ITSQMET", margin, 19);
      y = 39;
      pdf.setTextColor(25, 42, 58);
      text(`${definition.title}${draft ? " · BORRADOR" : ""}`, 15, true);
      metaLine("Docente", teacher.name);
      metaLine("Carrera", teacher.career);
      metaLine("Asignatura", teacher.subject);
      metaLine("Período", teacher.period);
      metaLine("Modalidad", teacher.modality);
      metaLine("Responsable", accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "—");
      metaLine("Fecha", formatDate(today()));
      metaLine("Versión", String(version));

      const addPhaseDetail = (phase: PhaseKey) => {
        const summary = phaseSummaries[phase];
        sectionTitle(`${phaseLabels[phase].title} · ${summary.percent}% · ${summary.status}`);
        text(`Aprobados: ${summary.resolved}/${summary.total} criterios (${summary.progress}%). Evaluados: ${summary.evaluated}/${summary.total}. Brechas críticas: ${summary.criticalGaps}. Evidencias históricas registradas: ${evidenceCountForPhase(phase)}.`, 8.5);
        const defs = criteriaForPhase(phase);
        const grouped = new Map<string, CompetencyDefinition[]>();
        for (const def of defs) {
          const list = grouped.get(def.process) ?? [];
          list.push(def);
          grouped.set(def.process, list);
        }
        const ordered = [...grouped.keys()].sort((a, b) => {
          const ai = sectionOrder[phase].indexOf(a);
          const bi = sectionOrder[phase].indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
        });
        for (const group of ordered) {
          ensure(12);
          text(group, 10, true);
          for (const def of grouped.get(group) ?? []) {
            const record = scores[def.id];
            const label = evaluationLabel(record);
            const obs = record?.coordinator_observation ? ` Observación: ${record.coordinator_observation}` : "";
            text(`• ${def.observable_competency} — ${label}.${obs}`, 8.2, false, 2);
          }
        }
      };

      if (reportKey === "informe_induccion") {
        addPhaseDetail("areas");
        addPhaseDetail("before");
      } else {
        sectionTitle("Resultado global");
        text(`Cumplimiento global: ${globalSummary.percent}%. Aprobados: ${globalSummary.resolved}/${globalSummary.total} criterios (${globalSummary.progress}%). Evaluados: ${globalSummary.evaluated}/${globalSummary.total}. Brechas críticas: ${globalSummary.criticalGaps}.`, 9);
        for (const phase of ["areas", "before", "during", "after"] as PhaseKey[]) {
          const summary = phaseSummaries[phase];
          text(`${phaseLabels[phase].title}: ${summary.percent}% · ${summary.status} · ${summary.resolved}/${summary.total} aprobados.`, 9, true);
        }

        const low = criteria.filter((def) => {
          const record = scores[def.id];
          return !record?.not_applicable && record?.score !== null && record?.score !== undefined && record.score < 3;
        });
        if (low.length) {
          sectionTitle("Aspectos que requieren mejora");
          for (const def of low.slice(0, 30)) {
            const phase = phaseForHito(def.hito_id);
            text(`• ${phase ? phaseLabels[phase].title : "Proceso"} / ${def.process}: ${def.observable_competency}${scores[def.id]?.coordinator_observation ? ` — ${scores[def.id].coordinator_observation}` : ""}`, 8.4, false, 2);
          }
          if (low.length > 30) text(`Se registran ${low.length - 30} hallazgos adicionales en los informes de etapa.`, 8.2);
        }

        if (narratives.strengths) {
          sectionTitle("Fortalezas");
          text(narratives.strengths, 9);
        }
        if (narratives.gaps) {
          sectionTitle("Brechas y compromisos");
          text(narratives.gaps, 9);
        }
        if (narratives.conclusion) {
          sectionTitle("Conclusión y recomendación");
          text(narratives.conclusion, 9);
        }
      }

      if (draft) {
        sectionTitle("Estado del documento");
        text(reportKey === "informe_induccion"
          ? "BORRADOR: H1 y/o H2 todavía tienen criterios pendientes o con calificación menor a 3. El informe de inducción será oficial cuando todos sus criterios aplicables estén aprobados."
          : "BORRADOR: existen criterios pendientes o con calificación menor a 3. El informe final será oficial cuando todos los criterios aplicables de Áreas, Antes, Durante y Después estén aprobados.", 9, true);
      }

      ensure(12);
      y += 4;
      pdf.setDrawColor(180, 188, 196);
      pdf.line(margin, y, margin + width, y);
      y += 5;
      text(`Código de verificación: ${code}`, 7.5);
      text(`Generado por SIACD · ${formatDate(today())} · Versión ${version}`, 7.5);

      const blob = pdf.output("blob");
      const storagePath = `${teacher.id}/documents/${reportKey}-v${version}-${Date.now()}.pdf`;
      let registered = false;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (!uploadError) {
        const { error: documentError } = await supabase.from("generated_documents").insert({
          expedient_id: teacher.id,
          document_type: reportKey,
          status: "generated",
          storage_path: storagePath,
          verification_code: code,
          generated_by: null,
          generated_by_staff_id: evaluatorStaffId,
          issued_on: today(),
          observation: `${draft ? "BORRADOR" : "OFICIAL"} · Versión ${version}`,
        });
        if (!documentError) registered = true;
        else await supabase.storage.from("siacd-evidence").remove([storagePath]);
      }

      pdf.save(`${safeName(definition.title.toLowerCase())}-${safeName(teacher.name.toLowerCase())}-v${version}.pdf`);
      setMessage(registered ? `${definition.title} generado, descargado y registrado.` : `${definition.title} descargado. No se pudo registrar en Supabase.`);
      if (registered) await load();
    } catch (error) {
      setMessage(`No se pudo generar el PDF: ${error instanceof Error ? error.message : "error inesperado"}`);
    } finally {
      setGenerating("");
    }
  }

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
        <button className={tab === "reports" ? styles.active : ""} onClick={() => setTab("reports")}>Informes</button>
        <button className={tab === "history" ? styles.active : ""} onClick={() => setTab("history")}><History size={14}/>Historial</button>
      </nav>

      <main className={styles.content}>
        {tab === "summary" && <SummaryView teacher={teacher} phaseSummaries={phaseSummaries} globalSummary={globalSummary} onOpen={setTab}/>} 

        {(["areas", "before", "during", "after"] as PhaseKey[]).includes(tab as PhaseKey) && <StaffCriterionEvaluationWorkspace teacher={teacher} phase={tab as PhaseKey} accessMode={accessMode} onChanged={handleCriterionChanged}/>} 

        {tab === "reports" && <ReportsView documents={documents} generating={generating} phaseSummaries={phaseSummaries} onGenerate={generateReport} onOpenStored={openStored}/>} 

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
      <button onClick={() => onOpen("reports")}><FileText size={17}/>Generar los 2 informes</button>
      <button onClick={() => onOpen("history")}><History size={17}/>Revisar historial</button>
    </section>
  </div>;
}

function ReportsView({ documents, generating, phaseSummaries, onGenerate, onOpenStored }: {
  documents: GeneratedDocument[];
  generating: ReportKey | "";
  phaseSummaries: Record<PhaseKey, PhaseSummary>;
  onGenerate: (key: ReportKey) => Promise<void>;
  onOpenStored: (path: string) => Promise<void>;
}) {
  const allComplete = (Object.keys(phaseSummaries) as PhaseKey[]).every((phase) => phaseSummaries[phase].resolved === phaseSummaries[phase].total && phaseSummaries[phase].total > 0);
  const officialDocuments = documents.filter((item) => reportDefinitions.some((def) => def.key === item.document_type));

  return <div className={styles.reportsRoot}>
    <section className={styles.reportsIntro}>
      <div><span>DOCUMENTACIÓN</span><h3>Informes PDF</h3><p>Un informe solo es oficial cuando todos sus criterios aplicables están aprobados con 3/4, 4/4 o No aplica aprobado.</p></div>
      <div className={allComplete ? styles.ready : styles.draft}><CheckCircle2 size={17}/><span>{allComplete ? "Expediente completo: informe final oficial habilitado." : "El informe final se generará como BORRADOR mientras existan pendientes o notas menores a 3."}</span></div>
    </section>

    <section className={styles.reportGrid}>
      {reportDefinitions.map((def) => <article className={styles.reportCard} key={def.key}>
        <FileText size={22}/>
        <div><strong>{def.title}</strong><p>{def.description}</p></div>
        <button disabled={Boolean(generating)} onClick={() => void onGenerate(def.key)}>{generating === def.key ? "Generando…" : "Generar PDF"}</button>
      </article>)}
    </section>

    <section className={styles.card}>
      <div className={styles.sectionHead}><div><h3>Informes generados</h3><p>Historial de versiones registradas en el expediente.</p></div></div>
      {officialDocuments.length === 0 ? <div className={styles.empty}>Todavía no se han generado informes con la nueva estructura.</div> : <div className={styles.documentList}>{officialDocuments.map((item) => <article key={item.id}>
        <div><strong>{reportDefinitions.find((def) => def.key === item.document_type)?.title ?? item.document_type}</strong><small>{formatDate(item.issued_on ?? item.generated_at)} · {item.observation ?? item.status}</small></div>
        <div><code>{item.verification_code ?? "Sin código"}</code>{item.storage_path && <button onClick={() => void onOpenStored(item.storage_path!)}><Download size={14}/>Abrir</button>}</div>
      </article>)}</div>}
    </section>
  </div>;
}
