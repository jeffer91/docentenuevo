import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "pages-dist");

async function read(relativePath) {
  return readFile(path.join(dist, relativePath), "utf8");
}

async function bundledJavascript() {
  const assets = path.join(dist, "assets");
  const names = await readdir(assets);
  const jsFiles = names.filter((name) => name.endsWith(".js"));
  return (await Promise.all(jsFiles.map((name) => readFile(path.join(assets, name), "utf8")))).join("\n");
}

test("genera los cuatro accesos públicos", async () => {
  const routes = ["index.html", "docente/index.html", "coordinador/index.html", "administrador/index.html"];
  for (const route of routes) {
    const html = await read(route);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<script[^>]+type="module"/);
  }
});

test("la portada general expone los tres perfiles", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Acceso Docentes/);
  assert.match(js, /Acceso Coordinadores/);
  assert.match(js, /Acceso Administrador/);
});

test("el bundle contiene la organización vigente", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Áreas/);
  assert.match(js, /Antes/);
  assert.match(js, /Durante/);
  assert.match(js, /Después/);
  assert.match(js, /Informe Consolidado/);
});
