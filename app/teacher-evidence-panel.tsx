"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, FileText, RefreshCw, UploadCloud } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-evidence-panel.module.css";

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
  requests: EvidenceRequest[];
  pending: number;
  corrections: number;
  waiting_review: number;
  approved: number;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusLabel(status: EvidenceRequest["status"]) {
  const labels: Record<EvidenceRequest["status"], string> = {
    pending: "Pendiente",
    submitted: "Enviada",
    in_review: "En revisión",
    correction_required: "Requiere corrección",
    approved: "Aprobada",
  };
  return labels[status];
}

function bytesLabel(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function TeacherEvidencePanel({ token, expedientId, onChanged }: {
  token: string;
  expedientId: string;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<WorkspaceData>({ requests: [], pending: 0, corrections: 0, waiting_review: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token || !expedientId) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("teacher_evidence_workspace", {
      p_token: token,
      p_expedient_id: expedientId,
    });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudieron cargar sus evidencias.");
      return;
    }
    setData(result as WorkspaceData);
  }, [expedientId, token]);

  useEffect(() => { void load(); }, [load]);

  const needsAction = useMemo(
    () => data.requests.filter((item) => item.status === "pending" || item.status === "correction_required"),
    [data.requests],
  );

  function chooseFile(requestId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      setMessage("El archivo supera el máximo de 10 MB.");
      event.target.value = "";
      return;
    }
    setFiles((current) => ({ ...current, [requestId]: file }));
  }

  async function submitEvidence(request: EvidenceRequest) {
    const supabase = getSupabaseBrowserClient();
    const file = files[request.id];
    if (!supabase || !file) {
      setMessage("Seleccione una captura, imagen o PDF antes de enviar.");
      return;
    }
    setBusyId(request.id);
    setMessage("");
    const form = new FormData();
    form.append("token", token);
    form.append("request_id", request.id);
    form.append("comment", comments[request.id] ?? "");
    form.append("file", file);

    const { data: result, error } = await supabase.functions.invoke("teacher-evidence", { body: form });
    setBusyId("");
    if (error || (result as { ok?: boolean } | null)?.ok !== true) {
      const code = (result as { error?: string } | null)?.error;
      setMessage(code === "invalid_file_size" ? "El archivo no cumple el tamaño permitido." : code === "unsupported_file_type" ? "Solo se permiten imágenes y PDF." : "No se pudo enviar la evidencia. Intente nuevamente.");
      return;
    }
    setFiles((current) => ({ ...current, [request.id]: null }));
    setComments((current) => ({ ...current, [request.id]: "" }));
    setMessage(request.status === "correction_required" ? "Nueva versión enviada para revisión." : "Evidencia enviada para revisión.");
    await load();
    await onChanged?.();
  }

  async function openSubmission(submissionId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyId(`open-${submissionId}`);
    const { data: result, error } = await supabase.functions.invoke("teacher-evidence", {
      body: { action: "signed-url", token, submission_id: submissionId },
    });
    setBusyId("");
    const url = (result as { url?: string } | null)?.url;
    if (error || !url) return setMessage("No se pudo abrir el archivo.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (loading) return <section className={styles.panel}><div className={styles.empty}>Cargando evidencias…</div></section>;

  return <section className={styles.panel}>
    <div className={styles.heading}>
      <div><span>Mis evidencias</span><h2>Capturas y archivos solicitados</h2><p>Envíe la evidencia y conserve aquí todas sus versiones y correcciones.</p></div>
      <button className={styles.refresh} onClick={() => void load()}><RefreshCw size={15}/>Actualizar</button>
    </div>

    {message && <div className={styles.message}>{message}</div>}

    <div className={styles.metrics}>
      <article><span>Pendientes</span><strong>{data.pending}</strong></article>
      <article><span>Por corregir</span><strong>{data.corrections}</strong></article>
      <article><span>En revisión</span><strong>{data.waiting_review}</strong></article>
      <article><span>Aprobadas</span><strong>{data.approved}</strong></article>
    </div>

    {needsAction.length > 0 && <div className={styles.attention}><Clock3 size={17}/><span>Tiene {needsAction.length} evidencia{needsAction.length === 1 ? "" : "s"} que requiere{needsAction.length === 1 ? "" : "n"} su acción.</span></div>}

    <div className={styles.requestList}>
      {data.requests.map((request) => {
        const latest = request.submissions[0] ?? null;
        const canSubmit = request.status === "pending" || request.status === "correction_required";
        return <article className={styles.requestCard} key={request.id}>
          <header>
            <div><span className={styles.meta}>{request.hito_id ?? "General"}{request.criterion_id ? ` · ${request.criterion_id}` : ""}{request.required ? " · Obligatoria" : ""}</span><h3>{request.title}</h3></div>
            <span className={`${styles.status} ${styles[request.status]}`}>{statusLabel(request.status)}</span>
          </header>
          {request.instructions && <p className={styles.instructions}>{request.instructions}</p>}
          <div className={styles.due}>Fecha límite: <strong>{formatDate(request.due_on)}</strong></div>

          {request.status === "correction_required" && latest?.review_comment && <div className={styles.correction}><strong>Corrección solicitada</strong><p>{latest.review_comment}</p></div>}

          {canSubmit && <div className={styles.uploadBox}>
            <label><UploadCloud size={19}/><span>{request.status === "correction_required" ? "Subir nueva versión" : "Seleccionar evidencia"}</span><small>Imagen o PDF · máximo 10 MB</small><input type="file" accept="image/*,application/pdf" onChange={(event) => chooseFile(request.id, event)} /></label>
            {files[request.id] && <div className={styles.selectedFile}><FileText size={15}/><span>{files[request.id]?.name}</span><small>{bytesLabel(files[request.id]?.size ?? null)}</small></div>}
            <textarea rows={2} placeholder="Comentario para la coordinación (opcional)" value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))}/>
            <button disabled={busyId === request.id || !files[request.id]} onClick={() => void submitEvidence(request)}>{busyId === request.id ? "Enviando…" : request.status === "correction_required" ? "Enviar nueva versión" : "Enviar evidencia"}</button>
          </div>}

          {request.submissions.length > 0 && <div className={styles.versions}>
            <strong>Historial de versiones</strong>
            {request.submissions.map((submission) => <div className={styles.versionRow} key={submission.id}>
              <div><FileText size={15}/><span><b>Versión {submission.version}</b> · {submission.file_name}<small>{formatDate(submission.submitted_at)}{submission.teacher_comment ? ` · ${submission.teacher_comment}` : ""}</small></span></div>
              <div><span className={`${styles.versionStatus} ${styles[submission.status]}`}>{submission.status === "approved" ? "Aprobada" : submission.status === "correction_required" ? "Corregir" : submission.status === "superseded" ? "Anterior" : "Enviada"}</span><button className={styles.open} disabled={busyId === `open-${submission.id}`} onClick={() => void openSubmission(submission.id)}><ExternalLink size={14}/>Ver</button></div>
            </div>)}
          </div>}

          {request.status === "approved" && <div className={styles.approvedNote}><CheckCircle2 size={16}/>Evidencia aprobada por coordinación.</div>}
        </article>;
      })}
    </div>

    {!data.requests.length && <div className={styles.empty}>La coordinación todavía no le ha solicitado evidencias.</div>}
  </section>;
}
