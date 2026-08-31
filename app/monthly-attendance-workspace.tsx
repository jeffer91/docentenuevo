"use client";

import { Download, FileCheck2, FileText, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import { REPORT_LOGO_DATA_URL, attendanceDocumentCode } from "./report-branding";
import type { CatalogOption, Teacher } from "./siacd-app-v3";

type RegisterHistory = {
  id: string;
  career_id: string;
  year: number;
  month: number;
  topic: string;
  event_date: string | null;
  trainer: string | null;
  immediate_supervisor: string | null;
  institutional_code: string;
  verification_code: string | null;
  version: number;
  storage_path: string | null;
  generated_at: string;
};

function ecuadorToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function careerLabel(career?: CatalogOption | null) {
  if (!career) return "";
  return career.program ? `${career.name} — ${career.program}` : career.name;
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export default function MonthlyAttendanceWorkspace({
  careers,
  teachers,
  coordinatorId,
  coordinatorName,
}: {
  careers: CatalogOption[];
  teachers: Teacher[];
  coordinatorId: string;
  coordinatorName: string;
}) {
  const today = ecuadorToday();
  const [careerId, setCareerId] = useState(careers[0]?.id ?? "");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [eventDate, setEventDate] = useState(today);
  const [topic, setTopic] = useState("Inducción de los procesos académicos a docentes nuevos");
  const [trainer, setTrainer] = useState(coordinatorName);
  const [immediateSupervisor, setImmediateSupervisor] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<RegisterHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCareer = useMemo(() => careers.find((item) => item.id === careerId) ?? null, [careerId, careers]);
  const availableTeachers = useMemo(() => {
    const seen = new Set<string>();
    return teachers.filter((teacher) => {
      if (teacher.careerId !== careerId || seen.has(teacher.teacherId)) return false;
      seen.add(teacher.teacherId);
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [careerId, teachers]);

  useEffect(() => {
    if (!careerId && careers[0]?.id) setCareerId(careers[0].id);
  }, [careerId, careers]);

  useEffect(() => {
    setSelected(new Set(availableTeachers.map((teacher) => teacher.teacherId)));
  }, [availableTeachers]);

  useEffect(() => {
    setTrainer(coordinatorName);
  }, [coordinatorName]);

  useEffect(() => {
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (!careerId || !year || !monthNumber) {
      setHistory([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase
      .from("induction_attendance_registers")
      .select("id,career_id,year,month,topic,event_date,trainer,immediate_supervisor,institutional_code,verification_code,version,storage_path,generated_at")
      .eq("career_id", careerId)
      .eq("year", year)
      .eq("month", monthNumber)
      .order("version", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setHistory([]);
          setMessage("No se pudo cargar el historial mensual de asistencia.");
          return;
        }
        setHistory((data ?? []) as RegisterHistory[]);
      });
  }, [careerId, month]);

  async function openStored(path: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("siacd-evidence").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      setMessage("No se pudo abrir el registro guardado.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function toggleTeacher(teacherId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  async function generate() {
    if (!selectedCareer || !month) {
      setMessage("Seleccione la carrera y el mes.");
      return;
    }
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (!year || !monthNumber) {
      setMessage("El mes seleccionado no es válido.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    try {
      const selectedTeachers = availableTeachers.filter((teacher) => selected.has(teacher.teacherId));
      const version = (history[0]?.version ?? 0) + 1;
      const label = careerLabel(selectedCareer);
      const institutionalCode = attendanceDocumentCode(label, year, monthNumber);
      const verificationCode = `SIACD-${year}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const pdf = new jsPDF({ unit: "mm", format: "a4" });

      const rowsPerPage = 25;
      const pageCount = Math.max(1, Math.ceil(selectedTeachers.length / rowsPerPage));

      const drawPage = (pageIndex: number) => {
        if (pageIndex > 0) pdf.addPage();
        const pageRows = selectedTeachers.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
        const left = 10;
        const width = 190;
        const top = 10;
        const headerHeight = 18;
        const logoWidth = 44;
        const codeWidth = 42;
        const centerWidth = width - logoWidth - codeWidth;

        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.35);
        pdf.rect(left, top, width, headerHeight);
        pdf.line(left + logoWidth, top, left + logoWidth, top + headerHeight);
        pdf.line(left + logoWidth + centerWidth, top, left + logoWidth + centerWidth, top + headerHeight);

        pdf.addImage(REPORT_LOGO_DATA_URL, "PNG", left + 2, top + 2, logoWidth - 4, 13.5);

        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(7.2);
        pdf.text("Coordinación General de Carreras", left + logoWidth + centerWidth / 2, top + 5, { align: "center" });
        pdf.setFontSize(7);
        const titleLines = pdf.splitTextToSize("REGISTRO DE ASISTENCIA A LA INDUCCIÓN", centerWidth - 5);
        pdf.text(titleLines, left + logoWidth + centerWidth / 2, top + 10.2, { align: "center" });

        const codeX = left + logoWidth + centerWidth;
        pdf.setFontSize(6.3);
        pdf.text("Código:", codeX + codeWidth / 2, top + 4.3, { align: "center" });
        pdf.setFont("helvetica", "normal");
        const codeLines = pdf.splitTextToSize(institutionalCode, codeWidth - 4);
        pdf.text(codeLines.slice(0, 3), codeX + codeWidth / 2, top + 8, { align: "center", lineHeightFactor: 1.05 });

        const metaTop = top + headerHeight;
        const metaHeight = 25;
        pdf.rect(left, metaTop, width, metaHeight);
        const metaRows = [
          ["TEMA", topic || "—"],
          ["FECHA", eventDate || "—"],
          ["CAPACITADOR", trainer || "—"],
          ["JEFE INMEDIATO", immediateSupervisor || "—"],
        ];
        const metaRowHeight = metaHeight / metaRows.length;
        metaRows.forEach(([labelText, value], index) => {
          const y = metaTop + index * metaRowHeight;
          if (index > 0) pdf.line(left, y, left + width, y);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(6.8);
          pdf.text(labelText, left + 2, y + 4.2);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7.2);
          pdf.text(pdf.splitTextToSize(value, width - 48).slice(0, 1), left + 44, y + 4.2);
        });

        const tableTop = metaTop + metaHeight + 4;
        const headerRowHeight = 8;
        const rowHeight = 8;
        const columns = [
          { title: "No", width: 9 },
          { title: "CÉDULA", width: 35 },
          { title: "NOMBRE Y APELLIDOS", width: 65 },
          { title: "UNIDAD/CARGO/CARRERA", width: 46 },
          { title: "FIRMA", width: 35 },
        ];
        const tableHeight = headerRowHeight + rowsPerPage * rowHeight;
        pdf.rect(left, tableTop, width, tableHeight);

        let x = left;
        columns.forEach((column, index) => {
          if (index > 0) pdf.line(x, tableTop, x, tableTop + tableHeight);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(6.7);
          pdf.text(column.title, x + column.width / 2, tableTop + 5.2, { align: "center" });
          x += column.width;
        });
        pdf.line(left, tableTop + headerRowHeight, left + width, tableTop + headerRowHeight);

        for (let row = 0; row < rowsPerPage; row += 1) {
          const y = tableTop + headerRowHeight + row * rowHeight;
          if (row > 0) pdf.line(left, y, left + width, y);
          const teacher = pageRows[row];
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.5);
          pdf.text(String(pageIndex * rowsPerPage + row + 1), left + 4.5, y + 5.2, { align: "center" });
          if (!teacher) continue;
          pdf.text(teacher.nationalId || "—", left + 11, y + 5.2);
          const nameLines = pdf.splitTextToSize(teacher.name, 61);
          pdf.text(nameLines.slice(0, 2), left + 46, y + 3.5, { lineHeightFactor: 1.05 });
          const careerLines = pdf.splitTextToSize(selectedCareer.name, 42);
          pdf.text(careerLines.slice(0, 2), left + 111, y + 3.5, { lineHeightFactor: 1.05 });
        }

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(5.8);
        pdf.setTextColor(85, 85, 85);
        pdf.text(`Verificación SIACD: ${verificationCode} · ${monthLabel(year, monthNumber)} · Versión ${version}`, left, 291);
        pdf.text(`Página ${pageIndex + 1} de ${pageCount}`, left + width, 291, { align: "right" });
      };

      for (let page = 0; page < pageCount; page += 1) drawPage(page);

      const blob = pdf.output("blob");
      const fileName = `registro-asistencia-induccion-${safeName(selectedCareer.name.toLowerCase())}-${month}-v${version}.pdf`;
      pdf.save(fileName);

      const storagePath = `attendance/${careerId}/${month}/registro-asistencia-v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("siacd-evidence")
        .upload(storagePath, blob, { contentType: "application/pdf", upsert: false });

      if (uploadError) {
        setMessage(`El PDF se descargó, pero no pudo guardarse por mes en SIACD: ${uploadError.message}`);
        return;
      }

      const { data: register, error: registerError } = await supabase
        .from("induction_attendance_registers")
        .insert({
          career_id: careerId,
          year,
          month: monthNumber,
          topic: topic || "Inducción de los procesos académicos a docentes nuevos",
          event_date: eventDate || null,
          trainer: trainer || null,
          immediate_supervisor: immediateSupervisor || null,
          institutional_code: institutionalCode,
          verification_code: verificationCode,
          version,
          storage_path: storagePath,
          generated_by_staff_id: coordinatorId || null,
        })
        .select("id")
        .single();

      if (registerError || !register?.id) {
        await supabase.storage.from("siacd-evidence").remove([storagePath]);
        setMessage(`El PDF se descargó, pero no pudo registrarse en el histórico mensual: ${registerError?.message ?? "sin identificador"}`);
        return;
      }

      if (selectedTeachers.length) {
        const { error: membersError } = await supabase.from("induction_attendance_members").insert(
          selectedTeachers.map((teacher, index) => ({
            register_id: register.id,
            teacher_id: teacher.teacherId || null,
            position: index + 1,
            national_id: teacher.nationalId || null,
            full_name: teacher.name,
            unit_career: selectedCareer.name,
            attended: true,
          })),
        );
        if (membersError) {
          await supabase.from("induction_attendance_registers").delete().eq("id", register.id);
          await supabase.storage.from("siacd-evidence").remove([storagePath]);
          setMessage(`El PDF se descargó, pero no se pudo guardar la lista de asistentes: ${membersError.message}`);
          return;
        }
      }

      setMessage(`Registro mensual guardado correctamente: ${monthLabel(year, monthNumber)} · versión ${version}.`);
      const { data } = await supabase
        .from("induction_attendance_registers")
        .select("id,career_id,year,month,topic,event_date,trainer,immediate_supervisor,institutional_code,verification_code,version,storage_path,generated_at")
        .eq("career_id", careerId)
        .eq("year", year)
        .eq("month", monthNumber)
        .order("version", { ascending: false });
      setHistory((data ?? []) as RegisterHistory[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el registro de asistencia.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="section-card">
    <div className="panel-head">
      <div>
        <div className="eyebrow">DOCUMENTACIÓN MENSUAL</div>
        <h3>Registro de Asistencia a la Inducción</h3>
        <p>Se genera por carrera y mes, conserva versiones independientes y utiliza la estructura institucional de asistencia.</p>
      </div>
      <span className="badge blue">{month || "Sin mes"}</span>
    </div>

    {message && <div className="error-note" style={{ marginBottom: 12 }}>{message}</div>}

    <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
      <div className="field" style={{ minWidth: 220 }}>
        <label>Carrera</label>
        <select value={careerId} onChange={(event) => setCareerId(event.target.value)}>
          {careers.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Mes de archivo</label>
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </div>
      <div className="field">
        <label>Fecha de inducción</label>
        <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, marginTop: 12 }}>
      <div className="field"><label>Tema</label><input value={topic} onChange={(event) => setTopic(event.target.value)} /></div>
      <div className="field"><label>Capacitador</label><input value={trainer} onChange={(event) => setTrainer(event.target.value)} /></div>
      <div className="field"><label>Jefe inmediato</label><input value={immediateSupervisor} onChange={(event) => setImmediateSupervisor(event.target.value)} placeholder="Nombre del jefe inmediato" /></div>
    </div>

    <div className="panel-head" style={{ marginTop: 18 }}>
      <div><h3>Asistentes</h3><p>{selected.size} seleccionado{selected.size === 1 ? "" : "s"} de {availableTeachers.length} docente{availableTeachers.length === 1 ? "" : "s"} disponibles.</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary-button" type="button" onClick={() => setSelected(new Set(availableTeachers.map((teacher) => teacher.teacherId)))}>Seleccionar todos</button>
        <button className="secondary-button" type="button" onClick={() => setSelected(new Set())}>Limpiar</button>
      </div>
    </div>

    {availableTeachers.length ? <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th></th><th>Cédula</th><th>Nombre y apellidos</th><th>Carrera</th></tr></thead>
        <tbody>{availableTeachers.map((teacher) => <tr key={teacher.teacherId}>
          <td><input type="checkbox" checked={selected.has(teacher.teacherId)} onChange={() => toggleTeacher(teacher.teacherId)} /></td>
          <td>{teacher.nationalId || "—"}</td>
          <td><strong>{teacher.name}</strong></td>
          <td>{selectedCareer?.name || teacher.career}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="empty-state"><h3>Sin docentes para esta carrera</h3><p>Puede generar la plantilla mensual vacía o seleccionar otra carrera.</p></div>}

    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
      <button className="primary-button" disabled={busy || !careerId || !month} onClick={() => void generate()}>
        {busy ? <Loader2 size={15}/> : <FileText size={15}/>}
        {busy ? "Generando…" : "Generar y guardar registro mensual"}
      </button>
    </div>

    <div className="panel-head" style={{ marginTop: 22 }}>
      <div><h3>Historial del mes</h3><p>Cada nueva generación crea una versión; nunca sobrescribe el registro anterior.</p></div>
    </div>
    {history.length ? <div className="teacher-list">{history.map((item) => <div className="teacher-row" key={item.id}>
      <div className="teacher"><div className="teacher-avatar"><FileCheck2 size={16}/></div><div><strong>{item.institutional_code}</strong><span>{monthLabel(item.year, item.month)} · versión {item.version}</span></div></div>
      <div className="row-meta"><span>{item.event_date || "Sin fecha"}</span><span>{item.trainer || "Sin capacitador"}</span></div>
      <div></div>
      {item.storage_path ? <button className="row-action" aria-label="Abrir registro" onClick={() => void openStored(item.storage_path!)}><Download size={15}/></button> : <span />}
    </div>)}</div> : <div className="empty-state"><p>Aún no existen versiones guardadas para este mes.</p></div>}
  </section>;
}
