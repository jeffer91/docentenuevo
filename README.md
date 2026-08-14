# SIACD · Acompañamiento Docente

Aplicación web para gestionar el expediente completo de acompañamiento a docentes nuevos: registro, hitos H1–H6, evaluaciones, evidencias, seguimiento, aprobación, certificación y respaldos PDF/Excel.

## Roles

- **Coordinador de Carrera:** ejecuta toda la operación del acompañamiento y envía el expediente a aprobación.
- **Autoridad aprobadora:** revisa, devuelve u aprueba expedientes y habilita certificados.
- **Administrador:** gestiona usuarios, carreras, períodos, criterios y configuración institucional.

## Tecnología

- React 19, Next.js/Vinext y TypeScript.
- Supabase Auth, Postgres, Row Level Security y Storage privado.
- Frontend publicable en GitHub Pages.

## Configuración local

1. Instale Node.js 22 o superior.
2. Ejecute `npm ci`.
3. Copie `.env.example` como `.env.local` y complete las variables públicas de Supabase.
4. Ejecute `npm run dev`.

El modo demostración está deshabilitado. La aplicación solo permite iniciar sesión cuando las variables de Supabase están configuradas y utiliza exclusivamente datos institucionales persistidos. Los roles se obtienen del perfil autenticado.

## Base de datos

La migración inicial está en `supabase/migrations/202608130001_initial_siacd.sql`. Incluye tablas, índices, políticas RLS, reglas de acceso por rol y el bucket privado `siacd-evidence`.

Las funciones del navegador solo utilizan la clave publicable de Supabase. Nunca incluya una clave secreta o `service_role` en variables públicas.

## Comandos

```bash
npm run dev          # desarrollo
npm run lint         # calidad de código
npm run build        # artefacto de producción
npm run build:pages  # frontend estático para GitHub Pages
npm test             # compilación y prueba del HTML renderizado
```

## GitHub Pages

El flujo `.github/workflows/pages.yml` compila y publica `pages-dist`. Configure `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como secretos de GitHub Actions. El repositorio no contiene credenciales ni datos docentes.
