"use client";

import { Download, FileText, Loader2, TestTube2, TriangleAlert, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import { REPORT_LOGO_DATA_URL, institutionalDocumentCode, reportHeaderTitle } from "./report-branding";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Phase = "areas" | "before" | "during" | "after";
type ReportKey = "informe_induccion" | "informe_final";
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

type GenerationWarning = {
  definition: ReportDefinition;
  reasons: string[];
  summary: Summary;
};

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
  {
    key: "informe_induccion",
    title: "Informe de Inducción de los Procesos Académicos a Docente: Nuevos",
    subtitle: "Integra H1 · Inducción por áreas y H2 · Preparación antes de la docencia.",
  },
  {
    key: "informe_final",
    title: "Informe Final de Acompañamiento-Docente: Nuevos",
    subtitle: "Integra el acompañamiento completo desde H1 hasta H6.",
  },
];

const phaseLabels: Record<Phase, string> = {
  areas: "H1. Inducción institucional por áreas",
  before: "H2. Preparación previa al inicio de la docencia",
  during: "H3–H5. Acompañamiento durante la docencia",
  after: "H6. Cierre académico y verificación final",
};
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
  const competency = definition.observable_competency.trim().replace(/[.]+$/, "");
  const evidence = definition.expected_evidence?.trim().replace(/[.]+$/, "");
  const normalized = competency.replace(/^verifica(?:\s+que)?\s+/i, "").replace(/^que\s+/i, "");
  const verification = normalized
    ? `Se verifica ${lowerInitial(normalized)} dentro del componente ${definition.process}.`
    : `Se verifica el criterio establecido dentro del componente ${definition.process}.`;
  return evidence ? `${verification} Evidencia esperada: ${evidence}.` : verification;
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
  void components;
  void stats;
  if (summary.evaluated === 0) {
    return `El proceso registra 0 % de avance de evaluación: ninguno de los ${summary.applicable} criterios aplicables cuenta todavía con calificación. La información presentada corresponde al estado disponible en SIACD y el proceso continúa abierto para revisión y validación.`;
  }
  if (summary.official) {
    return `La evaluación se encuentra completa: ${summary.evaluated} de ${summary.applicable} criterios aplicables fueron evaluados y aprobados. El cumplimiento de los criterios evaluados es ${summary.compliance ?? 100} % y el proceso cumple las condiciones de cierre establecidas en SIACD.`;
  }
  const satisfactory = summary.approved === summary.evaluated
    ? `Los ${summary.evaluated} criterios evaluados presentan cumplimiento satisfactorio.`
    : `De los ${summary.evaluated} criterios evaluados, ${summary.approved} se encuentran aprobados.`;
  const unresolved = Math.max(0, summary.applicable - summary.evaluated);
  return `El proceso registra un avance de evaluación del ${summary.advance} %, correspondiente a ${summary.evaluated} de ${summary.applicable} criterios aplicables. ${satisfactory} Permanecen ${unresolved} criterios sin calificación y el proceso continúa abierto con información pendiente de completar, revisar y/o validar.`;
}

function findingItems(summary: Summary, components: ComponentSummary[]) {
  const items: string[] = [];
  const unresolved = components
    .map((item) => ({
      ...item,
      unresolved: item.pending + item.review + item.resent + item.correction,
    }))
    .filter((item) => item.unresolved > 0)
    .sort((a, b) => b.unresolved - a.unresolved || b.pending - a.pending);

  unresolved.slice(0, 5).forEach((item) => {
    const details = [
      item.pending ? `${item.pending} pendientes` : "",
      item.review + item.resent ? `${item.review + item.resent} en revisión o reenviados` : "",
      item.correction ? `${item.correction} por corregir` : "",
    ].filter(Boolean).join(", ");
    items.push(`${item.name}: ${details}.`);
  });

  if (unresolved[0]?.pending) {
    items.unshift(`${unresolved[0].name} concentra el mayor número absoluto de criterios pendientes (${unresolved[0].pending}). Este dato describe volumen pendiente y no constituye un ranking de desempeño.`);
  }
  if (summary.pending) items.push("Acción: completar o validar los criterios pendientes según el tipo de verificación definido.");
  if (summary.review + summary.resent) items.push("Acción: finalizar la revisión de las evidencias recibidas o reenviadas.");
  if (summary.correction) items.push("Acción: atender los criterios por corregir y verificar la nueva evidencia.");
  if (!items.length) items.push("No se registran hallazgos o acciones pendientes dentro del alcance evaluado.");
  items.push("Responsable de revisión y seguimiento: Coordinación de carrera.");
  return [...new Set(items)].slice(0, 8);
}

function generationWarnings(
  definition: ReportDefinition,
  summary: Summary,
  rows: CriterionRow[],
  reviewCycles: ReviewCycle[],
  teacher: Teacher,
) {
  const reasons: string[] = [];
  if (!teacher.career?.trim()) reasons.push("No está registrada la carrera del expediente.");
  if (!teacher.subject?.trim()) reasons.push("No está registrada la asignatura del expediente.");
  if (!teacher.period?.trim()) reasons.push("No está registrado el período académico.");
  if (!teacher.modality?.trim()) reasons.push("No está registrada la modalidad.");

  if (summary.total === 0) {
    reasons.push("No existen criterios configurados para el alcance de este informe.");
  } else if (summary.evaluated === 0) {
    reasons.push(`Cobertura de calificación: 0/${summary.applicable}; ningún criterio aplicable tiene calificación.`);
  } else if (summary.evaluated < summary.applicable) {
    reasons.push(`Cobertura de calificación: ${summary.evaluated}/${summary.applicable}; ${summary.applicable - summary.evaluated} criterios aplicables aún no tienen calificación.`);
  }

  if (summary.pending > 0) reasons.push(`Estado operativo: ${summary.pending} criterios permanecen pendientes de evidencia o validación.`);
  if (summary.review + summary.resent > 0) reasons.push(`${summary.review + summary.resent} criterios están en revisión o fueron reenviados.`);
  if (summary.correction > 0) reasons.push(`${summary.correction} criterios requieren corrección.`);

  const evidenceRows = rows.filter((row) => Boolean(row.workspace?.request));
  if (evidenceRows.length) {
    const approvedEvidence = evidenceRows.filter((row) =>
      row.workspace?.request?.status === "approved" || row.latest?.status === "approved"
    ).length;
    if (approvedEvidence < evidenceRows.length) {
      reasons.push(`Validación documental: ${evidenceRows.length - approvedEvidence} criterios EVIDENCIA todavía no cuentan con evidencia aprobada.`);
    }
  }

  if (definition.key === "informe_final" && !reviewCycles.some((cycle) => cycle.status === "closed")) {
    reasons.push("Todavía no existen ciclos de revisión cerrados para mostrar evolución histórica.");
  }

  return [...new Set(reasons)];
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

function demoEvidenceImage(index: number, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#f4f7fa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#cfd9e3";
  ctx.lineWidth = 3;
  ctx.fillRect(35, 30, 1130, 610);
  ctx.strokeRect(35, 30, 1130, 610);

  ctx.fillStyle = "#173f63";
  ctx.fillRect(35, 30, 1130, 78);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.fillText(`EVIDENCIA DEMO 0${index}`, 75, 78);

  ctx.fillStyle = "#243b50";
  ctx.font = "bold 27px Arial";
  ctx.fillText(title, 75, 155);
  ctx.fillStyle = "#66798a";
  ctx.font = "19px Arial";
  ctx.fillText("Imagen completamente ficticia para validar el diseño y la trazabilidad del informe.", 75, 190);

  ctx.fillStyle = index === 1 ? "#eaf2f8" : index === 2 ? "#eef6f0" : "#f7f3eb";
  ctx.fillRect(78, 230, 720, 285);
  ctx.fillStyle = "#d5e2ec";
  ctx.fillRect(835, 230, 260, 285);

  ctx.fillStyle = "#173f63";
  ctx.font = "bold 22px Arial";
  ctx.fillText(index === 1 ? "Sesión institucional registrada" : index === 2 ? "Aula virtual y PEA verificados" : "Seguimiento académico completado", 115, 285);

  ctx.fillStyle = "#526a7c";
  ctx.font = "20px Arial";
  const rows = index === 1
    ? ["Teams configurado", "Inducción realizada", "Asistencia validada"]
    : index === 2
      ? ["Recursos cargados", "Unidades configuradas", "Evaluaciones habilitadas"]
      : ["129 criterios revisados", "100 % de avance", "Proceso aprobado"];
  rows.forEach((item, row) => {
    ctx.fillText(`✓ ${item}`, 125, 345 + row * 55);
  });

  ctx.fillStyle = "#2f6c4d";
  ctx.fillRect(875, 420, 180, 55);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 19px Arial";
  ctx.fillText("COMPLETADO", 897, 454);

  ctx.fillStyle = "#8b99a6";
  ctx.font = "17px Arial";
  ctx.fillText("SIACD · Datos ficticios · No representa una evidencia real", 75, 600);
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
  const [warning, setWarning] = useState<GenerationWarning | null>(null);
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
      const { error: imageError } = await supabase.rpc("staff_apply_demo_images", { p_expedient_id: teacher.id, p_staff_id: staffId });
      if (imageError) throw new Error(imageError.message);
      const baseMessage = (data as { message?: string } | null)?.message || "Escenario DEMO preparado.";
      setMessage(`${baseMessage} Evidencias visuales ficticias cargadas para revisar la presentación.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo preparar el escenario DEMO.");
    } finally {
      setDemoBusy("");
    }
  }

  async function generate(definition: ReportDefinition, force = false) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("No se pudo conectar con SIACD para reunir la información del informe.");
      return;
    }
    setWarning(null);
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
      const scope = definition.key === "informe_induccion"
        ? definitions.filter((item) => item.hito_id === "H1" || item.hito_id === "H2")
        : definitions;
      const rows: CriterionRow[] = scope.map((item) => {
        const score = scores.get(item.id) ?? null;
        const criterionWorkspace = evidenceMap.get(item.id) ?? null;
        return { definition: item, score, workspace: criterionWorkspace, latest: latestSubmission(criterionWorkspace), state: stateForCriterion(score, criterionWorkspace) };
      });
      const summary = summarize(rows);
      const official = summary.official;
      const warnings = generationWarnings(definition, summary, rows, reviewCycles, teacher);
      if (warnings.length && !force) {
        setWarning({ definition, reasons: warnings, summary });
        return;
      }
      const version = (documentsResult.data ?? []).filter((item) => item.document_type === definition.key && item.status !== "void").length + 1;
      const issuedOn = ecuadorToday();
      const verificationCode = `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const verificationUrl = `https://docentenuevo.pages.dev/verificar/?codigo=${encodeURIComponent(verificationCode)}`;
      const documentCode = institutionalDocumentCode(teacher.career, definition.key, issuedOn);
      const documentTitle = reportHeaderTitle(definition.key, teacher.career, teacher.period);
      const institutionalLogo = REPORT_LOGO_DATA_URL || await remoteImageDataUrl(new URL("/logo-itsqmet.png", window.location.origin).toString());
      const approverStaff = ((staffResult.data ?? []) as StaffRow[]).filter((item) => item.role === "approver");
      const generalCoordinatorName = approverStaff.length === 1 ? approverStaff[0].full_name : "Ing. Martha Tomalá";

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

      const drawArialCenteredText = (
        text: string,
        centerX: number,
        top: number,
        maxWidthMm: number,
        fontSizePt: number,
        bold = false,
        maxLines = 4,
        color = "#1c2a37",
      ) => {
        const dpi = 300;
        const mmToPx = dpi / 25.4;
        const ptToPx = dpi / 72;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(maxWidthMm * mmToPx));
        const measure = canvas.getContext("2d");
        if (!measure) return 0;
        const fontPx = fontSizePt * ptToPx;
        const fontWeight = bold ? 700 : 400;
        measure.font = `${fontWeight} ${fontPx}px Arial, sans-serif`;
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let current = "";
        const availablePx = canvas.width - Math.ceil(3 * mmToPx);
        words.forEach((word) => {
          const candidate = current ? `${current} ${word}` : word;
          if (current && measure.measureText(candidate).width > availablePx) {
            lines.push(current);
            current = word;
          } else {
            current = candidate;
          }
        });
        if (current) lines.push(current);
        const shown = lines.slice(0, maxLines);
        const lineHeightPx = fontPx * 1.15;
        canvas.height = Math.max(1, Math.ceil(shown.length * lineHeightPx + 2 * mmToPx));
        const ctx = canvas.getContext("2d");
        if (!ctx) return 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${fontWeight} ${fontPx}px Arial, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        shown.forEach((lineText, index) => {
          ctx.fillText(lineText, canvas.width / 2, mmToPx + lineHeightPx * (index + 0.5));
        });
        const heightMm = canvas.height / mmToPx;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", centerX - maxWidthMm / 2, top, maxWidthMm, heightMm);
        return heightMm;
      };

      const pageHeader = (pageNumber?: number, totalPages?: number) => {
        const top = 10;
        const height = 34;
        const leftWidth = 46;
        const rightWidth = 40;
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
          pdf.addImage(institutionalLogo, "PNG", leftX + 2.5, top + 2.5, leftWidth - 5, 16);
        } else {
          drawArialCenteredText("ITSQMET", leftX + leftWidth / 2, top + 6, leftWidth - 6, 9, true, 1, "#0d2946");
        }
        drawArialCenteredText("Acompañamiento docente", leftX + leftWidth / 2, top + 23, leftWidth - 4, 9, false, 2, "#2d3a46");

        pdf.line(centerX, top + 10, centerX + centerWidth, top + 10);
        drawArialCenteredText("Coordinación General de Carreras", centerX + centerWidth / 2, top + 2, centerWidth - 4, 9, true, 2, "#0d2946");
        drawArialCenteredText(documentTitle, centerX + centerWidth / 2, top + 12, centerWidth - 5, 9, false, 4, "#192632");

        pdf.line(rightX, top + 14, rightX + rightWidth, top + 14);
        pdf.line(rightX, top + 24, rightX + rightWidth, top + 24);
        drawArialCenteredText("CÓDIGO", rightX + rightWidth / 2, top + 1, rightWidth - 4, 9, true, 1, "#2d3a46");
        drawArialCenteredText(documentCode, rightX + rightWidth / 2, top + 6, rightWidth - 4, 9, false, 3, "#2d3a46");
        drawArialCenteredText(`Versión: ${version}`, rightX + rightWidth / 2, top + 16, rightWidth - 4, 9, false, 1, "#2d3a46");
        drawArialCenteredText(pageNumber && totalPages ? `Página: ${pageNumber} de ${totalPages}` : "Página: —", rightX + rightWidth / 2, top + 26, rightWidth - 4, 9, false, 1, "#2d3a46");

        y = 53;
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

        drawArialCenteredText(documentTitle, pageWidth / 2, 91, 160, 23, true, 5, "#0d2946");

        newPage();
        section("Datos y control del documento");
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
        pdf.roundedRect(margin, metaTop - 4, contentWidth, 56, 2, 2, "S");
        meta("Docente", teacher.name, margin + 4, metaTop + 3, metaCol - 8);
        meta("Carrera", teacher.career, margin + metaCol + metaGap, metaTop + 3, metaCol - 8);
        meta("Asignatura", teacher.subject, margin + 4, metaTop + 20, metaCol - 8);
        meta("Período / modalidad", `${teacher.period} · ${teacher.modality}`, margin + metaCol + metaGap, metaTop + 20, metaCol - 8);
        meta("Generado por", generatorStaff?.full_name || (accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "Coordinación académica"), margin + 4, metaTop + 37, metaCol - 8);
        meta("Fecha / fuente", `${formatDate(ecuadorToday())} · SIACD`, margin + metaCol + metaGap, metaTop + 37, metaCol - 8);
        y = metaTop + 62;
      };

      const drawStatsTable = (reportRows: CriterionRow[]) => {
        const current = summarize(reportRows);
        const stats = descriptiveStats(reportRows);
        const enoughCoverage = current.evaluated >= 5 && current.advance >= 50;
        const finishNote = apaTableTitle(
          "Resumen general de la evaluación",
          enoughCoverage
            ? "El avance se calcula sobre criterios aplicables; el cumplimiento se calcula únicamente sobre criterios evaluados. Los indicadores descriptivos se muestran porque existe cobertura suficiente para su lectura complementaria."
            : "El avance se calcula sobre criterios aplicables y es el indicador principal. El cumplimiento corresponde solo a los criterios ya evaluados; no representa el grado de terminación del proceso. Estado, calificación y evidencia son dimensiones relacionadas, pero no equivalentes ni sumables.",
        );
        const rowsData: string[][] = [
          ["Criterios aplicables", String(current.applicable)],
          ["Evaluados", String(current.evaluated)],
          ["Aprobados", String(current.approved)],
          ["Pendientes", String(current.pending)],
          ["En revisión / reenviados", String(current.review + current.resent)],
          ["Por corregir", String(current.correction)],
          ["No aplica", String(current.na)],
          ["AVANCE GENERAL", `${current.evaluated}/${current.applicable} · ${current.advance}%`],
          ["Cumplimiento de los criterios ya evaluados", current.compliance === null ? "Sin evaluación" : `${current.approved}/${current.evaluated} · ${current.compliance}%`],
        ];
        if (enoughCoverage) {
          rowsData.push(
            ["Media de calificación", stats.mean === null ? "Sin evaluación" : `${fmt(stats.mean)} / 4`],
            ["Mediana", stats.median === null ? "Sin evaluación" : `${fmt(stats.median, 1)} / 4`],
            ["Desviación estándar", stats.sd === null ? "Sin evaluación" : fmt(stats.sd)],
          );
        }
        const col1 = 128;
        const rowH = 7.2;
        ensure(rowsData.length * rowH + 10);
        rowsData.forEach(([label, value], index) => {
          if (index === 0) {
            pdf.setDrawColor(70, 85, 99);
            pdf.setLineWidth(0.5);
            pdf.line(margin, y - 2, margin + contentWidth, y - 2);
          }
          pdf.setFont("times", label === "AVANCE GENERAL" ? "bold" : "normal");
          pdf.setFontSize(label === "AVANCE GENERAL" ? 9.2 : 8.8);
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

      const drawComponentTable = (reportRows: CriterionRow[], forceComponents = false) => {
        const isConsolidated = definition.key === "informe_final" && !forceComponents;
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
        const components = componentSummaries(reportRows);

        section("Resumen ejecutivo", "El avance general es el indicador principal del estado del proceso.");
        card(margin, y, contentWidth, 24, "AVANCE GENERAL", `${current.evaluated}/${current.applicable} · ${current.advance}%`, colors.review);
        y += 30;
        const gap = 4;
        const quarter = (contentWidth - gap * 3) / 4;
        card(margin, y, quarter, 20, "Aplicables", String(current.applicable), colors.pending);
        card(margin + quarter + gap, y, quarter, 20, "Evaluados", String(current.evaluated), colors.review);
        card(margin + (quarter + gap) * 2, y, quarter, 20, "Aprobados", String(current.approved), colors.approved);
        card(margin + (quarter + gap) * 3, y, quarter, 20, "Pendientes", String(current.pending), colors.pending);
        y += 27;
        card(
          margin,
          y,
          contentWidth,
          20,
          "Cumplimiento de los criterios ya evaluados",
          current.compliance === null ? "Sin evaluación" : `${current.approved}/${current.evaluated} · ${current.compliance}%`,
          colors.approved,
        );
        y += 27;

        callout("Cómo leer los indicadores", [
          "Avance: proporción de criterios aplicables que ya cuentan con calificación. Es el indicador principal para saber cuánto del proceso ha sido evaluado.",
          "Cumplimiento: proporción de criterios aprobados entre los criterios que ya fueron evaluados. No equivale al porcentaje de terminación del proceso.",
          "Estado: describe la situación operativa del criterio (pendiente, en revisión, reenviado, por corregir, aprobado o No aplica).",
          "Evidencia: corresponde al soporte documental solicitado, presentado y validado. Un criterio puede estar pendiente de evidencia y, por ello, permanecer sin calificación.",
          "Estado, calificación y evidencia representan dimensiones diferentes; sus cantidades pueden superponerse y no deben sumarse entre sí.",
        ], "blue");

        section("Resultados generales", `Resultados consolidados de ${label}.`);
        drawStatsTable(reportRows);
        drawComponentTable(reportRows);

        section("Figuras", "Se presentan únicamente las visualizaciones necesarias para comprender el estado general y la distribución por componente.");
        apaFigure(
          "Distribución del estado de los criterios",
          statusDonut(current),
          66,
          "La figura presenta la frecuencia de criterios aprobados, por corregir, pendientes, en revisión y No aplica.",
        );
        const comparison = definition.key === "informe_final" ? phaseBarChart(reportRows) : componentBarChart(components);
        apaFigure(
          definition.key === "informe_final" ? "Avance y cumplimiento por etapa" : "Cumplimiento evaluado por componente",
          comparison,
          68,
          "La comparación debe interpretarse junto con la cobertura de evaluación de cada etapa o componente. Un porcentaje alto con pocos criterios evaluados no implica que el proceso esté completo.",
        );
      };

      const drawPhaseResults = (phase: Phase, reportRows: CriterionRow[]) => {
        const phaseRows = reportRows.filter((row) => phaseForHito(row.definition.hito_id) === phase);
        if (!phaseRows.length) return;
        const current = summarize(phaseRows);
        section(phaseLabels[phase], `${phaseRows.length} criterios organizados por componente.`);
        apaParagraph(
          `En este hito existen ${current.applicable} criterios aplicables; ${current.evaluated} cuentan con calificación y ${current.pending} permanecen pendientes. El avance del hito es ${current.advance} %.`,
          { indentFirstLine: false },
        );
        drawComponentTable(phaseRows, true);
      };

      const drawFindings = (reportRows: CriterionRow[]) => {
        const current = summarize(reportRows);
        const components = componentSummaries(reportRows);
        section("Hallazgos y acciones pendientes", "Se describen cantidades y estados observados sin establecer rankings de desempeño con cobertura incompleta.");
        callout("Hallazgos y seguimiento", findingItems(current, components), "amber");
      };

      const drawInterpretation = (reportRows: CriterionRow[], label: string) => {
        const current = summarize(reportRows);
        section("Interpretación de resultados");
        if (current.evaluated === 0) {
          apaParagraph(`En ${label} no existen criterios calificados todavía. El avance general es 0 % y la información disponible corresponde principalmente a estados operativos y evidencia pendiente de revisión.`);
          return;
        }
        const complianceText = current.compliance === null ? "Sin evaluación" : `${current.compliance} % (${current.approved}/${current.evaluated})`;
        apaParagraph(
          `En ${label} se han evaluado ${current.evaluated} de ${current.applicable} criterios aplicables, lo que representa un avance general del ${current.advance} %. El cumplimiento de los criterios ya evaluados es ${complianceText}. Este segundo indicador describe únicamente el subconjunto evaluado y no debe interpretarse como terminación del proceso.`,
        );
      };

      const drawConclusions = (reportRows: CriterionRow[]) => {
        const current = summarize(reportRows);
        section("Conclusiones");
        callout("Conclusión del informe", [conclusionText(current, componentSummaries(reportRows), descriptiveStats(reportRows))], "blue");
      };

      const drawCriterion = (row: CriterionRow) => {
        const evaluator = row.score?.evaluated_by_staff_id ? staffMap.get(row.score.evaluated_by_staff_id) ?? null : null;
        const titleLines = pdf.splitTextToSize(row.definition.observable_competency, 146);
        const evidenceText = row.definition.expected_evidence?.trim() || "No especificada";
        const evidenceLines = pdf.splitTextToSize(`Evidencia esperada: ${evidenceText}`, 164);
        const grade = row.score?.not_applicable
          ? "No aplica aprobado"
          : row.score?.score !== null && row.score?.score !== undefined
            ? `${row.score.score}/4`
            : "Sin calificación";
        const reviewDate = row.latest?.reviewed_at || row.score?.evaluated_at || row.latest?.submitted_at || null;
        const evaluatorText = evaluator ? `${evaluator.full_name} · ${roleLabel(evaluator.role)}` : "Sin evaluador registrado";
        const observation = row.score?.coordinator_observation?.trim() || "";
        const observationLines = observation ? pdf.splitTextToSize(`Observación: ${observation}`, 164) : [];
        const boxHeight = Math.max(31, 18 + titleLines.length * 4 + evidenceLines.length * 3.7 + observationLines.length * 3.5 + 11);

        ensure(boxHeight + 6);
        const top = y;
        const [r, g, b] = colors[row.state.key];
        pdf.setFillColor(252, 253, 254);
        pdf.setDrawColor(222, 229, 235);
        pdf.roundedRect(margin, top, contentWidth, boxHeight, 2, 2, "FD");
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(margin, top, 3, boxHeight, 1.5, 1.5, "F");

        pdf.setTextColor(24, 43, 62);
        pdf.setFont("times", "bold");
        pdf.setFontSize(9.5);
        pdf.text(titleLines, margin + 7, top + 7);

        pdf.setTextColor(r, g, b);
        pdf.setFontSize(8.2);
        pdf.text(row.state.label.toUpperCase(), 190, top + 7, { align: "right" });

        let yy = top + 10 + titleLines.length * 4;
        pdf.setFont("times", "normal");
        pdf.setFontSize(8.7);
        pdf.setTextColor(70, 83, 96);
        pdf.text(evidenceLines, margin + 7, yy);
        yy += evidenceLines.length * 3.7 + 2.3;

        pdf.setFont("times", "bold");
        pdf.setTextColor(48, 64, 80);
        pdf.text(`Calificación: ${grade}`, margin + 7, yy);
        pdf.setFont("times", "normal");
        pdf.text(`Fecha: ${reviewDate ? formatDate(reviewDate) : "Sin fecha registrada"}`, margin + 70, yy);
        yy += 4.4;
        pdf.text(`Evaluador: ${evaluatorText}`, margin + 7, yy);

        if (observationLines.length) {
          yy += 4.3;
          pdf.setFont("times", "italic");
          pdf.setTextColor(78, 92, 105);
          pdf.text(observationLines, margin + 7, yy);
        }
        y = top + boxHeight + 5;
      };

      const drawDetails = (reportRows: CriterionRow[]) => {
        newPage();
        section("Anexo de trazabilidad de criterios", "Detalle criterio por criterio para auditoría: estado, evidencia esperada, calificación, fecha, evaluador y observaciones.");
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
        ensure(150);
        section("Cierre y verificación");
        const evaluatorIds = [...new Set(rows.map((row) => row.score?.evaluated_by_staff_id).filter((value): value is string => Boolean(value)))];
        const evaluators = evaluatorIds.map((id) => staffMap.get(id)).filter((item): item is StaffRow => Boolean(item));
        if (evaluators.length) line(`Evaluador(es): ${evaluators.slice(0, 4).map((item) => `${item.full_name} (${roleLabel(item.role)})`).join(" · ")}`, 10);
        line(`Generado por: ${generatorStaff?.full_name || (accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "Coordinación académica")}`, 10);
        line(`Fecha de generación: ${formatDate(ecuadorToday())} · Versión ${version}`, 10);
        if (official) line("Estado: INFORME OFICIAL", 10, true, colors.approved);
        line(`Código del documento: ${documentCode}`, 10, true);
        line(`Código de verificación SIACD: ${verificationCode}`, 9);

        spacer(5);
        ensure(64);
        const signatureTop = y;
        const signatureHeight = 58;
        const signatureWidth = headerWidth / 3;
        const signatureColumns = [
          { heading: "ELABORADO POR:", name: teacher.name, role: "Docente" },
          { heading: "REVISADO POR:", name: coordinatorName || "—", role: "Coordinador(a) de Carrera" },
          { heading: "APROBADO POR:", name: generalCoordinatorName || "Ing. Martha Tomalá", role: "Coordinadora General de Carreras" },
        ];
        pdf.setDrawColor(35, 35, 35);
        pdf.setLineWidth(0.3);
        signatureColumns.forEach((item, index) => {
          const x = headerMargin + index * signatureWidth;
          pdf.rect(x, signatureTop, signatureWidth, signatureHeight);
          pdf.line(x, signatureTop + 36, x + signatureWidth, signatureTop + 36);
          pdf.line(x, signatureTop + 45, x + signatureWidth, signatureTop + 45);
          drawArialCenteredText(item.heading, x + signatureWidth / 2, signatureTop + 2, signatureWidth - 4, 9, true, 1, "#000000");
          drawArialCenteredText(`Nombre: ${item.name}`, x + signatureWidth / 2, signatureTop + 37, signatureWidth - 4, 9, false, 2, "#000000");
          drawArialCenteredText(`Cargo: ${item.role}`, x + signatureWidth / 2, signatureTop + 46, signatureWidth - 4, 9, false, 2, "#000000");
        });
        y = signatureTop + signatureHeight + 6;

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

      if (definition.key === "informe_induccion") {
        section("Objetivo");
        apaParagraph("Documentar el proceso de inducción institucional y preparación académica realizado al docente nuevo, presentando el avance de evaluación, los resultados disponibles, los hallazgos y las acciones pendientes registradas en SIACD.");

        section("Alcance y metodología de verificación");
        apaParagraph("El informe comprende H1. Inducción institucional por áreas y H2. Preparación previa al inicio de la docencia. H1 integra Talento, Software, Calidad y Bienestar Estudiantil; H2 integra Coordinación, Teams, Telegram, PEA, Adaptaciones, EVA y SISACAD.");
        apaParagraph("La verificación utiliza criterios CHECK y EVIDENCIA. Los criterios CHECK requieren confirmación del docente y verificación de coordinación; los criterios EVIDENCIA requieren soporte documental. La calificación se registra en escala de 0 a 4 y es independiente del estado operativo de la evidencia.");
      } else {
        section("Objetivo");
        apaParagraph("Documentar integralmente el proceso de acompañamiento al docente nuevo durante el período académico, consolidando la inducción, preparación, seguimiento, observación, evidencias, revisiones y cierre registrados en SIACD.");

        section("Alcance y metodología de verificación");
        apaParagraph("El Informe Final integra H1 a H6. Para facilitar la lectura ejecutiva, los resultados se presentan primero de forma consolidada y por etapa; la trazabilidad completa criterio por criterio se conserva en el anexo.");
        apaParagraph("La verificación combina criterios CHECK y EVIDENCIA, calificación de 0 a 4, estados operativos y validación documental. Avance, cumplimiento, estado y evidencia son indicadores relacionados, pero no equivalentes.");
      }

      if (warnings.length) {
        section("Estado de la información", "Los siguientes mensajes distinguen cobertura de calificación, estado operativo y validación documental.");
        callout(
          "Información pendiente o incompleta",
          [
            ...warnings,
            "Las cantidades pueden referirse a dimensiones diferentes del mismo criterio y no deben sumarse entre sí.",
            "El documento refleja la información disponible y puede volver a generarse en cualquier momento con los datos actualizados.",
          ],
          "amber",
        );
      }

      if (definition.key === "informe_induccion") {
        drawExecutive(rows, "la inducción y preparación inicial del docente");
        drawPhaseResults("areas", rows);
        drawPhaseResults("before", rows);
        drawFindings(rows);
        drawInterpretation(rows, "la inducción y preparación inicial del docente");
        drawConclusions(rows);
        await drawClosure();
        drawDetails(rows);
      } else {
        drawExecutive(rows, "el acompañamiento integral del docente");
        drawPhaseResults("areas", rows);
        drawPhaseResults("before", rows);
        drawPhaseResults("during", rows);
        drawPhaseResults("after", rows);
        drawHistory();
        drawFindings(rows);
        drawInterpretation(rows, "el acompañamiento integral del docente");
        drawConclusions(rows);
        await drawClosure();
        drawDetails(rows);
      }

      if (isDemo) {
        newPage();
        section("Anexo de evidencias demostrativas", "Imágenes ficticias incorporadas exclusivamente para validar la presentación del documento.");
        [
          ["Inducción institucional", "Sesión de inducción y participación"],
          ["Aula virtual y PEA", "Configuración académica y recursos"],
          ["Seguimiento académico", "Avance y cumplimiento del acompañamiento"],
        ].forEach(([title, figureTitle], index) => {
          apaFigure(
            figureTitle,
            demoEvidenceImage(index + 1, title),
            68,
            "Imagen ficticia generada por SIACD para pruebas de maquetación documental. No corresponde a una evidencia real ni contiene datos personales reales.",
          );
        });
      }

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
      const fileName = `${safeName(definition.title.toLowerCase())}-${safeName(teacher.name.toLowerCase())}-v${version}.pdf`;
      pdf.save(fileName);

      const storagePath = `${teacher.id}/documents/formal-${definition.key}-v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError) {
        setMessage(`${definition.title} se descargó, pero no pudo guardarse en SIACD: ${uploadError.message}`);
        return;
      }

      const { error: registerError } = await supabase.from("generated_documents").insert({
        expedient_id: teacher.id,
        document_type: definition.key,
        status: "generated",
        storage_path: storagePath,
        verification_code: verificationCode,
        generated_by: null,
        generated_by_staff_id: staffId,
        issued_on: issuedOn,
        observation: `${official ? "OFICIAL" : "INFORMACIÓN PENDIENTE"} · FORMATO APA 7 · Versión ${version}`,
      });
      if (registerError) {
        await supabase.storage.from("siacd-evidence").remove([storagePath]);
        setMessage(`${definition.title} se descargó, pero no pudo registrarse en el historial de SIACD: ${registerError.message}`);
        return;
      }

      setMessage(`${definition.title} generado y guardado en SIACD.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el informe.");
    } finally {
      setBusy("");
    }
  }

  return <div style={{ position: "fixed", inset: 0, background: "rgba(8,22,38,.58)", zIndex: 10020, display: "grid", placeItems: "center", padding: 18 }}>
    <section style={{ width: "min(940px,96vw)", maxHeight: "92vh", overflow: "auto", background: "white", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.24)" }}>
      <header style={{ padding: "20px 22px", background: "#0d2946", color: "white", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
        <div><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>DOCUMENTACIÓN INSTITUCIONAL</span><h2 style={{ margin: "5px 0 2px" }}>Informes del docente</h2><p style={{ margin: 0, opacity: .78, fontSize: 13 }}>SIACD genera únicamente el Informe de Inducción y el Informe Final. Ambos pueden generarse aun cuando existan datos pendientes.</p></div>
        <button onClick={onClose} aria-label="Cerrar" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "white", borderRadius: 10, padding: 8, cursor: "pointer" }}><X size={18}/></button>
      </header>
      <div style={{ padding: 22 }}>
        {message && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#eef5fb", marginBottom: 14, color: "#173b5c", fontSize: 13 }}>{message}</div>}
        {warning && <div style={{ padding: 14, borderRadius: 12, border: "1px solid #ead5a7", background: "#fff9ec", marginBottom: 14, color: "#654b17", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <TriangleAlert size={19} style={{ flex: "0 0 auto", marginTop: 1 }}/>
            <div>
              <strong style={{ display: "block", fontSize: 13 }}>El informe tiene información pendiente</strong>
              <span style={{ fontSize: 12 }}>Puede generarlo de todas formas; el documento reflejará el estado actual del expediente.</span>
            </div>
          </div>
          <ul style={{ margin: "0 0 0 27px", padding: 0, display: "grid", gap: 4, fontSize: 12 }}>
            {warning.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setWarning(null)} style={{ border: "1px solid #d8c697", background: "white", color: "#654b17", borderRadius: 9, padding: "8px 11px", fontWeight: 750, cursor: "pointer" }}>Cancelar</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void generate(warning.definition, true)} style={{ border: 0, background: "#8a6419", color: "white", borderRadius: 9, padding: "8px 11px", fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
              {busy === warning.definition.key ? <Loader2 size={14}/> : <Download size={14}/>}
              {busy === warning.definition.key ? "Generando…" : "Generar de todas formas"}
            </button>
          </div>
        </div>}
        {isDemo && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 11, marginBottom: 14, border: "1px solid #e1d8ef", background: "#faf7fd", borderRadius: 12 }}><TestTube2 size={17}/><strong style={{ fontSize: 12 }}>Docente de prueba</strong><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("mixed")} style={{ border: "1px solid #d8cae8", background: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Escenario mixto</button><button disabled={Boolean(demoBusy || busy)} onClick={() => void prepareDemo("approved")} style={{ border: 0, background: "#2e7d5b", color: "white", borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontWeight: 750 }}>Todo aprobado</button></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
          {reportCards.map((item) => <article key={item.key} style={{ border: "1px solid #dce4eb", borderRadius: 13, padding: 16, display: "grid", gap: 11 }}><FileText size={20}/><div><strong style={{ display: "block", fontSize: 15 }}>{item.title}</strong><span style={{ fontSize: 12, color: "#66788a" }}>{item.subtitle}</span></div><button disabled={Boolean(busy || demoBusy)} onClick={() => void generate(item)} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: "#143d63", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>{busy === item.key ? <Loader2 size={15}/> : <Download size={15}/>} {busy === item.key ? "Generando…" : "Generar PDF"}</button></article>)}
        </div>
      </div>
    </section>
  </div>;
}
