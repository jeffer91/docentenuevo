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

test("genera los accesos públicos y la verificación documental", async () => {
  const routes = ["index.html", "docente/index.html", "coordinador/index.html", "administrador/index.html", "verificar/index.html"];
  for (const route of routes) {
    const html = await read(route);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<script[^>]+type="module"/);
  }
});

test("el build publica una huella de versión verificable", async () => {
  const version = JSON.parse(await read("version.json"));
  assert.equal(version.app, "SIACD");
  assert.match(version.commit, /^(?:[0-9a-f]{7}|unknown)$/i);
  assert.equal(typeof version.built_at, "string");
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

test("un docente sin expediente puede crear su proceso desde el portal", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Seleccione su carrera/);
  assert.match(js, /Complete los datos de su proceso/);
  assert.match(js, /Crear proceso e ingresar/);
  assert.match(js, /Cambiar carrera/);
  assert.match(js, /teacher_create_process_from_onboarding/);
  assert.match(js, /teacher_set_onboarding_career/);
  assert.match(js, /Coordinador responsable/);
});

test("el primer registro docente empieza por la carrera y la vincula a coordinación", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Seleccione su carrera/);
  assert.match(js, /Carrera principal para este acompañamiento/);
  assert.match(js, /Coordinador responsable/);
  assert.match(js, /teacher_onboarding_assignments/);
  assert.match(js, /Preasignados desde el portal docente/);
});

test("el portal docente incluye el desglose y carga de evidencias", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Criterios de acompañamiento/);
  assert.match(js, /Pegue aquí su captura/);
  assert.match(js, /Ctrl\+V/);
  assert.match(js, /máximo 3 evidencias/i);
  assert.match(js, /Informes de acompañamiento/);
});

test("los informes distinguen avance, cumplimiento y verificación", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Avance de evaluación/);
  assert.match(js, /Cumplimiento evaluado/);
  assert.match(js, /Sin evaluación/);
  assert.match(js, /Verificación de documento/);
  assert.match(js, /Corregido \/ reenviado/);
});

test("el flujo legado de seis hitos no forma parte de la interfaz publicada", async () => {
  const js = await bundledJavascript();
  assert.doesNotMatch(js, /Mi proceso completo/);
  assert.doesNotMatch(js, /0\/6 hitos validados/);
  assert.doesNotMatch(js, /H4 · Seguimiento 1/);
});

test("el acceso de coordinadores es directo por selección de nombre", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Acceso de coordinadores/);
  assert.match(js, /Ingreso directo/);
  assert.match(js, /Seleccione su nombre para continuar/);
  assert.doesNotMatch(js, /Crear PIN e ingresar/);
  assert.doesNotMatch(js, /Confirmar PIN/);
  assert.doesNotMatch(js, /PIN coordinadores/);
});

test("los informes usan portada institucional y firmas ancladas", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Coordinador\(a\) General de Carreras/);
  assert.match(js, /DOCUMENTO OFICIAL/);
  assert.match(js, /Datos del documento/);
  assert.match(js, /Acompañamiento docente/);
  assert.match(js, /VERIFICACIÓN/);
  assert.match(js, /criterios de presentación APA 7/);
});
