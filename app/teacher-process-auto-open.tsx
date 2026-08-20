"use client";

import { useEffect } from "react";

/**
 * El docente entra directamente al desglose operativo. La pantalla de Inicio
 * sigue disponible en la navegación, pero deja de ocultar el cargador de
 * evidencias tras autenticarse.
 */
export default function TeacherProcessAutoOpen() {
  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const button = Array.from(document.querySelectorAll("button"))
        .find((item) => item.textContent?.trim() === "Mi proceso") as HTMLButtonElement | undefined;
      if (button) {
        button.click();
        window.clearInterval(timer);
      } else if (attempts >= 40) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
