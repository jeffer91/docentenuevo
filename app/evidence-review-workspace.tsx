"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { Teacher } from "./siacd-app-v3";
import styles from "./evidence-review-workspace.module.css";

type Criterion = {
  id: string;
  hito_id: string;
  label: string;
  criticality: string;
  expected_evidence: string | null;
};

type Submission = {
  id: string;
  version: number;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  teacher_comment: string | null;
  status: "submitted" | "correction_required" | "approved" | "superseded";
  submitted_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
};

type EvidenceRequest = {
  id: string;
  hito_id: string | null;
  criterion_id: string | null;
  title: string;
  instructions: string | null;
  due_on: string | null;
  required: boolean;
  status: "pending" | "submitted" | "in_review" | "correction_required" | "approved";
  created_at: string;
  submissions: Submission[];
};

type WorkspaceData = {
  criteria: Criterion[];
  requests: EvidenceRequest[];
  pending_review: number;
  corrections: number;
  approved: number;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function requestStatus(value: EvidenceRequest["status"]) {
  return ({ pending:"Pendiente", submitted:"Por revisar", in_review:"En revisión", correction_required:"Corrección solicitada", approved:"Aprobada" } as Record<EvidenceRequest["status"], string>)[value];
}

export default function EvidenceReviewWorkspace({ teacher, coordinatorName }: { teacher: Teacher; coordinatorName: string }) {
  const staffId = teacher.coordinatorId;
  const [data, setData] = useState<WorkspaceData>({ criteria: [], requests: [], pending_review: 0, corrections: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedHito, setSelectedHito] = useState("H1");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("staff_evidence_workspace", {
      p_expedient_id: teacher.id,
      p_staff_id: staffId,
    });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudo cargar el flujo de evidencias.");
      return;
    }
    setData(result as WorkspaceData);
  }, [staffId, teacher.id]);

  useEffect(() => { void load(); }, [load]);

  const criteriaForHito = useMemo(() => data.criteria.filter((item) => item.hito_id === selectedHito), [data.criteria, selectedHito]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    const form = new FormData(event.currentTarget);
    const criterionId = String(form.get("criterion_id") ?? "");
    const criterion = data.criteria.find((item) => item.id === criterionId);
    setBusyId("create");
    const { error } = await supabase.rpc("staff_create_evidence_request", {
      p_expedient_id: teacher.id,
      p_staff_id: staffId,
      p_hito_id: selectedHito || null,
      p_criterion_id: criterionId || null,
      p_title: String(form.get("title") ?? ""),
      p_instructions: String(form.get("instructions") ?? "") || criterion?.expected_evidence || null,
      p_due_on: String(form.get("due_on") ?? "") || null,
      p_required: form.get("required") === "on",
    });
    setBusyId("");
    if (error) return setMessage(`No se pudo solicitar la evidencia: ${error.message}`);
    setShowForm(false);
    setMessage("Solicitud enviada al docente.");
    await load();
  }

  async function openSubmission(submissionId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    setBusyId(`open-${submissionId}`);
    const { data: result, error } = await supabase.functions.invoke("teacher-evidence", {
      body: { action: "staff-signed-url", staff_id: staffId, submission_id: submissionId },
    });
    setBusyId("");
    const url = (result as { url?: string } | null)?.url;
    if (error || !url) return setMessage("No se pudo abrir el archivo.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function review(submission: Submission, decision: "approved" | "correction_required") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId) return;
    const comment = (reviewComments[submission.id] ?? "").trim();
    if (decision === "correction_required" && !comment) {
      setMessage("Escriba qué debe corregir el docente.");
      return;
    }
    setBusyId(`${decision}-${submission.id}`);
    const { error } = await supabase.rpc("staff_review_evidence_submission", {
      p_submission_id: submission.id,
      p_staff_id: staffId,
      p_decision: decision,
      p_comment: comment || null,
    });
    setBusyId("");
    if (error) return setMessage(`No se pudo revisar la evidencia: ${error.message}`);
    setReviewComments((current) => ({ ...current, [submission.id]: "" }));
    setMessage(decision === "approved" ? "Evidencia aprobada." : "Corrección solicitada al docente.");
    await load();
  }

  async function cancelRequest(requestId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !staffId || !window.confirm("¿Cancelar esta solicitud de evidencia?")) return;
    setBusyId(`cancel-${requestId}`);
    const { error } = await supabase.rpc("staff_cancel_evidence_request", { p_request_id: requestId, p_staff_id: staffId });
    setBusyId("");
    if (error) return setMessage(error.message);
    setMessage("Solicitud cancelada.");
    await load();
  }

  if (!staffId) return <div className={styles.empty}>Este expediente no tiene un coordinador asignado.</div>;
  if (loading) return <div className={styles.empty}>Cargando evidencias…</div>;

  return <section className={styles.workspace}>
    <div className={styles.heading}>
      <div><span>Evidencias del docente</span><h3>Solicitudes, versiones y revisión</h3><p>{teacher.name} · {coordinatorName}</p></div>
      <div className={styles.actions}><button className={styles.secondary} onClick={() => void load()}><RefreshCw size={14}/>Actualizar</button><button className={styles.primary} onClick={() => setShowForm(!showForm)}><Plus size={14}/>{showForm ? "Cerrar" : "Solicitar evidencia"}</button></div>
    </div>

    {message && <div className={styles.message}>{message}</div>}

    <div className={styles.metrics}>
      <article><span>Por revisar</span><strong>{data.pending_review}</strong></article>
      <article><span>Correcciones</span><strong>{data.corrections}</strong></article>
      <article><span>Aprobadas</span><strong>{data.approved}</strong></article>
      <article><span>Total solicitudes</span><strong>{data.requests.length}</strong></article>
    </div>

    {showForm && <form className={styles.form} onSubmit={createRequest}>
      <label>Hito<select value={selectedHito} onChange={(event) => setSelectedHito(event.target.value)}>{["H1","H2","H3","H4","H5","H6"].map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>Criterio<select name="criterion_id" defaultValue=""><option value="">General del hito</option>{criteriaForHito.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}</select></label>
      <label className={styles.full}>Título<input name="title" required placeholder="Ej. Captura del aula virtual configurada"/></label>
      <label className={styles.full}>Qué debe enviar<textarea name="instructions" rows={3} placeholder="Indique claramente qué debe verse en la captura o archivo."/></label>
      <label>Fecha límite<input type="date" name="due_on"/></label>
      <label className={styles.check}><input type="checkbox" name="required" defaultChecked/>Evidencia obligatoria</label>
      <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={() => setShowForm(false)}>Cancelar</button><button disabled={busyId === "create"} className={styles.primary}>{busyId === "create" ? "Enviando…" : "Enviar solicitud"}</button></div>
    </form>}

    <div className={styles.list}>
      {data.requests.map((request) => {
        const latest = request.submissions[0] ?? null;
        const reviewable = latest?.status === "submitted" && (request.status === "submitted" || request.status === "in_review");
        return <article className={styles.card} key={request.id}>
          <header><div><span>{request.hito_id ?? "General"}{request.criterion_id ? ` · ${request.criterion_id}` : ""}{request.required ? " · Obligatoria" : ""}</span><h4>{request.title}</h4><small>Fecha límite: {formatDate(request.due_on)}</small></div><span className={`${styles.status} ${styles[request.status]}`}>{requestStatus(request.status)}</span></header>
          {request.instructions && <p>{request.instructions}</p>}

          {reviewable && latest && <div className={styles.reviewBox}>
            <div className={styles.submissionHead}><div><FileText size={16}/><strong>Versión {latest.version} · {latest.file_name}</strong></div><button className={styles.secondary} disabled={busyId === `open-${latest.id}`} onClick={() => void openSubmission(latest.id)}><ExternalLink size={14}/>Ver archivo</button></div>
            {latest.teacher_comment && <p className={styles.teacherComment}>Docente: {latest.teacher_comment}</p>}
            <textarea rows={2} placeholder="Observación de revisión. Es obligatoria si solicita corrección." value={reviewComments[latest.id] ?? ""} onChange={(event) => setReviewComments((current) => ({ ...current, [latest.id]: event.target.value }))}/>
            <div className={styles.reviewActions}><button className={styles.correct} disabled={busyId.includes(latest.id)} onClick={() => void review(latest,"correction_required")}><RotateCcw size={14}/>Solicitar corrección</button><button className={styles.approve} disabled={busyId.includes(latest.id)} onClick={() => void review(latest,"approved")}><CheckCircle2 size={14}/>Aprobar</button></div>
          </div>}

          {request.status === "correction_required" && latest?.review_comment && <div className={styles.correction}><strong>Corrección enviada al docente</strong><span>{latest.review_comment}</span></div>}

          {request.submissions.length > 0 && <details className={styles.versions} open={request.submissions.length > 1}><summary>Historial · {request.submissions.length} versión{request.submissions.length === 1 ? "" : "es"}</summary>{request.submissions.map((submission) => <div className={styles.version} key={submission.id}><div><strong>v{submission.version}</strong><span>{submission.file_name}</span><small>{formatDate(submission.submitted_at)} · {submission.status === "approved" ? "Aprobada" : submission.status === "correction_required" ? "Corrección" : submission.status === "superseded" ? "Anterior" : "Enviada"}</small></div><button className={styles.link} onClick={() => void openSubmission(submission.id)}>Ver</button></div>)}</details>}

          {request.status !== "approved" && <div className={styles.cardFooter}><button className={styles.cancel} disabled={busyId === `cancel-${request.id}`} onClick={() => void cancelRequest(request.id)}><Trash2 size={13}/>Cancelar solicitud</button></div>}
        </article>;
      })}
    </div>

    {!data.requests.length && <div className={styles.empty}>No hay solicitudes de evidencia. Cree la primera para que aparezca en el espacio del docente.</div>}
  </section>;
}
