"use client";

import { useEffect } from "react";

const replacements: Array<[RegExp, string]> = [
  [/\bH1\s*[·:-]?\s*/g, "Áreas · "],
  [/\bH2\s*[·:-]?\s*/g, "Antes · "],
  [/\bH3\s*[·:-]?\s*/g, "Durante · "],
  [/\bH4\s*[·:-]?\s*/g, "Durante · "],
  [/\bH5\s*[·:-]?\s*/g, "Durante · "],
  [/\bH6\s*[·:-]?\s*/g, "Después · "],
];

function sanitizeTextNode(node: Text) {
  const original = node.nodeValue ?? "";
  let next = original;
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement);
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
 * Los códigos H1–H6 siguen existiendo como claves técnicas internas, pero no
 * forman parte del lenguaje funcional que ve el usuario.
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
