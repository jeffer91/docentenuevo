$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicación institucional en Cloudflare Pages" -ForegroundColor DarkBlue

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no está instalado."
}

# Configuración pública del proyecto SIACD.
# La clave anon de Supabase está diseñada para usarse en aplicaciones cliente.
$env:VITE_SUPABASE_URL = "https://avctziwwjbljeqmrdkky.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2Y3R6aXd3amJsamVxbXJka2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjQ1NjksImV4cCI6MjEwMjMwMDU2OX0.dp-9rGRJdZ8Agy-8LQydYk7YUlGZhbSNgMq1hwaGMvU"

Write-Host "Supabase configurado automáticamente." -ForegroundColor Green

Write-Host "1/4 Instalando dependencias..." -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw "Falló npm ci." }

Write-Host "2/4 Validando el código..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Falló la validación del código." }

Write-Host "3/4 Generando la aplicación de producción..." -ForegroundColor Cyan
npm run build:pages
if ($LASTEXITCODE -ne 0) { throw "Falló la compilación de producción." }

Write-Host "4/4 Publicando en Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloudflare requiere iniciar sesión una sola vez..." -ForegroundColor Yellow
    npx wrangler login
    if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesión en Cloudflare." }
}

npx wrangler pages deploy .\pages-dist --project-name docentenuevo --branch main
if ($LASTEXITCODE -ne 0) { throw "Falló la publicación en Cloudflare Pages." }

Write-Host "Publicación completada. El SIACD quedó conectado a Supabase." -ForegroundColor Green
