import React from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import "./admin-career-manager.css";
import "./teacher-directory.css";
import AccessLanding from "./access-landing";
import AdminShell from "./admin-shell";
import CoordinatorShell from "./coordinator-shell";
import DocumentVerification from "./document-verification";
import TeacherPortal from "./teacher-portal";
import UiLanguageSanitizer from "./ui-language-sanitizer";

const container = document.getElementById("root");

if (!container) throw new Error("No se encontró el contenedor principal de SIACD");

const pathname = window.location.pathname.toLowerCase();
const app = pathname.includes("/verificar")
  ? <DocumentVerification />
  : pathname.includes("/administrador")
    ? <AdminShell />
    : pathname.includes("/coordinador")
      ? <CoordinatorShell />
      : pathname.includes("/docente")
        ? <TeacherPortal />
        : <AccessLanding />;

createRoot(container).render(
  <React.StrictMode>
    <UiLanguageSanitizer />
    {app}
  </React.StrictMode>,
);
