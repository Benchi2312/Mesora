param(
  [Parameter(Mandatory = $true)]
  [string] $Entrada,
  [Parameter(Mandatory = $true)]
  [string] $Salida
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$origen = (Resolve-Path -LiteralPath $Entrada).Path
$destino = [IO.Path]::GetFullPath($Salida)
if ($origen -eq $destino) { throw 'La entrada y la salida deben ser archivos distintos.' }
if (Test-Path -LiteralPath $destino) { throw 'La salida ya existe; no se sobrescribe.' }

$entropia = [Text.Encoding]::UTF8.GetBytes('Mesora-local-backup-v1')
$datos = [Security.Cryptography.ProtectedData]::Unprotect(
  [IO.File]::ReadAllBytes($origen),
  $entropia,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
$manifiestoPath = "$origen.manifest.json"
if (Test-Path -LiteralPath $manifiestoPath) {
  $manifiesto = Get-Content -Raw -LiteralPath $manifiestoPath | ConvertFrom-Json
  $sha = [Security.Cryptography.SHA256]::Create()
  $hash = ([BitConverter]::ToString($sha.ComputeHash($datos))).Replace('-', '')
  if ($hash -ne $manifiesto.sha256) { throw 'El SHA-256 del respaldo descifrado no coincide.' }
}

$directorio = Split-Path -Parent $destino
New-Item -ItemType Directory -Force -Path $directorio | Out-Null
[IO.File]::WriteAllBytes($destino, $datos)
Write-Output "Copia descifrada. Protegela y eliminala cuando termines: $destino"
