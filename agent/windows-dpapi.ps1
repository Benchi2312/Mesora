param([ValidateSet('proteger','abrir')][string]$Modo)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Security
try {
  $entrada = [Console]::In.ReadToEnd().Trim()
  if ($Modo -eq 'proteger') {
    $bytes = [Text.Encoding]::UTF8.GetBytes($entrada)
    $cifrados = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($cifrados))
  } else {
    $cifrados = [Convert]::FromBase64String($entrada)
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect($cifrados,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
  }
} catch {
  [Console]::Error.WriteLine('No se pudo abrir el almacén seguro del usuario de Windows.')
  exit 1
}
