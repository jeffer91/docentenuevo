"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowRight, LockKeyhole, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import SiacdApp from "./siacd-app";

type CoordinatorOption = {
  id: string;
  full_name: string;
  pin_configured: boolean;
};

type PinOverviewRow = {
  staff_id: string;
  full_name: string;
  active: boolean;
  pin_configured: boolean;
};

type AccessResult = {
  ok?: boolean;
  reason?: string;
};

const COORDINATOR_SESSION_KEY = "siacd-coordinator-id";

export default function CoordinatorShell() {
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [authorizedId, setAuthorizedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const selectedCoordinator = useMemo(
    () => coordinators.find((coordinator) => coordinator.id === selectedId) ?? null,
    [coordinators, selectedId],
  );
  const firstAccess = selectedCoordinator?.pin_configured === false;

  useEffect(() => {
    window.sessionStorage.removeItem(COORDINATOR_SESSION_KEY);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .rpc("coordinator_pin_overview")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setError("No se pudo cargar la lista de coordinadores.");
          setLoading(false);
          return;
        }

        const options = ((data ?? []) as PinOverviewRow[])
          .filter((item) => item.active)
          .map((item) => ({
            id: String(item.staff_id),
            full_name: String(item.full_name),
            pin_configured: Boolean(item.pin_configured),
          }));

        setCoordinators(options);
        setSelectedId("");
        setLoading(false);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authorizedId) return;
    const timer = window.setInterval(() => {
      if (window.sessionStorage.getItem(COORDINATOR_SESSION_KEY) !== authorizedId) {
        setAuthorizedId("");
        setSelectedId("");
        setPin("");
        setConfirmPin("");
        setError("");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [authorizedId]);

  function authorize(staffId: string) {
    window.sessionStorage.setItem(COORDINATOR_SESSION_KEY, staffId);
    setAuthorizedId(staffId);
    setPin("");
    setConfirmPin("");
  }

  function changeCoordinator(staffId: string) {
    setSelectedId(staffId);
    setPin("");
    setConfirmPin("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCoordinator || pin.length !== 4) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    if (firstAccess && confirmPin !== pin) {
      setError("Los PIN no coinciden.");
      return;
    }

    setChecking(true);
    setError("");

    if (firstAccess) {
      const { data, error: registerError } = await supabase.rpc("coordinator_register_pin", {
        p_staff_id: selectedCoordinator.id,
        p_pin: pin,
      });
      setChecking(false);

      if (registerError) {
        setError("No se pudo crear el PIN. Intente nuevamente.");
        return;
      }

      const result = (data ?? {}) as AccessResult;
      if (result.ok) {
        setCoordinators((current) =>
          current.map((item) => item.id === selectedCoordinator.id ? { ...item, pin_configured: true } : item),
        );
        authorize(selectedCoordinator.id);
        return;
      }

      if (result.reason === "pin_already_configured") {
        setCoordinators((current) =>
          current.map((item) => item.id === selectedCoordinator.id ? { ...item, pin_configured: true } : item),
        );
        setPin("");
        setConfirmPin("");
        setError("Este coordinador ya tiene un PIN configurado. Ingrese su PIN actual para acceder.");
      } else if (result.reason === "coordinator_not_available") {
        setError("El coordinador seleccionado no está disponible.");
      } else {
        setError("No se pudo crear el PIN.");
      }
      return;
    }

    const { data, error: verifyError } = await supabase.rpc("coordinator_verify_pin", {
      p_staff_id: selectedCoordinator.id,
      p_pin: pin,
    });
    setChecking(false);

    if (verifyError) {
      setError("No se pudo validar el PIN. Intente nuevamente.");
      return;
    }

    const result = (data ?? {}) as AccessResult;
    if (result.ok) {
      authorize(selectedCoordinator.id);
      return;
    }

    if (result.reason === "pin_not_configured") {
      setCoordinators((current) =>
        current.map((item) => item.id === selectedCoordinator.id ? { ...item, pin_configured: false } : item),
      );
      setPin("");
      setConfirmPin("");
      setError("Es su primer ingreso. Cree un PIN personal de 4 dígitos.");
    } else if (result.reason === "coordinator_not_available") {
      setError("El coordinador seleccionado no está disponible.");
    } else {
      setError("PIN incorrecto.");
      setPin("");
    }
  }

  if (authorizedId) return <SiacdApp forcedAccess="coordinator" />;

  const canSubmit = Boolean(selectedCoordinator) && (
    firstAccess
      ? pin.length === 4 && confirmPin.length === 4
      : pin.length === 4
  );

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
          <p>Seleccione primero su nombre. El sistema le permitirá ingresar con su PIN o crear uno si es su primer acceso.</p>
        </div>
        <p>Proceso CGC-PRO-121 · Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Users size={18} />
            <h2 style={{ margin: 0 }}>Coordinador de Carrera</h2>
          </div>

          <p>
            {!selectedCoordinator
              ? "Seleccione su nombre para continuar."
              : firstAccess
                ? "Primer ingreso: cree y confirme un PIN personal de 4 dígitos."
                : "Ingrese su PIN personal de 4 dígitos."}
          </p>

          {loading ? <div className="error-note">Cargando coordinadores…</div> : coordinators.length ? <>
            <div className="field">
              <label>Nombre</label>
              <select
                value={selectedId}
                onChange={(event) => changeCoordinator(event.target.value)}
                disabled={checking}
              >
                <option value="" disabled>Seleccione su nombre</option>
                {coordinators.map((coordinator) => (
                  <option key={coordinator.id} value={coordinator.id}>{coordinator.full_name}</option>
                ))}
              </select>
            </div>

            {selectedCoordinator && firstAccess && (
              <div style={{ border: "1px solid #d7e4ef", borderRadius: 11, padding: 11, background: "#f5f9fc", fontSize: 12, color: "#48647a" }}>
                Primer ingreso de {selectedCoordinator.full_name}. Cree su PIN personal para continuar.
              </div>
            )}

            {selectedCoordinator && (
              <>
                <div className="field">
                  <label>{firstAccess ? "Nuevo PIN" : "PIN"}</label>
                  <div style={{ position: "relative" }}>
                    <LockKeyhole size={15} style={{ position: "absolute", left: 12, top: 12, color: "#6b7d90" }} />
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      autoComplete={firstAccess ? "new-password" : "off"}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      style={{ paddingLeft: 36 }}
                      autoFocus
                      disabled={checking}
                      required
                    />
                  </div>
                </div>

                {firstAccess && (
                  <div className="field">
                    <label>Confirmar PIN</label>
                    <div style={{ position: "relative" }}>
                      <LockKeyhole size={15} style={{ position: "absolute", left: 12, top: 12, color: "#6b7d90" }} />
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        autoComplete="new-password"
                        value={confirmPin}
                        onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        style={{ paddingLeft: 36 }}
                        disabled={checking}
                        required
                      />
                    </div>
                  </div>
                )}

                {error && <div className="error-note">{error}</div>}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={checking || !canSubmit}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {checking
                    ? (firstAccess ? "Creando PIN…" : "Verificando…")
                    : firstAccess
                      ? <>Crear PIN e ingresar <ArrowRight size={15} /></>
                      : <>Ingresar <ArrowRight size={15} /></>}
                </button>
              </>
            )}
          </> : <div className="error-note">No existen coordinadores activos.</div>}

          {!selectedCoordinator && error && <div className="error-note">{error}</div>}

          <a className="text-link" href="../" style={{ display: "inline-block", marginTop: 16 }}>Volver al inicio</a>
        </form>
      </section>
    </div>
  );
}
