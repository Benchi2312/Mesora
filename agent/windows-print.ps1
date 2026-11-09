param([ValidateSet('listar','imprimir')][string]$Modo)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing

if ($Modo -eq 'listar') {
  $nombres = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { [string]$_ })
  ConvertTo-Json -InputObject $nombres -Compress
  exit 0
}

$documento = $null
$fuente = $null
try {
  $trabajo = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
  if ($trabajo.papel_mm -notin @(58,80) -or [int]$trabajo.copias -lt 1 -or [int]$trabajo.copias -gt 5) {
    throw 'El ancho o la cantidad de copias no son válidos.'
  }
  $cola = [string]$trabajo.cola_windows
  $instaladas = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { [string]$_ })
  if ($cola -cnotin $instaladas) { throw 'La impresora configurada no está instalada en Windows.' }

  $anchoCaracteres = if ([int]$trabajo.papel_mm -eq 58) { 27 } else { 39 }
  $lineas = New-Object 'System.Collections.Generic.List[string]'
  function Agregar-Linea([string]$Texto) {
    $resto = $Texto.Trim()
    if ($resto.Length -eq 0) { $lineas.Add(' '); return }
    while ($resto.Length -gt $anchoCaracteres) {
      $lineas.Add($resto.Substring(0,$anchoCaracteres))
      $resto = $resto.Substring($anchoCaracteres).TrimStart()
    }
    $lineas.Add($resto)
  }
  Agregar-Linea ([string]$trabajo.restaurante)
  Agregar-Linea ('COMANDA ' + ([string]$trabajo.estacion).ToUpperInvariant())
  Agregar-Linea ('Mesa: ' + [string]$trabajo.mesa)
  Agregar-Linea ('Mesero: ' + [string]$trabajo.mesero)
  Agregar-Linea ('Fecha: ' + (Get-Date ([string]$trabajo.creado_at) -Format 'dd/MM/yyyy HH:mm'))
  Agregar-Linea ('Pedido: ' + [string]$trabajo.pedido_id)
  Agregar-Linea ('-' * $anchoCaracteres)
  foreach ($item in @($trabajo.items)) {
    Agregar-Linea (([string]$item.cantidad) + ' x ' + [string]$item.nombre)
    if (-not [string]::IsNullOrWhiteSpace([string]$item.nota)) { Agregar-Linea ('  ' + [string]$item.nota) }
  }
  Agregar-Linea ('-' * $anchoCaracteres)
  if ($trabajo.tipo -eq 'prueba') { Agregar-Linea 'PRUEBA DE IMPRESION MESORA' }

  $documento = New-Object System.Drawing.Printing.PrintDocument
  $documento.PrinterSettings.PrinterName = $cola
  if (-not $documento.PrinterSettings.IsValid) { throw 'Windows no puede usar la impresora seleccionada.' }
  $documento.PrinterSettings.Copies = [int16]$trabajo.copias
  $documento.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $documento.DocumentName = 'Mesora ' + [string]$trabajo.estacion + ' ' + ([string]$trabajo.id).Substring(0,8)
  $documento.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $anchoPapel = if ([int]$trabajo.papel_mm -eq 58) { 228 } else { 315 }
  $altoPapel = [Math]::Min(30000,[Math]::Max(180,$lineas.Count * 18 + 45))
  $documento.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Mesora rollo',$anchoPapel,$altoPapel)
  $fuente = New-Object System.Drawing.Font('Consolas',8,[System.Drawing.FontStyle]::Regular)
  $documento.add_PrintPage({
    param($remitente,$evento)
    $y = 4
    foreach ($linea in $lineas) {
      $evento.Graphics.DrawString($linea,$fuente,[System.Drawing.Brushes]::Black,4,$y)
      $y += 15
    }
    $evento.HasMorePages = $false
  })
  $documento.Print()
  [Console]::Out.WriteLine('ENVIADO_A_COLA')
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($fuente) { $fuente.Dispose() }
  if ($documento) { $documento.Dispose() }
}
