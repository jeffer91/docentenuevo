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
  external_url: string | null;
};

type Submission = {
  id: string;
  version: number;
  status: "submitted" | "correction_required" | "approved" | "superseded";
  submitted_at: string;
  reviewed_at: string | null;
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

type DescriptiveStats = {
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  distribution: [number, number, number, number, number];
};

type ComponentSummary = Summary & { name: string; stats: DescriptiveStats };

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

const colors: Record<StateKey, [number, number, number]> = {
  pending: [113, 128, 144],
  review: [45, 111, 168],
  resent: [111, 78, 168],
  correction: [193, 91, 55],
  approved: [46, 125, 91],
  na: [118, 86, 168],
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

function latestSubmission(workspace?: WorkspaceCriterion | null) {
  return workspace?.request?.submissions?.[0] ?? null;
}

function stateForCriterion(score: Score | null, workspace: WorkspaceCriterion | null) {
  const latest = latestSubmission(workspace);
  if (score?.not_applicable || workspace?.na_request?.status === "approved") return { key: "na", label: "No aplica" } as const;
  if (latest?.status === "submitted" && score?.evaluated_at) {
    const submitted = new Date(latest.submitted_at).getTime();
    const evaluated = new Date(score.evaluated_at).getTime();
    if (Number.isFinite(submitted) && Number.isFinite(evaluated) && submitted > evaluated) return { key: "resent", label: "Corregido / reenviado" } as const;
  }
  if (score?.score !== null && score?.score !== undefined) return score.score >= 3 ? { key: "approved", label: "Aprobado" } as const : { key: "correction", label: "Por corregir" } as const;
  if (workspace?.request?.status === "correction_required" || latest?.status === "correction_required") return { key: "correction", label: "Por corregir" } as const;
  if (["submitted", "in_review", "approved"].includes(workspace?.request?.status ?? "") || latest?.status === "submitted") return { key: "review", label: "En revisión" } as const;
  if (workspace?.na_request?.status === "pending") return { key: "review", label: "En revisión" } as const;
  return { key: "pending", label: "Pendiente de evidencia" } as const;
}

function summarize(rows: CriterionRow[]): Summary {
  const na = rows.filter((row) => row.state.key === "na").length;
  const applicable = Math.max(0, rows.length - na);
  const evaluated = rows.filter((row) => !row.score?.not_applicable && row.score?.score !== null && row.score?.score !== undefined).length;
  const approved = rows.filter((row) => row.score?.score !== null && row.score?.score !== undefined && row.score.score >= 3 && !row.score.not_applicable).length;
  const correction = rows.filter((row) => row.state.key === "correction").length;
  const pending = rows.filter((row) => row.state.key === "pending").length;
  const review = rows.filter((row) => row.state.key === "review").length;
  const resent = rows.filter((row) => row.state.key === "resent").length;
  const advance = applicable > 0 ? Math.round((evaluated / applicable) * 100) : 100;
  const compliance = evaluated > 0 ? Math.round((approved / evaluated) * 100) : null;
  const official = rows.length > 0 && applicable === evaluated && approved === applicable && correction === 0 && pending === 0 && review === 0 && resent === 0;
  return { total: rows.length, applicable, evaluated, approved, correction, pending, review, resent, na, advance, compliance, official };
}

function descriptiveStats(rows: CriterionRow[]): DescriptiveStats {
  const values = rows
    .map((row) => row.score)
    .filter((score): score is Score => Boolean(score) && !score.not_applicable && score.score !== null && score.score !== undefined)
    .map((score) => Number(score.score))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 4)
    .sort((a, b) => a - b);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  values.forEach((value) => { distribution[Math.round(value) as 0 | 1 | 2 | 3 | 4] += 1; });
  if (!values.length) return { n: 0, mean: null, median: null, sd: null, min: null, max: null, distribution };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    n: values.length,
    mean,
    median,
    sd: Math.sqrt(variance),
    min: values[0],
    max: values[values.length - 1],
    distribution,
  };
}

function componentSummaries(rows: CriterionRow[]): ComponentSummary[] {
  const grouped = new Map<string, CriterionRow[]>();
  rows.forEach((row) => grouped.set(row.definition.process, [...(grouped.get(row.definition.process) ?? []), row]));
  return [...grouped.entries()].map(([name, items]) => ({ name, ...summarize(items), stats: descriptiveStats(items) }));
}

function ecuadorToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00-05:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function roleLabel(role?: string | null) {
  if (role === "admin") return "Administrador SIACD";
  if (role === "approver") return "Autoridad revisora";
  return "Coordinador de carrera";
}

function fmt(value: number | null, decimals = 2) {
  if (value === null || !Number.isFinite(value)) return "Sin evaluación";
  return value.toFixed(decimals).replace(".", ",");
}

function lowerInitial(value: string) {
  const trimmed = value.trim().replace(/[.]+$/, "");
  return trimmed ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : "el criterio establecido";
}

function criterionExplanation(definition: Definition) {
  const evidence = definition.expected_evidence?.trim();
  const verification = `Este criterio verifica que ${lowerInitial(definition.observable_competency)} dentro del componente ${definition.process}.`;
  const support = evidence
    ? `La comprobación se sustenta en ${lowerInitial(evidence)} y en la trazabilidad registrada en SIACD.`
    : "La comprobación se sustenta en la evidencia registrada y revisada en SIACD.";
  return `${verification} ${support}`;
}

function scoreInterpretation(score: Score | null) {
  if (score?.not_applicable) return "No aplica aprobado por coordinación.";
  if (score?.score === null || score?.score === undefined) return "Sin calificación registrada.";
  if (score.score === 4) return "Cumplimiento integral del criterio.";
  if (score.score === 3) return "Cumple el criterio establecido.";
  if (score.score === 2) return "Cumplimiento parcial; requiere acompañamiento y corrección.";
  if (score.score === 1) return "Cumplimiento incipiente; requiere corrección prioritaria.";
  return "No cumple el criterio; requiere intervención y nueva evidencia.";
}

function conclusionText(summary: Summary, components: ComponentSummary[], stats: DescriptiveStats) {
  if (summary.evaluated === 0) return `Aún no existe una evaluación registrada para los ${summary.applicable} criterios aplicables. El informe permanece en borrador hasta que coordinación revise las evidencias y asigne las calificaciones correspondientes.`;
  const best = components.filter((item) => item.compliance !== null).sort((a, b) => (b.compliance ?? 0) - (a.compliance ?? 0))[0];
  const attention = components.filter((item) => item.correction + item.pending + item.review + item.resent > 0).sort((a, b) => (b.correction * 3 + b.pending + b.review + b.resent) - (a.correction * 3 + a.pending + a.review + a.resent))[0];
  const statistical = stats.mean === null ? "" : ` La calificación promedio es ${fmt(stats.mean)} de 4, con una desviación estándar de ${fmt(stats.sd)}.`;
  if (summary.official) return `La evaluación se encuentra completa. Todos los criterios aplicables fueron evaluados y aprobados, con un cumplimiento evaluado del ${summary.compliance ?? 100} %.${statistical} El informe cumple las condiciones para emitirse como documento oficial.`;
  return `El avance de evaluación es ${summary.advance} % y el cumplimiento de los criterios evaluados es ${summary.compliance ?? 0} %.${statistical}${best ? ` El componente con mejor desempeño es ${best.name}.` : ""}${attention ? ` La principal atención se concentra en ${attention.name}.` : ""} El proceso continúa en estado borrador.`;
}

function improvementItems(summary: Summary, components: ComponentSummary[]) {
  const items: string[] = [];
  const risks = components.filter((item) => item.correction + item.pending + item.review + item.resent > 0).sort((a, b) => (b.correction * 3 + b.pending + b.review + b.resent) - (a.correction * 3 + a.pending + a.review + a.resent)).slice(0, 4);
  risks.forEach((item) => {
    const details = [item.correction ? `${item.correction} por corregir` : "", item.pending ? `${item.pending} pendientes` : "", item.review + item.resent ? `${item.review + item.resent} en revisión` : ""].filter(Boolean).join(", ");
    items.push(`${item.name}: ${details}.`);
  });
  if (!summary.evaluated) items.unshift("Iniciar la revisión de las evidencias recibidas para contar con resultados evaluados.");
  if (summary.pending) items.push("Completar las evidencias pendientes antes del cierre del acompañamiento.");
  if (summary.correction) items.push("Priorizar los criterios por corregir y verificar el reenvío del docente.");
  if (!items.length) items.push("No se identifican aspectos pendientes de mejora en el alcance evaluado.");
  return [...new Set(items)].slice(0, 6);
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function statusDonut(summary: Summary) {
  const prepared = makeCanvas(1000, 420);
  if (!prepared) return "";
  const { canvas, ctx } = prepared;
  const items = [
    ["Aprobados", summary.approved, "#2e7d5b"],
    ["Por corregir", summary.correction, "#c15b37"],
    ["Pendientes", summary.pending, "#718090"],
    ["En revisión", summary.review + summary.resent, "#2d6fa8"],
    ["No aplica", summary.na, "#7656a8"],
  ] as const;
  const total = Math.max(1, items.reduce((sum, item) => sum + item[1], 0));
  const cx = 225;
  const cy = 210;
  let angle = -Math.PI / 2;
  items.forEach(([, value, color]) => {
    if (!value) return;
    const slice = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 130, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    angle += slice;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 76, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#173f62";
  ctx.font = "bold 40px Arial";
  ctx.fillText(String(summary.total), cx, cy - 3);
  ctx.font = "19px Arial";
  ctx.fillStyle = "#66788a";
  ctx.fillText("criterios", cx, cy + 30);
  ctx.textAlign = "left";
  let y = 98;
  items.forEach(([label, value, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(510, y - 17, 24, 24);
    ctx.fillStyle = "#21384f";
    ctx.font = "22px Arial";
    ctx.fillText(`${label}: ${value}`, 552, y + 2);
    y += 55;
  });
  return canvas.toDataURL("image/png");
}

function scoreDistributionChart(stats: DescriptiveStats) {
  const prepared = makeCanvas(1000, 390);
  if (!prepared) return "";
  const { canvas, ctx } = prepared;
  const max = Math.max(1, ...stats.distribution);
  const left = 100;
  const baseline = 310;
  const width = 120;
  const gap = 55;
  ctx.strokeStyle = "#dfe6ec";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, baseline);
  ctx.lineTo(930, baseline);
  ctx.stroke();
  stats.distribution.forEach((count, score) => {
    const x = left + score * (width + gap);
    const height = (count / max) * 210;
    ctx.fillStyle = score >= 3 ? "#2e7d5b" : score === 2 ? "#d09020" : "#c15b37";
    ctx.fillRect(x, baseline - height, width, height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#173f62";
    ctx.font = "bold 22px Arial";
    ctx.fillText(String(count), x + width / 2, baseline - height - 14);
    ctx.font = "19px Arial";
    ctx.fillText(`${score}/4`, x + width / 2, baseline + 35);
  });
  ctx.textAlign = "left";
  return canvas.toDataURL("image/png");
}

function componentBarChart(components: ComponentSummary[]) {
  const data = components.slice(0, 16);
  const prepared = makeCanvas(1200, Math.max(340, 70 + data.length * 56));
  if (!prepared) return "";
  const { canvas, ctx } = prepared;
  let y = 35;
  const labelWidth = 330;
  const barWidth = 700;
  data.forEach((item) => {
    const value = item.compliance ?? 0;
    ctx.fillStyle = "#314b63";
    ctx.font = "20px Arial";
    ctx.fillText(item.name.slice(0, 34), 32, y + 21);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(labelWidth, y, barWidth, 26);
    ctx.fillStyle = item.compliance === null ? "#b7c0c9" : value >= 80 ? "#2e7d5b" : value >= 60 ? "#d09020" : "#c15b37";
    ctx.fillRect(labelWidth, y, barWidth * value / 100, 26);
    ctx.fillStyle = "#173f62";
    ctx.font = "bold 18px Arial";
    ctx.fillText(item.compliance === null ? "Sin evaluación" : `${value}%`, labelWidth + barWidth + 18, y + 21);
    y += 56;
  });
  return canvas.toDataURL("image/png");
}

function phaseBarChart(rows: CriterionRow[]) {
  const data = phaseOrder.map((phase) => ({ label: phaseLabels[phase], summary: summarize(rows.filter((row) => phaseForHito(row.definition.hito_id) === phase)) }));
  const prepared = makeCanvas(1000, 390);
  if (!prepared) return "";
  const { canvas, ctx } = prepared;
  data.forEach((item, index) => {
    const value = item.summary.compliance ?? 0;
    const x = 115 + index * 205;
    const h = 205 * value / 100;
    ctx.fillStyle = "#edf1f4";
    ctx.fillRect(x, 75, 86, 225);
    ctx.fillStyle = item.summary.compliance === null ? "#b7c0c9" : value >= 80 ? "#2e7d5b" : value >= 60 ? "#d09020" : "#c15b37";
    ctx.fillRect(x, 300 - h, 86, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#173f62";
    ctx.font = "bold 19px Arial";
    ctx.fillText(item.summary.compliance === null ? "—" : `${value}%`, x + 43, 60);
    ctx.font = "17px Arial";
    ctx.fillText(item.label, x + 43, 340);
  });
  ctx.textAlign = "left";
  return canvas.toDataURL("image/png");
}

function evolutionChart(cycles: ReviewCycle[]) {
  const closed = cycles.filter((item) => item.status === "closed" && item.percent !== null).sort((a, b) => a.sequence - b.sequence).slice(-6);
  if (closed.length < 2) return "";
  const prepared = makeCanvas(1000, 350);
  if (!prepared) return "";
  const { canvas, ctx } = prepared;
  const left = 90;
  const right = 940;
  const top = 45;
  const bottom = 275;
  ctx.strokeStyle = "#dce4eb";
  ctx.lineWidth = 2;
  for (let p = 0; p <= 100; p += 25) {
    const yy = bottom - (bottom - top) * p / 100;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    ctx.fillStyle = "#718090";
    ctx.font = "16px Arial";
    ctx.fillText(`${p}%`, 36, yy + 5);
  }
  const step = (right - left) / (closed.length - 1);
  ctx.strokeStyle = "#2d6fa8";
  ctx.lineWidth = 5;
  ctx.beginPath();
  closed.forEach((item, index) => {
    const x = left + index * step;
    const yy = bottom - (bottom - top) * (item.percent ?? 0) / 100;
    if (!index) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  });
  ctx.stroke();
  closed.forEach((item, index) => {
    const x = left + index * step;
    const yy = bottom - (bottom - top) * (item.percent ?? 0) / 100;
    ctx.fillStyle = "#2d6fa8";
    ctx.beginPath();
    ctx.arc(x, yy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#173f62";
    ctx.font = "bold 17px Arial";
    ctx.fillText(`${item.percent}%`, x, yy - 16);
    ctx.font = "15px Arial";
    ctx.fillText(`R${item.sequence}`, x, bottom + 28);
  });
  ctx.textAlign = "left";
  return canvas.toDataURL("image/png");
}

async function remoteImageDataUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export default function FormalReportWorkspaceV3({ teacher, accessMode, coordinatorName, onClose }: { teacher: Teacher; accessMode: AccessMode; coordinatorName: string; onClose: () => void }) {
  const [busy, setBusy] = useState<ReportKey | "">("");
  const [demoBusy, setDemoBusy] = useState("");
  const [message, setMessage] = useState("");
  const reportCards = useMemo(() => reports, []);
  const isDemo = /\bdemo\b/i.test(teacher.name);

  async function resolveStaffId() {
    if (accessMode === "coordinator") return teacher.coordinatorId || "";
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "";
    const { data } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
    return data?.id ? String(data.id) : teacher.coordinatorId || "";
  }

  async function prepareDemo(mode: "mixed" | "approved") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setDemoBusy(mode);
    setMessage("");
    try {
      const staffId = await resolveStaffId();
      if (!staffId) throw new Error("No se pudo identificar al responsable.");
      const { data, error } = await supabase.rpc("staff_prepare_demo_report_fixture", { p_expedient_id: teacher.id, p_staff_id: staffId, p_mode: mode });
      if (error) throw new Error(error.message);
      setMessage((data as { message?: string } | null)?.message || "Escenario DEMO preparado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo preparar el escenario DEMO.");
    } finally {
      setDemoBusy("");
    }
  }

  async function generate(definition: ReportDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(definition.key);
    setMessage("");
    try {
      const staffId = await resolveStaffId();
      if (!staffId) throw new Error("No se pudo identificar al responsable del informe.");
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
      const scores = new Map<string, Score>((scoresResult.data ?? []).map((row) => [row.competency_id, {
        competency_id: row.competency_id,
        score: row.score === null ? null : Number(row.score),
        not_applicable: Boolean(row.not_applicable),
        coordinator_observation: row.coordinator_observation ?? null,
        evaluated_at: row.evaluated_at ?? null,
        evaluated_by_staff_id: row.evaluated_by_staff_id ?? null,
      }]));
      const workspace = workspaceResult.data as Workspace;
      const evidenceMap = new Map(workspace.criteria.map((item) => [item.id, item]));
      const staffMap = new Map<string, StaffRow>(((staffResult.data ?? []) as StaffRow[]).map((item) => [item.id, item]));
      const reviewCycles = ((reviewResult.data as ReviewWorkspace | null)?.cycles ?? []) as ReviewCycle[];
      const generatorStaff = staffMap.get(staffId) ?? null;
      const scope = definition.phase ? definitions.filter((item) => phaseForHito(item.hito_id) === definition.phase) : definitions;
      const rows: CriterionRow[] = scope.map((item) => {
        const score = scores.get(item.id) ?? null;
        const criterionWorkspace = evidenceMap.get(item.id) ?? null;
        return { definition: item, score, workspace: criterionWorkspace, latest: latestSubmission(criterionWorkspace), state: stateForCriterion(score, criterionWorkspace) };
      });
      const summary = summarize(rows);
      const official = summary.official;
      const version = (documentsResult.data ?? []).filter((item) => item.document_type === definition.key && item.status !== "void").length + 1;
      const code = `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const verificationUrl = `https://docentenuevo.pages.dev/verificar/?codigo=${encodeURIComponent(code)}`;
      const institutionalLogo = await remoteImageDataUrl(new URL("/logo-itsqmet.png", window.location.origin).toString());
      const approverStaff = ((staffResult.data ?? []) as StaffRow[]).filter((item) => item.role === "approver");
      const generalCoordinatorName = approverStaff.length === 1 ? approverStaff[0].full_name : "";

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const headerMargin = 16;
      const headerWidth = 178;
      const margin = 25.4;
      const contentWidth = pageWidth - margin * 2;
      const institutionalFont = "helvetica";
      const bodyFont = "times";
      let y = 29;
      let figureNumber = 0;
      let tableNumber = 0;

      const pageHeader = (pageNumber?: number, totalPages?: number) => {
        const top = 10;
        const height = 30;
        const leftWidth = 46;
        const rightWidth = 38;
        const centerWidth = headerWidth - leftWidth - rightWidth;
        const leftX = headerMargin;
        const centerX = leftX + leftWidth;
        const rightX = centerX + centerWidth;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(headerMargin - 1, top - 1, headerWidth + 2, height + 2, "F");
        pdf.setDrawColor(74, 92, 108);
        pdf.setLineWidth(0.25);
        pdf.rect(leftX, top, leftWidth, height);
        pdf.rect(centerX, top, centerWidth, height);
        pdf.rect(rightX, top, rightWidth, height);

        if (institutionalLogo) {
          pdf.addImage(institutionalLogo, "PNG", leftX + 4, top + 5, leftWidth - 8, 14);
        } else {
          pdf.setFont(institutionalFont, "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(13, 41, 70);
          pdf.text("ITSQMET", leftX + leftWidth / 2, top + 12, { align: "center" });
        }
        pdf.setFont(institutionalFont, "normal");
        pdf.setFontSize(7.4);
        pdf.setTextColor(45, 58, 70);
        pdf.text("Acompañamiento docente", leftX + leftWidth / 2, top + 25, { align: "center" });

        pdf.line(centerX, top + 9, centerX + centerWidth, top + 9);
        pdf.setFont(institutionalFont, "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(13, 41, 70);
        const careerLines = pdf.splitTextToSize(teacher.career || "Carrera no registrada", centerWidth - 6);
        pdf.text(careerLines.slice(0, 2), centerX + centerWidth / 2, top + 4.6, { align: "center" });

        const headerTitle = pdf.splitTextToSize(definition.title, centerWidth - 6);
        pdf.setFont(institutionalFont, "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(25, 38, 50);
        pdf.text(headerTitle.slice(0, 3), centerX + centerWidth / 2, top + 15, { align: "center" });

        pdf.line(rightX, top + 10, rightX + rightWidth, top + 10);
        pdf.line(rightX, top + 20, rightX + rightWidth, top + 20);
        pdf.setFont(institutionalFont, "bold");
        pdf.setFontSize(6.3);
        pdf.setTextColor(45, 58, 70);
        pdf.text("VERIFICACIÓN", rightX + 2, top + 3.7);
        pdf.setFont(institutionalFont, "normal");
        pdf.setFontSize(6.2);
        const codeLines = pdf.splitTextToSize(code, rightWidth - 4);
        pdf.text(codeLines.slice(0, 2), rightX + 2, top + 7);

        pdf.setFont(institutionalFont, "bold");
        pdf.setFontSize(6.5);
        pdf.text("Versión:", rightX + 2, top + 14);
        pdf.setFont(institutionalFont, "normal");
        pdf.text(String(version), rightX + 16, top + 14);

        pdf.setFont(institutionalFont, "bold");
        pdf.text("Página:", rightX + 2, top + 24);
        pdf.setFont(institutionalFont, "normal");
        pdf.text(pageNumber && totalPages ? `${pageNumber} de ${totalPages}` : "—", rightX + 16, top + 24);

        y = 49;
      };
      const newPage = () => { pdf.addPage(); pageHeader(); };
      const ensure = (height = 16) => { if (y + height > pageHeight - 20) newPage(); };
      const spacer = (height = 5) => { y += height; };

      const line = (text: string, size = 10, bold = false, color: [number, number, number] = [35, 51, 67], indent = 0, italic = false) => {
        if (!text) return;
        pdf.setFont(bodyFont, bold ? (italic ? "bolditalic" : "bold") : (italic ? "italic" : "normal"));
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const wrapped = pdf.splitTextToSize(text, contentWidth - indent);
        const lineHeight = Math.max(4.4, size * 0.48);
        ensure(wrapped.length * lineHeight + 3);
        pdf.text(wrapped, margin + indent, y);
        y += wrapped.length * lineHeight + 2.5;
      };

      const apaParagraph = (text: string, options?: { bold?: boolean; italic?: boolean; indentFirstLine?: boolean }) => {
        if (!text) return;
        const bold = Boolean(options?.bold);
        const italic = Boolean(options?.italic);
        const firstIndent = options?.indentFirstLine === false ? 0 : 12.7;
        pdf.setFont(bodyFont, bold ? (italic ? "bolditalic" : "bold") : (italic ? "italic" : "normal"));
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);

        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let current = "";
        words.forEach((word) => {
          const candidate = current ? `${current} ${word}` : word;
          const available = contentWidth - (lines.length === 0 ? firstIndent : 0);
          if (current && pdf.getTextWidth(candidate) > available) {
            lines.push(current);
            current = word;
          } else {
            current = candidate;
          }
        });
        if (current) lines.push(current);

        const lineHeight = 8.45;
        ensure(lines.length * lineHeight + 3);
        lines.forEach((textLine, index) => {
          pdf.text(textLine, margin + (index === 0 ? firstIndent : 0), y + index * lineHeight);
        });
        y += lines.length * lineHeight + 4.2;
      };

      const section = (title: string, subtitle?: string) => {
        ensure(subtitle ? 28 : 18);
        spacer(8);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(bodyFont, "bold");
        pdf.setFontSize(12);
        const titleLines = pdf.splitTextToSize(title, contentWidth);
        pdf.text(titleLines, pageWidth / 2, y, { align: "center" });
        y += titleLines.length * 5.2 + 3;
        if (subtitle) {
          pdf.setFont(bodyFont, "normal");
          pdf.setFontSize(11);
          const subtitleLines = pdf.splitTextToSize(subtitle, contentWidth);
          pdf.text(subtitleLines, margin, y);
          y += subtitleLines.length * 5.2 + 3;
        }
        spacer(3);
      };
      const card = (x: number, top: number, width: number, height: number, label: string, value: string, color: [number, number, number]) => {
        pdf.setFillColor(249, 251, 252);
        pdf.setDrawColor(224, 231, 237);
        pdf.roundedRect(x, top, width, height, 2, 2, "FD");
        pdf.setTextColor(...color);
        pdf.setFont("times", "bold");
        pdf.setFontSize(value.length > 18 ? 9 : 12);
        pdf.text(value, x + 4, top + 8.5);
        pdf.setTextColor(99, 113, 126);
        pdf.setFontSize(8);
        pdf.text(label.toUpperCase(), x + 4, top + height - 4);
      };
      const callout = (title: string, lines: string[], tone: "blue" | "amber") => {
        void tone;
        ensure(18);
        pdf.setFont(bodyFont, "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.text(title, margin, y);
        y += 8.45;
        lines.forEach((item) => {
          const wrapped = pdf.splitTextToSize(item, contentWidth - 12.7);
          ensure(wrapped.length * 8.45 + 4);
          pdf.setFont(bodyFont, "normal");
          pdf.setFontSize(12);
          pdf.text("•", margin + 3, y);
          pdf.text(wrapped, margin + 12.7, y);
          y += wrapped.length * 8.45 + 4.2;
        });
      };
      const apaFigure = (title: string, image: string, height: number, note: string) => {
        if (!image) return;
        figureNumber += 1;
        const titleLines = pdf.splitTextToSize(title, contentWidth);
        const noteLines = pdf.splitTextToSize(note, contentWidth - 8);
        ensure(8 + titleLines.length * 4.2 + height + 7 + noteLines.length * 4.1 + 8);
        pdf.setFont(bodyFont, "bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(25, 38, 50);
        pdf.text(`Figura ${figureNumber}`, margin, y);
        y += 5;
        pdf.setFont(bodyFont, "italic");
        pdf.setFontSize(10.5);
        pdf.text(titleLines, margin, y);
        y += titleLines.length * 4.2 + 3;
        pdf.addImage(image, "PNG", margin + 5, y, contentWidth - 10, height);
        y += height + 4;
        pdf.setFont(bodyFont, "italic");
        pdf.setFontSize(9.5);
        pdf.text("Nota.", margin, y);
        pdf.setFont("times", "normal");
        pdf.text(noteLines, margin + 9, y);
        y += noteLines.length * 4.1 + 8;
      };
      const apaTableTitle = (title: string, note: string) => {
        tableNumber += 1;
        ensure(18);
        pdf.setFont(bodyFont, "bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(25, 38, 50);
        pdf.text(`Tabla ${tableNumber}`, margin, y);
        y += 5;
        pdf.setFont(bodyFont, "italic");
        pdf.setFontSize(10.5);
        pdf.text(pdf.splitTextToSize(title, contentWidth), margin, y);
        y += 6;
        return () => {
          const noteLines = pdf.splitTextToSize(note, contentWidth - 8);
          pdf.setFont(bodyFont, "italic");
          pdf.setFontSize(9.5);
          pdf.text("Nota.", margin, y);
          pdf.setFont("times", "normal");
          pdf.text(noteLines, margin + 9, y);
          y += noteLines.length * 4 + 8;
        };
      };

      const drawHeader = () => {
        pageHeader();

        pdf.setTextColor(13, 41, 70);
        pdf.setFont(institutionalFont, "bold");
        pdf.setFontSize(23);
        const coverTitle = pdf.splitTextToSize(definition.title, 160);
        const titleTop = 105 - Math.max(0, coverTitle.length - 1) * 5;
        pdf.text(coverTitle, pageWidth / 2, titleTop, { align: "center" });

        pdf.setFont(institutionalFont, "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(82, 98, 113);
        const coverSubtitle = pdf.splitTextToSize(definition.subtitle, 145);
        pdf.text(coverSubtitle, pageWidth / 2, titleTop + coverTitle.length * 9 + 5, { align: "center" });

        pdf.setFillColor(official ? 229 : 255, official ? 246 : 243, official ? 235 : 215);
        pdf.setTextColor(official ? 34 : 141, official ? 104 : 88, official ? 64 : 18);
        pdf.roundedRect(82, 146, 46, 10, 2, 2, "F");
        pdf.setFont(institutionalFont, "bold");
        pdf.setFontSize(8);
        pdf.text(official ? "DOCUMENTO OFICIAL" : "BORRADOR", pageWidth / 2, 152.5, { align: "center" });

        const signatureTop = 232;
        const signatureHeight = 43;
        const signatureWidth = headerWidth / 3;
        const signatureRoles = [
          { role: "Docente", name: teacher.name },
          { role: "Coordinador(a) de Carrera", name: coordinatorName || "—" },
          { role: "Coordinador(a) General de Carreras", name: generalCoordinatorName || "—" },
        ];

        pdf.setDrawColor(110, 122, 133);
        pdf.setLineWidth(0.25);
        signatureRoles.forEach((item, index) => {
          const x = headerMargin + index * signatureWidth;
          pdf.rect(x, signatureTop, signatureWidth, signatureHeight);
          pdf.line(x + 8, signatureTop + 21, x + signatureWidth - 8, signatureTop + 21);
          pdf.setFont(institutionalFont, "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(28, 42, 55);
          const nameLines = pdf.splitTextToSize(item.name, signatureWidth - 8);
          pdf.text(nameLines, x + signatureWidth / 2, signatureTop + 27, { align: "center" });
          pdf.setFont(institutionalFont, "bold");
          pdf.setFontSize(9);
          const roleLines = pdf.splitTextToSize(item.role, signatureWidth - 6);
          pdf.text(roleLines, x + signatureWidth / 2, signatureTop + 36, { align: "center" });
        });

        newPage();
        section("Datos del documento");
        const meta = (label: string, value: string, x: number, top: number, width: number) => {
          pdf.setTextColor(101, 115, 128);
          pdf.setFont(institutionalFont, "bold");
          pdf.setFontSize(8);
          pdf.text(label.toUpperCase(), x, top);
          pdf.setTextColor(28, 42, 55);
          pdf.setFont(institutionalFont, "normal");
          pdf.setFontSize(9.5);
          pdf.text(pdf.splitTextToSize(value || "—", width), x, top + 5);
        };
        const metaTop = y;
        const metaGap = 8;
        const metaCol = (contentWidth - metaGap) / 2;
        pdf.setDrawColor(218, 226, 232);
        pdf.roundedRect(margin, metaTop - 4, contentWidth, 40, 2, 2, "S");
        meta("Docente", teacher.name, margin + 4, metaTop + 3, metaCol - 8);
        meta("Carrera", teacher.career, margin + metaCol + metaGap, metaTop + 3, metaCol - 8);
        meta("Asignatura", teacher.subject, margin + 4, metaTop + 20, metaCol - 8);
        meta("Período / modalidad", `${teacher.period} · ${teacher.modality}`, margin + metaCol + metaGap, metaTop + 20, metaCol - 8);
        y = metaTop + 45;
      };

      const drawStatsTable = (reportRows: CriterionRow[]) => {
        const current = summarize(reportRows);
        const stats = descriptiveStats(reportRows);
        const finishNote = apaTableTitle(
          "Resumen estadístico de la evaluación",
          "El avance se calcula sobre criterios aplicables. El cumplimiento se calcula sobre criterios evaluados. Los criterios No aplica aprobados se excluyen del denominador de criterios aplicables. La desviación estándar corresponde a la población de criterios evaluados incluida en este informe.",
        );
        const rowsData = [
          ["Criterios totales", String(current.total)],
          ["Criterios aplicables", String(current.applicable)],
          ["No aplica", String(current.na)],
          ["Evaluados", String(current.evaluated)],
          ["Aprobados", String(current.approved)],
          ["Por corregir", String(current.correction)],
          ["En revisión", String(current.review + current.resent)],
          ["Pendientes", String(current.pending)],
          ["Avance de evaluación", `${current.advance}%`],
          ["Cumplimiento evaluado", current.compliance === null ? "Sin evaluación" : `${current.compliance}%`],
          ["Media de calificación", stats.mean === null ? "Sin evaluación" : `${fmt(stats.mean)} / 4`],
          ["Mediana", stats.median === null ? "Sin evaluación" : `${fmt(stats.median, 1)} / 4`],
          ["Desviación estándar", stats.sd === null ? "Sin evaluación" : fmt(stats.sd)],
          ["Mínimo – máximo", stats.min === null ? "Sin evaluación" : `${fmt(stats.min, 0)} – ${fmt(stats.max, 0)}`],
        ];
        const col1 = 128;
        const rowH = 7.2;
        ensure(rowsData.length * rowH + 10);
        rowsData.forEach(([label, value], index) => {
          if (index === 0) {
            pdf.setDrawColor(70, 85, 99);
            pdf.setLineWidth(0.5);
            pdf.line(margin, y - 2, margin + contentWidth, y - 2);
          }
          pdf.setFont("times", "normal");
          pdf.setFontSize(8.8);
          pdf.setTextColor(36, 49, 61);
          pdf.text(label, margin + 2, y + 3.5);
          pdf.setFont("times", "bold");
          pdf.text(value, margin + col1, y + 3.5);
          y += rowH;
        });
        pdf.setDrawColor(70, 85, 99);
        pdf.line(margin, y - 2, margin + contentWidth, y - 2);
        y += 5;
        finishNote();
      };

      const drawComponentTable = (reportRows: CriterionRow[]) => {
        const isConsolidated = definition.key === "informe_consolidado";
        const data: ComponentSummary[] = isConsolidated
          ? phaseOrder.map((phase) => {
              const phaseRows = reportRows.filter((row) => phaseForHito(row.definition.hito_id) === phase);
              return { name: phaseLabels[phase], ...summarize(phaseRows), stats: descriptiveStats(phaseRows) };
            })
          : componentSummaries(reportRows);
        const finishNote = apaTableTitle(
          isConsolidated ? "Resultados estadísticos por etapa" : "Resultados estadísticos por componente",
          "Los porcentajes se presentan sobre el universo correspondiente a cada etapa o componente. Cuando no existen criterios evaluados, el cumplimiento se reporta como Sin evaluación.",
        );
        const widths = [66, 23, 23, 23, 25, 25];
        const headers = [isConsolidated ? "Etapa" : "Componente", "Aplic.", "Eval.", "Aprob.", "Avance", "Cumpl."];
        ensure(12 + data.length * 8);
        pdf.setFont("times", "bold");
        pdf.setFontSize(8.2);
        pdf.setTextColor(27, 42, 56);
        pdf.setDrawColor(75, 90, 105);
        pdf.line(margin, y - 2, margin + contentWidth, y - 2);
        let x = margin;
        headers.forEach((header, index) => {
          pdf.text(header, x + 1.5, y + 3.5);
          x += widths[index];
        });
        y += 7;
        pdf.setDrawColor(170, 181, 191);
        pdf.line(margin, y - 2, margin + contentWidth, y - 2);
        data.forEach((item) => {
          ensure(8);
          x = margin;
          const values = [item.name, String(item.applicable), String(item.evaluated), String(item.approved), `${item.advance}%`, item.compliance === null ? "—" : `${item.compliance}%`];
          pdf.setFont("times", "normal");
          pdf.setFontSize(8.1);
          values.forEach((value, index) => {
            pdf.text(pdf.splitTextToSize(value, widths[index] - 3), x + 1.5, y + 3.5);
            x += widths[index];
          });
          y += 7.3;
        });
        pdf.setDrawColor(75, 90, 105);
        pdf.line(margin, y - 2, margin + contentWidth, y - 2);
        y += 5;
        finishNote();
      };

      const drawExecutive = (reportRows: CriterionRow[], label: string) => {
        const current = summarize(reportRows);
        const stats = descriptiveStats(reportRows);
        const components = componentSummaries(reportRows);
        section("Resumen ejecutivo", current.official ? "Evaluación completa y aprobada." : "Estado actual del acompañamiento docente.");
        const gap = 4;
        const third = (contentWidth - gap * 2) / 3;
        card(margin, y, third, 20, "Aprobados", `${current.approved}/${current.applicable}`, colors.approved);
        card(margin + third + gap, y, third, 20, "Por corregir", String(current.correction), colors.correction);
        card(margin + (third + gap) * 2, y, third, 20, "Pendientes", String(current.pending), colors.pending);
        y += 25;
        const half = (contentWidth - gap) / 2;
        card(margin, y, half, 20, "En revisión", String(current.review + current.resent), colors.review);
        card(margin + half + gap, y, half, 20, "No aplica", String(current.na), colors.na);
        y += 27;
        card(margin, y, half, 22, "Avance de evaluación", `${current.evaluated}/${current.applicable} · ${current.advance}%`, colors.review);
        card(margin + half + gap, y, half, 22, "Cumplimiento evaluado", current.compliance === null ? "Sin evaluación" : `${current.approved}/${current.evaluated} · ${current.compliance}%`, colors.approved);
        y += 30;

        section("Análisis estadístico", "Indicadores descriptivos para interpretar el avance, el cumplimiento y la distribución de calificaciones.");
        drawStatsTable(reportRows);
        drawComponentTable(reportRows);

        section("Figuras", "Representación visual de los resultados del informe.");
        apaFigure(
          "Distribución del estado de los criterios",
          statusDonut(current),
          66,
          "La figura presenta la frecuencia de criterios aprobados, por corregir, pendientes, en revisión y No aplica. Los datos proceden del expediente SIACD vigente al momento de generar el informe.",
        );
        apaFigure(
          "Distribución de las calificaciones de los criterios evaluados",
          scoreDistributionChart(stats),
          62,
          "Las barras representan la frecuencia de calificaciones de 0/4 a 4/4. Los criterios No aplica y aquellos sin evaluación no forman parte de esta distribución.",
        );
        const comparison = definition.key === "informe_consolidado" ? phaseBarChart(reportRows) : componentBarChart(components);
        apaFigure(
          definition.key === "informe_consolidado" ? "Cumplimiento evaluado por etapa" : (definition.phase === "during" ? "Cumplimiento evaluado por bloque" : "Cumplimiento evaluado por componente"),
          comparison,
          68,
          "El cumplimiento corresponde a la proporción de criterios aprobados entre los criterios efectivamente evaluados. Cuando no existen evaluaciones, se muestra Sin evaluación.",
        );

        section("Interpretación de resultados");
        const narrative = current.evaluated === 0
          ? `En ${label} aún no existen calificaciones registradas. De ${current.applicable} criterios aplicables, ${current.pending} permanecen pendientes y ${current.review + current.resent} se encuentran en revisión. Por ello, el cumplimiento no debe interpretarse como 0 %, sino como Sin evaluación.`
          : `En ${label} se han evaluado ${current.evaluated} de ${current.applicable} criterios aplicables (${current.advance} % de avance). El cumplimiento evaluado es ${current.compliance ?? 0} %. La media de calificación es ${fmt(stats.mean)} de 4, la mediana es ${fmt(stats.median, 1)} y la desviación estándar es ${fmt(stats.sd)}.`;
        apaParagraph(narrative);

        section("Conclusiones");
        callout("Conclusión del informe", [conclusionText(current, components, stats)], "blue");
        section("Aspectos por mejorar");
        callout("Prioridades de mejora", improvementItems(current, components), "amber");
      };

      const drawCriterion = (row: CriterionRow) => {
        const evaluator = row.score?.evaluated_by_staff_id ? staffMap.get(row.score.evaluated_by_staff_id) ?? null : null;
        const titleLines = pdf.splitTextToSize(row.definition.observable_competency, 148);
        const explanationLines = pdf.splitTextToSize(`Qué se verifica: ${criterionExplanation(row.definition)}`, 164);
        const expectedEvidence = row.definition.expected_evidence?.trim() ? pdf.splitTextToSize(`Evidencia esperada: ${row.definition.expected_evidence.trim()}`, 164) : [];
        const observation = row.score?.coordinator_observation?.trim() || "";
        const observationLines = observation ? pdf.splitTextToSize(`Observación del evaluador: ${observation}`, 164) : [];
        const trace: string[] = [];
        (row.latest?.items ?? []).forEach((item) => {
          if (item.kind === "link") trace.push("Tipo de evidencia presentada: Enlace");
          else if (item.file_name) trace.push(`Evidencia presentada: ${item.file_name}`);
        });
        if (row.latest?.submitted_at) trace.push(`Fecha de carga: ${formatDate(row.latest.submitted_at)}`);
        const reviewDate = row.latest?.reviewed_at || row.score?.evaluated_at;
        if (reviewDate) trace.push(`Fecha de revisión: ${formatDate(reviewDate)}`);
        if (evaluator) trace.push(`Evaluador: ${evaluator.full_name} · ${roleLabel(evaluator.role)}`);
        const traceLines = trace.flatMap((text) => pdf.splitTextToSize(text, 164));
        const grade = row.score?.not_applicable ? "No aplica aprobado" : row.score?.score !== null && row.score?.score !== undefined ? `${row.score.score}/4` : "Sin calificación";
        const interpretationLines = pdf.splitTextToSize(`Interpretación: ${scoreInterpretation(row.score)}`, 164);
        const boxHeight = Math.max(
          34,
          15 + titleLines.length * 4 + explanationLines.length * 3.8 + expectedEvidence.length * 3.7 + interpretationLines.length * 3.7 + observationLines.length * 3.5 + traceLines.length * 3.4 + 18,
        );
        ensure(boxHeight + 8);
        const top = y;
        const [r, g, b] = colors[row.state.key];
        pdf.setFillColor(252, 253, 254);
        pdf.setDrawColor(222, 229, 235);
        pdf.roundedRect(margin, top, contentWidth, boxHeight, 2, 2, "FD");
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(margin, top, 3, boxHeight, 1.5, 1.5, "F");
        pdf.setTextColor(24, 43, 62);
        pdf.setFont("times", "bold");
        pdf.setFontSize(10);
        pdf.text(titleLines, margin + 7, top + 8);
        pdf.setTextColor(r, g, b);
        pdf.setFontSize(8.5);
        pdf.text(row.state.label.toUpperCase(), 190, top + 8, { align: "right" });
        let yy = top + 11 + titleLines.length * 4;
        pdf.setTextColor(55, 70, 84);
        pdf.setFont("times", "normal");
        pdf.setFontSize(9.5);
        pdf.text(explanationLines, margin + 7, yy);
        yy += explanationLines.length * 3.8 + 2.5;
        if (expectedEvidence.length) {
          pdf.setFont("times", "italic");
          pdf.setTextColor(78, 92, 105);
          pdf.text(expectedEvidence, margin + 7, yy);
          yy += expectedEvidence.length * 3.7 + 2.5;
        }
        pdf.setFont("times", "bold");
        pdf.setTextColor(48, 64, 80);
        pdf.text(`Calificación: ${grade}`, margin + 7, yy);
        yy += 4.7;
        pdf.setFont("times", "normal");
        pdf.setTextColor(72, 86, 99);
        pdf.text(interpretationLines, margin + 7, yy);
        yy += interpretationLines.length * 3.7 + 2.5;
        if (observationLines.length) {
          pdf.setFont(bodyFont, "italic");
          pdf.setFontSize(9.5);
          pdf.setTextColor(78, 92, 105);
          pdf.text(observationLines, margin + 7, yy);
          yy += observationLines.length * 3.5 + 2.5;
        }
        if (traceLines.length) {
          pdf.setFont("times", "normal");
          pdf.setFontSize(8.5);
          pdf.setTextColor(76, 91, 105);
          pdf.text(traceLines, margin + 7, yy);
        }
        y = top + boxHeight + 7;
      };

      const drawDetails = (reportRows: CriterionRow[], annex = false) => {
        newPage();
        section(annex ? "Anexo · Detalle completo de criterios" : "Detalle e interpretación de criterios", annex ? "Trazabilidad completa para auditoría." : "Cada criterio incluye explicación, estado, calificación, evidencia, fechas y evaluador.");
        for (const phase of phaseOrder) {
          const phaseRows = reportRows.filter((row) => phaseForHito(row.definition.hito_id) === phase);
          if (!phaseRows.length) continue;
          section(phaseLabels[phase], `${phaseRows.length} criterios organizados por componente.`);
          const groups = new Map<string, CriterionRow[]>();
          phaseRows.forEach((row) => groups.set(row.definition.process, [...(groups.get(row.definition.process) ?? []), row]));
          const ordered = [...groups.keys()].sort((a, b) => {
            const ai = sectionOrder[phase].indexOf(a);
            const bi = sectionOrder[phase].indexOf(b);
            return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
          });
          let family = "";
          for (const group of ordered) {
            if (phase === "during") {
              const next = duringFamily(group);
              if (next !== family) {
                family = next;
                spacer(5);
                line(family, 10.2, true, [80, 66, 126]);
              }
            }
            spacer(3);
            line(group, 9.8, true, [35, 75, 107]);
            (groups.get(group) ?? []).forEach(drawCriterion);
          }
        }
      };

      const drawHistory = () => {
        const chart = evolutionChart(reviewCycles);
        if (!chart) return;
        section("Evolución histórica", "Comparación de las revisiones cerradas registradas en SIACD.");
        apaFigure(
          "Evolución del cumplimiento entre revisiones",
          chart,
          62,
          "La línea representa el porcentaje de cumplimiento registrado en las revisiones cerradas disponibles. Esta figura se genera únicamente cuando existen al menos dos mediciones históricas comparables.",
        );
      };

      const drawClosure = async () => {
        section("Cierre y verificación");
        const evaluatorIds = [...new Set(rows.map((row) => row.score?.evaluated_by_staff_id).filter((value): value is string => Boolean(value)))];
        const evaluators = evaluatorIds.map((id) => staffMap.get(id)).filter((item): item is StaffRow => Boolean(item));
        if (evaluators.length) line(`Evaluador(es): ${evaluators.slice(0, 4).map((item) => `${item.full_name} (${roleLabel(item.role)})`).join(" · ")}`, 10);
        line(`Generado por: ${generatorStaff?.full_name || (accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "Coordinación académica")}`, 10);
        line(`Fecha de generación: ${formatDate(ecuadorToday())} · Versión ${version}`, 10);
        line(`Estado: ${official ? "INFORME OFICIAL" : "BORRADOR"}`, 10, true, official ? colors.approved : colors.correction);
        line(`Código de verificación: ${code}`, 10, true);
        ensure(35);
        const qr = await remoteImageDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verificationUrl)}`);
        if (qr) {
          pdf.addImage(qr, "PNG", margin, y, 28, 28);
          pdf.setFont("times", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(85, 98, 112);
          pdf.text("Escanee para verificar autenticidad", 50, y + 14);
          y += 33;
        } else {
          line(`Verificación: ${verificationUrl}`, 9);
        }
      };

      drawHeader();
      drawExecutive(rows, definition.phase ? `la etapa ${phaseLabels[definition.phase]}` : "el acompañamiento consolidado");
      if (definition.key === "informe_consolidado") drawHistory();
      drawDetails(rows, definition.key === "informe_consolidado");
      await drawClosure();

      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pageHeader(page, pages);
        if (page > 1) {
          pdf.setFont(institutionalFont, "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(92, 103, 114);
          pdf.text(String(page), pageWidth / 2, 291, { align: "center" });
        }
      }

      const blob = pdf.output("blob");
      const storagePath = `${teacher.id}/documents/formal-${definition.key}-v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(`No se pudo guardar el PDF: ${uploadError.message}`);
      const { error: registerError } = await supabase.from("generated_documents").insert({
        expedient_id: teacher.id,
        document_type: definition.key,
        status: "generated",
        storage_path: storagePath,
        verification_code: code,
        generated_by: null,
        generated_by_staff_id: staffId,
        issued_on: ecuadorToday(),
        observation: `${official ? "OFICIAL" : "BORRADOR"} · FORMATO APA 7 · Versión ${version}`,
      });
      if (registerError) {
        await supabase.storage.from("siacd-evidence").remove([storagePath]);
        throw new Error(`No se pudo registrar el documento: ${registerError.message}`);
      }
      pdf.save(`${safeName(definition.title.toLowerCase())}-${safeName(teacher.name.toLowerCase())}-v${version}.pdf`);
      setMessage(`${definition.title} generado${official ? " como documento oficial" : " como borrador"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el informe.");
    } finally {
      setBusy("");
    }
  }

  return <div style={{ position: "fixed", inset: 0, background: "rgba(8,22,38,.58)", zIndex: 10020, display: "grid", placeItems: "center", padding: 18 }}>
    <section style={{ width: "min(940px,96vw)", maxHeight: "92vh", overflow: "auto", background: "white", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.24)" }}>
      <header style={{ padding: "20px 22px", background: "#0d2946", color: "white", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
        <div><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>DOCUMENTACIÓN INSTITUCIONAL</span><h2 style={{ margin: "5px 0 2px" }}>Informes de acompañamiento</h2><p style={{ margin: 0, opacity: .78, fontSize: 13 }}>Portada institucional y contenido organizado con criterios de presentación APA 7 para texto, tablas, figuras, notas y anexos.</p></div>
        <button onClick={onClose} aria-label="Cerrar" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "white", borderRadius: 10, padding: 8, cursor: "pointer" }}><X size={18}/></button>
      </header>
      <div style={{ padding: 22 }}>
        {message && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#eef5fb", marginBottom: 14, color: "#173b5c", fontSize: 13 }}>{message}</div>}
        {isDemo && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 11, marginBottom: 14, border: "1px solid #e1d8ef", background: "#faf7fd", borderRadius: 12 }}><TestTube2 size={17}/><strong style={{ fontSize: 12 }}>Docente de prueba</strong><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("mixed")} style={{ border: "1px solid #d8cae8", background: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Escenario mixto</button><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("approved")} style={{ border: 0, background: "#2e7d5b", color: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Todo aprobado</button></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
          {reportCards.map((item) => <article key={item.key} style={{ border: "1px solid #dce4eb", borderRadius: 13, padding: 16, display: "grid", gap: 11 }}><FileText size={20}/><div><strong style={{ display: "block", fontSize: 15 }}>{item.title}</strong><span style={{ fontSize: 12, color: "#66788a" }}>{item.subtitle}</span></div><button disabled={Boolean(busy || demoBusy)} onClick={() => void generate(item)} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: "#143d63", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>{busy === item.key ? <Loader2 size={15}/> : <Download size={15}/>} {busy === item.key ? "Generando…" : "Generar PDF"}</button></article>)}
        </div>
      </div>
    </section>
  </div>;
}
