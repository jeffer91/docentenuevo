$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicación en Cloudflare" -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no está instalado."
}

if (-not (Test-Path ".env.local")) {
    Write-Warning "No existe .env.local. El SIACD se publicará en modo demostración."
    Write-Host "Para usar Supabase, copie .env.example como .env.local y complete las dos variables públicas." -ForegroundColor Yellow
}

Write-Host "1/4 Instalando dependencias..." -ForegroundColor Cyan
npm ci

Write-Host "2/4 Validando el código..." -ForegroundColor Cyan
npm run lint

Write-Host "3/4 Generando el Worker de producción..." -ForegroundColor Cyan
npm run build

Write-Host "4/4 Conectando y publicando en Cloudflare..." -ForegroundColor Cyan
npx wrangler login
npx wrangler deploy --config dist/server/wrangler.json

Write-Host "Publicación completada. Revise arriba la dirección workers.dev asignada por Cloudflare." -ForegroundColor Green
