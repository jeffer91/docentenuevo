# SIACD · Acompañamiento Docente

Aplicación web institucional para gestionar el acompañamiento de docentes nuevos: inducción por áreas, preparación previa, seguimiento durante la docencia, cierre, evidencias, revisiones e informes PDF.

## Accesos públicos

La portada general `/` presenta tres accesos independientes:

- **Docentes:** `/docente/`. Primer ingreso y accesos posteriores mediante cédula + PIN; la sesión queda asociada al dispositivo y se revoca al cerrar sesión.
- **Coordinadores:** `/coordinador/`. Visualiza las carreras y expedientes vinculados al coordinador seleccionado.
- **Administrador:** `/administrador/`. Gestiona coordinadores, carreras, docentes, expedientes, estadísticas y catálogos.

## Modelo operativo vigente

La fuente operativa actual es `public.competency_definitions` con **129 criterios activos** organizados en cuatro etapas:

- **Áreas:** H1. Talento, Software, Calidad y Bienestar Estudiantil.
- **Antes:** H2. Coordinador, Teams, Telegram, PEA, Adaptaciones, EVA y SISACAD.
- **Durante:** H3 + H4 + H5. General, Adaptaciones, Presentaciones, Unidades 1–4 y Observación de clase.
- **Después:** H6. Cierre, supletorios e informes finales.

H1–H6 se conservan como claves técnicas de compatibilidad. La interfaz institucional trabaja con **Áreas → Antes → Durante → Después**.

El avance se calcula con criterios resueltos. Un criterio marcado **No aplica** cuenta como resuelto para el avance y no interviene en el porcentaje de cumplimiento. El cumplimiento se calcula únicamente con criterios evaluados aplicables.

Los 75 criterios del catálogo anterior permanecen inactivos para preservar trazabilidad; no forman parte del cálculo vigente.

## Revisiones

`competency_scores` conserva el estado vigente de los 129 criterios y `review_cycles` / `review_results` mantienen revisiones repetibles sin sobrescribir ciclos anteriores.

Las revisiones creadas con catálogos anteriores permanecen visibles como **históricas**, pero no alteran el último resultado, la tendencia ni los indicadores del modelo activo.

## Informes PDF

Cada expediente genera cinco documentos:

1. Informe de Áreas.
2. Informe Antes.
3. Informe Durante.
4. Informe Después.
5. Informe Consolidado.

Un informe de etapa se identifica como **BORRADOR** mientras su etapa tenga criterios pendientes. El Consolidado es borrador mientras exista cualquier etapa incompleta. Los documentos pueden registrarse en `generated_documents`, con versión, código de verificación y archivo en Supabase Storage.

## Evidencias

El coordinador/administrador trabaja con el expediente institucional y el docente dispone de un flujo específico de evidencias solicitadas. Los buckets actuales son privados y separan archivos generales del expediente y entregas del portal docente.

## Datos del docente

Supabase es la fuente del expediente institucional. `public.teachers` conserva la identidad del docente y un mismo docente puede tener varios expedientes por carrera, asignatura o período.

Firebase Realtime Database se mantiene como directorio compartido/auxiliar para precarga y sincronización de información común. La cédula se normaliza a 10 dígitos y es la clave principal para reconciliar la identidad entre ambos orígenes.

## Tecnología

La aplicación publicada es un artefacto estático construido con:

- React 19 + TypeScript.
- Vite.
- Supabase Postgres, RPC/Edge Functions y Storage.
- Firebase Realtime Database como directorio auxiliar.
- jsPDF para informes.
- Cloudflare Pages para publicación institucional.

El runtime de producción no depende de Next App Router, Vinext, D1 ni Drizzle.

## Desarrollo y validación

```bash
npm ci
npm run dev
npm run lint
npm run build:pages
npm test
```

Los smoke tests verifican que el artefacto generado contenga las cuatro rutas públicas, los tres accesos de la portada y la organización Áreas/Antes/Durante/Después.

GitHub Actions valida los cambios y `main`; no realiza un segundo despliegue público. La publicación institucional se hace en Cloudflare Pages.

## Publicación

En Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\PUBLICAR_EN_CLOUDFLARE.ps1
```

El script usa `npm ci`, valida lint, genera `pages-dist`, ejecuta las pruebas y solo entonces publica en el proyecto Cloudflare Pages `docentenuevo`.

## Base de datos

Las migraciones oficiales están en `supabase/migrations/`. Las principales de la organización actual son:

```text
20260820110000_new_accompaniment_structure.sql
20260820111500_teacher_portal_areas.sql
20260820112000_dynamic_accompaniment_progress.sql
20260820170000_unify_active_model.sql
20260820190000_separate_current_and_historical_reviews.sql
```

El historial de migraciones no debe reescribirse. Las correcciones nuevas se realizan mediante migraciones adicionales.

## Estructura activa

```text
app/
  access-landing.tsx
  static-main.tsx
  siacd-app-v3.tsx
  siacd-app-v6.tsx
  admin-shell.tsx
  expedient-workspace.tsx
  expedient-workspace-v5.tsx
  expedient-workspace-v6.tsx
  review-cycle-workspace.tsx
  evidence-review-workspace.tsx
  teacher-portal.tsx
  teacher-process-portal.tsx
  lib/
pages/
  index.html
  docente/index.html
  coordinador/index.html
  administrador/index.html
supabase/
  functions/
  migrations/
```

Las versiones que ya no participaban en el runtime y los archivos del starter (Next/Vinext/D1/Drizzle) fueron retirados del árbol fuente para evitar mantener arquitecturas paralelas.
