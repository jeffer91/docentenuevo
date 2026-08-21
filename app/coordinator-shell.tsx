"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowRight, LockKeyhole, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import SiacdApp from "./siacd-app";

type CoordinatorOption = {
  id: string;
  full_name: string;
};

type VerifyResult = {
  ok?: boolean;
  reason?: string;
};

const COORDINATOR_SESSION_KEY = "siacd-coordinator-id";

export default function CoordinatorShell() {
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [authorizedId, setAuthorizedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.sessionStorage.removeItem(COORDINATOR_SESSION_KEY);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .from("siacd_staff")
      .select("id, full_name")
      .eq("role", "coordinator")
      .eq("active", true)
      .order("full_name")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setError("No se pudo cargar la lista de coordinadores.");
          setLoading(false);
          return;
        }
        const options = (data ?? []).map((item) => ({ id: String(item.id), full_name: String(item.full_name) }));
        setCoordinators(options);
        setSelectedId(options[0]?.id ?? "");
        setLoading(false);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authorizedId) return;
    const timer = window.setInterval(() => {
      if (window.sessionStorage.getItem(COORDINATOR_SESSION_KEY) !== authorizedId) {
        setAuthorizedId("");
        setPin("");
        setError("");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [authorizedId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || pin.length !== 4) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setChecking(true);
    setError("");
    const { data, error: verifyError } = await supabase.rpc("coordinator_verify_pin", {
      p_staff_id: selectedId,
      p_pin: pin,
    });
    setChecking(false);

    if (verifyError) {
      setError("No se pudo validar el PIN. Intente nuevamente.");
      return;
    }

    const result = (data ?? {}) as VerifyResult;
    if (result.ok) {
      window.sessionStorage.setItem(COORDINATOR_SESSION_KEY, selectedId);
      setAuthorizedId(selectedId);
      setPin("");
      return;
    }

    if (result.reason === "pin_not_configured") {
      setError("Este coordinador todavía no tiene un PIN configurado. Solicítelo al administrador.");
    } else if (result.reason === "coordinator_not_available") {
      setError("El coordinador seleccionado no está disponible.");
    } else {
      setError("PIN incorrecto.");
    }
    setPin("");
  }

  if (authorizedId) return <SiacdApp forcedAccess="coordinator" />;

  return (
    <div className="login-page">
      <section className="login-art">
        <div className="institution-brand">
          <img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" />
          <span>SIACD · Acompañamiento Docente</span>
        </div>
        <div>
          <p className="eyebrow">Acceso de coordinadores</p>
          <h1>Ingreso protegido con PIN</h1>
          <p>Seleccione su nombre e ingrese su PIN personal para acceder únicamente a sus carreras y docentes.</p>
        </div>
        <p>Proceso CGC-PRO-121 · Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Users size={18} />
            <h2 style={{ margin: 0 }}>Coordinador de Carrera</h2>
          </div>
          <p>El PIN es personal y consta de 4 dígitos.</p>

          {loading ? <div className="error-note">Cargando coordinadores…</div> : coordinators.length ? <>
            <div className="field">
              <label>Nombre</label>
              <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(""); }}>
                {coordinators.map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.full_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>PIN</label>
              <div style={{ position: "relative" }}>
                <LockKeyhole size={15} style={{ position: "absolute", left: 12, top: 12, color: "#6b7d90" }} />
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  style={{ paddingLeft: 36 }}
                  autoFocus
                  required
                />
              </div>
            </div>
            {error && <div className="error-note">{error}</div>}
            <button className="primary-button" type="submit" disabled={checking || pin.length !== 4} style={{ width: "100%", justifyContent: "center" }}>
              {checking ? "Verificando…" : <>Ingresar <ArrowRight size={15} /></>}
            </button>
          </> : <div className="error-note">No existen coordinadores activos.</div>}

          <a className="text-link" href="../" style={{ display: "inline-block", marginTop: 16 }}>Volver al inicio</a>
        </form>
      </section>
    </div>
  );
}
