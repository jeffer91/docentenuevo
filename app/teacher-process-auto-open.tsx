"use client";

import { useEffect } from "react";

/**
 * El docente entra directamente al desglose operativo. Esperamos a que el
 * detalle asíncrono termine de renderizar en vez de depender de 4 segundos
 * fijos; luego dejamos de observar para no interferir con la navegación.
 */
export default function TeacherProcessAutoOpen() {
  useEffect(() => {
    let finished = false;
    let observer: MutationObserver | null = null;

    const openProcess = () => {
      if (finished) return true;
      const button = Array.from(document.querySelectorAll("button"))
        .find((item) => item.textContent?.trim() === "Mi proceso") as HTMLButtonElement | undefined;
      if (!button) return false;
      finished = true;
      button.click();
      observer?.disconnect();
      return true;
    };

    if (!openProcess()) {
      observer = new MutationObserver(() => { void openProcess(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const timeout = window.setTimeout(() => {
      finished = true;
      observer?.disconnect();
    }, 15000);

    return () => {
      finished = true;
      window.clearTimeout(timeout);
      observer?.disconnect();
    };
  }, []);

  return null;
}
