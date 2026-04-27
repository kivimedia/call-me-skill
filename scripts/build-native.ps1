# Build native\CallMeSkillDaemon.exe from CallMeSkillDaemon.cs.
# Uses csc.exe from .NET Framework 4 (ships with every Windows install).
# Run with: npm run build-native
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot 'native\CallMeSkillDaemon.cs'
$out = Join-Path $repoRoot 'native\CallMeSkillDaemon.exe'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  Write-Error "csc.exe not found at $csc - install .NET Framework 4."
  exit 1
}
& $csc /nologo /target:exe /out:$out $src
if ($LASTEXITCODE -eq 0) {
  $size = (Get-Item $out).Length
  Write-Output "built: $out ($size bytes)"
} else {
  Write-Error "build failed (exit $LASTEXITCODE)"
  exit $LASTEXITCODE
}
