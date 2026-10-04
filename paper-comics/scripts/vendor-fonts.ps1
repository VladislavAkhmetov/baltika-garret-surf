$ErrorActionPreference = 'Stop'
$fontDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/fonts'))
$sourcePath = Join-Path $fontDirectory 'google-fonts-source.css'
$source = Get-Content -LiteralPath $sourcePath -Raw
$localCss = $source
foreach ($block in [regex]::Matches($source, '@font-face\s*\{[^}]+\}')) {
    $family = [regex]::Match($block.Value, "font-family:\s*'([^']+)'\;").Groups[1].Value
    $weight = [regex]::Match($block.Value, 'font-weight:\s*(\d+)').Groups[1].Value
    $url = [regex]::Match($block.Value, 'url\((https://fonts.gstatic.com/[^)]+)\)').Groups[1].Value
    $file = $family.ToLower().Replace(' ', '-') + '-' + $weight + '.ttf'
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $fontDirectory $file)
    $localCss = $localCss.Replace($url, $file)
}
[IO.File]::WriteAllText((Join-Path $fontDirectory 'fonts.css'), $localCss)
foreach ($family in @('caveat', 'rubik', 'russoone')) {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/google/fonts/main/ofl/$family/OFL.txt" -OutFile (Join-Path $fontDirectory ($family + '-OFL.txt'))
}
Get-ChildItem -LiteralPath $fontDirectory | Select-Object Name, Length
