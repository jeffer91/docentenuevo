"use client";

import { CheckCircle2, FileCheck2, Search, ShieldCheck, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";

type Verification = {
  valid?: boolean;
  authenticity?: string;
  code?: string;
  report_name?: string;
  report_status?: string;
  teacher?: string;
  career?: string;
  subject?: string;
  period?: string;
  modality?: string;
  issued_on?: string;
  version?: string;
};

function dateLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export default function DocumentVerification() {
  const initial = new URLSearchParams(window.location.search).get("codigo")?.trim() ?? "";
  const [code, setCode] = useState(initial);
  const [result, setResult] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function verify(value = code) {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("public_verify_siacd_document", { p_code: normalized });
    setBusy(false);
    if (error) {
      setResult(null);
      setMessage("No se pudo verificar el documento. Intente nuevamente.");
      return;
    }
    setCode(normalized);
    setResult((data ?? { valid: false, authenticity: "Documento no encontrado" }) as Verification);
  }

  useEffect(() => { if (initial) void verify(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event: FormEvent) {
    event.preventDefault();
    void verify();
  }

  return <main style={{ minHeight: "100vh", background: "#f4f7fb", color: "#10233d", padding: "32px 18px" }}>
    <section style={{ width: "min(760px,100%)", margin: "0 auto", display: "grid", gap: 14 }}>
      <header style={{ background: "linear-gradient(135deg,#071c34,#0d3b67)", color: "white", borderRadius: 18, padding: "22px 24px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><ShieldCheck size={24}/><strong>ITSQMET · SIACD</strong></div>
        <h1 style={{ margin: "10px 0 4px", fontSize: 25 }}>Verificación de documento</h1>
        <p style={{ margin: 0, color: "#cfdeec", fontSize: 13 }}>Consulte la autenticidad de un documento institucional emitido por SIACD.</p>
      </header>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, background: "white", border: "1px solid #dfe7ef", borderRadius: 14, padding: 10 }}>
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="SIACD-2026-XXXXXXXX" aria-label="Código de verificación" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, padding: "9px 10px", font: "inherit", textTransform: "uppercase" }}/>
        <button disabled={busy} style={{ border: 0, borderRadius: 9, background: "#0d3a66", color: "white", padding: "9px 13px", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Search size={15}/>{busy ? "Verificando…" : "Verificar"}</button>
      </form>

      {message && <div style={{ background: "#fff4e8", color: "#8a5528", border: "1px solid #efd7bf", borderRadius: 12, padding: 12 }}>{message}</div>}

      {result && <article style={{ background: "white", border: `1px solid ${result.valid ? "#cde6d6" : "#edcfcb"}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "16px 18px", background: result.valid ? "#edf8f1" : "#fff1ef", color: result.valid ? "#2e704b" : "#984b42" }}>
          {result.valid ? <CheckCircle2 size={21}/> : <XCircle size={21}/>}<div><strong style={{ display: "block" }}>{result.authenticity || (result.valid ? "Documento auténtico" : "Documento no válido")}</strong><span style={{ fontSize: 12 }}>{result.code || code}</span></div>
        </div>
        {result.valid && <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          {[["Documento", result.report_name], ["Estado", result.report_status], ["Docente", result.teacher], ["Carrera", result.career], ["Asignatura", result.subject], ["Período", result.period], ["Modalidad", result.modality], ["Fecha", dateLabel(result.issued_on)], ["Versión", result.version ? `v${result.version}` : "—"]].map(([label, value]) => <div key={label} style={{ borderLeft: "3px solid #dce5ed", paddingLeft: 9 }}><span style={{ display: "block", fontSize: 9, color: "#718498", textTransform: "uppercase", fontWeight: 800 }}>{label}</span><strong style={{ display: "block", marginTop: 3, fontSize: 12.5 }}>{value || "—"}</strong></div>)}
        </div>}
      </article>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", color: "#718498", fontSize: 11 }}><FileCheck2 size={14}/>La verificación consulta el registro institucional del documento.</div>
    </section>
  </main>;
}
