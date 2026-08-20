$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicacion institucional en Cloudflare Pages" -ForegroundColor DarkBlue

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no esta instalado."
}

# La URL y la publishable key son configuracion publica del cliente. Se respetan
# variables existentes para poder cambiar de proyecto sin editar el script.
if (-not $env:VITE_SUPABASE_URL) {
    $env:VITE_SUPABASE_URL = "https://avctziwwjbljeqmrdkky.supabase.co"
}
if (-not $env:VITE_SUPABASE_PUBLISHABLE_KEY) {
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2Y3R6aXd3amJsamVxbXJka2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjQ1NjksImV4cCI6MjEwMjMwMDU2OX0.dp-9rGRJdZ8Agy-8LQydYk7YUlGZhbSNgMq1hwaGMvU"
}

Write-Host "Supabase configurado." -ForegroundColor Green

Write-Host "1/5 Instalando dependencias exactas..." -ForegroundColor Cyan
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Fallo la instalacion de dependencias." }

Write-Host "2/5 Validando el codigo..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Fallo la validacion del codigo." }

Write-Host "3/5 Generando la aplicacion estatica..." -ForegroundColor Cyan
npm run build:pages
if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de produccion." }

Write-Host "4/5 Ejecutando pruebas del artefacto..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "Las pruebas del artefacto fallaron. No se publicara." }

Write-Host "5/5 Publicando en Cloudflare Pages..." -ForegroundColor Cyan
npx --no-install wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloudflare requiere iniciar sesion una sola vez..." -ForegroundColor Yellow
    npx --no-install wrangler login
    if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesion en Cloudflare." }
}

npx --no-install wrangler pages deploy .\pages-dist --project-name docentenuevo --branch main
if ($LASTEXITCODE -ne 0) { throw "Fallo la publicacion en Cloudflare Pages." }

Write-Host "Publicacion completada. SIACD quedo validado y conectado a Supabase." -ForegroundColor Green
