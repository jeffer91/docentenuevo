"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Plus, Save, Trash2, X } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import {
  cedulaValidationWarning,
  deleteDirectoryTeacher,
  mergeDirectoryCareers,
  normalizeCedula,
  normalizeDirectoryLabel,
  readDirectoryTeacher,
  writeDirectoryTeacher,
} from "./lib/teacher-directory";

export type TeacherMasterRecord = {
  teacherId: string;
  nationalId: string;
  name: string;
  email: string;
  entryDate: string;
};

export type TeacherMasterCareer = { id: string; name: string; program?: string };

type TeacherExpedientSummary = {
  id: string;
  career: string;
  subject: string;
  period: string;
  modality: string;
};

function relation(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as Record<string, unknown> : null;
}

function careerLabel(value: unknown) {
  const row = relation(value);
  if (!row) return "Sin carrera";
  const name = String(row.name ?? "Sin carrera");
  const program = row.program ? String(row.program) : "";
  return program ? `${name} — ${program}` : name;
}

export default function TeacherMasterModal({ teacher, careers, canManagePin = false, onClose, onChanged }: {
  teacher: TeacherMasterRecord;
  careers: TeacherMasterCareer[];
  canManagePin?: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [nationalId, setNationalId] = useState(teacher.nationalId);
  const [name, setName] = useState(teacher.name);
  const [email, setEmail] = useState(teacher.email);
  const [entryDate, setEntryDate] = useState(teacher.entryDate);
  const [directoryCareers, setDirectoryCareers] = useState<string[]>([]);
  const [careerToAdd, setCareerToAdd] = useState("");
  const [expedients, setExpedients] = useState<TeacherExpedientSummary[]>([]);
  const [currentPin, setCurrentPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingExpedientId, setDeletingExpedientId] = useState("");
  const [message, setMessage] = useState("");

  const managePin = canManagePin || (typeof window !== "undefined" && window.location.pathname.toLowerCase().includes("/administrador"));
  const normalizedId = normalizeCedula(nationalId);
  const warning = nationalId ? cedulaValidationWarning(nationalId) : null;
  const allowedNames = useMemo(() => new Set(careers.map((career) => normalizeDirectoryLabel(career.name))), [careers]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();

      if (teacher.nationalId) {
        try {
          const record = await readDirectoryTeacher(teacher.nationalId);
          if (active) setDirectoryCareers(record?.carreras ?? []);
        } catch {
          if (active) setMessage("No se pudo leer Firebase. Puede editar los datos y volver a sincronizar al guardar.");
        }
      }

      if (supabase) {
        const { data, error } = await supabase
          .from("expedients")
          .select("id, subject_names, modality, careers(name, program), academic_periods(name)")
          .eq("teacher_id", teacher.teacherId)
          .order("created_at", { ascending: false });

        if (!active) return;
        if (error) {
          setMessage((current) => current || `No se pudieron cargar los expedientes del docente: ${error.message}`);
        } else {
          const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
            id: String(row.id),
            career: careerLabel(row.careers),
            subject: String(row.subject_names ?? "Sin asignatura"),
            period: String(relation(row.academic_periods)?.name ?? "Sin período"),
            modality: String(row.modality ?? "Sin modalidad"),
          }));
          setExpedients(rows);
        }
      }

      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [teacher.nationalId, teacher.teacherId]);

  function addCareer() {
    const career = careers.find((item) => item.id === careerToAdd);
    if (!career) return;
    setDirectoryCareers((current) => mergeDirectoryCareers(current, [career.name]));
    setCareerToAdd("");
  }

  function removeCareer(career: string) {
    if (!allowedNames.has(normalizeDirectoryLabel(career))) return;
    setDirectoryCareers((current) => current.filter((item) => normalizeDirectoryLabel(item) !== normalizeDirectoryLabel(career)));
  }

  async function revealCurrentPin() {
    if (!/^\d{4}$/.test(adminPin)) {
      setMessage("Ingrese la clave de administrador de 4 dígitos para ver el PIN del docente.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    if (currentPin) {
      setPinVisible((visible) => !visible);
      return;
    }

    setPinLoading(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("teacher-access", {
      body: {
        action: "admin_get_pin",
        teacher_id: teacher.teacherId,
        admin_pin: adminPin,
      },
    });
    setPinLoading(false);

    const response = data as { ok?: boolean; pin?: string; error?: string } | null;
    if (error || !response?.ok || !response.pin) {
      if (response?.error === "invalid_admin_pin") {
        setMessage("La clave de administrador no es correcta.");
      } else if (response?.error === "pin_not_set") {
        setMessage("Este docente todavía no ha creado un PIN.");
      } else {
        setMessage("No se pudo consultar el PIN actual del docente.");
      }
      return;
    }

    setCurrentPin(response.pin);
    setPinVisible(true);
  }

  async function deleteExpedient(expedient: TeacherExpedientSummary) {
    if (!managePin || deleting || deletingExpedientId) return;
    const confirmed = window.confirm(
      `¿Eliminar este expediente de ${teacher.name}?\n\n${expedient.career}\n${expedient.subject}\n${expedient.period}\n\nSe eliminarán únicamente este expediente y sus evaluaciones, revisiones, evidencias e informes. El docente y sus otros expedientes se conservarán.`,
    );
    if (!confirmed) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setDeletingExpedientId(expedient.id);
    setMessage("");
    const { error } = await supabase.from("expedients").delete().eq("id", expedient.id);
    if (error) {
      setDeletingExpedientId("");
      setMessage(`No se pudo eliminar el expediente: ${error.message}`);
      return;
    }

    setExpedients((current) => current.filter((item) => item.id !== expedient.id));
    await onChanged();
    setDeletingExpedientId("");
    setMessage("Expediente eliminado. El docente y sus demás expedientes se conservaron.");
  }

  async function deleteTeacher() {
    if (!managePin || deleting || deletingExpedientId) return;
    const confirmed = window.confirm(
      `¿Eliminar definitivamente a ${teacher.name}?\n\nSe eliminarán TODOS sus expedientes, evaluaciones, evidencias, acceso y sesiones de SIACD. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setDeleting(true);
    setMessage("");
    const { error } = await supabase.from("teachers").delete().eq("id", teacher.teacherId);
    if (error) {
      setDeleting(false);
      setMessage(`No se pudo eliminar el docente: ${error.message}`);
      return;
    }

    let firebaseIssue = false;
    if (teacher.nationalId) {
      try {
        await deleteDirectoryTeacher(teacher.nationalId);
      } catch {
        firebaseIssue = true;
      }
    }

    await onChanged();
    setDeleting(false);

    if (firebaseIssue) {
      setMessage("El docente se eliminó de SIACD, pero Firebase no pudo eliminarse. Revise el directorio institucional.");
      return;
    }

    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cedula = normalizeCedula(nationalId);
    if (!cedula) {
      setMessage("La cédula debe tener 9 o 10 dígitos.");
      return;
    }
    if (managePin && (newPin || confirmPin)) {
      if (!/^\d{4}$/.test(newPin)) {
        setMessage("El nuevo PIN del docente debe tener exactamente 4 dígitos.");
        return;
      }
      if (newPin !== confirmPin) {
        setMessage("La confirmación del nuevo PIN no coincide.");
        return;
      }
      if (!/^\d{4}$/.test(adminPin)) {
        setMessage("Ingrese su clave de administrador de 4 dígitos para cambiar el PIN del docente.");
        return;
      }
    }

    setSaving(true);
    setMessage("");
    const now = new Date().toISOString();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSaving(false);
      setMessage("Supabase no está configurado.");
      return;
    }

    const { error } = await supabase
      .from("teachers")
      .update({
        national_id: cedula,
        full_name: name.trim(),
        institutional_email: email.trim() || null,
        started_institution_on: entryDate || null,
        updated_at: now,
      })
      .eq("id", teacher.teacherId);

    if (error) {
      setSaving(false);
      setMessage(`No se pudieron guardar los datos en SIACD: ${error.message}`);
      return;
    }

    try {
      await writeDirectoryTeacher({
        cedula,
        nombresCompletos: name.trim(),
        carreras: directoryCareers,
        actualizadoEn: now,
      });
    } catch (firebaseError) {
      await onChanged();
      setSaving(false);
      setMessage(`Los datos de SIACD se actualizaron, pero Firebase no pudo sincronizarse: ${firebaseError instanceof Error ? firebaseError.message : "error desconocido"}`);
      return;
    }

    if (managePin && newPin) {
      const { data: pinData, error: pinError } = await supabase.functions.invoke("teacher-access", {
        body: {
          action: "admin_reset_pin",
          teacher_id: teacher.teacherId,
          admin_pin: adminPin,
          new_pin: newPin,
        },
      });
      const response = pinData as { ok?: boolean; pin?: string; error?: string } | null;
      if (pinError || !response?.ok) {
        setSaving(false);
        if (response?.error === "invalid_admin_pin") {
          setMessage("Los datos del docente se guardaron, pero la clave de administrador no es correcta y el PIN no se cambió.");
        } else if (response?.error === "teacher_email_required") {
          setMessage("Los datos se guardaron, pero para crear el PIN el docente debe tener un correo válido.");
        } else {
          setMessage("Los datos se guardaron, pero no se pudo cambiar el PIN del docente.");
        }
        return;
      }
      setCurrentPin(response.pin ?? newPin);
      setPinVisible(true);
    }

    await onChanged();
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal teacher-master-modal" role="dialog" aria-modal="true">
        <div className="modal-head"><div><h2>Datos maestros del docente</h2><p className="subtitle">Administre la identidad del docente, sus expedientes y el acceso al SIACD.</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div>
        <form className="modal-body form-grid" onSubmit={submit}>
          <div className="field"><label>Cédula</label><input inputMode="numeric" value={nationalId} readOnly={Boolean(teacher.nationalId)} onChange={(event) => setNationalId(event.target.value.replace(/\D/g, "").slice(0, 10))} required /></div>
          <div className="field"><label>Estado de identificación</label><div className="teacher-master-readonly">{normalizedId ?? "Pendiente"}</div></div>
          {warning && <div className="field full"><div className="teacher-directory-warning">{warning}</div></div>}
          <div className="field full"><label>Nombres y apellidos</label><input value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div className="field"><label>Correo institucional</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label>Fecha de ingreso</label><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></div>

          <div className="field full teacher-directory-careers">
            <label>Carreras registradas</label>
            {loading ? <div className="teacher-master-readonly">Cargando directorio...</div> : <div className="teacher-directory-chips">{directoryCareers.length ? directoryCareers.map((career) => {
              const removable = allowedNames.has(normalizeDirectoryLabel(career));
              return <span key={career}>{career}{removable && <button type="button" onClick={() => removeCareer(career)}>×</button>}</span>;
            }) : <small>Sin carreras registradas.</small>}</div>}
            <div className="teacher-directory-add"><select value={careerToAdd} onChange={(event) => setCareerToAdd(event.target.value)}><option value="">Agregar carrera...</option>{careers.filter((career) => !directoryCareers.some((item) => normalizeDirectoryLabel(item) === normalizeDirectoryLabel(career.name))).map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""}</option>)}</select><button type="button" className="secondary-button" onClick={addCareer} disabled={!careerToAdd}><Plus size={13} />Agregar</button></div>
          </div>

          {managePin && <div className="field full teacher-directory-careers">
            <label>Expedientes vinculados ({expedients.length})</label>
            <small>Un docente puede tener varios expedientes. Elimine únicamente el expediente incorrecto sin borrar al docente.</small>
            {loading ? <div className="teacher-master-readonly">Cargando expedientes...</div> : expedients.length ? <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {expedients.map((expedient) => <div key={expedient.id} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid #dbe2ea", borderRadius: 12, background: "#fff" }}>
                <div style={{ minWidth: 0 }}><strong style={{ display: "block" }}>{expedient.career}</strong><span className="row-meta">{expedient.subject} · {expedient.period} · {expedient.modality}</span></div>
                <button type="button" className="ghost-button" onClick={() => void deleteExpedient(expedient)} disabled={Boolean(deletingExpedientId) || deleting || saving} style={{ flex: "0 0 auto", color: "#9b2c2c", borderColor: "#e6b9b5", background: "#fff7f6" }}><Trash2 size={14} />{deletingExpedientId === expedient.id ? "Eliminando..." : "Eliminar expediente"}</button>
              </div>)}
            </div> : <div className="teacher-master-readonly" style={{ marginTop: 8 }}>Este docente no tiene expedientes vinculados.</div>}
          </div>}

          {managePin && <>
            <div className="field full teacher-directory-careers">
              <label><KeyRound size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Acceso del docente</label>
              <div className="teacher-directory-add">
                <input readOnly type={pinVisible ? "text" : "password"} value={currentPin || "0000"} aria-label="PIN actual del docente" />
                <button type="button" className="secondary-button" onClick={revealCurrentPin} disabled={pinLoading}>
                  {pinVisible ? <EyeOff size={14} /> : <Eye size={14} />}{pinLoading ? "Consultando..." : currentPin && pinVisible ? "Ocultar PIN" : "Ver PIN"}
                </button>
              </div>
              <small>Para consultar o cambiar el PIN, ingrese primero la clave de administrador.</small>
            </div>
            <div className="field full"><label>Clave de administrador</label><input type="password" inputMode="numeric" maxLength={4} value={adminPin} onChange={(event) => { setAdminPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setCurrentPin(""); setPinVisible(false); }} placeholder="4 dígitos" autoComplete="off" /></div>
            <div className="field"><label>Nuevo PIN</label><input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 dígitos" autoComplete="new-password" /></div>
            <div className="field"><label>Confirmar nuevo PIN</label><input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Repita el PIN" autoComplete="new-password" /></div>
          </>}

          {message && <div className="field full"><div className="error-note">{message}</div></div>}
          <div className="form-actions">
            {managePin && <button type="button" className="ghost-button" onClick={deleteTeacher} disabled={deleting || saving || Boolean(deletingExpedientId)} style={{ marginRight: "auto", color: "#9b2c2c", borderColor: "#e6b9b5", background: "#fff7f6" }}><Trash2 size={14} />{deleting ? "Eliminando..." : "Eliminar docente completo"}</button>}
            <button type="button" className="ghost-button" onClick={onClose} disabled={deleting || Boolean(deletingExpedientId)}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={saving || deleting || Boolean(deletingExpedientId) || !normalizedId}><Save size={14} />{saving ? "Guardando..." : "Guardar datos"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
