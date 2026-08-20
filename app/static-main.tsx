import React from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import "./admin-career-manager.css";
import "./teacher-directory.css";
import AccessLanding from "./access-landing";
import AdminShell from "./admin-shell";
import SiacdApp from "./siacd-app-v6";
import TeacherPortal from "./teacher-portal";

const container = document.getElementById("root");

if (!container) throw new Error("No se encontró el contenedor principal de SIACD");

const pathname = window.location.pathname.toLowerCase();
const app = pathname.includes("/administrador")
  ? <AdminShell />
  : pathname.includes("/coordinador")
    ? <SiacdApp forcedAccess="coordinator" />
    : pathname.includes("/docente")
      ? <TeacherPortal />
      : <AccessLanding />;

createRoot(container).render(
  <React.StrictMode>
    {app}
  </React.StrictMode>,
);
