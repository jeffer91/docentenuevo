"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, IdCard, ShieldCheck, UserRoundPlus } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import {
  mergeDirectoryCareers,
  readDirectoryTeacher,
  writeDirectoryTeacher,
} from "./lib/teacher-directory";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
const DEVICE_EMAIL_KEY = "siacd-teacher-email";
const DEVICE_CEDULA_KEY = "siacd-teacher-cedula";

type AccessResponse = {
  ok?: boolean;
  error?: string;
  device_token?: string;
  teacher_id?: string;
  email?: string;
  full_name?: string;
  registered?: boolean;
  found?: boolean;
  started_institution_on?: string;
  careers?: string[];
};

type CareerOption = {
  id: string;
  name: string;
  program?: string;
  coordinatorId: string;
  coordinatorName: string;
};

type Mode = "login" | "career" | "first" | "register";

export default function TeacherCedulaAccess({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>("login");
  const [cedula, setCedula] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(DEVICE_CEDULA_KEY) ?? "");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [directoryCareers, setDirectoryCareers] = useState<string[]>([]);
  const [careerOptions, setCareerOptions] = useState<CareerOption[]>([]);
  const [selectedCareerId, setSelectedCareerId] = useState("");
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerMessage, setCareerMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCareer = useMemo(
    () => careerOptions.find((career) => career.id === selectedCareerId) ?? null,
    [careerOptions, selectedCareerId],
  );

  useEffect(() => {
    if (mode !== "career" || careerOptions.length) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void (async () => {
      setCareerLoading(true);
      setCareerMessage("");

      const [careerResult, staffResult, assignmentResult] = await Promise.all([
        supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
        supabase.from("siacd_staff").select("id, full_name").eq("role", "coordinator").eq("active", true),
        supabase.from("siacd_staff_careers").select("staff_id, career_id"),
      ]);

      if (!active) return;
      setCareerLoading(false);

      const error = careerResult.error ?? staffResult.error ?? assignmentResult.error;
      if (error) {
        setCareerMessage("No se pudieron cargar las carreras. Intente nuevamente.");
        return;
      }

      const staffMap = new Map(
        ((staffResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
          String(row.id),
          String(row.full_name ?? "Coordinador"),
        ]),
      );
      const careerMap = new Map(
        ((careerResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
          String(row.id),
          {
            id: String(row.id),
            name: String(row.name ?? ""),
            program: typeof row.program === "string" ? row.program : undefined,
          },
        ]),
      );

      const byCareer = new Map<string, CareerOption>();
      for (const row of (assignmentResult.data ?? []) as Array<Record<string, unknown>>) {
        const staffId = String(row.staff_id ?? "");
        const careerId = String(row.career_id ?? "");
        const coordinatorName = staffMap.get(staffId);
        const career = careerMap.get(careerId);
        if (!career || !coordinatorName) continue;
        byCareer.set(careerId, {
          ...career,
          coordinatorId: staffId,
          coordinatorName,
        });
      }

      const options = [...byCareer.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
      setCareerOptions(options);
      if (!options.length) {
        setCareerMessage("No existen carreras con coordinador asignado. Administración debe completar la asignación primero.");
      }
    })();

    return () => { active = false; };
  }, [careerOptions.length, mode]);

  if (!configured) {
    return <div className={styles.center}><div className={styles.card}><h1>SIACD Docentes</h1><p>La conexión con Supabase no está configurada.</p></div></div>;
  }

  function normalizedCedula() {
    const digits = cedula.replace(/\D/g, "");
    return digits.length === 9 ? `0${digits}` : digits;
  }

  function saveSession(data: AccessResponse, normalized: string) {
    if (!data.device_token) return false;
    window.localStorage.setItem(DEVICE_TOKEN_KEY, data.device_token);
    window.localStorage.setItem(DEVICE_EMAIL_KEY, data.email ?? "");
    window.localStorage.setItem(DEVICE_CEDULA_KEY, normalized);
    setPin("");
    setConfirmPin("");
    setMessage("");
    onAuthenticated(data.device_token);
    return true;
  }

  async function invoke(body: Record<string, unknown>) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null as AccessResponse | null, error: true };
    const result = await supabase.functions.invoke("teacher-access", { body });
    let data = result.data as AccessResponse | null;

    if (!data && result.error) {
      const context = (result.error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          data = await context.clone().json() as AccessResponse;
        } catch {
          data = null;
        }
      }
    }

    return { data, error: Boolean(result.error) };
  }

  async function linkSelectedCareer(teacherId: string, normalized: string, resolvedName: string) {
    if (!selectedCareer) return { ok: true as const };

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { ok: false as const, error: "No se pudo conectar con SIACD." };

    const { data: existingExpedient, error: expedientError } = await supabase
      .from("expedients")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("career_id", selectedCareer.id)
      .limit(1)
      .maybeSingle();

    if (expedientError) {
      return { ok: false as const, error: "No se pudo comprobar si ya existe un expediente para la carrera." };
    }

    if (!existingExpedient?.id) {
      const { data: existingAssignment, error: assignmentLookupError } = await supabase
        .from("teacher_onboarding_assignments")
        .select("id, status")
        .eq("teacher_id", teacherId)
        .eq("career_id", selectedCareer.id)
        .maybeSingle();

      if (assignmentLookupError) {
        return {
          ok: false as const,
          error: "No se pudo anexar la carrera al coordinador. Verifique que la migración de preasignación docente esté aplicada.",
        };
      }

      if (existingAssignment?.id) {
        if (existingAssignment.status === "cancelled") {
          const { error: reactivateError } = await supabase
            .from("teacher_onboarding_assignments")
            .update({
              coordinator_staff_id: selectedCareer.coordinatorId,
              status: "pending",
              completed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingAssignment.id);
          if (reactivateError) {
            return { ok: false as const, error: "No se pudo reactivar la asignación con el coordinador." };
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from("teacher_onboarding_assignments")
          .insert({
            teacher_id: teacherId,
            career_id: selectedCareer.id,
            coordinator_staff_id: selectedCareer.coordinatorId,
            status: "pending",
          });
        if (insertError) {
          return { ok: false as const, error: "No se pudo anexar el docente al coordinador de la carrera." };
        }
      }
    }

    try {
      const existingDirectory = await readDirectoryTeacher(normalized);
      await writeDirectoryTeacher({
        cedula: normalized,
        nombresCompletos: resolvedName,
        carreras: mergeDirectoryCareers(existingDirectory?.carreras ?? [], [selectedCareer.name]),
        actualizadoEn: new Date().toISOString(),
      });
    } catch {
      // Supabase conserva la preasignación aunque Firebase no responda.
    }

    return { ok: true as const };
  }

  async function loadFirstRegistration() {
    const normalized = normalizedCedula();
    if (!selectedCareer) {
      setMode("career");
      setMessage("Seleccione primero la carrera.");
      return;
    }
    if (!/^\d{10}$/.test(normalized)) {
      setMessage("Ingrese una cédula de 10 dígitos.");
      return;
    }

    setBusy(true);
    setMessage("");
    const { data, error } = await invoke({ action: "status", cedula: normalized });
    setBusy(false);

    if (error || !data?.ok) {
      setMessage("No se pudo consultar el registro. Intente nuevamente.");
      return;
    }

    if (data.registered) {
      setMode("login");
      setMessage("Esta cédula ya tiene PIN. Ingrese para confirmar la vinculación con la carrera seleccionada.");
      return;
    }

    setCedula(normalized);
    setFullName(data.full_name ?? "");
    setEmail(data.email ?? "");
    setEntryDate(data.started_institution_on ?? "");
    setDirectoryCareers(Array.isArray(data.careers) ? data.careers : []);
    setPin("");
    setConfirmPin("");
    setMode("register");
    window.localStorage.setItem(DEVICE_CEDULA_KEY, normalized);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedCedula();
    if (!/^\d{10}$/.test(normalized)) return setMessage("Ingrese una cédula de 10 dígitos.");
    if (!/^\d{4}$/.test(pin)) return setMessage("El PIN debe tener 4 dígitos.");

    setBusy(true);
    setMessage("");
    const { data } = await invoke({
      action: "login",
      cedula: normalized,
      pin,
      device_label: navigator.userAgent.slice(0, 180),
    });

    if (data?.device_token) {
      if (selectedCareer && data.teacher_id) {
        const linked = await linkSelectedCareer(data.teacher_id, normalized, (data.full_name ?? fullName.trim()) || "Docente");
        if (!linked.ok) {
          setBusy(false);
          setMessage(linked.error);
          return;
        }
      }
      setBusy(false);
      if (saveSession(data, normalized)) return;
    }

    setBusy(false);
    if (data?.error === "registration_required") {
      setMessage("Es su primer ingreso. Seleccione primero su carrera.");
      setMode("career");
      return;
    }
    if (data?.error === "invalid_credentials") {
      setMessage("La cédula o el PIN no son correctos.");
      return;
    }
    setMessage("No se pudo iniciar sesión. Revise los datos e intente nuevamente.");
  }

  function careerContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCareer) {
      setCareerMessage("Seleccione una carrera para continuar.");
      return;
    }
    setMessage("");
    setMode("first");
  }

  async function firstLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFirstRegistration();
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedCedula();
    if (!selectedCareer) return setMessage("Seleccione primero la carrera.");
    if (!/^\d{10}$/.test(normalized)) return setMessage("Ingrese una cédula válida.");
    if (fullName.trim().length < 5) return setMessage("Ingrese sus nombres y apellidos completos.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessage("Ingrese un correo válido.");
    if (!/^\d{4}$/.test(pin)) return setMessage("Cree un PIN de 4 dígitos.");
    if (pin !== confirmPin) return setMessage("La confirmación del PIN no coincide.");

    setBusy(true);
    setMessage("");
    const { data } = await invoke({
      action: "register",
      cedula: normalized,
      full_name: fullName.trim(),
      email: email.trim(),
      started_institution_on: entryDate || null,
      pin,
      device_label: navigator.userAgent.slice(0, 180),
    });

    if (data?.device_token && data.teacher_id) {
      const linked = await linkSelectedCareer(data.teacher_id, normalized, data.full_name ?? fullName.trim());
      if (!linked.ok) {
        setBusy(false);
        setMode("login");
        setMessage(`Su cuenta fue creada, pero falta vincularla con la carrera. ${linked.error} Ingrese con su PIN para reintentar.`);
        return;
      }
      setBusy(false);
      if (saveSession(data, normalized)) return;
    }

    setBusy(false);
    if (data?.error === "pin_registration_failed") {
      setMessage("No se pudo crear el PIN. Revise si el correo ya pertenece a otro registro.");
      return;
    }
    if (data?.error === "identity_conflict") {
      setMessage("La cédula ya está asociada a otro registro. Solicite revisión al coordinador.");
      return;
    }
    if (data?.error === "session_creation_failed") {
      setPin("");
      setConfirmPin("");
      setMode("login");
      setMessage("Sus datos y su PIN se guardaron. Ingrese con su cédula y PIN para completar la vinculación de la carrera.");
      return;
    }
    setMessage("No se pudo completar el registro. Revise los datos e intente nuevamente.");
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.brandPanel}>
        <img src="/logo-itsqmet.png" alt="ITSQMET" />
        <div>
          <span className={styles.eyebrow}>SIACD · Espacio docente</span>
          <h1>Su acompañamiento, en un solo lugar.</h1>
          <p>Consulte pendientes, avance, próximas revisiones y resultados del proceso de acompañamiento.</p>
        </div>
        <small>Primer ingreso: seleccione su carrera, confirme sus datos y cree un PIN. La carrera determina automáticamente su coordinador.</small>
      </section>

      <section className={styles.accessPanel}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}>{mode === "register" ? <UserRoundPlus size={22} /> : <ShieldCheck size={22} />}</div>
          <h2>{mode === "career" ? "Seleccione su carrera" : mode === "register" ? "Primer registro" : mode === "first" ? "Primera vez" : "Acceso docente"}</h2>

          {mode === "login" && (
            <form onSubmit={login}>
              <label>Cédula</label>
              <div className={styles.inputWithIcon}>
                <IdCard size={17} />
                <input type="text" inputMode="numeric" autoComplete="username" maxLength={10} value={cedula} onChange={(event) => setCedula(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0102030405" required />
              </div>
              <label>PIN</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              {selectedCareer && <div className={styles.message}>Carrera seleccionada: {selectedCareer.name} · Coordinador: {selectedCareer.coordinatorName}</div>}
              <button type="submit" disabled={busy || cedula.length !== 10 || pin.length !== 4}>{busy ? "Ingresando…" : "Ingresar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("career"); setPin(""); setMessage(""); }}>¿Es su primera vez? Seleccionar carrera</button>
            </form>
          )}

          {mode === "career" && (
            <form onSubmit={careerContinue}>
              <label>Carrera principal para este acompañamiento</label>
              <select
                value={selectedCareerId}
                onChange={(event) => {
                  setSelectedCareerId(event.target.value);
                  setCareerMessage("");
                }}
                disabled={careerLoading || !careerOptions.length}
                required
              >
                <option value="">{careerLoading ? "Cargando carreras…" : careerOptions.length ? "Seleccione una carrera" : "Sin carreras disponibles"}</option>
                {careerOptions.map((career) => (
                  <option key={career.id} value={career.id}>
                    {career.name}{career.program ? ` — ${career.program}` : ""}
                  </option>
                ))}
              </select>
              {selectedCareer && <div className={styles.message}>Coordinador responsable: {selectedCareer.coordinatorName}</div>}
              {careerMessage && <div className={styles.message}>{careerMessage}</div>}
              <button type="submit" disabled={careerLoading || !selectedCareer}>Continuar<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("login"); setMessage(""); }}>Ya tengo PIN</button>
            </form>
          )}

          {mode === "first" && (
            <form onSubmit={firstLookup}>
              {selectedCareer && <div className={styles.message}>Carrera: {selectedCareer.name} · Coordinador: {selectedCareer.coordinatorName}</div>}
              <label>Cédula</label>
              <div className={styles.inputWithIcon}>
                <IdCard size={17} />
                <input type="text" inputMode="numeric" maxLength={10} value={cedula} onChange={(event) => setCedula(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0102030405" required />
              </div>
              <button type="submit" disabled={busy || cedula.length !== 10}>{busy ? "Consultando…" : "Continuar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("career"); setMessage(""); }}>Cambiar carrera</button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("login"); setMessage(""); }}>Ya tengo PIN</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={register}>
              {selectedCareer && <div className={styles.message}>Carrera: {selectedCareer.name} · Coordinador: {selectedCareer.coordinatorName}</div>}
              <label>Cédula</label>
              <input value={cedula} readOnly />
              <label>Nombres y apellidos</label>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <label>Correo</label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label>Fecha de ingreso a la institución</label>
              <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              {directoryCareers.length > 0 && <div className={styles.message}>Carreras registradas previamente: {directoryCareers.join(" · ")}</div>}
              <label>Cree un PIN de 4 dígitos</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              <label>Confirme el PIN</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              <button type="submit" disabled={busy || !selectedCareer || pin.length !== 4 || confirmPin.length !== 4}>{busy ? "Guardando…" : "Guardar e ingresar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("career"); setPin(""); setConfirmPin(""); setMessage(""); }}>Cambiar carrera</button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("login"); setPin(""); setConfirmPin(""); setMessage(""); }}>Volver al ingreso</button>
            </form>
          )}

          {message && <div className={styles.message}>{message}</div>}
        </div>
      </section>
    </main>
  );
}
