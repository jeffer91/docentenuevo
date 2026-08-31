$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "SIACD - Publicacion institucional en Cloudflare Pages" -ForegroundColor DarkBlue

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git no esta instalado o no esta disponible en PATH."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 o superior no esta instalado."
}

Write-Host "0/6 Verificando que se publicara exactamente el main vigente..." -ForegroundColor Cyan
$inside = (git rev-parse --is-inside-work-tree 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $inside -ne "true") {
    throw "Esta carpeta no es un repositorio Git valido."
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "main") {
    throw "La publicacion institucional solo se permite desde la rama main. Rama actual: $branch"
}

git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar origin/main." }

$localCommit = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
$shortCommit = (git rev-parse --short HEAD).Trim()
if ($localCommit -ne $remoteCommit) {
    $localShort = (git rev-parse --short HEAD).Trim()
    $remoteShort = (git rev-parse --short origin/main).Trim()
    throw "La copia local esta desactualizada (local $localShort / origin main $remoteShort). No se publicara codigo antiguo. Ejecute: git stash push -u -m 'respaldo-local'; git pull --ff-only origin main"
}

$dirty = @(git status --porcelain --untracked-files=normal)
if ($dirty.Count -gt 0) {
    Write-Host "Cambios locales detectados:" -ForegroundColor Yellow
    $dirty | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    throw "La carpeta debe estar limpia antes de publicar. Guarde o respalde esos cambios y vuelva a ejecutar el script."
}

Write-Host "Version verificada: $shortCommit" -ForegroundColor Green

# La URL y la publishable key son configuracion publica del cliente. Se respetan
# variables existentes para poder cambiar de proyecto sin editar el script.
if (-not $env:VITE_SUPABASE_URL) {
    $env:VITE_SUPABASE_URL = "https://avctziwwjbljeqmrdkky.supabase.co"
}
if (-not $env:VITE_SUPABASE_PUBLISHABLE_KEY) {
    $env:VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2Y3R6aXd3amJsamVxbXJka2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjQ1NjksImV4cCI6MjEwMjMwMDU2OX0.dp-9rGRJdZ8Agy-8LQydYk7YUlGZhbSNgMq1hwaGMvU"
}

Write-Host "Supabase configurado." -ForegroundColor Green

Write-Host "0.5/6 Verificando esquema requerido para preasignacion docente..." -ForegroundColor Cyan
try {
    $schemaHeaders = @{ "apikey" = $env:VITE_SUPABASE_PUBLISHABLE_KEY }
    Invoke-RestMethod -Uri "$($env:VITE_SUPABASE_URL)/rest/v1/teacher_onboarding_assignments?select=id&limit=1" -Headers $schemaHeaders -Method Get -TimeoutSec 15 | Out-Null
} catch {
    throw "La base de datos aun no tiene disponible teacher_onboarding_assignments. Aplique la migracion 20260831100000_teacher_onboarding_career_assignment.sql antes de publicar esta version."
}
Write-Host "Esquema de preasignacion docente verificado." -ForegroundColor Green

Write-Host "0.6/6 Verificando esquema de documentacion mensual..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$($env:VITE_SUPABASE_URL)/rest/v1/induction_attendance_registers?select=id&limit=1" -Headers $schemaHeaders -Method Get -TimeoutSec 15 | Out-Null
} catch {
    throw "La base de datos aun no tiene disponible induction_attendance_registers. Aplique la migracion 20260831203000_documentation_two_reports_and_monthly_attendance.sql antes de publicar esta version."
}
Write-Host "Esquema de documentacion mensual verificado." -ForegroundColor Green

Write-Host "1/6 Instalando dependencias exactas..." -ForegroundColor Cyan
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Fallo la instalacion de dependencias." }

Write-Host "2/6 Validando el codigo..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Fallo la validacion del codigo." }

Write-Host "3/6 Generando la aplicacion estatica..." -ForegroundColor Cyan
npm run build:pages
if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de produccion." }

$versionFile = Join-Path $PSScriptRoot "pages-dist\version.json"
if (-not (Test-Path $versionFile)) {
    throw "El build no genero version.json; no se puede verificar que version se publicara."
}
$buildInfo = Get-Content $versionFile -Raw | ConvertFrom-Json
if ($buildInfo.commit -ne $shortCommit) {
    throw "La huella del build ($($buildInfo.commit)) no coincide con Git ($shortCommit)."
}

Write-Host "4/6 Ejecutando pruebas del artefacto..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "Las pruebas del artefacto fallaron. No se publicara." }

Write-Host "5/6 Publicando en Cloudflare Pages..." -ForegroundColor Cyan
npx --no-install wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloudflare requiere iniciar sesion una sola vez..." -ForegroundColor Yellow
    npx --no-install wrangler login
    if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesion en Cloudflare." }
}

npx --no-install wrangler pages deploy .\pages-dist --project-name docentenuevo --branch main
if ($LASTEXITCODE -ne 0) { throw "Fallo la publicacion en Cloudflare Pages." }

Write-Host "6/6 Verificando la version servida por docentenuevo.pages.dev..." -ForegroundColor Cyan
$verified = $false
$productionVersion = $null
for ($attempt = 1; $attempt -le 20; $attempt++) {
    try {
        $nonce = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $productionVersion = Invoke-RestMethod -Uri "https://docentenuevo.pages.dev/version.json?v=$nonce" -Headers @{ "Cache-Control" = "no-cache" } -TimeoutSec 10
        if ($productionVersion.commit -eq $shortCommit) {
            $verified = $true
            break
        }
    } catch {
        # La propagacion del alias de produccion puede tardar algunos segundos.
    }
    Start-Sleep -Seconds 3
}

if (-not $verified) {
    $served = if ($productionVersion -and $productionVersion.commit) { $productionVersion.commit } else { "sin respuesta verificable" }
    throw "Cloudflare termino el deploy, pero la URL principal aun no confirma la version $shortCommit (sirve: $served). No de por finalizada la publicacion hasta verificarla."
}

Write-Host "Publicacion completada y verificada. docentenuevo.pages.dev sirve SIACD $shortCommit." -ForegroundColor Green
