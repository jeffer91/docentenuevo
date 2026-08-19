"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useState } from "react";
import { ArrowRight, IdCard, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
const DEVICE_EMAIL_KEY = "siacd-teacher-email";
const DEVICE_CEDULA_KEY = "siacd-teacher-cedula";

type VerifyRow = {
  device_token: string;
  teacher_id: string;
  full_name: string;
  email: string;
  expires_at: string;
};

export default function TeacherCedulaAccess({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const configured = isSupabaseConfigured();
  const [cedula, setCedula] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(DEVICE_CEDULA_KEY) ?? "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"cedula" | "code">("cedula");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!configured) {
    return <div className={styles.center}><div className={styles.card}><h1>SIACD Docentes</h1><p>La conexión con Supabase no está configurada.</p></div></div>;
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = cedula.replace(/\D/g, "");
    if (!/^\d{10}$/.test(normalized)) {
      setMessage("Ingrese una cédula de 10 dígitos.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("teacher-access", { body: { cedula: normalized } });
    setBusy(false);

    const serviceError = (data as { error?: string } | null)?.error;
    if (serviceError === "email_delivery_not_configured") {
      setMessage("El ingreso por cédula ya está preparado, pero todavía falta activar el envío del código al correo institucional.");
      return;
    }
    if (serviceError === "invalid_national_id") {
      setMessage("Ingrese una cédula válida de 10 dígitos.");
      return;
    }
    if (error || serviceError) {
      setMessage("No se pudo enviar el código. Intente nuevamente en unos minutos.");
      return;
    }

    setCedula(normalized);
    window.localStorage.setItem(DEVICE_CEDULA_KEY, normalized);
    setStep("code");
    setMessage("Si la cédula está registrada y tiene correo institucional, recibirá un código de 4 dígitos.");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      setMessage("Ingrese los 4 dígitos del código recibido.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("teacher_verify_access_by_cedula", {
      p_national_id: cedula,
      p_code: code,
      p_device_label: navigator.userAgent.slice(0, 180),
    });
    setBusy(false);

    const row = !error && Array.isArray(data) ? data[0] as VerifyRow | undefined : undefined;
    if (!row?.device_token) {
      setMessage("El código no es válido o ya venció. Puede solicitar uno nuevo.");
      return;
    }

    window.localStorage.setItem(DEVICE_TOKEN_KEY, row.device_token);
    window.localStorage.setItem(DEVICE_EMAIL_KEY, row.email);
    window.localStorage.setItem(DEVICE_CEDULA_KEY, cedula);
    setCode("");
    setMessage("");
    onAuthenticated(row.device_token);
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
        <small>El código se solicita solo al registrar este dispositivo.</small>
      </section>

      <section className={styles.accessPanel}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}><ShieldCheck size={22} /></div>
          <h2>Acceso docente</h2>
          {step === "cedula" ? (
            <form onSubmit={requestCode}>
              <label>Cédula</label>
              <div className={styles.inputWithIcon}>
                <IdCard size={17} />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  maxLength={10}
                  value={cedula}
                  onChange={(event) => setCedula(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="0102030405"
                  required
                />
              </div>
              <button type="submit" disabled={busy || cedula.length !== 10}>{busy ? "Enviando…" : "Enviar código"}<ArrowRight size={16} /></button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <label>Código de 4 dígitos</label>
              <input
                className={styles.codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                required
              />
              <button type="submit" disabled={busy || code.length !== 4}>{busy ? "Verificando…" : "Ingresar"}<ArrowRight size={16} /></button>
              <button className={styles.linkButton} type="button" onClick={() => { setStep("cedula"); setCode(""); setMessage(""); }}>Cambiar cédula / solicitar otro código</button>
            </form>
          )}
          {message && <div className={styles.message}>{message}</div>}
        </div>
      </section>
    </main>
  );
}
