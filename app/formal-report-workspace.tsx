"use client";
/* eslint-disable @next/next/no-img-element */

import { Download, FileText, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Phase = "areas" | "before" | "during" | "after";
type ReportKey = "informe_areas" | "informe_antes" | "informe_durante" | "informe_despues" | "informe_consolidado";

type Definition = {
  id: string;
  hito_id: string;
  process: string;
  observable_competency: string;
  expected_evidence: string | null;
};

type Score = {
  competency_id: string;
  score: number | null;
  not_applicable: boolean;
  coordinator_observation: string | null;
  evaluated_at: string | null;
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
  review_comment: string | null;
  items: EvidenceItem[];
};

type WorkspaceCriterion = {
  id: string;
  request: { submissions: Submission[] } | null;
};

type Workspace = { criteria: WorkspaceCriterion[] };

type ReportDefinition = { key: ReportKey; title: string; subtitle: string; phase?: Phase };

const reports: ReportDefinition[] = [
  { key: "informe_areas", title: "Informe de Áreas", subtitle: "Inducción institucional y condiciones de incorporación docente.", phase: "areas" },
  { key: "informe_antes", title: "Informe Antes", subtitle: "Preparación académica y tecnológica previa al inicio de la docencia.", phase: "before" },
  { key: "informe_durante", title: "Informe Durante", subtitle: "Seguimiento de la ejecución académica y acompañamiento durante el período.", phase: "during" },
  { key: "informe_despues", title: "Informe Después", subtitle: "Cierre académico y verificación final del proceso docente.", phase: "after" },
  { key: "informe_consolidado", title: "Informe Consolidado", subtitle: "Resultado integral del acompañamiento docente." },
];

const phaseLabels: Record<Phase, string> = { areas: "Áreas", before: "Antes", during: "Durante", after: "Después" };
const sectionOrder: Record<Phase, string[]> = {
  areas: ["Talento", "Software", "Calidad", "Bienestar Estudiantil"],
  before: ["Coordinador", "Teams", "Telegram", "PEA", "Adaptaciones", "EVA", "SISACAD"],
  during: ["General", "Adaptaciones", "Presentaciones", "Unidad 1", "Unidad 2", "Unidad 3", "Unidad 4", "Observación de clase"],
  after: ["Cierre"],
};

function phaseForHito(value: string): Phase {
  if (value === "H1") return "areas";
  if (value === "H2") return "before";
  if (value === "H6") return "after";
  return "during";
}

function today() { return new Date().toISOString().slice(0, 10); }
function safeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

async function imageToJpegDataUrl(url: string): Promise<{ data: string; width: number; height: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar una imagen de evidencia.");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { data: canvas.toDataURL("image/jpeg", 0.82), width: canvas.width, height: canvas.height };
}

export default function FormalReportWorkspace({ teacher, accessMode, coordinatorName, onClose }: {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<ReportKey | "">("");
  const [message, setMessage] = useState("");
  const reportCards = useMemo(() => reports, []);

  async function resolveStaffId() {
    if (accessMode === "coordinator") return teacher.coordinatorId || "";
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "";
    const { data } = await supabase.from("siacd_staff").select("id").eq("role", "admin").eq("active", true).limit(1).maybeSingle();
    return data?.id ? String(data.id) : teacher.coordinatorId || "";
  }

  async function generate(definition: ReportDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(definition.key);
    setMessage("");
    try {
      const staffId = await resolveStaffId();
      if (!staffId) throw new Error("No se pudo identificar al responsable del informe.");

      const [definitionsResult, scoresResult, workspaceResult, documentsResult] = await Promise.all([
        supabase.from("competency_definitions").select("id,hito_id,process,observable_competency,expected_evidence").eq("active", true).order("id"),
        supabase.from("competency_scores").select("competency_id,score,not_applicable,coordinator_observation,evaluated_at").eq("expedient_id", teacher.id),
        supabase.rpc("staff_criterion_evidence_workspace", { p_expedient_id: teacher.id, p_staff_id: staffId }),
        supabase.from("generated_documents").select("id,document_type,status").eq("expedient_id", teacher.id),
      ]);
      if (definitionsResult.error || scoresResult.error || workspaceResult.error) throw new Error("No se pudo reunir la información del expediente.");

      const definitions = (definitionsResult.data ?? []) as Definition[];
      const scores = new Map<string, Score>((scoresResult.data ?? []).map((row) => [row.competency_id, {
        competency_id: row.competency_id,
        score: row.score === null ? null : Number(row.score),
        not_applicable: Boolean(row.not_applicable),
        coordinator_observation: row.coordinator_observation ?? null,
        evaluated_at: row.evaluated_at ?? null,
      }]));
      const workspace = workspaceResult.data as Workspace;
      const evidenceMap = new Map(workspace.criteria.map((item) => [item.id, item]));
      const scope = definition.phase ? definitions.filter((item) => phaseForHito(item.hito_id) === definition.phase) : definitions;
      const approved = scope.filter((item) => {
        const score = scores.get(item.id);
        return Boolean(score?.not_applicable || (score?.score !== null && score?.score !== undefined && score.score >= 3));
      }).length;
      const evaluated = scope.filter((item) => {
        const score = scores.get(item.id);
        return Boolean(score?.not_applicable || score?.score !== null && score?.score !== undefined);
      }).length;
      const pending = Math.max(0, scope.length - approved);
      const scored = scope.map((item) => scores.get(item.id)).filter((item): item is Score => Boolean(item && !item.not_applicable && item.score !== null));
      const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length / 4 * 100) : 0;
      const official = scope.length > 0 && approved === scope.length;
      const version = (documentsResult.data ?? []).filter((item) => item.document_type === definition.key && item.status !== "void").length + 1;
      const code = `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 16;
      const contentWidth = pageWidth - margin * 2;
      let y = 18;

      const pageHeader = () => {
        pdf.setFillColor(13, 41, 70);
        pdf.rect(0, 0, pageWidth, 20, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text("ITSQMET · SIACD", margin, 9);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.text("Sistema Integral de Acompañamiento Docente", margin, 14);
        pdf.setTextColor(30, 45, 60);
        y = 28;
      };
      const ensure = (height = 14) => {
        if (y + height > pageHeight - 18) {
          pdf.addPage();
          pageHeader();
        }
      };
      const line = (text: string, size = 9, bold = false, indent = 0) => {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text || "—", contentWidth - indent);
        ensure(lines.length * 4.4 + 3);
        pdf.text(lines, margin + indent, y);
        y += lines.length * 4.4 + 2;
      };
      const section = (title: string, subtitle?: string) => {
        ensure(subtitle ? 19 : 13);
        y += 2;
        pdf.setFillColor(239, 244, 248);
        pdf.roundedRect(margin, y - 5, contentWidth, subtitle ? 15 : 10, 1.5, 1.5, "F");
        pdf.setTextColor(13, 41, 70);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10.5);
        pdf.text(title, margin + 3, y + 1);
        if (subtitle) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7.5);
          pdf.setTextColor(75, 90, 105);
          pdf.text(pdf.splitTextToSize(subtitle, contentWidth - 6), margin + 3, y + 6);
          y += 12;
        } else y += 8;
        pdf.setTextColor(30, 45, 60);
      };
      const meta = (label: string, value: string, x: number, top: number, width: number) => {
        pdf.setTextColor(95, 108, 120);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.8);
        pdf.text(label.toUpperCase(), x, top);
        pdf.setTextColor(28, 42, 55);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.text(pdf.splitTextToSize(value || "—", width), x, top + 5);
      };

      pageHeader();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(17);
      pdf.setTextColor(13, 41, 70);
      pdf.text(definition.title, margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(85, 98, 112);
      pdf.text(pdf.splitTextToSize(definition.subtitle, contentWidth - 45), margin, y);
      pdf.setFillColor(official ? 225 : 255, official ? 244 : 243, official ? 232 : 215);
      pdf.setTextColor(official ? 34 : 141, official ? 104 : 88, official ? 64 : 18);
      pdf.roundedRect(164, 25, 30, 9, 2, 2, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.text(official ? "OFICIAL" : "BORRADOR", 179, 30.7, { align: "center" });
      y += 12;

      pdf.setDrawColor(220, 226, 232);
      pdf.roundedRect(margin, y, contentWidth, 31, 2, 2, "S");
      meta("Docente", teacher.name, margin + 4, y + 7, 72);
      meta("Carrera", teacher.career, margin + 82, y + 7, 91);
      meta("Asignatura", teacher.subject, margin + 4, y + 20, 72);
      meta("Período / modalidad", `${teacher.period} · ${teacher.modality}`, margin + 82, y + 20, 91);
      y += 38;

      section("Resumen ejecutivo", official ? "La etapa cumple todos los criterios aplicables." : "Documento provisional: existen criterios pendientes o por corregir.");
      const cards = [
        ["Aprobados", `${approved}/${scope.length}`],
        ["Evaluados", `${evaluated}/${scope.length}`],
        ["Pendientes", String(pending)],
        ["Resultado evaluado", `${average}%`],
      ];
      cards.forEach(([label, value], index) => {
        const x = margin + index * 45;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, y, 41, 18, 2, 2, "F");
        pdf.setTextColor(13, 41, 70);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(value, x + 4, y + 8);
        pdf.setFontSize(6.8);
        pdf.setTextColor(95, 108, 120);
        pdf.text(label.toUpperCase(), x + 4, y + 14);
      });
      y += 24;

      const phaseScopes: Phase[] = definition.phase ? [definition.phase] : ["areas", "before", "during", "after"];
      for (const phase of phaseScopes) {
        const phaseDefs = scope.filter((item) => phaseForHito(item.hito_id) === phase);
        if (!phaseDefs.length) continue;
        section(phaseLabels[phase], `${phaseDefs.length} criterios organizados por componente.`);
        const groups = new Map<string, Definition[]>();
        for (const item of phaseDefs) groups.set(item.process, [...(groups.get(item.process) ?? []), item]);
        const orderedGroups = [...groups.keys()].sort((a, b) => {
          const ai = sectionOrder[phase].indexOf(a);
          const bi = sectionOrder[phase].indexOf(b);
          return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
        });

        for (const group of orderedGroups) {
          ensure(12);
          line(group, 10, true);
          for (const criterion of groups.get(group) ?? []) {
            const score = scores.get(criterion.id);
            const isNa = Boolean(score?.not_applicable);
            const passed = Boolean(isNa || (score?.score !== null && score?.score !== undefined && score.score >= 3));
            const state = isNa ? "NO APLICA" : score?.score === null || score?.score === undefined ? "PENDIENTE" : passed ? `APROBADO · ${score.score}/4` : `CORRECCIÓN · ${score.score}/4`;
            const observation = score?.coordinator_observation?.trim() || "Sin observación registrada.";
            ensure(27);
            pdf.setDrawColor(224, 229, 234);
            pdf.roundedRect(margin, y - 2, contentWidth, 20, 1.5, 1.5, "S");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8.5);
            pdf.setTextColor(22, 43, 64);
            const titleLines = pdf.splitTextToSize(`${criterion.id} · ${criterion.observable_competency}`, 132);
            pdf.text(titleLines, margin + 3, y + 3);
            pdf.setFontSize(7);
            pdf.setTextColor(passed ? 39 : 150, passed ? 110 : 76, passed ? 62 : 45);
            pdf.text(state, margin + contentWidth - 3, y + 3, { align: "right" });
            y += Math.max(9, titleLines.length * 4 + 2);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(80, 92, 104);
            pdf.setFontSize(7.5);
            const obsLines = pdf.splitTextToSize(`Observación: ${observation}`, contentWidth - 8);
            pdf.text(obsLines.slice(0, 2), margin + 3, y);
            y += Math.min(2, obsLines.length) * 3.8 + 5;

            if (!passed || isNa) continue;
            const criterionEvidence = evidenceMap.get(criterion.id);
            const approvedSubmission = criterionEvidence?.request?.submissions?.find((item) => item.status === "approved") ?? null;
            if (!approvedSubmission) continue;
            const images = approvedSubmission.items.filter((item) => item.kind === "image").slice(0, 3);
            const references = approvedSubmission.items.filter((item) => item.kind !== "image");
            if (images.length) {
              ensure(57);
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(7.5);
              pdf.setTextColor(55, 72, 88);
              pdf.text("EVIDENCIA FINAL APROBADA", margin + 3, y);
              y += 4;
              const imageWidth = images.length === 1 ? 82 : images.length === 2 ? 75 : 52;
              let x = margin + 3;
              for (const item of images) {
                const { data: signed } = await supabase.functions.invoke("teacher-evidence", { body: { action: "staff-item-signed-url", staff_id: staffId, item_id: item.id } });
                const url = (signed as { url?: string } | null)?.url;
                if (!url) continue;
                try {
                  const prepared = await imageToJpegDataUrl(url);
                  const maxHeight = 46;
                  const ratio = prepared.height / prepared.width;
                  const drawHeight = Math.min(maxHeight, imageWidth * ratio);
                  pdf.addImage(prepared.data, "JPEG", x, y, imageWidth, drawHeight, undefined, "FAST");
                  pdf.setDrawColor(215, 221, 227);
                  pdf.rect(x, y, imageWidth, drawHeight, "S");
                  x += imageWidth + 5;
                } catch { /* La referencia textual se conserva aunque una miniatura no cargue. */ }
              }
              y += 50;
            }
            if (references.length) {
              for (const item of references) {
                const reference = item.kind === "link" ? item.external_url : item.file_name;
                if (reference) line(`Documento / enlace complementario: ${reference}`, 7.2, false, 3);
              }
            }
          }
        }
      }

      section("Cierre del informe");
      line(official
        ? "El presente documento consolida la evidencia final aprobada y los resultados registrados en SIACD para el alcance indicado."
        : "Este documento se emite como BORRADOR. Será oficial únicamente cuando todos los criterios aplicables estén aprobados con 3/4, 4/4 o No aplica aprobado.", 8.5);
      line(`Responsable: ${accessMode === "admin" ? "Administrador SIACD" : coordinatorName || "Coordinación académica"}`, 8);
      line(`Código de verificación: ${code}`, 7.5, true);
      line(`Fecha de generación: ${formatDate(today())} · Versión ${version}`, 7.5);

      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(225, 230, 235);
        pdf.line(margin, 285, pageWidth - margin, 285);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(105, 116, 127);
        pdf.text(`${definition.title} · ${teacher.name}`, margin, 290);
        pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, 290, { align: "right" });
      }

      const blob = pdf.output("blob");
      const storagePath = `${teacher.id}/documents/formal-${definition.key}-v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (!uploadError) {
        await supabase.from("generated_documents").insert({
          expedient_id: teacher.id,
          document_type: definition.key,
          status: "generated",
          storage_path: storagePath,
          verification_code: code,
          generated_by: null,
          generated_by_staff_id: staffId,
          issued_on: today(),
          observation: `${official ? "OFICIAL" : "BORRADOR"} · FORMATO INSTITUCIONAL · Versión ${version}`,
        });
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
      <header style={{ padding: "22px 24px", background: "#0d2946", color: "white", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
        <div><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}>DOCUMENTACIÓN INSTITUCIONAL</span><h2 style={{ margin: "6px 0 4px" }}>Informes formales SIACD</h2><p style={{ margin: 0, opacity: .78 }}>Incluyen resultados, observaciones y evidencias finales aprobadas.</p></div>
        <button onClick={onClose} aria-label="Cerrar" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "white", borderRadius: 10, padding: 8, cursor: "pointer" }}><X size={18}/></button>
      </header>
      <div style={{ padding: 24 }}>
        {message && <div style={{ padding: "11px 13px", borderRadius: 10, background: "#eef5fb", marginBottom: 16, color: "#173b5c" }}>{message}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
          {reportCards.map((item) => <article key={item.key} style={{ border: "1px solid #dce4eb", borderRadius: 14, padding: 17, display: "grid", gap: 10 }}>
            <FileText size={22}/><div><strong style={{ display: "block", fontSize: 16 }}>{item.title}</strong><span style={{ fontSize: 13, color: "#66788a" }}>{item.subtitle}</span></div>
            <button disabled={Boolean(busy)} onClick={() => void generate(item)} style={{ border: 0, borderRadius: 10, padding: "10px 12px", background: "#143d63", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
              {busy === item.key ? <Loader2 size={15}/> : <Download size={15}/>} {busy === item.key ? "Generando…" : "Generar PDF"}
            </button>
          </article>)}
        </div>
      </div>
    </section>
  </div>;
}
