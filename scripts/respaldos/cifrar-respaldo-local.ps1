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

$directorio = Split-Path -Parent $destino
New-Item -ItemType Directory -Force -Path $directorio | Out-Null
$datos = [IO.File]::ReadAllBytes($origen)
$entropia = [Text.Encoding]::UTF8.GetBytes('Mesora-local-backup-v1')
$cifrado = [Security.Cryptography.ProtectedData]::Protect(
  $datos,
  $entropia,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[IO.File]::WriteAllBytes($destino, $cifrado)

$descifrado = [Security.Cryptography.ProtectedData]::Unprotect(
  [IO.File]::ReadAllBytes($destino),
  $entropia,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
$sha = [Security.Cryptography.SHA256]::Create()
$hashOriginal = ([BitConverter]::ToString($sha.ComputeHash($datos))).Replace('-', '')
$hashVerificado = ([BitConverter]::ToString($sha.ComputeHash($descifrado))).Replace('-', '')
if ($hashOriginal -ne $hashVerificado) {
  Remove-Item -LiteralPath $destino -Force
  throw 'El archivo cifrado no paso la comprobacion SHA-256.'
}

$manifiesto = [ordered]@{
  formato = 'Windows DPAPI CurrentUser'
  bytes = $datos.Length
  sha256 = $hashOriginal
  verificado = $true
  perfilWindowsRequerido = $true
}
$manifiesto | ConvertTo-Json | Set-Content -LiteralPath "$destino.manifest.json" -Encoding utf8
Write-Output "Copia protegida y verificada: $destino"
