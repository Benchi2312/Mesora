#requires -Version 5.1
<#
  Exporta SQL con la CLI oficial. No restaura ni modifica datos del negocio.
  -Comprobar solo revisa herramientas locales; no conecta a la base.
  Los archivos contienen datos privados y requieren custodia fuera de Git.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$Proyecto = 'yyfsewgxyyqjyzcejsqq',
    [string]$Destino = (Join-Path $env:LOCALAPPDATA 'Mesora\Respaldos'),
    [switch]$Comprobar,
    [switch]$VentanaSinEscriturasConfirmada
)

$ErrorActionPreference = 'Stop'
$salida = $null
$temporal = $null
$manifest = $null
$inicio = [DateTime]::UtcNow
$utf8 = New-Object Text.UTF8Encoding($false)

function Invoke-SinSalidaPrivada {
    param([string]$Programa, [string[]]$Argumentos)
    # La CLI puede devolver detalles de conexion en un error. Se mantienen
    # unicamente en memoria y nunca se imprimen ni se guardan en el manifiesto.
    $anterior = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $resultado = & $Programa @Argumentos 2>&1
        $codigo = $LASTEXITCODE
        return [pscustomobject]@{ Codigo = $codigo; Texto = ($resultado -join "`n") }
    } finally {
        $ErrorActionPreference = $anterior
    }
}

function Save-Manifest {
    $json = $manifest | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $salida 'manifest.json'), $json, $utf8)
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Este script requiere Windows. Consulta docs/RESPALDOS.md para otras plataformas.' }
    $cli = Get-Command supabase -ErrorAction SilentlyContinue
    if (-not $cli) { throw 'Falta Supabase CLI. Instalala desde la guia oficial antes de exportar.' }
    $ayuda = Invoke-SinSalidaPrivada $cli.Source @('db', 'dump', '--help')
    if ($ayuda.Codigo -ne 0) { throw 'No se pudo consultar supabase db dump --help.' }
    foreach ($flag in @('--project-ref', '--linked', '--role-only', '--data-only', '--use-copy', '--exclude', '--schema', '--file')) {
        if ($ayuda.Texto -notmatch [regex]::Escape($flag)) { throw "La CLI instalada no admite $flag. Actualizala y revisa la guia antes de exportar." }
    }
    $version = Invoke-SinSalidaPrivada $cli.Source @('--version')
    if ($version.Codigo -ne 0) { throw 'No se pudo obtener la version de Supabase CLI.' }
    $versionCli = [regex]::Match($version.Texto, '\b\d+\.\d+\.\d+\b').Value
    if (-not $versionCli) { throw 'La version de Supabase CLI no tiene un formato reconocido.' }
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) { throw 'Falta Docker. La CLI ejecuta pg_dump dentro de un contenedor; aun no se ha creado ningun respaldo.' }
    $motor = Invoke-SinSalidaPrivada $docker.Source @('info', '--format', '{{.OSType}}')
    if ($motor.Codigo -ne 0 -or $motor.Texto.Trim() -ne 'linux') { throw 'Docker debe estar iniciado con contenedores Linux. Aun no se ha creado ningun respaldo.' }

    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
    $raizDestino = [IO.Path]::GetFullPath($Destino).TrimEnd('\')
    if ($raizDestino.StartsWith('\\') -or -not [IO.Path]::IsPathRooted($raizDestino)) { throw 'El destino debe ser una carpeta local absoluta. Copia despues el respaldo a almacenamiento privado externo.' }
    if ($raizDestino.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or $raizDestino.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'El destino no puede estar dentro del repositorio.' }
    $ancestro = $raizDestino
    while ($ancestro) {
        if (Test-Path -LiteralPath $ancestro) {
            if ((Get-Item -LiteralPath $ancestro).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El destino no admite enlaces o uniones de directorios.' }
            if (Test-Path -LiteralPath (Join-Path $ancestro '.git')) { throw 'El destino pertenece a un repositorio Git. Elige almacenamiento privado separado.' }
        }
        $padre = [IO.Directory]::GetParent($ancestro)
        $ancestro = if ($padre) { $padre.FullName } else { $null }
    }

    Write-Host "Herramientas disponibles: Supabase CLI $versionCli y Docker Linux."
    if ($Comprobar) {
        Write-Host 'Preflight local aprobado. No valida acceso a Supabase, espacio libre, exportacion ni restauracion.'
        exit 0
    }
    if (-not $VentanaSinEscriturasConfirmada) { throw 'Coordina una ventana sin ventas ni cambios de esquema y vuelve a ejecutar con -VentanaSinEscriturasConfirmada. Los volcados se generan en conexiones separadas.' }

    $nombre = '{0}-{1}-{2}' -f $Proyecto, [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'), [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $salida = Join-Path $raizDestino $nombre
    New-Item -ItemType Directory -Path $salida -ErrorAction Stop | Out-Null
    # Restringe esta carpeta NUEVA al usuario actual, SYSTEM y administradores.
    # Los permisos NTFS limitan el acceso, pero no cifran el contenido.
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $usuario = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($sid in @($usuario, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $regla = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($regla)
    }
    Set-Acl -LiteralPath $salida -AclObject $acl

    $manifest = [ordered]@{
        proyecto = $Proyecto
        iniciado_utc = $inicio.ToString('o')
        finalizado_utc = $null
        cli = $versionCli
        estado = 'incompleto'
        restauracion_verificada = $false
        archivos = @()
        cobertura = 'SQL exportado por Supabase CLI; revisar Auth, personalizaciones de esquemas administrados y extensiones antes de restaurar.'
        excluido = @('Archivos binarios de Storage', 'Configuracion de Auth/SMTP/hosting', 'Secretos de Edge Functions y claves de cifrado', 'Objetos de Storage Vector excluidos por la guia oficial')
        custodia = 'Permisos NTFS restringidos. El script no cifra ni crea una copia externa.'
    }
    Save-Manifest

    $temporal = Join-Path ([IO.Path]::GetTempPath()) ('mesora-backup-cli-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $temporal 'supabase') | Out-Null
    [IO.File]::WriteAllText((Join-Path $temporal 'supabase\config.toml'), "project_id = `"Mesora-backup`"`n[db]`nmajor_version = 17`n", $utf8)
    $exportaciones = @(
        @{ Nombre = 'roles.sql'; Opciones = @('--role-only') },
        @{ Nombre = 'schema.sql'; Opciones = @() },
        @{ Nombre = 'data.sql'; Opciones = @('--data-only', '--use-copy', '--exclude', 'storage.buckets_vectors', '--exclude', 'storage.vector_indexes') },
        @{ Nombre = 'history_schema.sql'; Opciones = @('--schema', 'supabase_migrations') },
        @{ Nombre = 'history_data.sql'; Opciones = @('--schema', 'supabase_migrations', '--data-only', '--use-copy') }
    )
    foreach ($exportacion in $exportaciones) {
        Write-Host ('Exportando {0}...' -f $exportacion.Nombre)
        $archivo = Join-Path $salida $exportacion.Nombre
        $argumentos = @('db', 'dump', '--linked', '--project-ref', $Proyecto, '--workdir', $temporal, '--file', $archivo) + $exportacion.Opciones
        $resultado = Invoke-SinSalidaPrivada $cli.Source $argumentos
        if ($resultado.Codigo -ne 0) { throw "Fallo al exportar $($exportacion.Nombre) (codigo $($resultado.Codigo)). Revisa autenticacion CLI, red y Docker. La copia queda marcada como incompleta; no es un respaldo valido." }
        if (-not (Test-Path -LiteralPath $archivo) -or (Get-Item -LiteralPath $archivo).Length -eq 0) { throw "La exportacion $($exportacion.Nombre) no produjo un archivo valido." }
        $manifest.archivos += [ordered]@{ nombre = $exportacion.Nombre; bytes = (Get-Item -LiteralPath $archivo).Length; sha256 = (Get-FileHash -LiteralPath $archivo -Algorithm SHA256).Hash.ToLowerInvariant() }
        Save-Manifest
        $resultado = $null
    }
    $manifest.estado = 'exportado_pendiente_restauracion'
    $manifest.finalizado_utc = [DateTime]::UtcNow.ToString('o')
    Save-Manifest
    Write-Host "Exportacion SQL terminada: $salida"
    Write-Host 'Falta copiarla a almacenamiento privado cifrado y probar la restauracion aislada. Consulta docs/RESPALDOS.md.'
} catch {
    if ($manifest -and $salida) {
        $manifest.finalizado_utc = [DateTime]::UtcNow.ToString('o')
        try { Save-Manifest } catch { }
    }
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($temporal -and (Test-Path -LiteralPath $temporal)) {
        $rutaTemporal = [IO.Path]::GetFullPath($temporal)
        $raizTemporal = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($rutaTemporal.StartsWith($raizTemporal, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $rutaTemporal -Leaf) -match '^mesora-backup-cli-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $rutaTemporal -Recurse -Force
        }
    }
}
