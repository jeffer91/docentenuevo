"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, LogOut, Mail, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
const DEVICE_EMAIL_KEY = "siacd-teacher-email";

type TeacherSession = {
  teacher_id: string;
  full_name: string;
  email: string;
  session_expires_at: string;
};

type PortalExpedient = {
  expedient_id: string;
  career: string;
  period: string;
  subject: string;
  status: string;
  activities_start_on: string | null;
  planned_close_on: string | null;
  hitos_executed: number;
};

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Pendiente",
    in_progress: "En acompañamiento",
    with_gaps: "Con brechas",
    ready_for_review: "Listo para revisión",
    pending_approval: "Pendiente de aprobación",
    returned: "Devuelto",
    approved: "Aprobado",
    certified: "Certificado",
    archived: "Archivado",
  };
  return labels[value] ?? value;
}

export default function TeacherPortal() {
  const configured = isSupabaseConfigured();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [expedients, setExpedients] = useState<PortalExpedient[]>([]);

  const loadSummary = useCallback(async (token: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("teacher_portal_summary", { p_token: token });
    if (error) {
      setMessage("No se pudo cargar el acompañamiento docente.");
      return;
    }
    setExpedients((data ?? []) as PortalExpedient[]);
  }, []);

  useEffect(() => {
    let active = true;
    async function validateSavedDevice() {
      if (!configured) {
        if (active) setChecking(false);
        return;
      }
      const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
      const savedEmail = window.localStorage.getItem(DEVICE_EMAIL_KEY) ?? "";
      if (savedEmail && active) setEmail(savedEmail);
      if (!token) {
        if (active) setChecking(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) setChecking(false);
        return;
      }
      const { data, error } = await supabase.rpc("teacher_validate_device", { p_token: token });
      const row = !error && Array.isArray(data) ? (data[0] as TeacherSession | undefined) : undefined;
      if (!active) return;
      if (!row) {
        window.localStorage.removeItem(DEVICE_TOKEN_KEY);
        setChecking(false);
        return;
      }
      setSession(row);
      setEmail(row.email);
      setChecking(false);
      await loadSummary(token);
    }
    void validateSavedDevice();
    return () => { active = false; };
  }, [configured, loadSummary]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("teacher-access", { body: { email: normalizedEmail } });
    setBusy(false);

    const serviceError = (data as { error?: string } | null)?.error;
    if (serviceError === "email_delivery_not_configured") {
      setMessage("El acceso docente ya está preparado, pero falta activar el servicio que enviará los códigos por correo.");
      return;
    }
    if (error || serviceError) {
      setMessage("No se pudo enviar el código. Intente nuevamente en unos minutos.");
      return;
    }

    setEmail(normalizedEmail);
    setStep("code");
    setMessage("Si el correo está registrado, recibirá un código de 4 dígitos. Revise también correo no deseado.");
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
    const { data, error } = await supabase.rpc("teacher_verify_access", {
      p_email: email.trim().toLowerCase(),
      p_code: code,
      p_device_label: navigator.userAgent.slice(0, 180),
    });
    setBusy(false);

    const row = !error && Array.isArray(data) ? data[0] as (TeacherSession & { device_token: string }) | undefined : undefined;
    if (!row?.device_token) {
      setMessage("El código no es válido o ya venció. Puede solicitar uno nuevo.");
      return;
    }

    window.localStorage.setItem(DEVICE_TOKEN_KEY, row.device_token);
    window.localStorage.setItem(DEVICE_EMAIL_KEY, row.email);
    setSession({
      teacher_id: row.teacher_id,
      full_name: row.full_name,
      email: row.email,
      session_expires_at: row.session_expires_at,
    });
    setCode("");
    setMessage("");
    await loadSummary(row.device_token);
  }

  async function logout() {
    const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
    const supabase = getSupabaseBrowserClient();
    if (token && supabase) await supabase.rpc("teacher_revoke_device", { p_token: token });
    window.localStorage.removeItem(DEVICE_TOKEN_KEY);
    setSession(null);
    setExpedients([]);
    setStep("email");
    setMessage("");
  }

  if (!configured) {
    return <div className={styles.center}><div className={styles.card}><h1>SIACD Docentes</h1><p>La conexión con Supabase no está configurada.</p></div></div>;
  }

  if (checking) {
    return <div className={styles.center}><div className={styles.loading}>Verificando este dispositivo…</div></div>;
  }

  if (!session) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.brandPanel}>
          <img src="/logo-itsqmet.png" alt="ITSQMET" />
          <div>
            <span className={styles.eyebrow}>SIACD · Espacio docente</span>
            <h1>Su acompañamiento, en un solo lugar.</h1>
            <p>Consulte pendientes, evidencias, revisiones y resultados del proceso de acompañamiento docente.</p>
          </div>
          <small>El código se solicita solo al registrar este dispositivo.</small>
        </section>

        <section className={styles.accessPanel}>
          <div className={styles.accessCard}>
            <div className={styles.accessIcon}><ShieldCheck size={22} /></div>
            <h2>Acceso docente</h2>
            {step === "email" ? (
              <form onSubmit={requestCode}>
                <label>Correo institucional</label>
                <div className={styles.inputWithIcon}><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@institucion.edu.ec" required /></div>
                <button type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar código"}<ArrowRight size={16} /></button>
              </form>
            ) : (
              <form onSubmit={verifyCode}>
                <label>Código de 4 dígitos</label>
                <input className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" required />
                <button type="submit" disabled={busy || code.length !== 4}>{busy ? "Verificando…" : "Ingresar"}<ArrowRight size={16} /></button>
                <button className={styles.linkButton} type="button" onClick={() => { setStep("email"); setCode(""); setMessage(""); }}>Usar otro correo / solicitar otro código</button>
              </form>
            )}
            {message && <div className={styles.message}>{message}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.portal}>
      <header className={styles.portalHeader}>
        <div><span className={styles.eyebrow}>SIACD · Docente</span><h1>Bienvenido, {session.full_name}</h1><p>{session.email}</p></div>
        <button className={styles.logout} onClick={() => void logout()}><LogOut size={16} />Cerrar sesión</button>
      </header>

      <section className={styles.infoBanner}>
        <CheckCircle2 size={20} />
        <div><strong>Este dispositivo quedó registrado.</strong><span>No tendrá que ingresar el código cada vez que abra SIACD mientras la sesión siga vigente.</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Bloque 1</span><h2>Mis procesos de acompañamiento</h2></div><span>{expedients.length} proceso{expedients.length === 1 ? "" : "s"}</span></div>
        {expedients.length ? (
          <div className={styles.grid}>
            {expedients.map((item) => {
              const progress = Math.round((Number(item.hitos_executed ?? 0) / 6) * 100);
              return (
                <article className={styles.expedientCard} key={item.expedient_id}>
                  <div className={styles.cardTop}><strong>{item.career}</strong><span>{statusLabel(item.status)}</span></div>
                  <h3>{item.subject}</h3>
                  <p>{item.period}</p>
                  <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>
                  <div className={styles.cardBottom}><span>{item.hitos_executed}/6 hitos ejecutados</span><strong>{progress}%</strong></div>
                </article>
              );
            })}
          </div>
        ) : <div className={styles.empty}>No existen procesos vinculados a este docente todavía.</div>}
      </section>
    </main>
  );
}
