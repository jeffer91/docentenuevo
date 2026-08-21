"use client";

import { Download, FileText, Loader2, TestTube2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Phase = "areas" | "before" | "during" | "after";
type ReportKey = "informe_areas" | "informe_antes" | "informe_durante" | "informe_despues" | "informe_consolidado";
type StateKey = "pending" | "review" | "resent" | "correction" | "approved" | "na";

type Definition = {
  id: string;
  hito_id: string;
  process: string;
  observable_competency: string;
  expected_evidence: string | null;
  criticality: "Crítica" | "Importante" | "Deseable";
};

type Score = {
  competency_id: string;
  score: number | null;
  not_applicable: boolean;
  coordinator_observation: string | null;
  evaluated_at: string | null;
  evaluated_by_staff_id: string | null;
};

type EvidenceItem = {
  id: string;
  kind: "image" | "file" | "link";
  file_name: string | null;
  mime_type: string | null;
  external_url: string | null;
};

type Submission = {
  id: string;
  version: number;
  status: "submitted" | "correction_required" | "approved" | "superseded";
  teacher_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
  items: EvidenceItem[];
};

type WorkspaceCriterion = {
  id: string;
  na_request?: { status: string; reviewed_at?: string | null } | null;
  request: {
    status: "pending" | "submitted" | "in_review" | "correction_required" | "approved" | "cancelled";
    submissions: Submission[];
  } | null;
};

type Workspace = { criteria: WorkspaceCriterion[] };
type StaffRow = { id: string; full_name: string; role: string };
type ReviewCycle = { id: string; sequence: number; title: string; closed_at: string | null; status: string; percent: number | null };
type ReviewWorkspace = { cycles?: ReviewCycle[] };
type ReportDefinition = { key: ReportKey; title: string; subtitle: string; phase?: Phase };

type CriterionRow = {
  definition: Definition;
  score: Score | null;
  workspace: WorkspaceCriterion | null;
  latest: Submission | null;
  state: { key: StateKey; label: string };
};

type Summary = {
  total: number;
  applicable: number;
  evaluated: number;
  approved: number;
  correction: number;
  pending: number;
  review: number;
  resent: number;
  na: number;
  advance: number;
  compliance: number | null;
  official: boolean;
};

const reports: ReportDefinition[] = [
  { key: "informe_areas", title: "Informe de Áreas", subtitle: "Inducción institucional y condiciones de incorporación docente.", phase: "areas" },
  { key: "informe_antes", title: "Informe Antes", subtitle: "Preparación académica y tecnológica previa al inicio de la docencia.", phase: "before" },
  { key: "informe_durante", title: "Informe Durante", subtitle: "Seguimiento de la ejecución académica y acompañamiento durante el período.", phase: "during" },
  { key: "informe_despues", title: "Informe Después", subtitle: "Cierre académico y verificación final del proceso docente.", phase: "after" },
  { key: "informe_consolidado", title: "Informe Consolidado", subtitle: "Resultado integral del acompañamiento docente." },
];

const phaseLabels: Record<Phase, string> = { areas: "Áreas", before: "Antes", during: "Durante", after: "Después" };
const phaseOrder: Phase[] = ["areas", "before", "during", "after"];
const sectionOrder: Record<Phase, string[]> = {
  areas: ["Talento", "Software", "Calidad", "Bienestar Estudiantil"],
  before: ["Coordinador", "Teams", "Telegram", "PEA", "Adaptaciones", "EVA", "SISACAD"],
  during: ["General", "Adaptaciones", "Presentaciones", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4", "Observación de clase"],
  after: ["Cierre"],
};
const stateColors: Record<StateKey, [number, number, number]> = {
  pending: [113, 128, 144], review: [45, 111, 168], resent: [111, 78, 168],
  correction: [193, 91, 55], approved: [46, 125, 91], na: [118, 86, 168],
};

function phaseForHito(value: string): Phase {
  if (value === "H1") return "areas";
  if (value === "H2") return "before";
  if (value === "H6") return "after";
  return "during";
}

function duringFamily(process: string) {
  if (process === "General") return "Seguimiento general";
  if (["Adaptaciones", "Presentaciones"].includes(process)) return "Seguimiento documental";
  if (/^Unidad\s+[1-4]$/i.test(process)) return "Verificación por unidades";
  return "Observación directa de clase";
}

function today() { return new Date().toISOString().slice(0, 10); }
function safeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }
function formatDate(value?: string | null) {
  if (!value) return "";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}
function roleLabel(value?: string | null) {
  if (value === "admin") return "Administrador SIACD";
  if (value === "approver") return "Autoridad revisora";
  return "Coordinador de carrera";
}
function latestSubmission(workspace?: WorkspaceCriterion | null) { return workspace?.request?.submissions?.[0] ?? null; }

function isFreshResubmission(score: Score | null, latest: Submission | null, workspace: WorkspaceCriterion | null) {
  if (!latest || latest.status !== "submitted" || !["submitted", "in_review"].includes(workspace?.request?.status ?? "")) return false;
  if (!score?.evaluated_at) return Boolean((workspace?.request?.submissions?.length ?? 0) > 1);
  const submittedAt = new Date(latest.submitted_at).getTime();
  const evaluatedAt = new Date(score.evaluated_at).getTime();
  return Number.isFinite(submittedAt) && Number.isFinite(evaluatedAt) && submittedAt > evaluatedAt;
}

function stateForCriterion(score: Score | null, workspace: WorkspaceCriterion | null) {
  const latest = latestSubmission(workspace);
  if (score?.not_applicable || workspace?.na_request?.status === "approved") return { key: "na", label: "No aplica" } as const;
  if (isFreshResubmission(score, latest, workspace)) return { key: "resent", label: "Corregido / reenviado" } as const;
  if (score?.score !== null && score?.score !== undefined) return score.score >= 3 ? { key: "approved", label: "Aprobado" } as const : { key: "correction", label: "Por corregir" } as const;
  if (workspace?.request?.status === "approved") return { key: "approved", label: "Aprobado" } as const;
  if (workspace?.request?.status === "correction_required" || latest?.status === "correction_required") return { key: "correction", label: "Por corregir" } as const;
  if (["submitted", "in_review"].includes(workspace?.request?.status ?? "") || latest?.status === "submitted") return { key: "review", label: "En revisión" } as const;
  if (workspace?.na_request?.status === "pending") return { key: "review", label: "En revisión" } as const;
  return { key: "pending", label: "Pendiente de evidencia" } as const;
}

function summarize(rows: CriterionRow[]): Summary {
  const na = rows.filter((row) => row.state.key === "na").length;
  const applicable = Math.max(0, rows.length - na);
  const evaluated = rows.filter((row) => !row.score?.not_applicable && row.score?.score !== null && row.score?.score !== undefined).length;
  const approved = rows.filter((row) => row.state.key === "approved").length;
  const correction = rows.filter((row) => row.state.key === "correction").length;
  const pending = rows.filter((row) => row.state.key === "pending").length;
  const review = rows.filter((row) => row.state.key === "review").length;
  const resent = rows.filter((row) => row.state.key === "resent").length;
  const advance = applicable > 0 ? Math.round(evaluated / applicable * 100) : 100;
  const compliance = evaluated > 0 ? Math.round(approved / evaluated * 100) : null;
  const official = rows.length > 0 && pending === 0 && review === 0 && resent === 0 && correction === 0 && evaluated === applicable;
  return { total: rows.length, applicable, evaluated, approved, correction, pending, review, resent, na, advance, compliance, official };
}

function componentSummaries(rows: CriterionRow[]) {
  const groups = new Map<string, CriterionRow[]>();
  for (const row of rows) groups.set(row.definition.process, [...(groups.get(row.definition.process) ?? []), row]);
  return [...groups.entries()].map(([name, items]) => ({ name, ...summarize(items) }));
}

function analysisText(label: string, summary: Summary, components: ReturnType<typeof componentSummaries>) {
  if (summary.evaluated === 0) return `De los ${summary.applicable} criterios aplicables de ${label}, aún no existe una evaluación registrada. Hay ${summary.pending} pendientes de evidencia y ${summary.review + summary.resent} en revisión. El avance de evaluación es ${summary.advance} % y el cumplimiento se mantiene como Sin evaluación.`;
  const attention = components.filter((item) => item.correction > 0 || item.pending > 0 || item.review + item.resent > 0)
    .sort((a, b) => (b.correction + b.pending + b.review + b.resent) - (a.correction + a.pending + a.review + a.resent)).slice(0, 3).map((item) => item.name);
  const first = `De los ${summary.applicable} criterios aplicables de ${label}, ${summary.evaluated} han sido evaluados. Se registran ${summary.approved} aprobados, ${summary.correction} por corregir, ${summary.pending} pendientes de evidencia, ${summary.review + summary.resent} en revisión y ${summary.na} No aplica.`;
  const second = `El avance de evaluación alcanza el ${summary.advance} %, mientras que el cumplimiento de los criterios evaluados corresponde al ${summary.compliance ?? 0} %.`;
  return attention.length ? `${first} ${second} Los principales aspectos que requieren atención se concentran en ${attention.join(", ")}.` : `${first} ${second}`;
}

function strengthsAndRisks(components: ReturnType<typeof componentSummaries>) {
  const strengths = components.filter((item) => item.evaluated > 0 && item.compliance !== null)
    .sort((a, b) => (b.compliance ?? 0) - (a.compliance ?? 0) || b.advance - a.advance).slice(0, 3);
  const risks = components.filter((item) => item.correction > 0 || item.pending > 0 || item.review + item.resent > 0)
    .sort((a, b) => (b.correction * 3 + b.pending + b.review + b.resent) - (a.correction * 3 + a.pending + a.review + a.resent)).slice(0, 3);
  return { strengths, risks };
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); return { canvas, ctx };
}

function statusDonut(summary: Summary) {
  const prepared = makeCanvas(900, 360); if (!prepared) return "";
  const { canvas, ctx } = prepared;
  const items = [
    ["Aprobados", summary.approved, "#2e7d5b"], ["Por corregir", summary.correction, "#c15b37"],
    ["Pendientes", summary.pending, "#718090"], ["En revisión", summary.review + summary.resent, "#2d6fa8"], ["No aplica", summary.na, "#7656a8"],
  ] as const;
  const total = Math.max(1, items.reduce((sum, item) => sum + item[1], 0));
  let angle = -Math.PI / 2; const cx = 190; const cy = 180;
  for (const [, value, color] of items) { if (!value) continue; const slice = value / total * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 115, angle, angle + slice); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); angle += slice; }
  ctx.beginPath(); ctx.arc(cx, cy, 67, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.textAlign = "center"; ctx.fillStyle = "#173f62"; ctx.font = "bold 34px Arial"; ctx.fillText(String(summary.total), cx, cy - 2); ctx.font = "18px Arial"; ctx.fillStyle = "#66788a"; ctx.fillText("criterios", cx, cy + 28);
  ctx.textAlign = "left"; let y = 82;
  for (const [label, value, color] of items) { ctx.fillStyle = color; ctx.fillRect(390, y - 17, 22, 22); ctx.fillStyle = "#21384f"; ctx.font = "22px Arial"; ctx.fillText(`${label}: ${value}`, 430, y); y += 48; }
  return canvas.toDataURL("image/png");
}

function componentBarChart(components: ReturnType<typeof componentSummaries>, title: string) {
  const rows = components.slice(0, 12); const prepared = makeCanvas(1100, Math.max(300, 110 + rows.length * 54)); if (!prepared) return "";
  const { canvas, ctx } = prepared; ctx.fillStyle = "#173f62"; ctx.font = "bold 26px Arial"; ctx.fillText(title, 30, 42);
  let y = 95; const labelWidth = 275; const barWidth = 670;
  rows.forEach((item) => { const value = item.compliance ?? 0; ctx.fillStyle = "#314b63"; ctx.font = "20px Arial"; ctx.fillText(item.name.slice(0, 30), 30, y + 20); ctx.fillStyle = "#e8edf2"; ctx.fillRect(labelWidth, y, barWidth, 24); ctx.fillStyle = item.compliance === null ? "#b7c0c9" : value >= 80 ? "#2e7d5b" : value >= 60 ? "#d09020" : "#c15b37"; ctx.fillRect(labelWidth, y, barWidth * value / 100, 24); ctx.fillStyle = "#173f62"; ctx.font = "bold 19px Arial"; ctx.fillText(item.compliance === null ? "Sin evaluación" : `${value}%`, labelWidth + barWidth + 18, y + 20); y += 54; });
  return canvas.toDataURL("image/png");
}

function phaseBarChart(data: Array<{ label: string; summary: Summary }>) {
  const prepared = makeCanvas(1000, 360); if (!prepared) return ""; const { canvas, ctx } = prepared;
  ctx.fillStyle = "#173f62"; ctx.font = "bold 26px Arial"; ctx.fillText("Cumplimiento por etapa", 30, 42);
  data.forEach((item, index) => { const value = item.summary.compliance ?? 0; const x = 110 + index * 195; const h = 190 * value / 100; ctx.fillStyle = "#e8edf2"; ctx.fillRect(x, 110, 82, 190); ctx.fillStyle = item.summary.compliance === null ? "#b7c0c9" : value >= 80 ? "#2e7d5b" : value >= 60 ? "#d09020" : "#c15b37"; ctx.fillRect(x, 300 - h, 82, h); ctx.textAlign = "center"; ctx.fillStyle = "#173f62"; ctx.font = "bold 20px Arial"; ctx.fillText(item.summary.compliance === null ? "—" : `${value}%`, x + 41, 300 - h - 12); ctx.font = "18px Arial"; ctx.fillText(item.label, x + 41, 330); });
  ctx.textAlign = "left"; return canvas.toDataURL("image/png");
}

function evolutionChart(cycles: ReviewCycle[]) {
  const closed = cycles.filter((item) => item.status === "closed" && item.percent !== null).sort((a, b) => a.sequence - b.sequence).slice(-6); if (closed.length < 2) return "";
  const prepared = makeCanvas(1000, 330); if (!prepared) return ""; const { canvas, ctx } = prepared; const left = 90; const right = 940; const top = 80; const bottom = 260;
  ctx.fillStyle = "#173f62"; ctx.font = "bold 26px Arial"; ctx.fillText("Evolución del cumplimiento", 30, 42);
  ctx.strokeStyle = "#dce4eb"; ctx.lineWidth = 2; for (let p = 0; p <= 100; p += 25) { const yy = bottom - (bottom - top) * p / 100; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); ctx.fillStyle = "#718090"; ctx.font = "16px Arial"; ctx.fillText(`${p}%`, 36, yy + 5); }
  const step = (right - left) / (closed.length - 1); ctx.strokeStyle = "#2d6fa8"; ctx.lineWidth = 5; ctx.beginPath();
  closed.forEach((item, index) => { const x = left + index * step; const yy = bottom - (bottom - top) * (item.percent ?? 0) / 100; if (!index) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }); ctx.stroke();
  closed.forEach((item, index) => { const x = left + index * step; const yy = bottom - (bottom - top) * (item.percent ?? 0) / 100; ctx.fillStyle = "#2d6fa8"; ctx.beginPath(); ctx.arc(x, yy, 8, 0, Math.PI * 2); ctx.fill(); ctx.textAlign = "center"; ctx.fillStyle = "#173f62"; ctx.font = "bold 17px Arial"; ctx.fillText(`${item.percent}%`, x, yy - 16); ctx.font = "15px Arial"; ctx.fillText(`R${item.sequence}`, x, bottom + 28); });
  ctx.textAlign = "left"; return canvas.toDataURL("image/png");
}

async function remoteImageDataUrl(url: string) {
  try { const response = await fetch(url); if (!response.ok) return ""; const blob = await response.blob(); return await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : ""); reader.onerror = () => resolve(""); reader.readAsDataURL(blob); }); } catch { return ""; }
}

export default function FormalReportWorkspace({ teacher, accessMode, coordinatorName, onClose }: { teacher: Teacher; accessMode: AccessMode; coordinatorName: string; onClose: () => void; }) {
  const [busy, setBusy] = useState<ReportKey | "">("");
  const [demoBusy, setDemoBusy] = useState("");
  const [message, setMessage] = useState("");
  const reportCards = useMemo(() => reports, []);
  const isDemo = /\bdemo\b/i.test(teacher.name);

  async function resolveStaffId() {
    if (accessMode === "coordinator") return teacher.coordinatorId || "";
    const supabase = getSupabaseBrowserClient(); if (!supabase) return "";
    const { data } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
    return data?.id ? String(data.id) : teacher.coordinatorId || "";
  }

  async function prepareDemo(mode: "mixed" | "approved") {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setDemoBusy(mode); setMessage("");
    try { const staffId = await resolveStaffId(); if (!staffId) throw new Error("No se pudo identificar al responsable."); const { data, error } = await supabase.rpc("staff_prepare_demo_report_fixture", { p_expedient_id: teacher.id, p_staff_id: staffId, p_mode: mode }); if (error) throw new Error(error.message.includes("Could not find") ? "Falta aplicar la migración de informes en Supabase." : error.message); const result = data as { message?: string } | null; setMessage(result?.message || "Escenario DEMO preparado."); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo preparar el escenario DEMO."); } finally { setDemoBusy(""); }
  }

  async function generate(definition: ReportDefinition) {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setBusy(definition.key); setMessage("");
    try {
      const staffId = await resolveStaffId(); if (!staffId) throw new Error("No se pudo identificar al responsable del informe.");
      const [definitionsResult, scoresResult, workspaceResult, documentsResult, staffResult, reviewResult] = await Promise.all([
        supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,expected_evidence,criticality").eq("active", true).order("id"),
        supabase.from("competency_scores").select("competency_id,score,not_applicable,coordinator_observation,evaluated_at,evaluated_by_staff_id").eq("expedient_id", teacher.id),
        supabase.rpc("staff_criterion_evidence_workspace", { p_expedient_id: teacher.id, p_staff_id: staffId }),
        supabase.from("generated_documents").select("id,document_type,status").eq("expedient_id", teacher.id),
        supabase.from("siacd_staff").select("id,full_name,role").eq("active", true),
        supabase.rpc("staff_review_workspace", { p_expedient_id: teacher.id, p_staff_id: staffId }),
      ]);
      if (definitionsResult.error || scoresResult.error || workspaceResult.error) throw new Error("No se pudo reunir la información del expediente.");

      const definitions = (definitionsResult.data ?? []) as Definition[];
      const scores = new Map<string, Score>((scoresResult.data ?? []).map((row) => [row.competency_id, { competency_id: row.competency_id, score: row.score === null ? null : Number(row.score), not_applicable: Boolean(row.not_applicable), coordinator_observation: row.coordinator_observation ?? null, evaluated_at: row.evaluated_at ?? null, evaluated_by_staff_id: row.evaluated_by_staff_id ?? null }]));
      const workspace = workspaceResult.data as Workspace;
      const evidenceMap = new Map(workspace.criteria.map((item) => [item.id, item]));
      const staffMap = new Map<string, StaffRow>(((staffResult.data ?? []) as StaffRow[]).map((item) => [item.id, item]));
      const generatorStaff = staffMap.get(staffId) ?? null;
      const reviewCycles = ((reviewResult.data as ReviewWorkspace | null)?.cycles ?? []) as ReviewCycle[];
      const scope = definition.phase ? definitions.filter((item) => phaseForHito(item.hito_id) === definition.phase) : definitions;
      const rows: CriterionRow[] = scope.map((item) => { const score = scores.get(item.id) ?? null; const criterionWorkspace = evidenceMap.get(item.id) ?? null; return { definition: item, score, workspace: criterionWorkspace, latest: latestSubmission(criterionWorkspace), state: stateForCriterion(score, criterionWorkspace) }; });
      const summary = summarize(rows); const official = summary.official;
      const version = (documentsResult.data ?? []).filter((item) => item.document_type === definition.key && item.status !== "void").length + 1;
      const code = `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const verificationUrl = `https://docentenuevo.pages.dev/verificar/?codigo=${encodeURIComponent(code)}`;

      const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = 210; const pageHeight = 297; const margin = 14; const contentWidth = 182; let y = 18;
      const pageHeader = () => { pdf.setFillColor(13, 41, 70); pdf.rect(0, 0, pageWidth, 20, "F"); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("ITSQMET · SIACD", margin, 9); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.text("Sistema Integral de Acompañamiento Docente", margin, 14); pdf.setTextColor(30, 45, 60); y = 28; };
      const ensure = (height = 14) => { if (y + height > pageHeight - 18) { pdf.addPage(); pageHeader(); } };
      const line = (text: string, size = 9, bold = false, color: [number, number, number] = [30, 45, 60]) => { if (!text) return; pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(...color); const lines = pdf.splitTextToSize(text, contentWidth); ensure(lines.length * 4.2 + 3); pdf.text(lines, margin, y); y += lines.length * 4.2 + 2; };
      const section = (title: string, subtitle?: string, color: [number, number, number] = [13, 41, 70]) => { ensure(subtitle ? 18 : 12); y += 2; pdf.setFillColor(241, 245, 248); pdf.roundedRect(margin, y - 5, contentWidth, subtitle ? 14 : 9, 1.5, 1.5, "F"); pdf.setTextColor(...color); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.2); pdf.text(title, margin + 3, y + 1); if (subtitle) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.2); pdf.setTextColor(75, 90, 105); pdf.text(pdf.splitTextToSize(subtitle, contentWidth - 6), margin + 3, y + 5.5); y += 11; } else y += 7; };
      const meta = (label: string, value: string, x: number, top: number, width: number) => { pdf.setTextColor(95, 108, 120); pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.7); pdf.text(label.toUpperCase(), x, top); pdf.setTextColor(28, 42, 55); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.1); pdf.text(pdf.splitTextToSize(value || "—", width), x, top + 5); };
      const drawHeader = () => { pageHeader(); pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.setTextColor(13, 41, 70); pdf.text(definition.title, margin, y); y += 7; pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.7); pdf.setTextColor(85, 98, 112); pdf.text(pdf.splitTextToSize(definition.subtitle, 137), margin, y); pdf.setFillColor(official ? 229 : 255, official ? 246 : 243, official ? 235 : 215); pdf.setTextColor(official ? 34 : 141, official ? 104 : 88, official ? 64 : 18); pdf.roundedRect(166, 25, 29, 9, 2, 2, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.text(official ? "OFICIAL" : "BORRADOR", 180.5, 30.7, { align: "center" }); y += 12; pdf.setDrawColor(220, 226, 232); pdf.roundedRect(margin, y, contentWidth, 31, 2, 2, "S"); meta("Docente", teacher.name, 18, y + 7, 75); meta("Carrera", teacher.career, 102, y + 7, 88); meta("Asignatura", teacher.subject, 18, y + 20, 75); meta("Período / modalidad", `${teacher.period} · ${teacher.modality}`, 102, y + 20, 88); y += 38; };
      const card = (x: number, top: number, width: number, label: string, value: string, color: [number, number, number]) => { pdf.setFillColor(249, 251, 252); pdf.setDrawColor(226, 232, 237); pdf.roundedRect(x, top, width, 17, 2, 2, "FD"); pdf.setTextColor(...color); pdf.setFont("helvetica", "bold"); pdf.setFontSize(value.length > 14 ? 8.2 : 11.3); pdf.text(value, x + 3, top + 7.2); pdf.setFontSize(6.1); pdf.setTextColor(98, 111, 124); pdf.text(label.toUpperCase(), x + 3, top + 13.2); };

      const drawSummary = (reportRows: CriterionRow[], label: string) => { const s = summarize(reportRows); section("Resumen ejecutivo", s.official ? "Todos los criterios aplicables están aprobados." : "Documento en proceso de evaluación y acompañamiento."); const gap = 2; const w = (contentWidth - gap * 4) / 5; card(margin, y, w, "Aprobados", String(s.approved), stateColors.approved); card(margin + (w + gap), y, w, "Por corregir", String(s.correction), stateColors.correction); card(margin + (w + gap) * 2, y, w, "Pendientes", String(s.pending), stateColors.pending); card(margin + (w + gap) * 3, y, w, "En revisión", String(s.review + s.resent), stateColors.review); card(margin + (w + gap) * 4, y, w, "No aplica", String(s.na), stateColors.na); y += 21; const half = (contentWidth - 3) / 2; card(margin, y, half, "Avance de evaluación", `${s.evaluated}/${s.applicable} · ${s.advance}%`, stateColors.review); card(margin + half + 3, y, half, "Cumplimiento evaluado", s.compliance === null ? "Sin evaluación" : `${s.approved}/${s.evaluated} · ${s.compliance}%`, stateColors.approved); y += 23; const donut = statusDonut(s); const bars = componentBarChart(componentSummaries(reportRows), definition.phase === "during" ? "Cumplimiento por bloque" : "Cumplimiento por componente"); if (donut || bars) ensure(58); if (donut) pdf.addImage(donut, "PNG", margin, y, 82, 33); if (bars) pdf.addImage(bars, "PNG", 100, y, 96, 44); if (donut || bars) y += 49; section("Análisis automático"); line(analysisText(label, s, componentSummaries(reportRows)), 8.1); return s; };

      const drawPhaseTable = () => { const data = phaseOrder.map((phase) => ({ phase, label: phaseLabels[phase], summary: summarize(rows.filter((row) => phaseForHito(row.definition.hito_id) === phase)) })); section("Resultado por etapa"); ensure(38); const xs = [14, 48, 75, 100, 124, 148, 176]; const heads = ["Etapa", "Aprob.", "Corregir", "Pend.", "Revisión", "N/A", "Cumpl."]; pdf.setFillColor(233, 239, 244); pdf.rect(margin, y, contentWidth, 7, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.6); pdf.setTextColor(42, 61, 79); heads.forEach((h, i) => pdf.text(h, xs[i], y + 4.7)); y += 8; data.forEach((row) => { const values = [row.label, String(row.summary.approved), String(row.summary.correction), String(row.summary.pending), String(row.summary.review + row.summary.resent), String(row.summary.na), row.summary.compliance === null ? "—" : `${row.summary.compliance}%`]; pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.1); pdf.setTextColor(45, 61, 78); values.forEach((value, i) => pdf.text(value, xs[i], y + 4.5)); pdf.setDrawColor(232, 236, 240); pdf.line(margin, y + 6.5, 196, y + 6.5); y += 7; }); const chart = phaseBarChart(data.map((item) => ({ label: item.label, summary: item.summary }))); if (chart) { ensure(64); pdf.addImage(chart, "PNG", margin, y + 2, contentWidth, 57); y += 63; } };

      const drawInsights = (reportRows: CriterionRow[]) => { const s = summarize(reportRows); const comps = componentSummaries(reportRows); const { strengths, risks } = strengthsAndRisks(comps); section("Fortalezas identificadas"); if (strengths.length) strengths.forEach((item) => line(`${item.name}: ${item.compliance ?? 0}% de cumplimiento evaluado y ${item.advance}% de avance.`, 8)); else line("Todavía no existen evaluaciones suficientes para identificar fortalezas.", 8); section("Aspectos por corregir"); if (risks.length) risks.forEach((item) => line(`${item.name}: ${item.correction} por corregir, ${item.pending} pendientes y ${item.review + item.resent} en revisión.`, 8)); else line("No se registran componentes con brechas activas.", 8); const critical = reportRows.filter((row) => row.definition.criticality === "Crítica" && !["approved", "na"].includes(row.state.key)).slice(0, 8); section("Criterios críticos pendientes"); if (critical.length) critical.forEach((row) => line(`${row.definition.id} · ${row.definition.observable_competency} — ${row.state.label}.`, 7.7)); else line("No se registran criterios críticos pendientes.", 8); section("Recomendaciones"); if (s.correction) line("Priorizar los criterios por corregir y verificar una nueva entrega antes de cerrar el informe.", 8); if (s.review + s.resent) line("Revisar las evidencias pendientes de validación para actualizar el avance real del proceso.", 8); if (s.pending) line("Solicitar las evidencias faltantes en los componentes con menor avance.", 8); if (s.official) line("Mantener la trazabilidad y conservar las evidencias aprobadas como respaldo del cierre oficial.", 8); section("Conclusión general"); line(s.official ? `El alcance evaluado está completo y aprobado. El cumplimiento evaluado es ${s.compliance ?? 100}% y el informe puede emitirse como OFICIAL.` : `El proceso permanece en BORRADOR. El avance de evaluación es ${s.advance}% y el cumplimiento evaluado es ${s.compliance === null ? "Sin evaluación" : `${s.compliance}%`}.`, 8.1); };

      const drawCriterion = (row: CriterionRow) => { const score = row.score; const latest = row.latest; const evaluator = score?.evaluated_by_staff_id ? staffMap.get(score.evaluated_by_staff_id) ?? null : null; const titleLines = pdf.splitTextToSize(`${row.definition.id} · ${row.definition.observable_competency}`, 126); const observation = score?.coordinator_observation?.trim() || ""; const observationLines = observation ? pdf.splitTextToSize(`Observación: ${observation}`, 174) : []; const evidenceLines: string[] = []; (latest?.items ?? []).forEach((item) => { const ref = item.kind === "link" ? item.external_url : item.file_name; if (ref) evidenceLines.push(`${item.kind === "link" ? "Tipo de evidencia: Enlace · " : "Evidencia: "}${ref}`); }); if (latest?.submitted_at) evidenceLines.push(`Fecha de carga: ${formatDate(latest.submitted_at)}`); const reviewDate = latest?.reviewed_at || score?.evaluated_at; if (reviewDate) evidenceLines.push(`Fecha de revisión: ${formatDate(reviewDate)}`); if (evaluator) evidenceLines.push(`Evaluador: ${evaluator.full_name} · ${roleLabel(evaluator.role)}`); const trace = evidenceLines.flatMap((text) => pdf.splitTextToSize(text, 174)); const boxHeight = Math.max(17, 10 + titleLines.length * 3.5 + (observationLines.length ? observationLines.length * 3.3 + 2 : 0) + (trace.length ? trace.length * 3.1 + 4 : 0)); ensure(boxHeight + 4); const top = y - 2; const [r, g, b] = stateColors[row.state.key]; pdf.setDrawColor(224, 229, 234); pdf.setFillColor(252, 253, 254); pdf.roundedRect(margin, top, contentWidth, boxHeight, 1.5, 1.5, "FD"); pdf.setFillColor(r, g, b); pdf.rect(margin, top, 2.2, boxHeight, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(22, 43, 64); pdf.text(titleLines, 18, y + 2.5); pdf.setTextColor(r, g, b); pdf.setFontSize(6.7); pdf.text(row.state.label.toUpperCase(), 193, y + 2.5, { align: "right" }); y += titleLines.length * 3.5 + 3.5; pdf.setTextColor(50, 66, 82); pdf.setFontSize(7.1); const grade = score?.not_applicable ? "No aplica aprobado" : score?.score !== null && score?.score !== undefined ? `${score.score}/4` : "Sin calificación"; pdf.text(`Calificación: ${grade}`, 18, y); y += 4; if (observationLines.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(82, 94, 106); pdf.text(observationLines, 18, y); y += observationLines.length * 3.3 + 2; } if (trace.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.7); pdf.setTextColor(76, 91, 105); pdf.text(trace, 18, y); y += trace.length * 3.1 + 3; } y = Math.max(y, top + boxHeight + 3); };

      const drawDetails = (reportRows: CriterionRow[], annex = false) => { section(annex ? "Anexo · Detalle completo de criterios" : "Detalle de criterios", annex ? "Trazabilidad criterio por criterio para auditoría y respaldo." : "Estado, calificación, evidencia, fechas y evaluador."); for (const phase of phaseOrder) { const phaseRows = reportRows.filter((row) => phaseForHito(row.definition.hito_id) === phase); if (!phaseRows.length) continue; section(phaseLabels[phase], `${phaseRows.length} criterios.`, [22, 75, 112]); const groups = new Map<string, CriterionRow[]>(); phaseRows.forEach((row) => groups.set(row.definition.process, [...(groups.get(row.definition.process) ?? []), row])); const ordered = [...groups.keys()].sort((a, b) => { const ai = sectionOrder[phase].indexOf(a); const bi = sectionOrder[phase].indexOf(b); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b); }); let family = ""; for (const group of ordered) { if (phase === "during") { const next = duringFamily(group); if (next !== family) { family = next; ensure(10); line(family, 9.1, true, [74, 65, 120]); } } ensure(9); line(group, 8.5, true, [43, 78, 104]); (groups.get(group) ?? []).forEach(drawCriterion); } } };

      const drawClosure = async () => { section("Cierre del informe"); const evaluatorIds = [...new Set(rows.map((row) => row.score?.evaluated_by_staff_id).filter((value): value is string => Boolean(value)))]; const evaluators = evaluatorIds.map((id) => staffMap.get(id)).filter((item): item is StaffRow => Boolean(item)); if (evaluators.length) line(`Evaluador(es): ${evaluators.slice(0, 4).map((item) => `${item.full_name} (${roleLabel(item.role)})`).join(" · ")}`, 7.7); line(`Generado por: ${generatorStaff?.full_name || (accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "Coordinación académica")}`, 7.7); line(`Fecha de generación: ${formatDate(today())} · Versión ${version}`, 7.5); line(`Estado: ${official ? "INFORME OFICIAL" : "BORRADOR"}`, 7.7, true, official ? stateColors.approved : stateColors.correction); line(`Código de verificación: ${code}`, 7.5, true); line(`Verificación: ${verificationUrl}`, 6.7); ensure(34); const qr = await remoteImageDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verificationUrl)}`); if (qr) { pdf.addImage(qr, "PNG", margin, y, 28, 28); pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.7); pdf.setTextColor(85, 98, 112); pdf.text("Escanee para verificar autenticidad", 47, y + 14); y += 32; } };

      drawHeader();
      if (definition.key === "informe_consolidado") { drawSummary(rows, "el acompañamiento consolidado"); drawPhaseTable(); const history = evolutionChart(reviewCycles); if (history) { section("Evolución histórica"); ensure(64); pdf.addImage(history, "PNG", margin, y, contentWidth, 57); y += 63; } drawInsights(rows); drawDetails(rows, true); }
      else { drawSummary(rows, `la etapa ${definition.phase ? phaseLabels[definition.phase] : definition.title}`); drawDetails(rows); drawInsights(rows); }
      await drawClosure();

      const pages = pdf.getNumberOfPages(); for (let page = 1; page <= pages; page += 1) { pdf.setPage(page); pdf.setDrawColor(225, 230, 235); pdf.line(margin, 285, 196, 285); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(105, 116, 127); pdf.text(`${definition.title} · ${teacher.name}`, margin, 290); pdf.text(`Página ${page} de ${pages}`, 196, 290, { align: "right" }); }

      const blob = pdf.output("blob"); const storagePath = `${teacher.id}/documents/formal-${definition.key}-v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (!uploadError) await supabase.from("generated_documents").insert({ expedient_id: teacher.id, document_type: definition.key, status: "generated", storage_path: storagePath, verification_code: code, generated_by: null, generated_by_staff_id: staffId, issued_on: today(), observation: `${official ? "OFICIAL" : "BORRADOR"} · FORMATO INSTITUCIONAL · Versión ${version}` });
      pdf.save(`${safeName(definition.title.toLowerCase())}-${safeName(teacher.name.toLowerCase())}-v${version}.pdf`); setMessage(`${definition.title} generado${official ? " como documento oficial" : " como borrador"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo generar el informe."); } finally { setBusy(""); }
  }

  return <div style={{ position: "fixed", inset: 0, background: "rgba(8,22,38,.58)", zIndex: 10020, display: "grid", placeItems: "center", padding: 18 }}>
    <section style={{ width: "min(940px,96vw)", maxHeight: "92vh", overflow: "auto", background: "white", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.24)" }}>
      <header style={{ padding: "20px 22px", background: "#0d2946", color: "white", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
        <div><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>DOCUMENTACIÓN INSTITUCIONAL</span><h2 style={{ margin: "5px 0 2px" }}>Informes SIACD</h2><p style={{ margin: 0, opacity: .78, fontSize: 13 }}>Resumen ejecutivo, trazabilidad y anexo auditable.</p></div>
        <button onClick={onClose} aria-label="Cerrar" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "white", borderRadius: 10, padding: 8, cursor: "pointer" }}><X size={18}/></button>
      </header>
      <div style={{ padding: 22 }}>
        {message && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#eef5fb", marginBottom: 14, color: "#173b5c", fontSize: 13 }}>{message}</div>}
        {isDemo && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 11, marginBottom: 14, border: "1px solid #e1d8ef", background: "#faf7fd", borderRadius: 12 }}><TestTube2 size={17}/><strong style={{ fontSize: 12 }}>Docente de prueba</strong><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("mixed")} style={{ border: "1px solid #d8cae8", background: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Escenario mixto</button><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("approved")} style={{ border: 0, background: "#2e7d5b", color: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Todo aprobado</button></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12 }}>
          {reportCards.map((item) => <article key={item.key} style={{ border: "1px solid #dce4eb", borderRadius: 13, padding: 15, display: "grid", gap: 9 }}><FileText size={20}/><div><strong style={{ display: "block", fontSize: 15 }}>{item.title}</strong><span style={{ fontSize: 12, color: "#66788a" }}>{item.subtitle}</span></div><button disabled={Boolean(busy || demoBusy)} onClick={() => void generate(item)} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: "#143d63", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>{busy === item.key ? <Loader2 size={15}/> : <Download size={15}/>} {busy === item.key ? "Generando…" : "Generar PDF"}</button></article>)}
        </div>
      </div>
    </section>
  </div>;
}