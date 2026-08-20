# SIACD · Acompañamiento Docente

Aplicación web institucional para gestionar el acompañamiento completo a docentes nuevos: inducción por áreas, preparación previa, seguimiento durante la docencia, cierre, evidencias, revisiones e informes PDF.

## Accesos

- **Coordinador:** `/coordinador/`. Selecciona su nombre y ve únicamente las carreras y docentes que tiene asignados.
- **Administrador:** `/administrador/` con clave institucional. Gestiona coordinadores, carreras, docentes, estadísticas y catálogos.
- **Docente:** `/docente/`. Accede con correo/cédula según el flujo vigente y mantiene su sesión de dispositivo mientras sea válida.
- **Aprobador:** estructura preparada para una fase posterior, actualmente no expuesta como acceso principal.

## Organización del acompañamiento

La navegación operativa del expediente es:

**Resumen | Áreas | Antes | Durante | Después | Informes | Historial**

Los H1–H6 se conservan únicamente como claves técnicas para mantener compatibilidad con los expedientes y tablas existentes:

- **Áreas:** H1. Inducción institucional por Talento, Software, Calidad y Bienestar Estudiantil.
- **Antes:** H2. Preparación del docente antes del inicio de la asignatura.
- **Durante:** H3 + H4 + H5. Seguimiento general, adaptaciones, presentaciones, Unidades 1–4 y observación de clase.
- **Después:** H6. Supletorios e informes finales.

El avance y el cumplimiento se calculan de forma dinámica a partir de los criterios activos. Los criterios marcados como **No aplica** cuentan como resueltos para el avance, pero no afectan el porcentaje de cumplimiento.

## Catálogo institucional vigente

La migración `20260820110000_new_accompaniment_structure.sql` carga el catálogo derivado de `organización(2).xlsx` y corrige redacción y duplicaciones funcionales.

El catálogo vigente contiene 129 criterios distribuidos entre:

- Áreas: Talento, Software, Calidad y Bienestar Estudiantil.
- Antes: Coordinador, Teams, Telegram, PEA, Adaptaciones, EVA y SISACAD.
- Durante: General, Adaptaciones, Presentaciones, Unidad 1, Unidad 2, Unidad 3, Unidad 4 y Observación de clase.
- Después: Cierre.

El catálogo anterior no se elimina: queda inactivo para preservar trazabilidad histórica.

## Informes PDF

Cada expediente puede generar cinco informes oficiales:

1. **Informe de Áreas**.
2. **Informe Antes**.
3. **Informe Durante**.
4. **Informe Después**.
5. **Informe Consolidado**.

Los cuatro informes de etapa contienen el detalle de sus criterios, evaluaciones y observaciones. El consolidado presenta el resultado global, estado de cada etapa, brechas y narrativas de fortalezas/conclusiones cuando existen.

Si aún existen criterios pendientes, el consolidado se genera identificado como **BORRADOR**. Los documentos se descargan en PDF y, cuando Supabase Storage está disponible, quedan registrados en `generated_documents` con código de verificación y versión visible en el nombre/observación.

## Revisión repetible

Las revisiones continúan funcionando como ciclos independientes, sin sobrescribir resultados anteriores. `competency_scores` conserva el estado vigente y el módulo de Revisiones conserva el historial de revisiones/correcciones.

## Evidencias

Las evidencias permanecen almacenadas en Supabase Storage y vinculadas al expediente/H1–H6. Como H1–H6 ahora representan las cuatro etapas funcionales, las evidencias se contabilizan automáticamente en Áreas, Antes, Durante o Después.

## Directorio de docentes

SIACD vincula docentes por cédula con Firebase Realtime Database y utiliza Supabase como fuente del expediente institucional.

- La cédula se normaliza a 10 dígitos.
- Un docente se conserva una sola vez en `public.teachers` mediante `national_id` único y puede tener varios expedientes.
- Firebase conserva información compartida del directorio.
- Supabase conserva expedientes, evaluaciones, revisiones, evidencias y documentos.

## Tecnología y publicación

- React 19 y TypeScript.
- Supabase Postgres y Storage.
- Firebase Realtime Database para el directorio compartido.
- Vite para el artefacto estático publicado.
- jsPDF para los cinco informes PDF.

La publicación institucional se realiza con:

```powershell
powershell -ExecutionPolicy Bypass -File .\PUBLICAR_EN_CLOUDFLARE.ps1
```

## Base de datos

Las migraciones oficiales están en `supabase/migrations/`.

Para habilitar la nueva organización es indispensable aplicar:

```text
20260820110000_new_accompaniment_structure.sql
```

Esta migración:

- agrega la fase `areas`;
- reclasifica H1–H6;
- conserva el catálogo anterior como inactivo;
- carga los 129 criterios de la nueva organización;
- mantiene los seis hitos técnicos en expedientes ya existentes.

## Estructura principal

```text
app/
  administrador/
  coordinador/
  docente/
  expedient-workspace.tsx          Entrada activa
  expedient-workspace-v5.tsx       Integra expediente + Revisiones
  expedient-workspace-v6.tsx       Nueva organización y 5 informes PDF
  expedient-workspace-v6.module.css
  review-cycle-workspace.tsx
  evidence-review-workspace.tsx
  teacher-portal.tsx
  lib/
supabase/migrations/
```

Las versiones anteriores del expediente se conservan como referencia histórica y compatibilidad, pero la entrada activa utiliza V6 a través de V5.
