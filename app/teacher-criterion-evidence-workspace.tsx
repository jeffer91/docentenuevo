"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, ClipboardEvent, DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-criterion-evidence-workspace.module.css";

export type TeacherEvidencePhase = "areas" | "before" | "during" | "after";
type CriterionMode = "check" | "evidence";

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
  mode: CriterionMode;
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

type DraftFiles = Record<string, File[]>;
type DraftLinks = Record<string, string[]>;
type DraftText = Record<string, string>;

const MAX_ITEMS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const phaseOrder: TeacherEvidencePhase[] = ["areas", "before", "during", "after"];
const phaseLabels: Record<TeacherEvidencePhase, string> = {
  areas: "Áreas",
  before: "Antes",
  during: "Durante",
  after: "Después",
};

function phaseForHito(hitoId: string): TeacherEvidencePhase {
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

function criterionState(criterion: Criterion) {
  if (criterion.score?.not_applicable || criterion.na_request?.status === "approved") {
    return { key: "naApproved", label: "No aplica aprobado" } as const;
  }
  if ((criterion.score?.score ?? -1) >= 3) return { key: "approved", label: "Aprobado" } as const;
  if (criterion.na_request?.status === "pending") return { key: "naPending", label: "No aplica solicitado" } as const;
  if (criterion.score?.evaluated_at && (criterion.score.score ?? 3) < 3) {
    return { key: "correction", label: criterion.mode === "check" ? "Requiere ajuste" : "Requiere corrección" } as const;
  }
  if (criterion.mode === "check") return { key: "pending", label: "Pendiente de verificación" } as const;
  if (criterion.request?.status === "approved") return { key: "approved", label: "Aprobado" } as const;
  if (criterion.request?.status === "correction_required") return { key: "correction", label: "Requiere corrección" } as const;
  if (criterion.request?.status === "submitted" || criterion.request?.status === "in_review") {
    return { key: "submitted", label: "Enviado · pendiente de revisión" } as const;
  }
  return { key: "pending", label: "Pendiente de evidencia" } as const;
}

function latestSubmission(criterion: Criterion) {
  return criterion.mode === "evidence" ? criterion.request?.submissions?.[0] ?? null : null;
}

function canEditLatest(criterion: Criterion) {
  if (criterion.mode !== "evidence") return false;
  const latest = latestSubmission(criterion);
  return Boolean(
    latest
    && latest.status === "submitted"
    && !latest.reviewed_at
    && criterion.request?.status === "submitted",
  );
}

export default function TeacherCriterionEvidenceWorkspace({
  token,
  expedientId,
  initialPhase = "areas",
  onChanged,
}: {
  token: string;
  expedientId: string;
  initialPhase?: TeacherEvidencePhase;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<WorkspaceData>({ criteria: [], total: 0, na_pending: 0 });
  const [phase, setPhase] = useState<TeacherEvidencePhase>(initialPhase);
  const [openCriterion, setOpenCriterion] = useState("");
  const [files, setFiles] = useState<DraftFiles>({});
  const [links, setLinks] = useState<DraftLinks>({});
  const [linkDraft, setLinkDraft] = useState<DraftText>({});
  const [comments, setComments] = useState<DraftText>({});
  const [naJustification, setNaJustification] = useState<DraftText>({});
  const [naOpen, setNaOpen] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { setPhase(initialPhase); }, [initialPhase]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token || !expedientId) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc("teacher_criterion_evidence_workspace", {
      p_token: token,
      p_expedient_id: expedientId,
    });
    setLoading(false);
    if (error || !result) {
      setMessage("No se pudo cargar su proceso.");
      return;
    }
    setData(result as WorkspaceData);
  }, [expedientId, token]);

  useEffect(() => { void load(); }, [load]);

  const phaseCriteria = useMemo(
    () => data.criteria.filter((criterion) => phaseForHito(criterion.hito_id) === phase),
    [data.criteria, phase],
  );

  const phaseMetrics = useMemo(() => Object.fromEntries(phaseOrder.map((item) => {
    const criteria = data.criteria.filter((criterion) => phaseForHito(criterion.hito_id) === item);
    const evidenceCriteria = criteria.filter((criterion) => criterion.mode === "evidence");
    const sent = evidenceCriteria.filter((criterion) => Boolean(criterion.request?.submissions?.length)).length;
    const approved = criteria.filter((criterion) => {
      const state = criterionState(criterion);
      return state.key === "approved" || state.key === "naApproved";
    }).length;
    const corrections = criteria.filter((criterion) => criterionState(criterion).key === "correction").length;
    return [item, { total: criteria.length, evidenceTotal: evidenceCriteria.length, sent, approved, corrections }];
  })) as Record<TeacherEvidencePhase, { total: number; evidenceTotal: number; sent: number; approved: number; corrections: number }>, [data.criteria]);

  const groups = useMemo(() => {
    const map = new Map<string, Criterion[]>();
    for (const criterion of phaseCriteria) {
      const list = map.get(criterion.process) ?? [];
      list.push(criterion);
      map.set(criterion.process, list);
    }
    return [...map.entries()];
  }, [phaseCriteria]);

  function currentCount(criterion: Criterion) {
    return canEditLatest(criterion) ? latestSubmission(criterion)?.items.length ?? 0 : 0;
  }

  function stagedCount(criterionId: string) {
    return (files[criterionId]?.length ?? 0) + (links[criterionId]?.length ?? 0);
  }

  function addFiles(criterion: Criterion, incoming: File[]) {
    if (criterion.mode !== "evidence") return;
    const available = MAX_ITEMS - currentCount(criterion) - stagedCount(criterion.id);
    if (available <= 0) {
      setMessage("Cada entrega admite máximo 3 evidencias.");
      return;
    }
    const valid = incoming.filter((file) => {
      if (file.size <= 0 || file.size > MAX_BYTES) {
        setMessage(`${file.name} supera el máximo de 10 MB.`);
        return false;
      }
      return true;
    }).slice(0, available);
    setFiles((state) => ({ ...state, [criterion.id]: [...(state[criterion.id] ?? []), ...valid] }));
    if (incoming.length > available) setMessage("Se agregaron solo los elementos disponibles hasta completar el máximo de 3.");
  }

  function chooseFiles(criterion: Criterion, event: ChangeEvent<HTMLInputElement>) {
    addFiles(criterion, Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function pasteFiles(criterion: Criterion, event: ClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((item): item is File => Boolean(item));
    if (!pasted.length) return;
    event.preventDefault();
    addFiles(criterion, pasted);
    setMessage("Captura pegada. Revise la entrega y pulse Enviar.");
  }

  function dropFiles(criterion: Criterion, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(criterion, Array.from(event.dataTransfer.files ?? []));
  }

  function addLink(criterion: Criterion) {
    if (criterion.mode !== "evidence") return;
    const value = (linkDraft[criterion.id] ?? "").trim();
    if (!value) return;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid");
    } catch {
      setMessage("Ingrese un enlace válido que empiece con http:// o https://.");
      return;
    }
    const available = MAX_ITEMS - currentCount(criterion) - stagedCount(criterion.id);
    if (available <= 0) return setMessage("Cada entrega admite máximo 3 evidencias.");
    setLinks((state) => ({ ...state, [criterion.id]: [...(state[criterion.id] ?? []), value] }));
    setLinkDraft((state) => ({ ...state, [criterion.id]: "" }));
  }

  function removeStagedFile(criterionId: string, index: number) {
    setFiles((state) => ({ ...state, [criterionId]: (state[criterionId] ?? []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  function removeStagedLink(criterionId: string, index: number) {
    setLinks((state) => ({ ...state, [criterionId]: (state[criterionId] ?? []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function submitEvidence(criterion: Criterion) {
    if (criterion.mode !== "evidence") return;
    const request = criterion.request;
    if (!request) return setMessage("Este criterio todavía no tiene un espacio de evidencia disponible.");
    const selectedFiles = files[criterion.id] ?? [];
    const selectedLinks = links[criterion.id] ?? [];
    if (!selectedFiles.length && !selectedLinks.length) return setMessage("Pegue, arrastre, seleccione un archivo o agregue un enlace antes de enviar.");

    const editable = canEditLatest(criterion);
    const latest = latestSubmission(criterion);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`send-${criterion.id}`);
    setMessage("");

    const form = new FormData();
    form.append("token", token);
    form.append("request_id", request.id);
    form.append("comment", comments[criterion.id] ?? latest?.teacher_comment ?? "");
    selectedFiles.forEach((file) => form.append("file", file));
    selectedLinks.forEach((link) => form.append("link", link));

    const functionName = editable ? "teacher-criterion-evidence" : "teacher-evidence";
    if (editable && latest) {
      form.append("action", "append");
      form.append("submission_id", latest.id);
    }

    const { data: result, error } = await supabase.functions.invoke(functionName, { body: form });
    setBusy("");
    const response = result as { ok?: boolean; error?: string } | null;
    if (error || !response?.ok) {
      const code = response?.error;
      setMessage(
        code === "invalid_item_count" ? "La entrega admite máximo 3 evidencias."
          : code === "invalid_file_size" ? "Uno de los archivos supera el máximo permitido de 10 MB."
            : code === "unsupported_file_type" ? "Ese tipo de archivo no está permitido."
              : code === "submission_locked" ? "La coordinación ya empezó a revisar esta entrega y ya no puede modificarse."
                : "No se pudo enviar la evidencia. Intente nuevamente.",
      );
      return;
    }

    setFiles((state) => ({ ...state, [criterion.id]: [] }));
    setLinks((state) => ({ ...state, [criterion.id]: [] }));
    setComments((state) => ({ ...state, [criterion.id]: "" }));
    setMessage(editable ? "Evidencias agregadas a la entrega enviada." : request.status === "correction_required" ? "Nueva entrega enviada para revisión." : "Evidencia enviada. Queda pendiente de revisión por coordinación.");
    await load();
    await onChanged?.();
  }

  async function openItem(item: EvidenceItem) {
    if (item.kind === "link" && item.external_url) {
      window.open(item.external_url, "_blank", "noopener,noreferrer");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`open-${item.id}`);
    const { data: result, error } = await supabase.functions.invoke("teacher-evidence", {
      body: { action: "signed-item-url", token, item_id: item.id },
    });
    setBusy("");
    const url = (result as { url?: string } | null)?.url;
    if (error || !url) return setMessage("No se pudo abrir la evidencia.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function deletePendingItem(criterion: Criterion, item: EvidenceItem) {
    if (!canEditLatest(criterion)) return;
    if (!window.confirm("¿Eliminar esta evidencia de la entrega pendiente?")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`delete-${item.id}`);
    const { data: result, error } = await supabase.functions.invoke("teacher-criterion-evidence", {
      body: { action: "delete-item", token, item_id: item.id },
    });
    setBusy("");
    const response = result as { ok?: boolean; error?: string } | null;
    if (error || !response?.ok) {
      setMessage(response?.error === "submission_locked" ? "La entrega ya está en revisión y no puede modificarse." : "No se pudo eliminar la evidencia.");
      return;
    }
    setMessage("Evidencia eliminada de la entrega pendiente.");
    await load();
  }

  async function savePendingComment(criterion: Criterion) {
    const latest = latestSubmission(criterion);
    if (!latest || !canEditLatest(criterion)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`comment-${criterion.id}`);
    const { data: result, error } = await supabase.functions.invoke("teacher-criterion-evidence", {
      body: {
        action: "update-comment",
        token,
        submission_id: latest.id,
        comment: comments[criterion.id] ?? latest.teacher_comment ?? "",
      },
    });
    setBusy("");
    const response = result as { ok?: boolean } | null;
    if (error || !response?.ok) return setMessage("No se pudo actualizar el comentario.");
    setMessage("Comentario actualizado.");
    await load();
  }

  async function requestNotApplicable(criterion: Criterion) {
    const justification = (naJustification[criterion.id] ?? "").trim();
    if (justification.length < 8) return setMessage("Explique brevemente por qué este criterio no aplica.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`na-${criterion.id}`);
    const { error } = await supabase.rpc("teacher_request_not_applicable", {
      p_token: token,
      p_expedient_id: expedientId,
      p_criterion_id: criterion.id,
      p_justification: justification,
    });
    setBusy("");
    if (error) return setMessage(`No se pudo enviar la solicitud: ${error.message}`);
    setNaOpen("");
    setNaJustification((state) => ({ ...state, [criterion.id]: "" }));
    setMessage("Solicitud de No aplica enviada a coordinación.");
    await load();
  }

  async function cancelNotApplicable(criterion: Criterion) {
    if (!criterion.na_request || criterion.na_request.status !== "pending") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(`na-cancel-${criterion.id}`);
    const { error } = await supabase.rpc("teacher_cancel_not_applicable", {
      p_token: token,
      p_request_id: criterion.na_request.id,
    });
    setBusy("");
    if (error) return setMessage("No se pudo cancelar la solicitud.");
    setMessage("Solicitud de No aplica cancelada.");
    await load();
  }

  if (loading) return <div className={styles.loading}><Loader2 size={18}/><span>Preparando sus criterios…</span></div>;

  return <div className={styles.root}>
    <div className={styles.topline}>
      <div><span>MI PROCESO</span><h2>Criterios de acompañamiento</h2><p>Los criterios CHECK los verifica directamente coordinación. Solo los criterios EVIDENCIA requieren que adjunte archivos, capturas o enlaces.</p></div>
      <button className={styles.refresh} onClick={() => void load()}><RefreshCw size={15}/>Actualizar</button>
    </div>

    {message && <div className={styles.message}><AlertCircle size={16}/><span>{message}</span><button onClick={() => setMessage("")} aria-label="Cerrar mensaje"><X size={14}/></button></div>}

    <div className={styles.phaseTabs}>
      {phaseOrder.map((item) => {
        const metric = phaseMetrics[item];
        return <button key={item} className={phase === item ? styles.phaseActive : ""} onClick={() => setPhase(item)}>
          <span>{phaseLabels[item]}</span>
          <small>{metric.approved}/{metric.total} aprobados</small>
          {metric.corrections > 0 && <b>{metric.corrections} por corregir</b>}
        </button>;
      })}
    </div>

    <section className={styles.phaseSummary}>
      <div><span>Etapa</span><strong>{phaseLabels[phase]}</strong></div>
      <div><span>Evidencias enviadas</span><strong>{phaseMetrics[phase].sent}/{phaseMetrics[phase].evidenceTotal}</strong></div>
      <div><span>Criterios aprobados</span><strong>{phaseMetrics[phase].approved}/{phaseMetrics[phase].total}</strong></div>
      <div><span>Por corregir</span><strong>{phaseMetrics[phase].corrections}</strong></div>
    </section>

    <div className={styles.groups}>
      {groups.map(([group, criteria]) => <section className={styles.group} key={group}>
        <header><div><span>{phaseLabels[phase]}</span><h3>{group}</h3></div><small>{criteria.length} criterio{criteria.length === 1 ? "" : "s"}</small></header>
        <div className={styles.criteria}>
          {criteria.map((criterion) => {
            const state = criterionState(criterion);
            const latest = latestSubmission(criterion);
            const editable = canEditLatest(criterion);
            const expanded = openCriterion === criterion.id;
            const existingCount = currentCount(criterion);
            const totalDraftCount = stagedCount(criterion.id);
            const canAdd = existingCount + totalDraftCount < MAX_ITEMS;
            const naPending = criterion.na_request?.status === "pending";
            const blocked = state.key === "approved" || state.key === "naApproved" || naPending;

            return <article className={`${styles.criterion} ${styles[state.key] ?? ""}`} key={criterion.id}>
              <button className={styles.criterionHead} onClick={() => setOpenCriterion(expanded ? "" : criterion.id)}>
                <div className={styles.criterionIdentity}>
                  <span className={styles.code}>{criterion.id}</span>
                  <div>
                    <strong>{criterion.label}</strong>
                    <small>{criterion.mode === "check" ? "CHECK · no requiere cargar evidencia" : criterion.expected_evidence ? `EVIDENCIA · ${criterion.expected_evidence}` : "EVIDENCIA · adjunte un archivo, captura o enlace"}</small>
                  </div>
                </div>
                <div className={styles.criterionState}><span>{state.label}</span><b>{criterion.mode === "check" ? "CHECK" : latest?.items?.length ? `${latest.items.length}/3` : "0/3"}</b></div>
              </button>

              {expanded && <div className={styles.criterionBody}>
                {criterion.na_request?.status === "rejected" && <div className={styles.reviewNote}><RotateCcw size={15}/><div><strong>Solicitud de No aplica rechazada</strong><p>{criterion.na_request.review_comment || "Coordinación indicó que este criterio sí corresponde."}</p></div></div>}
                {criterion.na_request?.status === "pending" && <div className={styles.naPendingBox}><ClockIcon/><div><strong>Solicitud de No aplica pendiente</strong><p>{criterion.na_request.justification}</p></div><button disabled={busy === `na-cancel-${criterion.id}`} onClick={() => void cancelNotApplicable(criterion)}>Cancelar solicitud</button></div>}
                {state.key === "naApproved" && <div className={styles.approvedBox}><CheckCircle2 size={17}/><div><strong>No aplica aprobado</strong><p>{criterion.na_request?.review_comment || criterion.score?.observation || "Coordinación aprobó la justificación."}</p></div></div>}

                {criterion.mode === "check" && <div className={state.key === "approved" ? styles.approvedBox : styles.currentSubmission}>
                  <div className={styles.submissionTitle}><div><strong>Verificación directa de coordinación</strong><span>No necesita adjuntar archivos ni enlaces para este criterio.</span></div><span>CHECK</span></div>
                  {criterion.score?.observation && <div className={styles.reviewNote}><RotateCcw size={15}/><div><strong>Observación de coordinación</strong><p>{criterion.score.observation}</p></div></div>}
                </div>}

                {criterion.mode === "evidence" && latest && <div className={styles.currentSubmission}>
                  <div className={styles.submissionTitle}><div><strong>{latest.status === "approved" ? "Evidencia aprobada" : latest.status === "correction_required" ? "Entrega revisada" : editable ? "Entrega enviada · todavía puede editarla" : `Entrega v${latest.version}`}</strong><span>{formatDate(latest.submitted_at)}{latest.reviewed_at ? ` · revisada ${formatDate(latest.reviewed_at)}` : ""}</span></div><span>v{latest.version}</span></div>
                  {latest.review_comment && <div className={styles.reviewNote}><RotateCcw size={15}/><div><strong>Observación de coordinación</strong><p>{latest.review_comment}</p></div></div>}
                  <div className={styles.items}>
                    {latest.items.map((item) => <div className={styles.item} key={item.id}>
                      <div className={styles.itemIcon}>{item.kind === "image" ? <ImageIcon size={16}/> : item.kind === "link" ? <Link2 size={16}/> : <FileText size={16}/>}</div>
                      <div><strong>{item.kind === "link" ? item.external_url : item.file_name}</strong><small>{item.kind === "link" ? "Enlace" : `${item.mime_type ?? "Archivo"}${item.size_bytes ? ` · ${bytesLabel(item.size_bytes)}` : ""}`}</small></div>
                      <button onClick={() => void openItem(item)} disabled={busy === `open-${item.id}`} title="Abrir"><ExternalLink size={14}/></button>
                      {editable && <button className={styles.deleteItem} onClick={() => void deletePendingItem(criterion, item)} disabled={busy === `delete-${item.id}`} title="Eliminar"><Trash2 size={14}/></button>}
                    </div>)}
                  </div>
                  {latest.teacher_comment && !editable && <div className={styles.teacherComment}><strong>Mi comentario</strong><p>{latest.teacher_comment}</p></div>}
                  {editable && <div className={styles.editComment}><input value={comments[criterion.id] ?? latest.teacher_comment ?? ""} onChange={(event) => setComments((current) => ({ ...current, [criterion.id]: event.target.value }))} placeholder="Comentario para coordinación (opcional)"/><button disabled={busy === `comment-${criterion.id}`} onClick={() => void savePendingComment(criterion)}>Guardar comentario</button></div>}
                </div>}

                {criterion.mode === "evidence" && !blocked && (criterion.request?.status === "pending" || criterion.request?.status === "correction_required" || editable) && <div className={styles.uploader}>
                  <div
                    className={`${styles.dropzone} ${canAdd ? "" : styles.dropzoneDisabled}`}
                    tabIndex={canAdd ? 0 : -1}
                    onPaste={(event) => canAdd && pasteFiles(criterion, event)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => canAdd && dropFiles(criterion, event)}
                  >
                    <Clipboard size={22}/>
                    <strong>{editable ? "Agregar a la entrega enviada" : criterion.request?.status === "correction_required" ? "Suba la corrección" : "Pegue aquí su captura"}</strong>
                    <span>Ctrl+V · arrastrar y soltar · o seleccionar archivo</span>
                    <label className={styles.fileButton}><UploadCloud size={14}/>Seleccionar<input type="file" multiple disabled={!canAdd} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(event) => chooseFiles(criterion, event)}/></label>
                    <small>Máximo 3 evidencias por entrega · 10 MB por archivo</small>
                  </div>

                  {(files[criterion.id]?.length ?? 0) > 0 && <div className={styles.staged}>{files[criterion.id].map((file, index) => <div key={`${file.name}-${index}`}><Paperclip size={14}/><span>{file.name}</span><small>{bytesLabel(file.size)}</small><button onClick={() => removeStagedFile(criterion.id, index)}><X size={13}/></button></div>)}</div>}
                  {(links[criterion.id]?.length ?? 0) > 0 && <div className={styles.staged}>{links[criterion.id].map((link, index) => <div key={`${link}-${index}`}><Link2 size={14}/><span>{link}</span><button onClick={() => removeStagedLink(criterion.id, index)}><X size={13}/></button></div>)}</div>}

                  {canAdd && <div className={styles.linkLine}><Link2 size={15}/><input value={linkDraft[criterion.id] ?? ""} onChange={(event) => setLinkDraft((current) => ({ ...current, [criterion.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(criterion); } }} placeholder="Pegar enlace (opcional)"/><button onClick={() => addLink(criterion)}>Agregar</button></div>}

                  {!editable && <textarea rows={2} value={comments[criterion.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [criterion.id]: event.target.value }))} placeholder="Comentario para coordinación (opcional)"/>}
                  <div className={styles.sendLine}><span>{existingCount + totalDraftCount}/3 evidencias</span><button className={styles.sendButton} disabled={busy === `send-${criterion.id}` || totalDraftCount === 0} onClick={() => void submitEvidence(criterion)}>{busy === `send-${criterion.id}` ? <Loader2 size={15}/> : <Send size={15}/>} {editable ? "Guardar cambios" : criterion.request?.status === "correction_required" ? "Enviar nueva entrega" : "Enviar"}</button></div>
                </div>}

                {!blocked && !editable && criterion.request?.status !== "submitted" && criterion.request?.status !== "in_review" && <div className={styles.naArea}>
                  {naOpen === criterion.id ? <div className={styles.naForm}><strong>Solicitar “No aplica”</strong><p>Use esta opción solo cuando el criterio realmente no corresponda a su asignatura o situación.</p><textarea rows={2} value={naJustification[criterion.id] ?? ""} onChange={(event) => setNaJustification((current) => ({ ...current, [criterion.id]: event.target.value }))} placeholder="Explique brevemente por qué no aplica…"/><div><button onClick={() => setNaOpen("")}>Cancelar</button><button className={styles.naSend} disabled={busy === `na-${criterion.id}`} onClick={() => void requestNotApplicable(criterion)}>Enviar solicitud</button></div></div> : <button className={styles.naButton} onClick={() => setNaOpen(criterion.id)}>Este criterio no aplica en mi caso</button>}
                </div>}

                {criterion.mode === "evidence" && criterion.request?.submissions && criterion.request.submissions.length > 1 && <details className={styles.history}><summary>Ver historial de entregas ({criterion.request.submissions.length})</summary><div>{criterion.request.submissions.map((submission) => <article key={submission.id}><strong>Versión {submission.version}</strong><span>{formatDate(submission.submitted_at)} · {submission.status === "approved" ? "Aprobada" : submission.status === "correction_required" ? "Requiere corrección" : submission.status === "superseded" ? "Anterior" : "Enviada"}</span>{submission.review_comment && <p>{submission.review_comment}</p>}</article>)}</div></details>}
              </div>}
            </article>;
          })}
        </div>
      </section>)}
    </div>
  </div>;
}

function ClockIcon() {
  return <AlertCircle size={17}/>;
}
