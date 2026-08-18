import React from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import SiacdApp from "./siacd-app-v2";

const container = document.getElementById("root");

if (!container) throw new Error("No se encontró el contenedor principal de SIACD");

createRoot(container).render(
  <React.StrictMode>
    <SiacdApp />
  </React.StrictMode>,
);
