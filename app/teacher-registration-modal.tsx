"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, X } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import {
  cedulaValidationWarning,
  mergeDirectoryCareers,
  newestName,
  normalizeCedula,
  normalizeDirectoryLabel,
  readDirectoryTeacher,
} from "./lib/teacher-directory";

export type TeacherRegistrationCareer = { id: string; name: string; program?: string };
export type TeacherRegistrationPeriod = { id: string; name: string };
export type TeacherScheduleRange = { startTime: string; endTime: string };

export type TeacherRegistrationInput = {
  nationalId: string;
  name: string;
  careerId: string;
  directoryCareers: string[];
  periodId: string;
  subject: string;
  modality: string;
  entryDate: string;
  activitiesStartDate: string;
  plannedCloseDate: string;
  schedules: TeacherScheduleRange[];
  email: string;
  teams: string;
  telegram: string;
};

type SupabaseTeacher = {
  id: string;
  national_id: string | null;
  full_name: string;
  institutional_email: string | null;
  started_institution_on: string | null;
  updated_at: string | null;
};

export default function TeacherRegistrationModal({ careers, periods, coordinatorName, onClose, onSave }: {
  careers: TeacherRegistrationCareer[];
  periods: TeacherRegistrationPeriod[];
  coordinatorName: string;
  onClose: () => void;
  onSave: (input: TeacherRegistrationInput) => Promise<void>;
}) {
  const [nationalId, setNationalId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [careerId, setCareerId] = useState("");
  const [directoryCareers, setDirectoryCareers] = useState<string[]>([]);
  const [directoryCareerToAdd, setDirectoryCareerToAdd] = useState("");
  const [schedules, setSchedules] = useState<TeacherScheduleRange[]>([{ startTime: "", endTime: "" }]);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "new" | "error">("idle");
  const [lookupMessage, setLookupMessage] = useState("");

  const normalizedId = normalizeCedula(nationalId);
  const cedulaWarning = nationalId ? cedulaValidationWarning(nationalId) : null;

  const assignedCareerLabels = useMemo(
    () => new Map(careers.map((career) => [normalizeDirectoryLabel(career.name), career])),
    [careers],
  );

  async function lookup() {
    const cedula = normalizeCedula(nationalId);
    if (!cedula) {
      setLookupState("error");
      setLookupMessage("Ingrese una cédula de 9 o 10 dígitos.");
      return;
    }
    setNationalId(cedula);
    setLookupState("loading");
    setLookupMessage("Buscando en el directorio institucional...");

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase no está configurado");
      const [firebaseTeacher, supabaseResult] = await Promise.all([
        readDirectoryTeacher(cedula),
        supabase
          .from("teachers")
          .select("id, national_id, full_name, institutional_email, started_institution_on, updated_at")
          .eq("national_id", cedula)
          .maybeSingle(),
      ]);

      if (supabaseResult.error) throw supabaseResult.error;
      const supabaseTeacher = (supabaseResult.data ?? null) as SupabaseTeacher | null;
      const resolved = newestName({
        firebaseName: firebaseTeacher?.nombresCompletos,
        firebaseUpdatedAt: firebaseTeacher?.actualizadoEn,
        supabaseName: supabaseTeacher?.full_name,
        supabaseUpdatedAt: supabaseTeacher?.updated_at ?? undefined,
      });

      setName(resolved.name);
      setEmail(supabaseTeacher?.institutional_email ?? "");
      setEntryDate(supabaseTeacher?.started_institution_on ?? "");
      const firebaseCareers = firebaseTeacher?.carreras ?? [];
      setDirectoryCareers(firebaseCareers);

      const matches = careers.filter((career) =>
        firebaseCareers.some((item) => normalizeDirectoryLabel(item) === normalizeDirectoryLabel(career.name)),
      );
      if (matches.length === 1) setCareerId(matches[0].id);

      if (firebaseTeacher || supabaseTeacher) {
        const sourceText = resolved.source === "supabase" ? "Supabase tenía la información más reciente." : "Firebase aportó la información principal.";
        const roles = firebaseTeacher?.roles ?? [];
        const roleText = roles.length
          ? ` Roles registrados: ${roles.join(", ")}. Al guardar, SIACD añadirá el rol docente sin eliminar los demás.`
          : " Al guardar, SIACD registrará el rol docente.";
        setLookupState("found");
        setLookupMessage(`Persona encontrada. ${sourceText}${roleText}`);
      } else {
        setLookupState("new");
        setLookupMessage("La cédula no está registrada. Complete los datos y SIACD la creará en el directorio con rol docente.");
      }
    } catch (error) {
      setLookupState("error");
      setLookupMessage(`No se pudo consultar el directorio: ${error instanceof Error ? error.message : "error desconocido"}. Puede completar el registro manualmente.`);
    }
  }

  function addDirectoryCareer() {
    const career = careers.find((item) => item.id === directoryCareerToAdd);
    if (!career) return;
    setDirectoryCareers((current) => mergeDirectoryCareers(current, [career.name]));
    setDirectoryCareerToAdd("");
  }

  function removeDirectoryCareer(value: string) {
    const normalized = normalizeDirectoryLabel(value);
    if (!assignedCareerLabels.has(normalized)) return;
    setDirectoryCareers((current) => current.filter((item) => normalizeDirectoryLabel(item) !== normalized));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cedula = normalizeCedula(nationalId);
    if (!cedula) return window.alert("La cédula debe tener 9 o 10 dígitos.");
    if (!name.trim()) return window.alert("Ingrese los nombres y apellidos del docente.");
    if (!careerId) return window.alert("Seleccione la carrera del expediente.");
    if (schedules.some((schedule) => !schedule.startTime || !schedule.endTime || schedule.endTime <= schedule.startTime)) {
      return window.alert("Revise las jornadas.");
    }

    const form = new FormData(event.currentTarget);
    const currentCareer = careers.find((career) => career.id === careerId);
    const finalDirectoryCareers = mergeDirectoryCareers(directoryCareers, currentCareer ? [currentCareer.name] : []);

    void onSave({
      nationalId: cedula,
      name: name.trim(),
      careerId,
      directoryCareers: finalDirectoryCareers,
      periodId: String(form.get("periodId") ?? ""),
      subject: String(form.get("subject") ?? ""),
      modality: String(form.get("modality") ?? ""),
      entryDate,
      activitiesStartDate: String(form.get("activitiesStartDate") ?? ""),
      plannedCloseDate: String(form.get("plannedCloseDate") ?? ""),
      schedules,
      email,
      teams: String(form.get("teams") ?? ""),
      telegram: String(form.get("telegram") ?? ""),
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal teacher-directory-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><h2>Registrar docente nuevo</h2><p className="subtitle">Coordinador: {coordinatorName}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>

        <form className="modal-body form-grid" onSubmit={submit}>
          <div className="field full teacher-id-field">
            <label>Cédula</label>
            <div className="teacher-id-search">
              <input
                inputMode="numeric"
                placeholder="Ej. 0201878634"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value.replace(/\D/g, "").slice(0, 10))}
                onBlur={() => {
                  const normalized = normalizeCedula(nationalId);
                  if (normalized) setNationalId(normalized);
                }}
                required
              />
              <button type="button" className="secondary-button" onClick={() => void lookup()} disabled={lookupState === "loading"}>
                <Search size={14} />{lookupState === "loading" ? "Buscando..." : "Buscar"}
              </button>
            </div>
            {cedulaWarning && <small className="teacher-directory-warning">{cedulaWarning}</small>}
            {lookupMessage && <div className={`teacher-directory-status ${lookupState}`}>{lookupState === "found" && <CheckCircle2 size={15} />}{lookupMessage}</div>}
          </div>

          <div className="field full"><label>Nombres y apellidos</label><input value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div className="field"><label>Carrera del expediente</label><select value={careerId} onChange={(event) => setCareerId(event.target.value)} required disabled={!careers.length}><option value="">{careers.length ? "Seleccione una carrera" : "No tiene carreras asignadas"}</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""}</option>)}</select></div>
          <div className="field"><label>Asignatura(s)</label><input name="subject" required /></div>

          <div className="field full teacher-directory-careers">
            <label>Carreras registradas para esta persona</label>
            <div className="teacher-directory-chips">
              {directoryCareers.length ? directoryCareers.map((career) => {
                const removable = assignedCareerLabels.has(normalizeDirectoryLabel(career));
                return <span key={career}>{career}{removable && <button type="button" onClick={() => removeDirectoryCareer(career)} aria-label={`Quitar ${career}`}>×</button>}</span>;
              }) : <small>Sin carreras registradas todavía.</small>}
            </div>
            <div className="teacher-directory-add">
              <select value={directoryCareerToAdd} onChange={(event) => setDirectoryCareerToAdd(event.target.value)}><option value="">Agregar una de mis carreras...</option>{careers.filter((career) => !directoryCareers.some((item) => normalizeDirectoryLabel(item) === normalizeDirectoryLabel(career.name))).map((career) => <option key={career.id} value={career.id}>{career.name}</option>)}</select>
              <button type="button" className="secondary-button" onClick={addDirectoryCareer} disabled={!directoryCareerToAdd}><Plus size={13} />Agregar</button>
            </div>
            <small>Las carreras de otros coordinadores se muestran como referencia y no se eliminan desde esta pantalla.</small>
          </div>

          <div className="field"><label>Modalidad</label><select name="modality"><option>Presencial</option><option>Híbrida</option><option>Online</option><option>Intensiva</option></select></div>
          <div className="field"><label>Período académico</label><select name="periodId" required><option value="">Seleccione un período</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></div>
          <div className="field"><label>Fecha de ingreso</label><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></div>
          <div className="field"><label>Inicio de actividades</label><input type="date" name="activitiesStartDate" required /></div>
          <div className="field full"><label>Fecha prevista de cierre</label><input type="date" name="plannedCloseDate" /></div>

          <div className="field full"><label>Jornadas / horarios</label><div className="schedule-editor">{schedules.map((schedule, index) => <div className="schedule-range" key={index}><strong>Jornada {index + 1}</strong><div className="field"><label>Desde</label><input type="time" required value={schedule.startTime} onChange={(event) => setSchedules((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, startTime: event.target.value } : row))} /></div><div className="schedule-separator">a</div><div className="field"><label>Hasta</label><input type="time" required value={schedule.endTime} onChange={(event) => setSchedules((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, endTime: event.target.value } : row))} /></div><button type="button" className="icon-button schedule-remove" disabled={schedules.length === 1} onClick={() => setSchedules((current) => current.filter((_, rowIndex) => rowIndex !== index))}><X size={15} /></button></div>)}<button type="button" className="secondary-button schedule-add" onClick={() => setSchedules((current) => [...current, { startTime: "", endTime: "" }])}><Plus size={14} />Agregar otra jornada</button></div></div>

          <div className="field"><label>Correo institucional</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label>Código Teams</label><input name="teams" /></div>
          <div className="field full"><label>Enlace Telegram</label><input type="url" name="telegram" /></div>
          {!careers.length && <div className="field full"><div className="error-note">Este coordinador no tiene carreras asignadas. El administrador debe asignarlas antes de registrar docentes.</div></div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={!careers.length || !periods.length || !normalizedId}><Plus size={14} />Guardar expediente</button></div>
        </form>
      </div>
    </div>
  );
}
