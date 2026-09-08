param([string]$Version = '0.3.44')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path $repo ('test-artifacts/v' + $Version + '/installer-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$target = Join-Path $work 'Installed App'
$report = [ordered]@{ status='RUNNING'; manualGui='PENDING'; steps=@(); installRoot=$target }
$keys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
$shortcuts = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Jira Activity Analyzer.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Jira Activity Analyzer.lnk'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $existing = @(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Jira Activity Analyzer*' })
  if ($existing.Count -or @($shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count) { throw 'Existing installation or shortcut found: no system installation changed.' }
  $setup = Join-Path $repo ('release/v' + $Version + '-candidate/Jira Activity Analyzer Setup ' + $Version + '.exe')
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $process = Start-Process -FilePath $setup -ArgumentList ('/S /D=' + $target) -WindowStyle Hidden -Wait -PassThru
  $report.steps += @{ command='Installer /S /D=<isolated-root>'; exitCode=$process.ExitCode; durationMs=$watch.ElapsedMilliseconds }
  if ($process.ExitCode -ne 0) { throw 'Installer failed' }
  $exe = Join-Path $target 'Jira Activity Analyzer.exe'
  if (!(Test-Path -LiteralPath $exe)) { throw 'Installed executable missing' }
  $env:JAA_UI_EXECUTABLE=$exe; $env:JAA_UI_APP_ROOT=$target; $env:JAA_UI_EVIDENCE=(Join-Path $work 'ui'); $env:JAA_UI_SHORT='1'; $env:JAA_UI_EXPECT_VERSION=$Version; $env:JAA_UI_DEEP='0'; $env:JAA_UI_WORKBENCH='0'
  $watch.Restart()
  node scripts/test-v0344-ui.cjs
  $report.steps += @{ command='node scripts/test-v0344-ui.cjs (installed EXE)'; exitCode=$LASTEXITCODE; durationMs=$watch.ElapsedMilliseconds }
  if ($LASTEXITCODE -ne 0) { throw 'Installed UI failed' }
  $uninstall = @(Get-ChildItem -LiteralPath $target -Filter 'Uninstall*.exe')
  if ($uninstall.Count -ne 1) { throw 'Ambiguous uninstaller' }
  if (![IO.Path]::GetFullPath($target).StartsWith([IO.Path]::GetFullPath($work) + [IO.Path]::DirectorySeparatorChar)) { throw 'Uninstall containment failed' }
  $watch.Restart()
  $process = Start-Process -FilePath $uninstall[0].FullName -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  $report.steps += @{ command='Isolated uninstaller /S'; exitCode=$process.ExitCode; durationMs=$watch.ElapsedMilliseconds }
  if ($process.ExitCode -ne 0) { throw 'Uninstaller failed' }
  for ($i=0; $i -lt 50 -and (Test-Path -LiteralPath $exe); $i++) { Start-Sleep -Milliseconds 100 }
  if (Test-Path -LiteralPath $exe) { throw 'Installed binary remains after uninstall' }
  $remaining = @(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Jira Activity Analyzer*' })
  if ($remaining.Count -or @($shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count) { throw 'Installation metadata remains; retained for inspection, no manual deletion.' }
  $report.status='PASS'
} catch { $report.status='FAIL'; $report.error=$_.Exception.Message; Write-Error -ErrorAction Continue $_ }
finally { $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $work 'report.json') -Encoding utf8; Write-Output ('Installer evidence: ' + $work) }
if ($report.status -ne 'PASS') { exit 1 }
