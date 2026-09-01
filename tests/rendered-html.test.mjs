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
  assert.match(js, /Informe de Inducción de los Procesos Académicos a Docente: Nuevos/);
  assert.match(js, /Informe Final de Acompañamiento-Docente: Nuevos/);
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

test("los criterios CHECK permiten confirmación docente sin autoaprobar", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Sí, ya lo conozco/);
  assert.match(js, /Confirmado por usted/);
  assert.match(js, /Coordinación todavía debe verificarlo/);
  assert.match(js, /teacher_acknowledge_check/);
  assert.match(js, /El docente confirmó este criterio/);
});

test("la creación del proceso valida la fecha contra el período académico", async () => {
  const js = await bundledJavascript();
  assert.match(js, /starts_on/);
  assert.match(js, /ends_on/);
  assert.match(js, /Dentro del período/);
  assert.match(js, /activity_date_outside_period/);
});

test("el portal docente incluye el desglose y carga de evidencias", async () => {
  const js = await bundledJavascript();
  assert.match(js, /Criterios de acompañamiento/);
  assert.match(js, /Pegue aquí su captura/);
  assert.match(js, /Ctrl\+V/);
  assert.match(js, /máximo 3 evidencias/i);
  assert.match(js, /Documentación del docente/);
});

test("los informes siempre permiten generar con información pendiente y existe un solo generador documental", async () => {
  const js = await bundledJavascript();
  const formalSource = await readFile(path.join(root, "app", "formal-report-workspace-v3.tsx"), "utf8");
  const expedientSource = await readFile(path.join(root, "app", "expedient-workspace-v7.tsx"), "utf8");
  const v8Source = await readFile(path.join(root, "app", "expedient-workspace-v8.tsx"), "utf8");
  const mainSource = await readFile(path.join(root, "app", "static-main.tsx"), "utf8");
  assert.match(js, /Generar de todas formas/);
  assert.match(js, /El informe tiene información pendiente/);
  assert.match(js, /puede volver a generarse en cualquier momento/i);
  assert.match(formalSource, /import \{ jsPDF \} from "jspdf"/);
  assert.doesNotMatch(formalSource, /await import\("jspdf"\)/);
  assert.doesNotMatch(expedientSource, /jsPDF|generateReport|ReportsView|Generar los 2 informes|BORRADOR/);
  assert.doesNotMatch(v8Source, /MutationObserver|siacdFormalHidden/);
  assert.match(v8Source, /FormalReportWorkspace/);
  assert.match(mainSource, /vite:preloadError/);
});

test("los informes distinguen avance, cumplimiento y verificación", async () => {
  const js = await bundledJavascript();
  assert.match(js, /AVANCE GENERAL/);
  assert.match(js, /Cumplimiento de los criterios ya evaluados/);
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

test("el encabezado usa identidad institucional, dos informes y códigos por carrera", async () => {
  const js = await bundledJavascript();
  const branding = await readFile(path.join(root, "app", "report-branding.ts"), "utf8");
  const formal = await readFile(path.join(root, "app", "formal-report-workspace-v3.tsx"), "utf8");
  const attendance = await readFile(path.join(root, "app", "monthly-attendance-workspace.tsx"), "utf8");
  assert.match(js, /Coordinación General de Carreras/);
  assert.match(js, /Informe de Inducción de los Procesos Académicos a Docente: Nuevos/);
  assert.match(js, /Informe Final de Acompañamiento-Docente: Nuevos/);
  assert.match(js, /CÓDIGO/);
  assert.match(branding, /Desarrollo de Software/);
  assert.match(branding, /CTSDS/);
  assert.match(branding, /CTSUAEIN/);
  assert.match(branding, /INF-/);
  assert.match(branding, /RGI1-/);
  assert.match(branding, /PRO-121/);
  assert.match(branding, /REPORT_LOGO_DATA_URL/);
  assert.doesNotMatch(branding, /\.\.\.truncated\.\.\./);
  assert.match(formal, /logo-itsqmet\.png/);
  assert.match(attendance, /logo-itsqmet\.png/);
  assert.doesNotMatch(formal, /informe_areas|informe_antes|informe_durante|informe_despues|informe_consolidado/);
});

test("el coordinador puede generar y versionar el registro mensual de asistencia", async () => {
  const js = await bundledJavascript();
  const source = await readFile(path.join(root, "app", "monthly-attendance-workspace.tsx"), "utf8");
  assert.match(js, /Documentación institucional/);
  assert.match(js, /Registro de Asistencia a la Inducción/);
  assert.match(js, /Mes de archivo/);
  assert.match(js, /Generar y guardar registro mensual/);
  assert.match(source, /rowsPerPage = 25/);
  assert.match(source, /induction_attendance_registers/);
  assert.match(source, /induction_attendance_members/);
  assert.match(source, /Cada nueva generación crea una versión/);
});

test("los informes usan Arial en cabecera, título y cuadro de firmas", async () => {
  const js = await bundledJavascript();
  const formal = await readFile(path.join(root, "app", "formal-report-workspace-v3.tsx"), "utf8");
  assert.match(js, /ELABORADO POR:/);
  assert.match(js, /REVISADO POR:/);
  assert.match(js, /APROBADO POR:/);
  assert.match(js, /Ing\. Martha Tomalá/);
  assert.match(js, /Coordinadora General de Carreras/);
  assert.match(js, /Acompañamiento docente/);
  assert.match(js, /CÓDIGO/);
  assert.match(formal, /Arial, sans-serif/);
  assert.match(formal, /drawArialCenteredText\(documentTitle, pageWidth \/ 2, 82, 160, 23/);
  assert.match(formal, /drawArialCenteredText\("Coordinación General de Carreras"/);
  assert.match(formal, /drawArialCenteredText\(item\.heading/);
  assert.doesNotMatch(formal, /coverSubtitle/);
  assert.doesNotMatch(formal, /borrador/i);
});

test("el informe de inducción sigue una arquitectura ejecutiva y deja criterios en anexo", async () => {
  const formal = await readFile(path.join(root, "app", "formal-report-workspace-v3.tsx"), "utf8");
  assert.match(formal, /H1\. Inducción institucional por áreas/);
  assert.match(formal, /H2\. Preparación previa al inicio de la docencia/);
  assert.match(formal, /AVANCE GENERAL/);
  assert.match(formal, /Cumplimiento de los criterios ya evaluados/);
  assert.match(formal, /Estado, calificación y evidencia representan dimensiones diferentes/);
  assert.match(formal, /Hallazgos y acciones pendientes/);
  assert.match(formal, /Anexo de trazabilidad de criterios/);
  assert.match(formal, /mayor número absoluto de criterios pendientes/);
  assert.match(formal, /no constituye un ranking de desempeño/);
  assert.doesNotMatch(formal, /Aspectos por mejorar/);
  assert.doesNotMatch(formal, /mejor desempeño/i);
  assert.doesNotMatch(formal, /principal atención se concentra/i);
  assert.doesNotMatch(formal, /scoreDistributionChart/);
  assert.doesNotMatch(formal, /verifica que verifica/i);

  const closure = formal.indexOf("await drawClosure();");
  const annex = formal.indexOf("drawDetails(rows);", closure);
  assert.ok(closure >= 0 && annex > closure, "El cierre, firmas y QR deben ir antes del anexo de trazabilidad.");
  assert.match(formal, /ensure\(150\)/);
  assert.match(formal, /const signatureTop = y/);
  assert.match(formal, /coverMeta\("Docente"/);
  assert.match(formal, /coverMeta\("Carrera"/);
  assert.match(formal, /coverMeta\("Asignatura"/);
  assert.match(formal, /coverMeta\("Período"/);
  assert.match(formal, /coverMeta\("Modalidad"/);
  assert.match(formal, /const mostPending = components/);
  assert.match(formal, /sort\(\(a, b\) => b\.pending - a\.pending/);
  assert.match(formal, /ensure\(24 \+ rowsData\.length \* rowH \+ 18\)/);
  assert.match(formal, /ensure\(24 \+ data\.length \* 8 \+ 18\)/);
});

