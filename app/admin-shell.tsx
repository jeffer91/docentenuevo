"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useState } from "react";
import SiacdApp from "./siacd-app-v3";

const ADMIN_PIN_HASH = "e6955a2c59dc90833986fe0894cf6718dddaa7816bb51bc955cdd3eb4470e554";
const ADMIN_SESSION_KEY = "siacd-admin-authorized";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminShell() {
  const [authorized, setAuthorized] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1",
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    const valid = await sha256(pin) === ADMIN_PIN_HASH;
    setChecking(false);

    if (valid) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setAuthorized(true);
      setError("");
      return;
    }

    setError("Clave incorrecta");
    setPin("");
  }

  if (authorized) return <SiacdApp forcedAccess="admin" />;

  return (
    <div className="login-page">
      <section className="login-art">
        <div className="institution-brand">
          <img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" />
          <span>SIACD · Administración</span>
        </div>
        <div>
          <p className="eyebrow">Acceso restringido</p>
          <h1>Administrador SIACD</h1>
          <p>Ingrese la clave institucional para acceder al panel de administración.</p>
        </div>
        <p>Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2>Clave de administrador</h2>
          <p>Acceso exclusivo para administración del SIACD.</p>
          <div className="field">
            <label>Clave</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
          </div>
          {error && <div className="error-note">{error}</div>}
          <button className="primary-button" type="submit" disabled={checking || pin.length !== 4}>
            {checking ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </section>
    </div>
  );
}
