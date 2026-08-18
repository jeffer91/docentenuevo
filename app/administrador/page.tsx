"use client";

import { FormEvent, useState } from "react";
import SiacdApp from "../siacd-app-v3";

const ADMIN_PIN_HASH = "e6955a2c59dc90833986fe0894cf6718dddaa7816bb51bc955cdd3eb4470e554";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await sha256(pin) === ADMIN_PIN_HASH) {
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
          <p>Ingrese la clave para acceder al panel de administración.</p>
        </div>
        <p>Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2>Clave de administrador</h2>
          <div className="field">
            <label>Clave</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <div className="error-note">{error}</div>}
          <button className="primary-button" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            Ingresar
          </button>
        </form>
      </section>
    </div>
  );
}
