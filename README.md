# SIACD · Acompañamiento Docente

Aplicación web institucional para gestionar el expediente completo de acompañamiento a docentes nuevos: registro, cronograma H1–H6, evaluación, seguimiento, plan de mejora, evidencias, documentos y certificación.

## Accesos

- **Coordinador:** `/coordinador/`. Selecciona su nombre y ve únicamente las carreras y docentes que tiene asignados.
- **Administrador:** `/administrador/` con clave institucional. Gestiona coordinadores, carreras, docentes, estadísticas y catálogos.
- **Docente:** `/docente/`. Accede con correo y código de 4 dígitos la primera vez; el dispositivo queda recordado mientras la sesión sea válida.
- **Aprobador:** estructura preparada para una fase posterior, actualmente no expuesta en la interfaz.

## Organización del acompañamiento

Los seis hitos institucionales se conservan sin alterar sus criterios ni sus pesos. SIACD ahora los organiza en tres momentos:

- **Antes:** H1 Inducción + H2 Preparación.
- **Durante:** H3 Inicio de docencia + H4 Seguimiento 1 + H5 Seguimiento 2 + Calidad.
- **Después:** H6 Cierre + validaciones finales + documentos + certificación.

El expediente principal se presenta como **Resumen | Antes | Durante | Después | Historial**. El Historial concentra cronograma, bitácora, plan de mejora y evidencias, evitando una navegación principal con demasiadas pestañas.

La columna `phase` de `hito_definitions` guarda esta clasificación sin reemplazar el campo `moment`, que conserva el momento institucional detallado de cada hito.

## Revisión repetible

El Bloque 1 dejó preparada la estructura para ciclos de revisión sin sobrescribir resultados anteriores. Los futuros ciclos pueden conservar revisión 1, corrección, revisión 2, etc., mientras `competency_scores` mantiene el estado vigente del expediente.

## Asignación de carreras

La creación o edición de un coordinador administra únicamente su nombre y estado. La asignación de carreras se realiza desde **Asignación de carreras** mediante carreras disponibles y carreras asignadas.

Una carrera institucional solo puede pertenecer a un coordinador a la vez.

## Directorio de docentes

SIACD vincula los docentes por cédula con Firebase Realtime Database, proyecto `repaso-fire-d8ceb`, nodo `docentes-registrados`.

- La cédula se normaliza a 10 dígitos. Si llega con 9, se antepone `0`.
- SIACD advierte si el dígito verificador no coincide, pero no bloquea el registro.
- Al registrar un docente se consulta Firebase y Supabase; cuando existen datos en ambos, se toma como base el registro actualizado más recientemente.
- Un docente se conserva una sola vez en `public.teachers` mediante `national_id` único y puede tener varios expedientes.
- Firebase conserva datos básicos, varias carreras y múltiples roles.
- Supabase continúa siendo la fuente del expediente SIACD, H1–H6, evaluaciones, evidencias, documentos y certificación.

## Expediente docente

Cada expediente conserva:

- ficha del docente;
- cronograma H1–H6;
- 75 criterios operativos;
- bitácora de seguimiento;
- plan de mejora;
- 17 criterios complementarios;
- 21 criterios de calidad;
- evidencias;
- generación documental y certificación.

El resultado integrado utiliza 60% del componente operativo, 15% de la matriz complementaria y 25% de calidad.

## Tecnología y publicación

- React 19 y TypeScript.
- Supabase Postgres, Storage y Edge Functions.
- Firebase Realtime Database para el directorio compartido.
- Vite para el artefacto estático publicado en Cloudflare Pages.

La publicación institucional se realiza con:

```powershell
powershell -ExecutionPolicy Bypass -File .\PUBLICAR_EN_CLOUDFLARE.ps1
```

## Base de datos

Las migraciones oficiales están en `supabase/migrations/`. Las más recientes incorporan:

- personal SIACD y asignación de carreras;
- expediente integral H1–H6;
- matriz complementaria, calidad, evidencias y documentos;
- una carrera por coordinador;
- cédula única para vincular Supabase con Firebase;
- acceso docente y estructura de ciclos de revisión;
- clasificación de H1–H6 en Antes, Durante y Después.

## Estructura principal

```text
app/
  administrador/
  coordinador/
  docente/
  admin-shell.tsx
  admin-career-manager.tsx
  teacher-portal.tsx
  teacher-registration-modal.tsx
  teacher-master-modal.tsx
  expedient-workspace.tsx          Entrada activa del expediente
  expedient-workspace-v4.tsx       Organización Antes/Durante/Después
  expedient-finalization.tsx
  lib/teacher-directory.ts
  static-main.tsx
pages/
supabase/migrations/
supabase/functions/
```

`siacd-app-v2.tsx` se conserva únicamente como referencia histórica y no participa en la aplicación activa.
