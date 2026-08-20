"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useState } from "react";
import { ArrowRight, IdCard, ShieldCheck, UserRoundPlus } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
const DEVICE_EMAIL_KEY = "siacd-teacher-email";
const DEVICE_CEDULA_KEY = "siacd-teacher-cedula";

type AccessResponse = {
  ok?: boolean;
  error?: string;
  device_token?: string;
  email?: string;
  full_name?: string;
  registered?: boolean;
  found?: boolean;
  started_institution_on?: string;
  careers?: string[];
};

type Mode = "login" | "first" | "register";

export default function TeacherCedulaAccess({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>("login");
  const [cedula, setCedula] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(DEVICE_CEDULA_KEY) ?? "");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [careers, setCareers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  async function loadFirstRegistration() {
    const normalized = normalizedCedula();
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
      setMessage("Esta cédula ya tiene PIN. Ingrese con su cédula y PIN.");
      return;
    }

    setCedula(normalized);
    setFullName(data.full_name ?? "");
    setEmail(data.email ?? "");
    setEntryDate(data.started_institution_on ?? "");
    setCareers(Array.isArray(data.careers) ? data.careers : []);
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
    setBusy(false);

    if (data?.device_token && saveSession(data, normalized)) return;
    if (data?.error === "registration_required") {
      setMessage("Es su primer ingreso. Complete sus datos y cree su PIN.");
      setMode("first");
      return;
    }
    if (data?.error === "invalid_credentials") {
      setMessage("La cédula o el PIN no son correctos.");
      return;
    }
    setMessage("No se pudo iniciar sesión. Revise los datos e intente nuevamente.");
  }

  async function firstLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadFirstRegistration();
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedCedula();
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
    setBusy(false);

    if (data?.device_token && saveSession(data, normalized)) return;
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
      setMessage("Sus datos y su PIN se guardaron correctamente. Ingrese ahora con su cédula y PIN.");
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
        <small>Primer ingreso: complete sus datos y cree un PIN. Luego ingrese únicamente con cédula y PIN.</small>
      </section>

      <section className={styles.accessPanel}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}>{mode === "register" ? <UserRoundPlus size={22} /> : <ShieldCheck size={22} />}</div>
          <h2>{mode === "register" ? "Primer registro" : mode === "first" ? "Primera vez" : "Acceso docente"}</h2>

          {mode === "login" && (
            <form onSubmit={login}>
              <label>Cédula</label>
              <div className={styles.inputWithIcon}>
                <IdCard size={17} />
                <input type="text" inputMode="numeric" autoComplete="username" maxLength={10} value={cedula} onChange={(event) => setCedula(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0102030405" required />
              </div>
              <label>PIN</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              <button type="submit" disabled={busy || cedula.length !== 10 || pin.length !== 4}>{busy ? "Ingresando…" : "Ingresar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("first"); setPin(""); setMessage(""); }}>¿Es su primera vez? Registrar mis datos</button>
            </form>
          )}

          {mode === "first" && (
            <form onSubmit={firstLookup}>
              <label>Cédula</label>
              <div className={styles.inputWithIcon}>
                <IdCard size={17} />
                <input type="text" inputMode="numeric" maxLength={10} value={cedula} onChange={(event) => setCedula(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0102030405" required />
              </div>
              <button type="submit" disabled={busy || cedula.length !== 10}>{busy ? "Consultando…" : "Continuar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("login"); setMessage(""); }}>Ya tengo PIN</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={register}>
              <label>Cédula</label>
              <input value={cedula} readOnly />
              <label>Nombres y apellidos</label>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <label>Correo</label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label>Fecha de ingreso a la institución</label>
              <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              {careers.length > 0 && <div className={styles.message}>Carreras registradas: {careers.join(" · ")}</div>}
              <label>Cree un PIN de 4 dígitos</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              <label>Confirme el PIN</label>
              <input className={styles.codeInput} type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required />
              <button type="submit" disabled={busy || pin.length !== 4 || confirmPin.length !== 4}>{busy ? "Guardando…" : "Guardar e ingresar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode("login"); setPin(""); setConfirmPin(""); setMessage(""); }}>Volver al ingreso</button>
            </form>
          )}

          {message && <div className={styles.message}>{message}</div>}
        </div>
      </section>
    </main>
  );
}
