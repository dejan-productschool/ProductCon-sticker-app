# Prints one image at an exact physical size on Windows.
#
# The Brother VC-500W is driven through its normal Windows driver here. We go
# through System.Drawing.Printing rather than a shell "print" verb so the size
# is stated in millimetres and nothing scales the label to fit a page.
#
# Only reach for Brother's b-PAC SDK if explicit half-cut control turns out to
# be needed. Try this first.

param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$PrinterName = "",
  [double]$WidthMm = 50,
  [double]$HeightMm = 50,
  [int]$Copies = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $ImagePath)) { throw "image not found: $ImagePath" }

$img = [System.Drawing.Image]::FromFile((Resolve-Path $ImagePath))
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = "ship-it-sticker"

  if ($PrinterName -ne "") { $doc.PrinterSettings.PrinterName = $PrinterName }
  if (-not $doc.PrinterSettings.IsValid) {
    throw "printer not valid: '$($doc.PrinterSettings.PrinterName)'"
  }
  $doc.PrinterSettings.Copies = $Copies

  # PaperSize is in hundredths of an inch.
  $w100 = [int][Math]::Round($WidthMm / 25.4 * 100)
  $h100 = [int][Math]::Round($HeightMm / 25.4 * 100)
  $doc.DefaultPageSettings.PaperSize =
    New-Object System.Drawing.Printing.PaperSize("Sticker", $w100, $h100)
  $doc.DefaultPageSettings.Margins =
    New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.OriginAtMargins = $false

  $doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
    $e.Graphics.InterpolationMode =
      [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.PixelOffsetMode =
      [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $rect = New-Object System.Drawing.RectangleF(0, 0, $WidthMm, $HeightMm)
    $e.Graphics.DrawImage($img, $rect)
    $e.HasMorePages = $false
  })

  $doc.Print()
  Write-Output "printed;$($doc.PrinterSettings.PrinterName);${WidthMm}x${HeightMm}mm"
}
finally {
  $img.Dispose()
}
