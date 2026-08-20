"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import {
  cedulaValidationWarning,
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
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const normalizedId = normalizeCedula(nationalId);
  const warning = nationalId ? cedulaValidationWarning(nationalId) : null;
  const allowedNames = useMemo(() => new Set(careers.map((career) => normalizeDirectoryLabel(career.name))), [careers]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!teacher.nationalId) {
        if (active) setLoading(false);
        return;
      }
      try {
        const record = await readDirectoryTeacher(teacher.nationalId);
        if (active) setDirectoryCareers(record?.carreras ?? []);
      } catch {
        if (active) setMessage("No se pudo leer Firebase. Puede editar los datos y volver a sincronizar al guardar.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [teacher.nationalId]);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cedula = normalizeCedula(nationalId);
    if (!cedula) {
      setMessage("La cédula debe tener 9 o 10 dígitos.");
      return;
    }
    if (canManagePin && (newPin || confirmPin || adminPin)) {
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

    if (canManagePin && newPin) {
      const { data: pinData, error: pinError } = await supabase.functions.invoke("teacher-access", {
        body: {
          action: "admin_reset_pin",
          teacher_id: teacher.teacherId,
          admin_pin: adminPin,
          new_pin: newPin,
        },
      });
      const serviceError = (pinData as { error?: string } | null)?.error;
      if (pinError || serviceError) {
        setSaving(false);
        if (serviceError === "invalid_admin_pin") {
          setMessage("Los datos del docente se guardaron, pero la clave de administrador no es correcta y el PIN no se cambió.");
        } else if (serviceError === "teacher_email_required") {
          setMessage("Los datos se guardaron, pero para crear el PIN el docente debe tener un correo válido.");
        } else {
          setMessage("Los datos se guardaron, pero no se pudo cambiar el PIN del docente.");
        }
        return;
      }
    }

    await onChanged();
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal teacher-master-modal" role="dialog" aria-modal="true">
        <div className="modal-head"><div><h2>Datos maestros del docente</h2><p className="subtitle">Actualiza Supabase y el nodo docentes-registrados de Firebase.</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div>
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

          {canManagePin && <>
            <div className="field full teacher-directory-careers">
              <label><KeyRound size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Acceso del docente</label>
              <div className="teacher-master-readonly">PIN actual: •••• · El PIN se guarda protegido y no puede visualizarse. El administrador sí puede reemplazarlo.</div>
            </div>
            <div className="field"><label>Nuevo PIN</label><input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 dígitos" autoComplete="new-password" /></div>
            <div className="field"><label>Confirmar nuevo PIN</label><input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Repita el PIN" autoComplete="new-password" /></div>
            <div className="field full"><label>Clave de administrador para autorizar el cambio</label><input type="password" inputMode="numeric" maxLength={4} value={adminPin} onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Solo necesaria si cambia el PIN" autoComplete="off" /></div>
          </>}

          {message && <div className="field full"><div className="error-note">{message}</div></div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving || !normalizedId}><Save size={14} />{saving ? "Guardando..." : "Guardar datos"}</button></div>
        </form>
      </div>
    </div>
  );
}
