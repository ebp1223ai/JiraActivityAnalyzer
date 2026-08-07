[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RepoPath,
  [Parameter(Mandatory = $true)][string]$WorkflowPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$RunId,
  [string]$OutputRoot,
  [ValidateSet('workspace-write')][string]$Sandbox = 'workspace-write',
  [string]$ResumeThreadId,
  [switch]$WritePreflightRecord
)

$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$parser = Join-Path $toolRoot 'parse-codex-jsonl.mjs'
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$workflowFile = (Resolve-Path -LiteralPath $WorkflowPath).Path
$workflow = Get-Content -LiteralPath $workflowFile -Raw | ConvertFrom-Json
$repoParent = Split-Path -Parent $repo
$telemetryRoot = if ($OutputRoot) { [System.IO.Path]::GetFullPath($OutputRoot) } else { Join-Path $repoParent 'JiraActivityAnalyzer-codex-telemetry' }
$runRoot = Join-Path $telemetryRoot $RunId
$preflightRoot = Join-Path $telemetryRoot 'preflight'

if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'REPO_NOT_GIT' }
if (Test-Path -LiteralPath $runRoot) { throw 'OUTPUT_ROOT_COLLISION' }
$blockedRoots = @(
  (Join-Path $repo 'dist'),
  (Join-Path $repo 'dist-electron'),
  (Join-Path $repo 'release')
)
foreach ($blocked in $blockedRoots) {
  if ($runRoot.StartsWith([System.IO.Path]::GetFullPath($blocked), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'OUTPUT_ROOT_INSIDE_PACKAGE_INPUT'
  }
}
if ($runRoot.StartsWith($repo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'OUTPUT_ROOT_INSIDE_REPOSITORY'
}

$codex = (Get-Command codex.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$cliVersion = (& $codex --version).Trim()
$execHelp = (& $codex exec --help) -join [Environment]::NewLine
$resumeHelp = (& $codex exec resume --help) -join [Environment]::NewLine
if ($LASTEXITCODE -ne 0 -or $execHelp -notmatch '--json' -or $execHelp -notmatch 'workspace-write' -or $resumeHelp -notmatch '--json') {
  throw 'CLI_CAPABILITY_CHECK_FAILED'
}

New-Item -ItemType Directory -Path $runRoot | Out-Null
$executionRoot = $repo
if ($workflow.isolated -eq $true) {
  $executionRoot = Join-Path $runRoot 'isolated-workspace'
  New-Item -ItemType Directory -Path $executionRoot | Out-Null
}
$gitBefore = [ordered]@{
  branch = (& git -C $repo branch --show-current).Trim()
  head = (& git -C $repo rev-parse HEAD).Trim()
  status = @(& git -C $repo status --short)
}
$runStarted = (Get-Date).ToString('o')
$threadId = $ResumeThreadId
$phaseSummaries = @()
$phaseManifests = @()
$workflowRequirements = ''
if ($workflow.requirementsPath) {
  $requirementsPath = Join-Path (Split-Path -Parent $workflowFile) $workflow.requirementsPath
  $workflowRequirements = Get-Content -LiteralPath $requirementsPath -Raw
}

function Quote-ProcessArgument([string]$value) {
  if ($value -notmatch '[\s"]') { return $value }
  return '"' + ($value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Invoke-CapturedProcess([string]$file, [string[]]$arguments, [string]$workingDirectory, [string]$stdinText) {
  $start = Get-Date
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $file
  $psi.Arguments = (($arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' ')
  $psi.WorkingDirectory = $workingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  if (-not $process.Start()) { throw 'PROCESS_START_FAILED' }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if ($null -ne $stdinText) {
    $process.StandardInput.Write($stdinText)
  }
  $process.StandardInput.Close()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $end = Get-Date
  return [ordered]@{
    exitCode = $process.ExitCode
    stdout = $stdout
    stderr = $stderr
    startedAt = $start.ToString('o')
    endedAt = $end.ToString('o')
    durationMs = [math]::Round(($end - $start).TotalMilliseconds)
  }
}

try {
  foreach ($phase in $workflow.phases) {
    $phaseId = [string]$phase.phaseId
    $eventsPath = Join-Path $runRoot "events.$phaseId.jsonl"
    $stderrPath = Join-Path $runRoot "stderr.$phaseId.log"
    $lastMessagePath = Join-Path $runRoot "last-message.$phaseId.txt"
    $manifestPath = Join-Path $runRoot "phase.$phaseId.manifest.json"
    $hashPath = Join-Path $runRoot "phase.$phaseId.sha256.json"
    $handoffPath = Join-Path $runRoot "handoff.$phaseId.json"
    $handoffThreadId = if ($threadId) { $threadId } else { 'RUNNER_INJECT' }
    $handoffInstruction = if ($workflow.requireHandoff -ne $false) {
      "Raw telemetry output root: $runRoot`nWrite the required phase handoff JSON to: $handoffPath`nUse threadId: $handoffThreadId"
    } else {
      'This is a telemetry self-test. Do not read or write repository files and do not create a phase handoff.'
    }
    $prompt = @"
ACTIVE PHASE ONLY: $phaseId.
$($phase.instruction)
$handoffInstruction
Do not continue to a later phase in this turn.

$workflowRequirements
"@
    if (-not $threadId) {
      $arguments = @('exec', '--json', '--color', 'never', '-C', $executionRoot, '--approve-for-me', '--add-dir', $runRoot)
      if ($workflow.isolated -eq $true) { $arguments += '--skip-git-repo-check' }
      $arguments += @('-o', $lastMessagePath, '-')
    } else {
      $arguments = @('exec', '--approve-for-me', 'resume', '--json')
      if ($workflow.isolated -eq $true) { $arguments += '--skip-git-repo-check' }
      $arguments += @('-o', $lastMessagePath, $threadId, '-')
    }
    $result = Invoke-CapturedProcess $codex $arguments $executionRoot $prompt
    [System.IO.File]::WriteAllText($eventsPath, $result.stdout, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($stderrPath, $result.stderr, [System.Text.UTF8Encoding]::new($false))
    if ($result.exitCode -ne 0) { throw "CODEX_PROCESS_FAILED:${phaseId}:$($result.exitCode)" }
    if ($phase.expectedLastMessage) {
      if (-not (Test-Path -LiteralPath $lastMessagePath)) { throw "LAST_MESSAGE_MISSING:$phaseId" }
      $actualLastMessage = (Get-Content -LiteralPath $lastMessagePath -Raw).Trim()
      if ($actualLastMessage -ne [string]$phase.expectedLastMessage) { throw "LAST_MESSAGE_MISMATCH:$phaseId" }
    }
    $phaseSummaryPath = Join-Path $runRoot "telemetry.$phaseId.json"
    & $node $parser parse --input $eventsPath --output $phaseSummaryPath
    if ($LASTEXITCODE -ne 0) { throw "TELEMETRY_PARSE_GATE_FAILED:$phaseId" }
    $phaseSummary = Get-Content -LiteralPath $phaseSummaryPath -Raw | ConvertFrom-Json
    if (-not $threadId) {
      if ($phaseSummary.threadIds.Count -ne 1) { throw 'THREAD_ID_UNAVAILABLE' }
      $threadId = [string]$phaseSummary.threadIds[0]
    } elseif ($phaseSummary.threadIds.Count -gt 0 -and $phaseSummary.threadIds -notcontains $threadId) {
      throw "THREAD_MISMATCH:$phaseId"
    }
    if ($phaseSummary.status -ne 'AVAILABLE') { throw "USAGE_GATE_FAILED:$phaseId" }
    if ($workflow.requireHandoff -ne $false) {
      if (-not (Test-Path -LiteralPath $handoffPath)) { throw "HANDOFF_MISSING:$phaseId" }
      $handoff = Get-Content -LiteralPath $handoffPath -Raw | ConvertFrom-Json
      if ($handoff.threadId -eq 'RUNNER_INJECT' -and $phaseId -eq [string]$workflow.phases[0].phaseId) {
        $handoff | Add-Member -NotePropertyName workerDeclaredThreadId -NotePropertyValue 'RUNNER_INJECT' -Force
        $handoff.threadId = $threadId
        [System.IO.File]::WriteAllText($handoffPath, ($handoff | ConvertTo-Json -Depth 12) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
      }
      & $node $parser handoff --input $handoffPath --phase $phaseId --thread $threadId
      if ($LASTEXITCODE -ne 0) { throw "HANDOFF_GATE_FAILED:$phaseId" }
    }
    $phaseManifest = [ordered]@{
      schemaVersion = 1
      runId = $RunId
      phaseId = $phaseId
      threadId = $threadId
      exitCode = $result.exitCode
      startedAt = $result.startedAt
      endedAt = $result.endedAt
      durationMs = $result.durationMs
      events = [System.IO.Path]::GetFileName($eventsPath)
      stderr = [System.IO.Path]::GetFileName($stderrPath)
      lastMessage = [System.IO.Path]::GetFileName($lastMessagePath)
      handoff = if (Test-Path -LiteralPath $handoffPath) { [System.IO.Path]::GetFileName($handoffPath) } else { $null }
      telemetryStatus = $phaseSummary.status
    }
    $phaseManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    $phaseHashes = [ordered]@{}
    foreach ($artifact in @($eventsPath, $stderrPath, $lastMessagePath, $manifestPath, $phaseSummaryPath)) {
      if (Test-Path -LiteralPath $artifact) { $phaseHashes[[System.IO.Path]::GetFileName($artifact)] = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant() }
    }
    if (Test-Path -LiteralPath $handoffPath) { $phaseHashes[[System.IO.Path]::GetFileName($handoffPath)] = (Get-FileHash -Algorithm SHA256 -LiteralPath $handoffPath).Hash.ToLowerInvariant() }
    $phaseHashes | ConvertTo-Json | Set-Content -LiteralPath $hashPath -Encoding UTF8
    $phaseSummaries += $phaseSummary
    $phaseManifests += $phaseManifest
  }

  $usage = [ordered]@{
    availability = 'AVAILABLE'
    inputTokens = 0
    cachedInputTokens = 0
    cacheWriteInputTokens = 0
    outputTokens = 0
    reasoningOutputTokens = 0
    totalTokens = 0
    totalFormula = 'sum of per-turn totalTokens; cached/reasoning breakdowns are not added again'
  }
  $optionalCacheWrite = $true
  foreach ($summary in $phaseSummaries) {
    $usage.inputTokens += [long]$summary.usage.inputTokens
    $usage.cachedInputTokens += [long]$summary.usage.cachedInputTokens
    $usage.outputTokens += [long]$summary.usage.outputTokens
    $usage.reasoningOutputTokens += [long]$summary.usage.reasoningOutputTokens
    $usage.totalTokens += [long]$summary.usage.totalTokens
    if ($null -eq $summary.usage.cacheWriteInputTokens) { $optionalCacheWrite = $false } else { $usage.cacheWriteInputTokens += [long]$summary.usage.cacheWriteInputTokens }
  }
  if (-not $optionalCacheWrite) { $usage.cacheWriteInputTokens = $null; $usage.cacheWriteAvailability = 'UNAVAILABLE_OPTIONAL_FIELD' }
  $gitAfter = [ordered]@{
    branch = (& git -C $repo branch --show-current).Trim()
    head = (& git -C $repo rev-parse HEAD).Trim()
    status = @(& git -C $repo status --short)
    diffStat = @(& git -C $repo diff --stat)
    diffNumStat = @(& git -C $repo diff --numstat)
  }
  $telemetry = [ordered]@{ schemaVersion = 1; status = 'AVAILABLE'; runId = $RunId; threadId = $threadId; phases = $phaseSummaries; usage = $usage }
  $scope = [ordered]@{
    schemaVersion = 1
    telemetryObservedPaths = @($phaseSummaries | ForEach-Object { $_.pathEvidence.telemetryObservedPaths } | Sort-Object -Unique)
    workerDeclaredInspectedPaths = @()
    gitConfirmedModifiedPaths = @(& git -C $repo diff --name-only)
    inspectionLimitation = 'Inspection coverage is declared by the Worker and corroborated where possible; it is not guaranteed to be a complete automatic read trace.'
  }
  foreach ($phase in $workflow.phases) {
    $handoffPath = Join-Path $runRoot "handoff.$($phase.phaseId).json"
    if (Test-Path -LiteralPath $handoffPath) {
      $handoff = Get-Content -LiteralPath $handoffPath -Raw | ConvertFrom-Json
      $scope.workerDeclaredInspectedPaths += @($handoff.inspectedPaths)
    }
  }
  $scope.workerDeclaredInspectedPaths = @($scope.workerDeclaredInspectedPaths | Sort-Object -Unique)
  $runEnded = (Get-Date).ToString('o')
  $runManifest = [ordered]@{
    schemaVersion = 1
    runId = $RunId
    status = 'completed'
    cliVersion = $cliVersion
    sandbox = $Sandbox
    threadId = $threadId
    startedAt = $runStarted
    endedAt = $runEnded
    gitBefore = $gitBefore
    gitAfter = $gitAfter
    phases = $phaseManifests
  }
  $telemetry | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $runRoot 'telemetry-summary.json') -Encoding UTF8
  $scope | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runRoot 'scope-summary.json') -Encoding UTF8
  $runManifest | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $runRoot 'run-manifest.json') -Encoding UTF8
  $allHashes = [ordered]@{}
  Get-ChildItem -LiteralPath $runRoot -File | Where-Object Name -ne 'sha256-manifest.json' | Sort-Object Name | ForEach-Object {
    $allHashes[$_.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  }
  $allHashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot 'sha256-manifest.json') -Encoding UTF8

  if ($WritePreflightRecord) {
    New-Item -ItemType Directory -Path $preflightRoot -Force | Out-Null
    $identitySeed = "{0}|{1}|{2}" -f [Environment]::MachineName, [Environment]::OSVersion.VersionString, $cliVersion
    $identityBytes = [System.Text.Encoding]::UTF8.GetBytes($identitySeed)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $machineHash = ([BitConverter]::ToString($sha.ComputeHash($identityBytes))).Replace('-', '').ToLowerInvariant()
    $toolHashes = [ordered]@{}
    Get-ChildItem -LiteralPath $toolRoot -File -Recurse | Where-Object FullName -notmatch '[\\/]fixtures[\\/]' | Sort-Object FullName | ForEach-Object {
      $relative = $_.FullName.Substring($toolRoot.Length + 1).Replace('\', '/')
      $toolHashes[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    }
    $record = [ordered]@{
      schemaVersion = 1
      status = 'VALID'
      validatedAt = $runEnded
      codexCliVersion = $cliVersion
      authenticationCheck = 'PASS_VIA_SUCCESSFUL_EXEC_JSON'
      runnerParserSchemaHashes = $toolHashes
      selfTestRunId = $RunId
      requiredEvents = [ordered]@{ threadStarted = $true; turnCompleted = $true; validUsage = $true; explicitResume = ($workflow.phases.Count -gt 1) }
      sandbox = $Sandbox
      safeMachineIdentityHash = $machineHash
      expirationReasons = @('CLI_VERSION_CHANGED', 'TOOLING_HASH_CHANGED', 'AUTHENTICATION_FAILED', 'JSONL_SCHEMA_GATE_FAILED', 'RESUME_FAILED')
    }
    $tempRecord = Join-Path $preflightRoot 'preflight-record.json.tmp'
    $record | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempRecord -Encoding UTF8
    Move-Item -LiteralPath $tempRecord -Destination (Join-Path $preflightRoot 'preflight-record.json') -Force
  }
  Write-Output ($runManifest | ConvertTo-Json -Depth 15)
} catch {
  $failure = [ordered]@{ schemaVersion = 1; runId = $RunId; status = 'failed'; failedAt = (Get-Date).ToString('o'); message = $_.Exception.Message; threadId = $threadId }
  $failure | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'failed-attempt.json') -Encoding UTF8
  throw
}
