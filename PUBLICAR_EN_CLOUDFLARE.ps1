$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicacion institucional en Cloudflare Pages" -ForegroundColor DarkBlue

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no esta instalado."
}

$env:VITE_SUPABASE_URL = "https://avctziwwjbljeqmrdkky.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2Y3R6aXd3amJsamVxbXJka2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjQ1NjksImV4cCI6MjEwMjMwMDU2OX0.dp-9rGRJdZ8Agy-8LQydYk7YUlGZhbSNgMq1hwaGMvU"

Write-Host "Supabase configurado automaticamente." -ForegroundColor Green

Write-Host "1/4 Sincronizando dependencias..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Fallo la instalacion de dependencias." }

Write-Host "2/4 Validando el codigo..." -ForegroundColor Cyan
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern pages-dist --max-warnings 0
if ($LASTEXITCODE -ne 0) { throw "Fallo la validacion del codigo." }

Write-Host "3/4 Generando la aplicacion de produccion..." -ForegroundColor Cyan
npm run build:pages
if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de produccion." }

Write-Host "4/4 Publicando en Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloudflare requiere iniciar sesion una sola vez..." -ForegroundColor Yellow
    npx wrangler login
    if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesion en Cloudflare." }
}

npx wrangler pages deploy .\pages-dist --project-name docentenuevo --branch main
if ($LASTEXITCODE -ne 0) { throw "Fallo la publicacion en Cloudflare Pages." }

Write-Host "Publicacion completada. El SIACD quedo conectado a Supabase." -ForegroundColor Green
