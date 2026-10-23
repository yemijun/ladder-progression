# Rebuild PNGs from the same geometry as icon.svg. Windows / System.Drawing.
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
function Fill-RoundedRect($graphics, $brush, [single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $shape = [Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  $shape.AddArc($x, $y, $d, $d, 180, 90)
  $shape.AddArc(($x + $width - $d), $y, $d, $d, 270, 90)
  $shape.AddArc(($x + $width - $d), ($y + $height - $d), $d, $d, 0, 90)
  $shape.AddArc($x, ($y + $height - $d), $d, $d, 90, 90)
  $shape.CloseFigure()
  $graphics.FillPath($brush, $shape)
  $shape.Dispose()
}
$variants = @(
  @{name='icon-192.png'; size=192; rounded=$true; scale=1},
  @{name='icon-512.png'; size=512; rounded=$true; scale=1},
  @{name='icon-maskable-512.png'; size=512; rounded=$false; scale=0.9},
  @{name='apple-touch-icon.png'; size=180; rounded=$false; scale=1},
  @{name='apple-touch-icon-167.png'; size=167; rounded=$false; scale=1},
  @{name='apple-touch-icon-152.png'; size=152; rounded=$false; scale=1}
)
foreach ($variant in $variants) {
  $canvas = [Drawing.Bitmap]::new(2048, 2048)
  $g = [Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.ScaleTransform(4, 4)
  $background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#183f30'))
  if ($variant.rounded) { Fill-RoundedRect $g $background 0 0 512 512 112 }
  else { $g.FillRectangle($background, 0, 0, 512, 512) }
  $g.TranslateTransform(256, 256)
  $g.ScaleTransform($variant.scale, $variant.scale)
  $g.TranslateTransform(-256, -256)
  $bars = @(@{x=112; y=256; h=128; color='#76a988'}, @{x=216; y=192; h=192; color='#b2d1a5'}, @{x=320; y=128; h=256; color='#edf4db'})
  foreach ($bar in $bars) {
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($bar.color))
    Fill-RoundedRect $g $brush $bar.x $bar.y 80 $bar.h 16
    $brush.Dispose()
  }
  $output = [Drawing.Bitmap]::new($variant.size, $variant.size)
  $target = [Drawing.Graphics]::FromImage($output)
  if (-not $variant.rounded) { $target.Clear([Drawing.ColorTranslator]::FromHtml('#183f30')) }
  $target.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $target.DrawImage($canvas, 0, 0, $variant.size, $variant.size)
  $output.Save((Join-Path $projectRoot $variant.name), [Drawing.Imaging.ImageFormat]::Png)
  $target.Dispose(); $output.Dispose(); $g.Dispose(); $canvas.Dispose(); $background.Dispose()
}
