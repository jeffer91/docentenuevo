$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicación institucional en Cloudflare Pages" -ForegroundColor DarkBlue

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no está instalado."
}

if (-not $env:VITE_SUPABASE_URL) {
    $env:VITE_SUPABASE_URL = Read-Host "Pegue VITE_SUPABASE_URL"
}

if (-not $env:VITE_SUPABASE_PUBLISHABLE_KEY) {
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = Read-Host "Pegue VITE_SUPABASE_PUBLISHABLE_KEY"
}

if (-not $env:VITE_SUPABASE_URL -or -not $env:VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw "Supabase es obligatorio. La versión de demostración está deshabilitada."
}

Write-Host "1/4 Instalando dependencias..." -ForegroundColor Cyan
npm ci

Write-Host "2/4 Validando el código..." -ForegroundColor Cyan
npm run lint

Write-Host "3/4 Generando la aplicación de producción..." -ForegroundColor Cyan
npm run build:pages

Write-Host "4/4 Conectando y publicando en Cloudflare Pages..." -ForegroundColor Cyan
npx wrangler login
npx wrangler pages deploy .\pages-dist --project-name docentenuevo --branch main

Write-Host "Publicación completada. El SIACD quedó conectado a Supabase." -ForegroundColor Green
