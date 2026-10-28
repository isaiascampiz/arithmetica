# Rebuild the editable identity artwork with outlined system-font lettering.
# Windows only. No packages, application servers or record files are involved.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$invariant = [Globalization.CultureInfo]::InvariantCulture
$utf8 = [Text.UTF8Encoding]::new($false)
function Number([double] $value) { $value.ToString('0.###', $invariant) }
function Outline([Drawing.Drawing2D.GraphicsPath] $outline) {
  $points = $outline.PathPoints
  $types = $outline.PathTypes
  $commands = [Collections.Generic.List[string]]::new()
  for ($i = 0; $i -lt $points.Length; $i++) {
    $kind = $types[$i] -band 7
    if ($kind -eq 0) {
      $commands.Add(('M{0} {1}' -f (Number $points[$i].X), (Number $points[$i].Y)))
    } elseif ($kind -eq 1) {
      $commands.Add(('L{0} {1}' -f (Number $points[$i].X), (Number $points[$i].Y)))
    } elseif ($kind -eq 3) {
      $commands.Add(('C{0} {1} {2} {3} {4} {5}' -f
        (Number $points[$i].X), (Number $points[$i].Y),
        (Number $points[$i + 1].X), (Number $points[$i + 1].Y),
        (Number $points[$i + 2].X), (Number $points[$i + 2].Y)))
      $i += 2
    } else { throw "Unsupported outline segment: $kind" }
    if (($types[$i] -band 128) -ne 0) { $commands.Add('Z') }
  }
  $commands -join ' '
}

$identities = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'marks.json') -Raw | ConvertFrom-Json
foreach ($identity in $identities) {
  $name = $identity.name
  if ($name -notin @('zavri', 'rivren', 'kilter', 'rivet')) { throw 'Unknown identity name.' }
  $destination = Join-Path $PSScriptRoot $name
  [IO.Directory]::CreateDirectory($destination) | Out-Null
  $font = [Drawing.FontFamily]::new('Century Gothic')
  $outline = [Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $outline.AddString($name, $font, [int][Drawing.FontStyle]::Bold, 72,
      [Drawing.PointF]::new(0, 0), [Drawing.StringFormat]::GenericTypographic)
    $bounds = $outline.GetBounds()
    $lettering = Outline $outline
    $width = Number (92 + $bounds.Width)
    $wordX = Number (92 - $bounds.X)
    $wordY = Number ((80 - $bounds.Height) / 2 - $bounds.Y)
    $mark = $identity.svg
    $head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} 80" role="img" aria-labelledby="{1}-title"><title id="{1}-title">{1}</title>' -f $width, $name
    $word = '<g transform="translate({0} {1})"><path fill-rule="evenodd" d="{2}"/></g>' -f $wordX, $wordY, $lettering
    $full = $head + '<g fill="#5b93ce" transform="translate(8 8)">' + $mark + '</g><g fill="#202b48">' + $word + '</g></svg>'
    $mono = $head + '<g fill="#202b48"><g transform="translate(8 8)">' + $mark + '</g>' + $word + '</g></svg>'
    $reversed = $mono.Replace('#202b48', '#ffffff')
    $markOnly = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="{0}-mark-title"><title id="{0}-mark-title">{0} symbol</title><g fill="currentColor">{1}</g></svg>' -f $name, $mark
    [IO.File]::WriteAllText((Join-Path $destination 'logo.svg'), $full, $utf8)
    [IO.File]::WriteAllText((Join-Path $destination 'logo-mono.svg'), $mono, $utf8)
    [IO.File]::WriteAllText((Join-Path $destination 'logo-reversed.svg'), $reversed, $utf8)
    [IO.File]::WriteAllText((Join-Path $destination 'mark.svg'), $markOnly, $utf8)
  } finally {
    $outline.Dispose()
    $font.Dispose()
  }
}
