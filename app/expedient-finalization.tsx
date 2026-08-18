"use client";

import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Link2,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./siacd-block3.module.css";

export type FinalizationMode = "complementary" | "quality" | "evidence" | "documents" | "certification";

type ComplementaryDefinition = {
  id: string;
  display_id: string;
  hito: string;
  process: string;
  observable_criterion: string;
  criticality: "Crítica" | "Importante" | "Deseable";
  expected_evidence: string | null;
};

type ComplementaryScore = {
  criterion_id: string;
  score: number | null;
  observation: string;
  verified_on: string;
};

type QualityCriterion = {
  id: string;
  dimension: string;
  criterion: string;
  validation_parameter: string;
  expected_evidence: string | null;
  criticality: "Crítica" | "Importante" | "Deseable";
  weight: number;
  level_0: string;
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
};

type QualityScore = {
  criterion_id: string;
  score: number | null;
  finding: string;
  improvement_commitment: string;
  verification_on: string;
};

type Evidence = {
  id: string;
  hito_id: string | null;
  kind: "file" | "screenshot" | "photo" | "link";
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
  status: "generated" | "signed" | "archived" | "void";
  storage_path: string | null;
  verification_code: string | null;
  issued_on: string | null;
  signed_at: string | null;
  archived_at: string | null;
  observation: string | null;
  generated_at: string;
};

type Followup = {
  id: string;
  happened_on: string;
  hito_id: string | null;
  followup_type: string;
  finding: string;
  agreed_action: string | null;
};

type DocumentDefinition = {
  type: string;
  title: string;
  description: string;
};

const documentDefinitions: DocumentDefinition[] = [
  { type: "acta_induccion", title: "Acta oficial de inducción", description: "Ficha inicial, resultados H1 y compromisos." },
  { type: "acompanamiento_1", title: "Registro de acompañamiento 1", description: "Hallazgos, retroalimentación y compromisos." },
  { type: "informe_calidad", title: "Informe de observación de calidad", description: "Rúbrica CAL-01 a CAL-21 y plan de acompañamiento." },
  { type: "acompanamiento_2", title: "Registro de acompañamiento 2", description: "Verificación de compromisos y nuevos hallazgos." },
  { type: "informe_cierre", title: "Informe consolidado de cierre", description: "Resultados, fortalezas, brechas y recomendación." },
  { type: "certificado", title: "Certificado de cumplimiento", description: "Se habilita únicamente al cumplir todas las reglas." },
  { type: "reporte_docente", title: "Reporte individual del docente", description: "Síntesis completa del acompañamiento." },
  { type: "indice_expediente", title: "Índice del expediente", description: "Control de documentos, evidencias y trazabilidad." },
];

const narrativeKeys = [
  { key: "process_summary", label: "Resumen del proceso" },
  { key: "strengths", label: "Fortalezas identificadas" },
  { key: "gaps", label: "Brechas y compromisos" },
  { key: "accompaniment_plan", label: "Plan de acompañamiento" },
  { key: "conclusion", label: "Conclusión y recomendación" },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function scoreLabel(score: number | null) {
  if (score === null) return "Pendiente";
  if (score >= 3) return "Cumple";
  if (score === 2) return "En desarrollo";
  return "Requiere acompañamiento";
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function verificationCode() {
  return `SIACD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export default function ExpedientFinalization({
  mode,
  teacher,
  accessMode,
  coordinatorName,
  operationalPercent,
  operationalEvaluated,
  operationalCriticalGaps,
  onChanged,
}: {
  mode: FinalizationMode;
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  operationalPercent: number;
  operationalEvaluated: number;
  operationalCriticalGaps: number;
  onChanged: () => Promise<void> | void;
}) {
  const [compDefs, setCompDefs] = useState<ComplementaryDefinition[]>([]);
  const [compScores, setCompScores] = useState<Record<string, ComplementaryScore>>({});
  const [qualityDefs, setQualityDefs] = useState<QualityCriterion[]>([]);
  const [qualityScores, setQualityScores] = useState<Record<string, QualityScore>>({});
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [narratives, setNarratives] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [schemaIssue, setSchemaIssue] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaIssue("");

    const [cd, cs, qd, qs, ev, gd, nr, fu] = await Promise.all([
      supabase.from("complementary_definitions").select("id,display_id,hito,process,observable_criterion,criticality,expected_evidence").eq("active", true).order("display_id"),
      supabase.from("complementary_scores").select("criterion_id,score,observation,verified_on").eq("expedient_id", teacher.id),
      supabase.from("quality_criteria").select("id,dimension,criterion,validation_parameter,expected_evidence,criticality,weight,level_0,level_1,level_2,level_3,level_4").eq("active", true).order("id"),
      supabase.from("quality_scores").select("criterion_id,score,finding,improvement_commitment,verification_on").eq("expedient_id", teacher.id),
      supabase.from("evidences").select("id,hito_id,kind,title,description,external_url,storage_path,happened_on,created_at").eq("expedient_id", teacher.id).order("created_at", { ascending: false }),
      supabase.from("generated_documents").select("id,document_type,status,storage_path,verification_code,issued_on,signed_at,archived_at,observation,generated_at").eq("expedient_id", teacher.id).order("generated_at", { ascending: false }),
      supabase.from("document_narratives").select("section_key,content").eq("expedient_id", teacher.id),
      supabase.from("followups").select("id,happened_on,hito_id,followup_type,finding,agreed_action").eq("expedient_id", teacher.id).order("happened_on", { ascending: true }),
    ]);

    const migrationError = cd.error || qd.error || gd.error || nr.error;
    if (migrationError && /does not exist|schema cache|column/i.test(migrationError.message)) {
      setSchemaIssue("Falta aplicar la migración 202608180003_block3_finalization.sql en Supabase.");
      setLoading(false);
      return;
    }
    const anyError = cd.error || cs.error || qd.error || qs.error || ev.error || gd.error || nr.error || fu.error;
    if (anyError) {
      setMessage(`No se pudo cargar el Bloque 3: ${anyError.message}`);
      setLoading(false);
      return;
    }

    setCompDefs((cd.data ?? []) as ComplementaryDefinition[]);
    setQualityDefs((qd.data ?? []).map((row) => ({ ...row, weight: Number(row.weight) })) as QualityCriterion[]);
    const cMap: Record<string, ComplementaryScore> = {};
    for (const row of cs.data ?? []) {
      cMap[row.criterion_id] = {
        criterion_id: row.criterion_id,
        score: row.score === null ? null : Number(row.score),
        observation: row.observation ?? "",
        verified_on: row.verified_on ?? "",
      };
    }
    setCompScores(cMap);
    const qMap: Record<string, QualityScore> = {};
    for (const row of qs.data ?? []) {
      qMap[row.criterion_id] = {
        criterion_id: row.criterion_id,
        score: row.score === null ? null : Number(row.score),
        finding: row.finding ?? "",
        improvement_commitment: row.improvement_commitment ?? "",
        verification_on: row.verification_on ?? "",
      };
    }
    setQualityScores(qMap);
    setEvidences((ev.data ?? []) as Evidence[]);
    setDocuments((gd.data ?? []) as GeneratedDocument[]);
    setFollowups((fu.data ?? []) as Followup[]);
    setNarratives(Object.fromEntries((nr.data ?? []).map((row) => [row.section_key, row.content ?? ""])));
    setLoading(false);
  }, [teacher.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const compStats = useMemo(() => {
    const values = compDefs
      .map((def) => compScores[def.id]?.score)
      .filter((value): value is number => value !== null && value !== undefined);
    const result = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length / 4 : 0;
    const criticalGaps = compDefs.filter((def) => def.criticality === "Crítica" && (compScores[def.id]?.score ?? 4) < 3).length;
    return { evaluated: values.length, total: compDefs.length, result, criticalGaps };
  }, [compDefs, compScores]);

  const qualityStats = useMemo(() => {
    let result = 0;
    let evaluated = 0;
    let criticalGaps = 0;
    const dimensions: Record<string, { sum: number; count: number }> = {};
    for (const def of qualityDefs) {
      const score = qualityScores[def.id]?.score;
      if (score === null || score === undefined) continue;
      evaluated += 1;
      result += (score / 4) * Number(def.weight);
      if (def.criticality === "Crítica" && score < 3) criticalGaps += 1;
      dimensions[def.dimension] ??= { sum: 0, count: 0 };
      dimensions[def.dimension].sum += score;
      dimensions[def.dimension].count += 1;
    }
    return { evaluated, total: qualityDefs.length, result, criticalGaps, dimensions };
  }, [qualityDefs, qualityScores]);

  const evidenceHitos = useMemo(
    () => new Set(evidences.map((item) => item.hito_id).filter((id): id is string => Boolean(id && /^H[1-6]$/.test(id)))).size,
    [evidences],
  );

  const finalScore = useMemo(
    () => operationalPercent / 100 * 0.60 + compStats.result * 0.15 + qualityStats.result * 0.25,
    [operationalPercent, compStats.result, qualityStats.result],
  );

  const certificationChecks = useMemo(() => [
    { label: "75 criterios H1–H6 evaluados", ok: operationalEvaluated === 75, value: `${operationalEvaluated}/75` },
    { label: "Resultado operativo mínimo 75%", ok: operationalPercent >= 75, value: `${operationalPercent}%` },
    { label: "Sin brechas críticas H1–H6", ok: operationalCriticalGaps === 0, value: String(operationalCriticalGaps) },
    { label: "17 criterios complementarios evaluados", ok: compStats.evaluated === 17, value: `${compStats.evaluated}/17` },
    { label: "Matriz complementaria mínimo 75%", ok: compStats.result >= 0.75, value: percent(compStats.result) },
    { label: "21 criterios de Calidad evaluados", ok: qualityStats.evaluated === 21, value: `${qualityStats.evaluated}/21` },
    { label: "Calidad mínimo 75%", ok: qualityStats.result >= 0.75, value: percent(qualityStats.result) },
    { label: "Sin brechas críticas de Calidad", ok: qualityStats.criticalGaps === 0, value: String(qualityStats.criticalGaps) },
    { label: "Mínimo 4 seguimientos", ok: followups.length >= 4, value: String(followups.length) },
    { label: "Evidencia en mínimo 4 hitos", ok: evidenceHitos >= 4, value: `${evidenceHitos}/6` },
    { label: "Resultado integrado mínimo 75%", ok: finalScore >= 0.75, value: percent(finalScore) },
  ], [operationalEvaluated, operationalPercent, operationalCriticalGaps, compStats, qualityStats, followups.length, evidenceHitos, finalScore]);

  const canCertify = certificationChecks.every((item) => item.ok);
  const certificationLabel = canCertify ? (finalScore >= 0.8125 ? "CERTIFICADO CON ALTO DOMINIO" : "CERTIFICADO") : "EN DESARROLLO";

  async function syncMetrics(nextComp = compScores, nextQuality = qualityScores, nextEvidences = evidences) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const cValues = compDefs
      .map((def) => nextComp[def.id]?.score)
      .filter((value): value is number => value !== null && value !== undefined);
    const cScore = cValues.length ? cValues.reduce((sum, value) => sum + value, 0) / cValues.length / 4 : 0;
    let qScore = 0;
    for (const def of qualityDefs) {
      const score = nextQuality[def.id]?.score;
      if (score !== null && score !== undefined) qScore += score / 4 * Number(def.weight);
    }
    const eHitos = new Set(nextEvidences.map((item) => item.hito_id).filter((id) => id && /^H[1-6]$/.test(id))).size;
    const integrated = operationalPercent / 100 * 0.60 + cScore * 0.15 + qScore * 0.25;
    await supabase.from("expedients").update({
      complementary_score: cScore || null,
      quality_score: qScore || null,
      final_score: integrated || null,
      followups_count: followups.length,
      evidence_hitos_count: eHitos,
      updated_at: new Date().toISOString(),
    }).eq("id", teacher.id);
  }

  async function saveComplementary(def: ComplementaryDefinition) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const current = compScores[def.id] ?? { criterion_id: def.id, score: null, observation: "", verified_on: "" };
    setSavingId(def.id);
    const { error } = await supabase.from("complementary_scores").upsert({
      expedient_id: teacher.id,
      criterion_id: def.id,
      score: current.score,
      observation: current.observation || null,
      verified_on: current.verified_on || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "expedient_id,criterion_id" });
    if (error) setMessage(`No se pudo guardar ${def.display_id}: ${error.message}`);
    else {
      const next = { ...compScores, [def.id]: current };
      setCompScores(next);
      await syncMetrics(next, qualityScores, evidences);
      setMessage(`${def.display_id} guardado`);
      await onChanged();
    }
    setSavingId("");
  }

  async function saveQuality(def: QualityCriterion) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const current = qualityScores[def.id] ?? { criterion_id: def.id, score: null, finding: "", improvement_commitment: "", verification_on: "" };
    setSavingId(def.id);
    const { error } = await supabase.from("quality_scores").upsert({
      expedient_id: teacher.id,
      criterion_id: def.id,
      score: current.score,
      finding: current.finding || null,
      improvement_commitment: current.improvement_commitment || null,
      verification_on: current.verification_on || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "expedient_id,criterion_id" });
    if (error) setMessage(`No se pudo guardar ${def.id}: ${error.message}`);
    else {
      const next = { ...qualityScores, [def.id]: current };
      setQualityScores(next);
      await syncMetrics(compScores, next, evidences);
      setMessage(`${def.id} guardado`);
      await onChanged();
    }
    setSavingId("");
  }

  async function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setUploading(true);
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const url = String(form.get("external_url") ?? "").trim();
    let storagePath: string | null = null;
    let kind: Evidence["kind"] = "link";

    if (file instanceof File && file.size > 0) {
      storagePath = `${teacher.id}/evidence/${Date.now()}-${safeName(file.name)}`;
      kind = file.type.startsWith("image/") ? "photo" : "file";
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, file, { upsert: false });
      if (uploadError) {
        setUploading(false);
        setMessage(`No se pudo subir el archivo: ${uploadError.message}`);
        return;
      }
    } else if (!url) {
      setUploading(false);
      setMessage("Adjunte un archivo o coloque un enlace.");
      return;
    }

    const { error } = await supabase.from("evidences").insert({
      expedient_id: teacher.id,
      hito_id: String(form.get("hito_id") ?? "") || null,
      kind,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? "") || null,
      external_url: url || null,
      storage_path: storagePath,
      mime_type: file instanceof File && file.size > 0 ? file.type || null : null,
      size_bytes: file instanceof File && file.size > 0 ? file.size : null,
      happened_on: String(form.get("happened_on") ?? "") || null,
      uploaded_by: null,
      uploaded_by_staff_id: teacher.coordinatorId || null,
    });
    if (error) {
      if (storagePath) await supabase.storage.from("siacd-evidence").remove([storagePath]);
      setMessage(`No se pudo registrar la evidencia: ${error.message}`);
      setUploading(false);
      return;
    }
    setUploading(false);
    (event.currentTarget as HTMLFormElement).reset();
    setMessage("Evidencia registrada");
    await load();
    await onChanged();
  }

  async function openStored(path: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("siacd-evidence").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) return setMessage(`No se pudo abrir el archivo: ${error?.message ?? "sin URL"}`);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteEvidence(item: Evidence) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !window.confirm("¿Eliminar esta evidencia?")) return;
    if (item.storage_path) await supabase.storage.from("siacd-evidence").remove([item.storage_path]);
    const { error } = await supabase.from("evidences").delete().eq("id", item.id);
    if (error) return setMessage(error.message);
    setMessage("Evidencia eliminada");
    await load();
    await onChanged();
  }

  async function saveNarratives() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSavingId("narratives");
    const rows = narrativeKeys.map(({ key }) => ({
      expedient_id: teacher.id,
      section_key: key,
      content: narratives[key] ?? "",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("document_narratives").upsert(rows, { onConflict: "expedient_id,section_key" });
    if (error) setMessage(`No se pudo guardar la síntesis: ${error.message}`);
    else setMessage("Síntesis documental guardada");
    setSavingId("");
  }

  function addPdfHeader(pdf: any, title: string) {
    pdf.setFillColor(7, 28, 52);
    pdf.rect(0, 0, 210, 30, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(17);
    pdf.text("SIACD", 16, 12);
    pdf.setFontSize(9);
    pdf.text("Sistema Integral de Acompañamiento Docente · ITSQMET", 16, 20);
    pdf.setTextColor(25, 42, 58);
    pdf.setFontSize(15);
    pdf.text(title, 16, 43, { maxWidth: 178 });
  }

  async function generateDocument(definition: DocumentDefinition) {
    if (definition.type === "certificado" && !canCertify) {
      setMessage("El certificado todavía no está habilitado. Revise las condiciones de certificación.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setGenerating(definition.type);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      addPdfHeader(pdf, definition.title);
      let y = 56;
      const line = (label: string, value: string) => {
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${label}:`, 16, y);
        pdf.setFont("helvetica", "normal");
        const text = pdf.splitTextToSize(value || "—", 135);
        pdf.text(text, 56, y);
        y += Math.max(6, text.length * 4.5);
      };
      const section = (title: string, value: string) => {
        if (!value) return;
        if (y > 245) { pdf.addPage(); y = 20; }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(title, 16, y);
        y += 5;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        const text = pdf.splitTextToSize(value, 178);
        if (y + text.length * 4.5 > 275) { pdf.addPage(); y = 20; }
        pdf.text(text, 16, y);
        y += text.length * 4.5 + 6;
      };

      line("Docente", teacher.name);
      line("Carrera", teacher.career);
      line("Asignatura(s)", teacher.subject);
      line("Período", teacher.period);
      line("Coordinador", coordinatorName);
      line("Fecha de emisión", formatDate(today()));
      line("Resultado operativo", `${operationalPercent}%`);
      line("Matriz complementaria", percent(compStats.result));
      line("Observación de Calidad", percent(qualityStats.result));
      line("Resultado integrado", percent(finalScore));
      line("Seguimientos", String(followups.length));
      line("Hitos con evidencia", `${evidenceHitos}/6`);

      if (definition.type === "acta_induccion") {
        section("Objeto", "Dejar constancia de la inducción institucional y del inicio del proceso de acompañamiento del docente nuevo.");
        section("Compromisos iniciales", narratives.accompaniment_plan || narratives.gaps || "Los compromisos se registran y verifican en la bitácora institucional.");
      } else if (definition.type === "acompanamiento_1") {
        section("Objeto", "Registrar el primer acompañamiento técnico y la retroalimentación derivada de la revisión del expediente.");
        section("Hallazgos", followups.slice(0, Math.max(1, Math.ceil(followups.length / 2))).map((f) => `${formatDate(f.happened_on)} · ${f.hito_id ?? "General"} · ${f.finding}`).join("\n") || "Sin registros.");
        section("Compromisos", narratives.gaps);
      } else if (definition.type === "informe_calidad") {
        section("Resultado de calidad", `${percent(qualityStats.result)} · ${qualityStats.criticalGaps} brechas críticas · ${qualityStats.evaluated}/21 criterios evaluados.`);
        section("Fortalezas", narratives.strengths);
        section("Brechas identificadas", narratives.gaps);
        section("Plan de acompañamiento", narratives.accompaniment_plan);
      } else if (definition.type === "acompanamiento_2") {
        section("Objeto", "Verificar los compromisos del acompañamiento anterior y registrar nuevos hallazgos.");
        section("Verificación de compromisos", followups.slice(Math.floor(followups.length / 2)).map((f) => `${formatDate(f.happened_on)} · ${f.finding}${f.agreed_action ? ` · Acción: ${f.agreed_action}` : ""}`).join("\n") || "Sin registros.");
        section("Acuerdos finales", narratives.gaps);
      } else if (definition.type === "informe_cierre") {
        section("Resumen del proceso", narratives.process_summary);
        section("Resultados", `Operativo ${operationalPercent}% · Complementaria ${percent(compStats.result)} · Calidad ${percent(qualityStats.result)} · Integrado ${percent(finalScore)}.`);
        section("Fortalezas y brechas", `${narratives.strengths || ""}\n${narratives.gaps || ""}`.trim());
        section("Conclusión y recomendación", narratives.conclusion);
      } else if (definition.type === "certificado") {
        section("Certificación", `Se certifica que ${teacher.name} ha cumplido las condiciones institucionales del proceso de acompañamiento docente, alcanzando un resultado integrado de ${percent(finalScore)}. Dictamen: ${certificationLabel}.`);
        section("Validez", "Este documento es válido al constar el expediente completo, sin brechas críticas y con las evidencias mínimas requeridas.");
      } else if (definition.type === "reporte_docente") {
        section("Síntesis del proceso", narratives.process_summary);
        section("Fortalezas", narratives.strengths);
        section("Brechas y compromisos", narratives.gaps);
        section("Conclusión", narratives.conclusion);
      } else if (definition.type === "indice_expediente") {
        section("Control documental", documentDefinitions.map((d) => `${d.title}: ${documents.some((item) => item.document_type === d.type && item.status !== "void") ? "Generado" : "Pendiente"}`).join("\n"));
        section("Trazabilidad", `${followups.length} seguimientos · ${evidences.length} evidencias · ${evidenceHitos} hitos con evidencia.`);
      }

      const code = verificationCode();
      if (y > 260) { pdf.addPage(); y = 20; }
      pdf.setFontSize(8);
      pdf.setTextColor(95, 105, 115);
      pdf.text(`Código de verificación: ${code}`, 16, 285);

      const blob = pdf.output("blob");
      const storagePath = `${teacher.id}/documents/${definition.type}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("siacd-evidence").upload(storagePath, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { error: documentError } = await supabase.from("generated_documents").insert({
        expedient_id: teacher.id,
        document_type: definition.type,
        status: "generated",
        storage_path: storagePath,
        verification_code: code,
        generated_by: null,
        generated_by_staff_id: teacher.coordinatorId || null,
        issued_on: today(),
      });
      if (documentError) {
        await supabase.storage.from("siacd-evidence").remove([storagePath]);
        throw new Error(documentError.message);
      }

      if (definition.type === "certificado") {
        const { error: certError } = await supabase.from("expedients").update({
          status: "certified",
          certified_at: new Date().toISOString(),
          operational_score: operationalPercent / 100,
          complementary_score: compStats.result,
          quality_score: qualityStats.result,
          final_score: finalScore,
          critical_gaps: operationalCriticalGaps,
          followups_count: followups.length,
          evidence_hitos_count: evidenceHitos,
          updated_at: new Date().toISOString(),
        }).eq("id", teacher.id);
        if (certError) throw new Error(certError.message);
      }

      pdf.save(`${safeName(definition.title.toLowerCase())}-${safeName(teacher.name.toLowerCase())}.pdf`);
      setMessage(`${definition.title} generado correctamente`);
      await load();
      await onChanged();
    } catch (error) {
      setMessage(`No se pudo generar el documento: ${error instanceof Error ? error.message : "error inesperado"}`);
    } finally {
      setGenerating("");
    }
  }

  async function setDocumentStatus(item: GeneratedDocument, status: "signed" | "archived") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const patch: Record<string, string> = { status };
    if (status === "signed") patch.signed_at = new Date().toISOString();
    if (status === "archived") patch.archived_at = new Date().toISOString();
    const { error } = await supabase.from("generated_documents").update(patch).eq("id", item.id);
    if (error) setMessage(error.message);
    else { setMessage(status === "signed" ? "Documento marcado como firmado" : "Documento archivado"); await load(); }
  }

  if (loading) return <div className={styles.loading}>Cargando cierre integral…</div>;
  if (schemaIssue) return <div className={styles.schemaIssue}><strong>Actualización de Supabase pendiente</strong><span>{schemaIssue}</span></div>;

  return (
    <div className={styles.root}>
      {message && <div className={styles.message}>{message}</div>}

      {mode === "complementary" && (
        <>
          <MetricStrip
            items={[
              ["Criterios evaluados", `${compStats.evaluated}/17`],
              ["Resultado", percent(compStats.result)],
              ["Brechas críticas", String(compStats.criticalGaps)],
              ["Dictamen", compStats.evaluated === 17 && compStats.result >= 0.75 ? "CUMPLE" : "EN DESARROLLO"],
            ]}
          />
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Matriz complementaria</h3><p>17 criterios operativos adicionales. Sus IDs se almacenan como MC-C01…MC-C17 para evitar conflicto con H6.</p></div></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>ID</th><th>Hito</th><th>Proceso</th><th>Criterio</th><th>Criticidad</th><th>Evidencia</th><th>Puntaje</th><th>Estado</th><th>Fecha</th><th>Observación</th><th></th></tr></thead>
                <tbody>{compDefs.map((def) => {
                  const current = compScores[def.id] ?? { criterion_id: def.id, score: null, observation: "", verified_on: "" };
                  return <tr key={def.id}>
                    <td><strong>{def.display_id}</strong></td><td>{def.hito}</td><td>{def.process}</td>
                    <td className={styles.longText}>{def.observable_criterion}</td>
                    <td><span className={def.criticality === "Crítica" ? styles.critical : styles.neutral}>{def.criticality}</span></td>
                    <td>{def.expected_evidence ?? "—"}</td>
                    <td><select value={current.score === null ? "" : String(current.score)} onChange={(e) => setCompScores((state) => ({ ...state, [def.id]: { ...current, score: e.target.value === "" ? null : Number(e.target.value) } }))}><option value="">—</option>{[0,1,2,3,4].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                    <td>{scoreLabel(current.score)}</td>
                    <td><input type="date" value={current.verified_on} onChange={(e) => setCompScores((state) => ({ ...state, [def.id]: { ...current, verified_on: e.target.value } }))}/></td>
                    <td><textarea rows={2} value={current.observation} onChange={(e) => setCompScores((state) => ({ ...state, [def.id]: { ...current, observation: e.target.value } }))}/></td>
                    <td><button className={styles.iconButton} onClick={() => void saveComplementary(def)} disabled={savingId === def.id}><Save size={14}/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {mode === "quality" && (
        <>
          <MetricStrip items={[
            ["Criterios evaluados", `${qualityStats.evaluated}/21`],
            ["Calidad ponderada", percent(qualityStats.result)],
            ["Brechas críticas", String(qualityStats.criticalGaps)],
            ["Dictamen", qualityStats.evaluated === 21 && qualityStats.result >= 0.75 && qualityStats.criticalGaps === 0 ? "APROBADO" : "EN DESARROLLO"],
          ]}/>
          <div className={styles.dimensionGrid}>
            {Object.entries(qualityStats.dimensions).map(([dimension, data]) => <article key={dimension}><strong>{dimension}</strong><span>{data.count ? (data.sum / data.count).toFixed(2) : "—"} / 4</span></article>)}
          </div>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Observación de Calidad</h3><p>Rúbrica analítica CAL-01 a CAL-21 con descriptor automático del nivel seleccionado.</p></div></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>ID</th><th>Dimensión</th><th>Criterio / validación</th><th>Evidencia</th><th>Criticidad</th><th>Peso</th><th>Puntaje</th><th>Descriptor</th><th>Hallazgo</th><th>Compromiso</th><th>Fecha</th><th></th></tr></thead>
                <tbody>{qualityDefs.map((def) => {
                  const current = qualityScores[def.id] ?? { criterion_id: def.id, score: null, finding: "", improvement_commitment: "", verification_on: "" };
                  const descriptor = current.score === null ? "Pendiente" : def[`level_${current.score}` as keyof QualityCriterion] as string;
                  return <tr key={def.id}>
                    <td><strong>{def.id}</strong></td><td>{def.dimension}</td>
                    <td className={styles.longText}><strong>{def.criterion}</strong><small>{def.validation_parameter}</small></td>
                    <td>{def.expected_evidence ?? "—"}</td>
                    <td><span className={def.criticality === "Crítica" ? styles.critical : styles.neutral}>{def.criticality}</span></td>
                    <td>{Math.round(def.weight * 1000) / 10}%</td>
                    <td><select value={current.score === null ? "" : String(current.score)} onChange={(e) => setQualityScores((state) => ({ ...state, [def.id]: { ...current, score: e.target.value === "" ? null : Number(e.target.value) } }))}><option value="">—</option>{[0,1,2,3,4].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                    <td className={styles.descriptor}>{descriptor}</td>
                    <td><textarea rows={2} value={current.finding} onChange={(e) => setQualityScores((state) => ({ ...state, [def.id]: { ...current, finding: e.target.value } }))}/></td>
                    <td><textarea rows={2} value={current.improvement_commitment} onChange={(e) => setQualityScores((state) => ({ ...state, [def.id]: { ...current, improvement_commitment: e.target.value } }))}/></td>
                    <td><input type="date" value={current.verification_on} onChange={(e) => setQualityScores((state) => ({ ...state, [def.id]: { ...current, verification_on: e.target.value } }))}/></td>
                    <td><button className={styles.iconButton} onClick={() => void saveQuality(def)} disabled={savingId === def.id}><Save size={14}/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {mode === "evidence" && (
        <>
          <MetricStrip items={[
            ["Evidencias", String(evidences.length)],
            ["Hitos con evidencia", `${evidenceHitos}/6`],
            ["Meta mínima", "4 hitos"],
            ["Estado", evidenceHitos >= 4 ? "CUMPLE" : "PENDIENTE"],
          ]}/>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Control de evidencias</h3><p>Archivos, fotografías, capturas o enlaces vinculados al expediente y al hito correspondiente.</p></div></div>
            <form className={styles.formGrid} onSubmit={addEvidence}>
              <label>Hito<select name="hito_id"><option value="">General</option>{["H1","H2","H3","H4","H5","H6"].map((h) => <option key={h}>{h}</option>)}</select></label>
              <label>Fecha<input type="date" name="happened_on" defaultValue={today()}/></label>
              <label className={styles.full}>Título<input name="title" required placeholder="Nombre claro de la evidencia"/></label>
              <label className={styles.full}>Descripción<textarea name="description" rows={2} placeholder="Qué demuestra esta evidencia"/></label>
              <label>Archivo<input type="file" name="file" accept=".pdf,.docx,.xlsx,image/jpeg,image/png,image/webp"/></label>
              <label>O enlace externo<input type="url" name="external_url" placeholder="https://..."/></label>
              <div className={styles.formActions}><button className={styles.primary} disabled={uploading}><UploadCloud size={14}/>{uploading ? "Subiendo..." : "Guardar evidencia"}</button></div>
            </form>
            <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Hito</th><th>Evidencia</th><th>Tipo</th><th>Fecha</th><th>Referencia</th><th></th></tr></thead><tbody>{evidences.map((item) => <tr key={item.id}><td>{item.hito_id ?? "General"}</td><td><strong>{item.title}</strong><small>{item.description ?? ""}</small></td><td>{item.kind}</td><td>{formatDate(item.happened_on ?? item.created_at)}</td><td>{item.external_url ? <button className={styles.linkButton} onClick={() => window.open(item.external_url!, "_blank", "noopener,noreferrer")}><Link2 size={13}/>Abrir enlace</button> : item.storage_path ? <button className={styles.linkButton} onClick={() => void openStored(item.storage_path!)}><Download size={13}/>Abrir archivo</button> : "—"}</td><td><button className={styles.deleteButton} onClick={() => void deleteEvidence(item)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
          </section>
        </>
      )}

      {mode === "documents" && (
        <>
          <MetricStrip items={[
            ["Documentos generados", String(documents.filter((d) => d.status !== "void").length)],
            ["Firmados", String(documents.filter((d) => d.status === "signed").length)],
            ["Archivados", String(documents.filter((d) => d.status === "archived").length)],
            ["Resultado integrado", percent(finalScore)],
          ]}/>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Síntesis para informes</h3><p>Estos textos alimentan los documentos institucionales generados desde el expediente.</p></div><button className={styles.primary} onClick={() => void saveNarratives()} disabled={savingId === "narratives"}><Save size={14}/>Guardar síntesis</button></div>
            <div className={styles.narrativeGrid}>{narrativeKeys.map(({ key, label }) => <label key={key}><span>{label}</span><textarea rows={4} value={narratives[key] ?? ""} onChange={(e) => setNarratives((state) => ({ ...state, [key]: e.target.value }))}/></label>)}</div>
          </section>
          <section className={styles.card}>
            <div className={styles.sectionHead}><div><h3>Generación documental</h3><p>Los PDF incluyen datos y resultados reales del expediente. También quedan registrados en Supabase.</p></div></div>
            <div className={styles.documentGrid}>{documentDefinitions.map((def) => {
              const blocked = def.type === "certificado" && !canCertify;
              return <article key={def.type} className={styles.documentCard}><FileText size={20}/><div><strong>{def.title}</strong><p>{def.description}</p></div><button className={blocked ? styles.disabledButton : styles.primary} disabled={blocked || generating === def.type} onClick={() => void generateDocument(def)}>{generating === def.type ? "Generando..." : blocked ? "No habilitado" : "Generar PDF"}</button></article>;
            })}</div>
            {documents.length > 0 && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Documento</th><th>Emisión</th><th>Código</th><th>Estado</th><th>Archivo</th><th>Control</th></tr></thead><tbody>{documents.map((item) => <tr key={item.id}><td>{documentDefinitions.find((d) => d.type === item.document_type)?.title ?? item.document_type}</td><td>{formatDate(item.issued_on ?? item.generated_at)}</td><td>{item.verification_code ?? "—"}</td><td>{item.status}</td><td>{item.storage_path ? <button className={styles.linkButton} onClick={() => void openStored(item.storage_path!)}><Download size={13}/>Abrir</button> : "—"}</td><td><div className={styles.inlineActions}>{item.status === "generated" && <button onClick={() => void setDocumentStatus(item, "signed")}>Firmado</button>}{item.status !== "archived" && item.status !== "void" && <button onClick={() => void setDocumentStatus(item, "archived")}>Archivar</button>}</div></td></tr>)}</tbody></table></div>}
          </section>
        </>
      )}

      {mode === "certification" && (
        <>
          <section className={styles.resultHero}>
            <div><span>RESULTADO INTEGRADO</span><strong>{percent(finalScore)}</strong><small>SIACD 60% + Matriz 15% + Calidad 25%</small></div>
            <div className={canCertify ? styles.certified : styles.inProgress}><ShieldCheck size={28}/><strong>{certificationLabel}</strong><span>{canCertify ? "Todas las condiciones están cumplidas." : "Complete los requisitos pendientes antes de certificar."}</span></div>
          </section>
          <section className={styles.card}>
            <div className={styles.formulaGrid}><article><span>SIACD operativo</span><strong>{operationalPercent}%</strong><small>Aporte {Math.round(operationalPercent * 0.60)} puntos</small></article><article><span>Matriz complementaria</span><strong>{percent(compStats.result)}</strong><small>Aporte {Math.round(compStats.result * 15)} puntos</small></article><article><span>Calidad</span><strong>{percent(qualityStats.result)}</strong><small>Aporte {Math.round(qualityStats.result * 25)} puntos</small></article></div>
            <div className={styles.checklist}>{certificationChecks.map((item) => <div key={item.label} className={item.ok ? styles.checkOk : styles.checkPending}><CheckCircle2 size={17}/><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
            <div className={styles.certActions}>
              <button className={canCertify ? styles.certifyButton : styles.disabledButton} disabled={!canCertify || generating === "certificado"} onClick={() => void generateDocument(documentDefinitions.find((d) => d.type === "certificado")!)}><FileCheck2 size={17}/>{generating === "certificado" ? "Generando certificado..." : "Certificar y generar PDF"}</button>
              <span>Disponible para {accessMode === "admin" ? "Administrador" : "Coordinador"} sin aprobación adicional.</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricStrip({ items }: { items: [string, string][] }) {
  return <div className={styles.metrics}>{items.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}
