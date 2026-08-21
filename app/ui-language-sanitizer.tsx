"use client";

import { useEffect } from "react";

const exactLabels: Record<string, string> = {
  H1: "Áreas",
  H2: "Antes",
  H3: "Durante",
  H4: "Durante",
  H5: "Durante",
  H6: "Después",
  "Sin evidencia": "Pendiente de evidencia",
  "Pendiente de evidencia": "Pendiente de evidencia",
  "Por revisar": "En revisión",
  "Enviado · revisar": "En revisión",
  "Enviado · pendiente de revisión": "En revisión",
  "Requiere corrección": "Por corregir",
  "Corregir": "Por corregir",
  "No aplica aprobado": "No aplica",
};

const decoratedReplacements: Array<[RegExp, string]> = [
  [/\bH1\s+[·:-]\s+/g, "Áreas · "],
  [/\bH2\s+[·:-]\s+/g, "Antes · "],
  [/\bH3\s+[·:-]\s+/g, "Durante · "],
  [/\bH4\s+[·:-]\s+/g, "Durante · "],
  [/\bH5\s+[·:-]\s+/g, "Durante · "],
  [/\bH6\s+[·:-]\s+/g, "Después · "],
];

function sanitizeTextNode(node: Text) {
  const original = node.nodeValue ?? "";
  const trimmed = original.trim();
  const exact = exactLabels[trimmed];
  let next = original;

  if (exact) {
    const start = original.indexOf(trimmed);
    next = `${original.slice(0, start)}${exact}${original.slice(start + trimmed.length)}`;
  } else {
    for (const [pattern, replacement] of decoratedReplacements) next = next.replace(pattern, replacement);
  }

  if (next !== original) node.nodeValue = next;
}

function sanitize(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    sanitizeTextNode(root as Text);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    sanitizeTextNode(node as Text);
    node = walker.nextNode();
  }
}

/**
 * Mantiene una sola terminología visible en SIACD. Los códigos H1–H6 y los
 * nombres técnicos de estado siguen existiendo internamente para no alterar
 * la base de datos ni el flujo de evaluación.
 */
export default function UiLanguageSanitizer() {
  useEffect(() => {
    sanitize(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") sanitize(mutation.target);
        for (const node of mutation.addedNodes) sanitize(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}