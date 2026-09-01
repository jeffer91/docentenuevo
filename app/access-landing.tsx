/* eslint-disable @next/next/no-img-element */

import { GraduationCap, ShieldCheck, Users } from "lucide-react";

export default function AccessLanding() {
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="institution-brand">
          <img src={`${import.meta.env.BASE_URL}logo-itsqmet.png`} alt="Instituto Tecnológico Superior Quito Metropolitano" />
          <span>SIACD · Acompañamiento Docente</span>
        </div>
        <div>
          <p className="eyebrow">ITSQMET · Sistema institucional</p>
          <h1>Gestión del acompañamiento docente</h1>
          <p>Acceso general al SIACD para docentes, coordinadores y administración.</p>
        </div>
        <p>Proceso CGC-PRO-121 · Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Seleccione su acceso</h2>
          <p>Cada perfil dispone de un enlace independiente.</p>

          <a
            className="primary-button"
            href="./docente/"
            style={{ justifyContent: "center", textDecoration: "none", width: "100%" }}
          >
            <GraduationCap size={16} />
            Acceso Docentes
          </a>

          <a
            className="secondary-button"
            href="./coordinador/"
            style={{ justifyContent: "center", textDecoration: "none", width: "100%", marginTop: 10 }}
          >
            <Users size={16} />
            Acceso Coordinadores
          </a>

          <a
            className="secondary-button"
            href="./administrador/"
            style={{ justifyContent: "center", textDecoration: "none", width: "100%", marginTop: 10 }}
          >
            <ShieldCheck size={16} />
            Acceso Administrador
          </a>
        </div>
      </section>
    </div>
  );
}
