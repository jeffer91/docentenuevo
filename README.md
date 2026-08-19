# SIACD · Acompañamiento Docente

Aplicación web institucional para gestionar el expediente completo de acompañamiento a docentes nuevos: registro, cronograma H1–H6, evaluación, seguimiento, plan de mejora, evidencias, documentos y certificación.

## Accesos

- **Coordinador:** acceso directo por `/coordinador/`. Selecciona su nombre y ve únicamente las carreras y docentes que tiene asignados.
- **Administrador:** acceso por `/administrador/` con clave institucional. Gestiona coordinadores, carreras, docentes, estadísticas y catálogos.
- **Aprobador:** estructura preparada para una fase posterior, actualmente no expuesta en la interfaz.

## Asignación de carreras

La creación o edición de un coordinador administra únicamente su nombre y estado. La asignación de carreras se realiza desde **Asignación de carreras** mediante dos tablas: carreras disponibles y carreras asignadas al coordinador seleccionado.

Una carrera institucional solo puede pertenecer a un coordinador a la vez. Al asignarla desaparece de disponibles; al quitarla vuelve a estar disponible.

## Directorio de docentes

SIACD vincula los docentes por cédula con Firebase Realtime Database, proyecto `repaso-fire-d8ceb`, nodo `docentes-registrados`.

- La cédula se normaliza a 10 dígitos. Si llega con 9, se antepone `0`.
- SIACD advierte si el dígito verificador no coincide, pero no bloquea el registro.
- Al registrar un docente se consulta Firebase y Supabase; cuando existen datos en ambos, se toma como base el registro actualizado más recientemente.
- Un docente se conserva una sola vez en `public.teachers` mediante `national_id` único y puede tener varios expedientes.
- Firebase conserva `cedula`, `nombresCompletos`, `actualizadoEn` y un nodo `carreras` con una o varias carreras.
- Los coordinadores pueden actualizar los docentes visibles dentro de sus carreras; el administrador puede actualizar todos.
- Si Firebase no puede sincronizarse después de crear un expediente, el expediente de Supabase permanece guardado y el sistema informa la incidencia.

Firebase funciona como directorio compartido de personas; Supabase continúa siendo la fuente del expediente SIACD, H1–H6, evaluaciones, evidencias, documentos y certificación.

## Expediente docente

Cada expediente concentra:

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
- Supabase Postgres y Storage.
- Firebase Realtime Database para el directorio compartido de docentes.
- Vite para el artefacto estático publicado en Cloudflare Pages.
- `app/static-main.tsx` es la entrada del build de Cloudflare y reutiliza los mismos componentes de acceso y administración que la ruta Next.

La publicación institucional se realiza con:

```powershell
powershell -ExecutionPolicy Bypass -File .\PUBLICAR_EN_CLOUDFLARE.ps1
```

El script instala dependencias, exige una validación ESLint sin advertencias, genera `pages-dist` y publica en el proyecto Cloudflare Pages `docentenuevo`.

## Base de datos

Las migraciones oficiales están en `supabase/migrations/`. Las más recientes incorporan:

- personal SIACD y asignación de carreras;
- expediente integral H1–H6;
- matriz complementaria, calidad, evidencias y documentos;
- restricción para impedir que una carrera se asigne a más de un coordinador;
- cédula única `national_id` para vincular el docente de Supabase con Firebase.

## Estructura principal

```text
app/
  administrador/              Ruta Next del administrador
  coordinador/                Ruta Next del coordinador
  admin-shell.tsx             Acceso del administrador
  admin-career-manager.tsx    Asignación de carreras
  teacher-registration-modal.tsx
  teacher-master-modal.tsx
  lib/teacher-directory.ts    Lectura/escritura del nodo Firebase
  siacd-app-v3.tsx            Aplicación principal
  expedient-workspace.tsx
  expedient-finalization.tsx
  static-main.tsx             Entrada real del build estático Cloudflare
pages/                        Entradas HTML para Vite
supabase/migrations/          Esquema y evolución de la base de datos
```

`siacd-app-v2.tsx` se conserva únicamente como referencia histórica y no participa en la aplicación activa ni en la validación.
