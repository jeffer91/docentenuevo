"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./staff-criterion-evaluation-workspace.module.css";

export type StaffEvaluationPhase = "areas" | "before" | "during" | "after";

type EvidenceItem = {
  id: string;
  position: number;
  kind: "image" | "file" | "link";
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  external_url: string | null;
};

type Submission = {
  id: string;
  version: number;
  teacher_comment: string | null;
  status: "submitted" | "correction_required" | "approved" | "superseded";
  submitted_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
  items: EvidenceItem[];
};

type EvidenceRequest = {
  id: string;
  status: "pending" | "submitted" | "in_review" | "correction_required" | "approved" | "cancelled";
  title: string;
  instructions: string | null;
  origin: string;
  submissions: Submission[];
};

type NaRequest = {
  id: string;
  justification: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  review_comment: string | null;
  reviewed_at: string | null;
};

type Score = {
  score: number | null;
  not_applicable: boolean;
  observation: string | null;
  evaluated_at: string | null;
};

type Criterion = {
  id: string;
  hito_id: string;
  process: string;
  label: string;
  criticality: string;
  expected_evidence: string | null;
  score: Score | null;
  na_request: NaRequest | null;
  request: EvidenceRequest | null;
};

type WorkspaceData = {
  criteria: Criterion[];
  total: number;
  na_pending: number;
};

const sectionOrder: Record<StaffEvaluationPhase, string[]> = {
  areas: ["Talento", "Software", "Calidad", "Bienestar Estudiantil"],
  before: ["Coordinador", "Teams", "Telegram", "PEA", "Adaptaciones", "EVA", "SISACAD"],
  during: ["General", "Adaptaciones", "Presentaciones", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4", "Observación de clase"],
  after: ["Cierre"],
};

const phaseLabels: Record<StaffEvaluationPhase, string> = {
  areas: "Áreas",
  before: "Antes",
  during: "Durante",
  after: "Después",
};

function phaseForHito(hitoId: string): StaffEvaluationPhase {
  if (hitoId === "H1") return "areas";
  if (hitoId === "H2") return "before";
  if (hitoId === "H6") return "after";
  return "during";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function bytesLabel(value?: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function latestSubmission(criterion: Criterion) {
  return criterion.request?.submissions?.[0] ?? null;
}

function isFreshSubmission(criterion: Criterion) {
  const latest = latestSubmission(criterion);
  return Boolean(
    latest
    && latest.status === "submitted"
    && !latest.reviewed_at
    && ["submitted", "in_review"].includes(criterion.request?.status ?? ""),
  );
}

function criterionState(criterion: Criterion) {
  if (criterion.score?.not_applicable || criterion.na_request?.status === "approved") {
    return { key: "na", label: "No aplica aprobado" } as const;
  }
  if (criterion.request?.status === "approved" || (criterion.score?.score ?? -1) >= 3) {
    return { key: "approved", label: "Aprobado" } as const;
  }
  if (criterion.na_request?.status === "pending") {
    return { key: "naPending", label: "No aplica solicitado" } as const;
  }
  if (criterion.request?.status === "correction_required" || ((criterion.score?.score ?? 3) < 3 && criterion.score?.evaluated_at)) {
    return { key: "correction", label: "Requiere corrección" } as const;
  }
  if (["submitted", "in_review"].includes(criterion.request?.status ?? "")) {
    return { key: "submitted", label: "Enviado · revisar" } as const;
  }
  return { key: "pending", label: "Pendiente de evidencia" } as const;
}

export default function StaffCriterionEvaluationWorkspace({
  teacher,
  phase,
  accessMode,
  onChanged,
}: {
  teacher: Teacher;
  phase: StaffEvaluationPhase;
  accessMode: AccessMode;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<WorkspaceData>({ criteria: [], total: 0, na_pending: 0 });
  const [staffId, setStaffId] = useState("");
  const [openCriterion, setOpenCriterion] = useState("");
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [naComments, setNaComments] = useState<Record<string, string>>({});
  const [itemUrls, setItemUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const resolveStaffId = useCallback(async () => {
    if (accessMode === "coordinator") return teacher.coordinatorId || "";
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "";
    const { data: row } = await supabase
      .from("siacd_staff")
      .select("id")
      .eq("role", "admin")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    return row?.id ? String(row.id) : "";
  }, [accessMode, teacher.coordinatorId]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const resolvedStaffId = await resolveStaffId();
    setStaffId(resolvedStaffId);
    if (!resolvedStaffId) {
      setMessage("No se pudo identificar al responsable que realizará la evaluación.");
      setLoading(false);
      return;
    }
    const { data: result, error } = await supabase.rpc("staff_criterion_evidence_workspace", {
      p_expedient_id: teacher.id,
      p_staff_id: resolvedStaffId,
    });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudo cargar las evidencias de los criterios.");
      return;
    }
    setData(result as WorkspaceData);
  }, [resolveStaffId, teacher.id]);

  useEffect(() => { void load(); }, [load]);

  const phaseCriteria = useMemo(
    () => data.criteria.filter((criterion) => phaseForHito(criterion.hito_id) === phase),
    [data.criteria, phase],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Criterion[]>();
    for (const criterion of phaseCriteria) {
      const list = map.get(criterion.process) ?? [];
      list.push(criterion);
      map.set(criterion.process, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = sectionOrder[phase].indexOf(a);
      const bi = sectionOrder[phase].indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
    });
  }, [phase, phaseCriteria]);

  const metrics = useMemo(() => {
    let sent = 0;
    let approved = 0;
    let corrections = 0;
    let waiting = 0;
    let naPending = 0;
    for (const criterion of phaseCriteria) {
      if (latestSubmission(criterion)) sent += 1;
      const state = criterionState(criterion);
      if (state.key === "approved" || state.key === "na") approved += 1;
      if (state.key === "correction") corrections += 1;
      if (state.key === "submitted") waiting += 1;
      if (state.key === "naPending") naPending += 1;
    }
    return { total: phaseCriteria.length, sent, approved, corrections, waiting, naPending };
  }, [phaseCriteria]);

  async function signedItemUrl(item: EvidenceItem) {
    if (item.kind === "link") return item.external_url ?? "";
    if (itemUrls[item.id]) return itemUrls[item.id];
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return "";
    const { data: result, error } = await supabase.functions.invoke("teacher-evidence", {
      body: { action: "staff-item-signed-url", staff_id: staffId, item_id: item.id },
    });
    const url = (result as { url?: string } | null)?.url ?? "";
    if (!error && url) setItemUrls((current) => ({ ...current, [item.id]: url }));
    return error ? "" : url;
  }

  async function toggleCriterion(criterion: Criterion) {
    const next = openCriterion === criterion.id ? "" : criterion.id;
    setOpenCriterion(next);
    if (!next) return;
    const latest = latestSubmission(criterion);
    const images = latest?.items.filter((item) => item.kind === "image") ?? [];
    await Promise.all(images.map((item) => signedItemUrl(item)));
  }

  async function openItem(item: EvidenceItem) {
    const url = await signedItemUrl(item);
    if (!url) {
      setMessage("No se pudo abrir esta evidencia.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function evaluate(criterion: Criterion) {
    if (!staffId || !isFreshSubmission(criterion)) return;
    const scoreText = scoreDrafts[criterion.id] ?? "";
    const score = Number(scoreText);
    const observation = (observations[criterion.id] ?? "").trim();
    if (!scoreText || !Number.isInteger(score) || score < 0 || score > 4) {
      setMessage("Seleccione una calificación entre 0 y 4.");
      return;
    }
    if (score < 3 && !observation) {
      setMessage("Para una calificación de 0, 1 o 2 debe indicar qué debe corregir el docente.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`score-${criterion.id}`);
    const { data: result, error } = await supabase.rpc("staff_evaluate_criterion_submission", {
      p_expedient_id: teacher.id,
      p_criterion_id: criterion.id,
      p_staff_id: staffId,
      p_score: score,
      p_observation: observation || null,
    });
    setBusy("");
    if (error || !(result as { ok?: boolean } | null)?.ok) {
      const code = error?.message ?? "";
      setMessage(
        code.includes("evidence_required") ? "El docente todavía no ha enviado evidencia para este criterio."
          : code.includes("submission_not_pending") ? "Esta entrega ya fue revisada o fue reemplazada. Actualice la vista."
            : code.includes("comment_required") ? "Debe escribir una observación cuando la calificación es menor a 3."
              : `No se pudo guardar la evaluación${error?.message ? `: ${error.message}` : "."}`,
      );
      return;
    }
    setScoreDrafts((current) => ({ ...current, [criterion.id]: "" }));
    setObservations((current) => ({ ...current, [criterion.id]: "" }));
    setMessage(score >= 3 ? "Criterio aprobado. La entrega quedó cerrada." : "Evaluación guardada. El docente verá la observación y deberá realizar una nueva entrega.");
    await load();
    await onChanged?.();
  }

  async function reviewNa(criterion: Criterion, decision: "approved" | "rejected") {
    const request = criterion.na_request;
    if (!request || request.status !== "pending" || !staffId) return;
    const comment = (naComments[criterion.id] ?? "").trim();
    if (decision === "rejected" && !comment) {
      setMessage("Para rechazar la solicitud indique por qué el criterio sí debe cumplirse.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`na-${decision}-${criterion.id}`);
    const { error } = await supabase.rpc("staff_review_not_applicable", {
      p_request_id: request.id,
      p_staff_id: staffId,
      p_decision: decision,
      p_comment: comment || null,
    });
    setBusy("");
    if (error) {
      setMessage(`No se pudo revisar la solicitud de No aplica: ${error.message}`);
      return;
    }
    setNaComments((current) => ({ ...current, [criterion.id]: "" }));
    setMessage(decision === "approved" ? "No aplica aprobado. El criterio queda cerrado sin afectar el avance." : "Solicitud rechazada. El docente deberá presentar evidencia.");
    await load();
    await onChanged?.();
  }

  if (loading) {
    return <div className={styles.loading}><Loader2 size={18}/><span>Cargando evidencias y evaluaciones…</span></div>;
  }

  return <div className={styles.root}>
    <section className={styles.topline}>
      <div><span>EVALUACIÓN INTEGRADA</span><h3>{phaseLabels[phase]}</h3><p>Revise la evidencia del docente y califique el mismo criterio. Una nota de 3 o 4 aprueba; 0, 1 o 2 genera corrección automática.</p></div>
      <button onClick={() => void load()}><RefreshCw size={15}/>Actualizar</button>
    </section>

    {message && <div className={styles.message}><AlertCircle size={16}/><span>{message}</span></div>}

    <section className={styles.metrics}>
      <div><span>Enviados</span><strong>{metrics.sent}/{metrics.total}</strong></div>
      <div><span>Por revisar</span><strong>{metrics.waiting}</strong></div>
      <div><span>Aprobados</span><strong>{metrics.approved}/{metrics.total}</strong></div>
      <div><span>Correcciones</span><strong>{metrics.corrections}</strong></div>
      <div><span>N/A pendientes</span><strong>{metrics.naPending}</strong></div>
    </section>

    {groups.map(([group, criteria]) => <section className={styles.group} key={group}>
      <header><div><span>{phaseLabels[phase]}</span><h4>{group}</h4></div><small>{criteria.length} criterio{criteria.length === 1 ? "" : "s"}</small></header>
      <div className={styles.criteria}>
        {criteria.map((criterion) => {
          const state = criterionState(criterion);
          const latest = latestSubmission(criterion);
          const expanded = openCriterion === criterion.id;
          const gradeable = isFreshSubmission(criterion);
          const currentScore = criterion.score?.not_applicable ? "N/A" : criterion.score?.score === null || criterion.score?.score === undefined ? "—" : `${criterion.score.score}/4`;
          return <article className={`${styles.criterion} ${styles[state.key] ?? ""}`} key={criterion.id}>
            <button className={styles.criterionHead} onClick={() => void toggleCriterion(criterion)}>
              <div className={styles.identity}><span className={styles.code}>{criterion.id}</span><div><strong>{criterion.label}</strong><small>{criterion.expected_evidence ? `Evidencia esperada: ${criterion.expected_evidence}` : "Evidencia requerida"}</small></div></div>
              <div className={styles.headState}><span>{state.label}</span><b>{currentScore}</b></div>
            </button>

            {expanded && <div className={styles.body}>
              {criterion.na_request?.status === "pending" && <section className={styles.naBox}>
                <div className={styles.noticeTitle}><Clock3 size={17}/><div><strong>Solicitud de No aplica</strong><p>{criterion.na_request.justification}</p></div></div>
                <textarea rows={2} value={naComments[criterion.id] ?? ""} onChange={(event) => setNaComments((current) => ({ ...current, [criterion.id]: event.target.value }))} placeholder="Comentario para el docente (obligatorio si rechaza)…"/>
                <div className={styles.naActions}>
                  <button className={styles.reject} disabled={busy.startsWith("na-")} onClick={() => void reviewNa(criterion, "rejected")}><XCircle size={15}/>Rechazar</button>
                  <button className={styles.approve} disabled={busy.startsWith("na-")} onClick={() => void reviewNa(criterion, "approved")}><CheckCircle2 size={15}/>Aprobar No aplica</button>
                </div>
              </section>}

              {state.key === "na" && <div className={styles.approvedNotice}><CheckCircle2 size={17}/><div><strong>No aplica aprobado</strong><p>{criterion.na_request?.review_comment || criterion.score?.observation || "La justificación fue aprobada por coordinación."}</p></div></div>}

              {latest ? <section className={styles.submission}>
                <header><div><strong>Entrega del docente · v{latest.version}</strong><span>{formatDate(latest.submitted_at)}{latest.reviewed_at ? ` · revisada ${formatDate(latest.reviewed_at)}` : ""}</span></div><span className={styles.submissionState}>{latest.status === "approved" ? "Aprobada" : latest.status === "correction_required" ? "Corrección solicitada" : latest.status === "superseded" ? "Histórica" : "Pendiente de revisión"}</span></header>
                {latest.teacher_comment && <div className={styles.teacherComment}><strong>Comentario del docente</strong><p>{latest.teacher_comment}</p></div>}
                <div className={styles.items}>
                  {latest.items.map((item) => <article className={styles.item} key={item.id}>
                    {item.kind === "image" ? <div className={styles.imageWrap}>{itemUrls[item.id] ? <img src={itemUrls[item.id]} alt={item.file_name ?? "Evidencia"}/> : <button onClick={() => void signedItemUrl(item)}><ImageIcon size={18}/>Cargar vista previa</button>}</div> : <div className={styles.fileIcon}>{item.kind === "link" ? <Link2 size={19}/> : <FileText size={19}/>}</div>}
                    <div className={styles.itemMeta}><strong>{item.kind === "link" ? item.external_url : item.file_name}</strong><span>{item.kind === "link" ? "Enlace" : `${item.mime_type ?? "Archivo"}${item.size_bytes ? ` · ${bytesLabel(item.size_bytes)}` : ""}`}</span></div>
                    <button className={styles.openItem} onClick={() => void openItem(item)}><ExternalLink size={14}/>Abrir</button>
                  </article>)}
                </div>
                {latest.review_comment && <div className={styles.previousReview}><RotateCcw size={15}/><div><strong>Observación registrada</strong><p>{latest.review_comment}</p></div></div>}
              </section> : <div className={styles.noEvidence}><Clock3 size={17}/><div><strong>El docente todavía no envía evidencia</strong><p>La evaluación permanecerá bloqueada hasta que exista una entrega.</p></div></div>}

              {gradeable && <section className={styles.evaluation}>
                <div className={styles.evaluationTitle}><div><span>CALIFICACIÓN</span><strong>Evalúe esta misma entrega</strong></div><small>3–4 aprueba · 0–2 solicita corrección</small></div>
                <div className={styles.scoreButtons}>
                  {[0, 1, 2, 3, 4].map((score) => <button key={score} className={(scoreDrafts[criterion.id] ?? "") === String(score) ? styles.scoreSelected : ""} onClick={() => setScoreDrafts((current) => ({ ...current, [criterion.id]: String(score) }))}><b>{score}</b><span>{score === 4 ? "Integral" : score === 3 ? "Cumple" : score === 2 ? "Acompañamiento" : score === 1 ? "Incipiente" : "No cumple"}</span></button>)}
                </div>
                <label>Observación del coordinador<textarea rows={3} value={observations[criterion.id] ?? ""} onChange={(event) => setObservations((current) => ({ ...current, [criterion.id]: event.target.value }))} placeholder={(Number(scoreDrafts[criterion.id]) < 3 && scoreDrafts[criterion.id]) ? "Indique exactamente qué debe corregir el docente…" : "Observación o retroalimentación (opcional si aprueba)…"}/></label>
                <div className={styles.saveLine}><span>{scoreDrafts[criterion.id] && Number(scoreDrafts[criterion.id]) < 3 ? "Al guardar, el docente recibirá automáticamente una solicitud de corrección." : "Al guardar 3 o 4, esta entrega quedará aprobada."}</span><button disabled={busy === `score-${criterion.id}`} onClick={() => void evaluate(criterion)}>{busy === `score-${criterion.id}` ? <Loader2 size={15}/> : <Save size={15}/>}Guardar evaluación</button></div>
              </section>}

              {!gradeable && state.key === "correction" && <div className={styles.waitingCorrection}><RotateCcw size={17}/><div><strong>Esperando nueva entrega del docente</strong><p>La evaluación anterior se conserva en el historial. Cuando el docente corrija, aparecerá una nueva versión para revisar.</p></div></div>}

              {criterion.request?.submissions && criterion.request.submissions.length > 1 && <details className={styles.history}><summary>Historial de entregas ({criterion.request.submissions.length})</summary><div>{criterion.request.submissions.map((submission) => <article key={submission.id}><strong>Versión {submission.version}</strong><span>{formatDate(submission.submitted_at)} · {submission.status === "approved" ? "Aprobada" : submission.status === "correction_required" ? "Requiere corrección" : submission.status === "superseded" ? "Anterior" : "Enviada"}</span>{submission.review_comment && <p>{submission.review_comment}</p>}</article>)}</div></details>}
            </div>}
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
