[CmdletBinding()]
param(
    [string]$SourcePath = (Join-Path $PSScriptRoot "..\bridge\ib_bridge.py"),
    [string]$CoreSourcePath = (Join-Path $PSScriptRoot "..\bridge\ib_bridge_core.py"),
    [string]$SmiAdapterSourcePath = (Join-Path $PSScriptRoot "..\bridge\smi_forward_adapter.py"),
    [string]$TargetPath = "C:\ib_bridge\ib_bridge.py",
    [string]$HealthUrl = "http://127.0.0.1:8000/ib/status"
)

$ErrorActionPreference = "Stop"

function Invoke-Compile([string]$Python, [string]$Path) {
    & $Python -m py_compile $Path
    if ($LASTEXITCODE -ne 0) { throw "Python compile validation failed for $Path" }
}

function Get-BridgeProcess {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
        $_.CommandLine.IndexOf("ib_bridge.py", [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.ExecutablePath -and
        $_.ExecutablePath -ieq $script:BridgePythonPath
    })
}

$source = (Resolve-Path -LiteralPath $SourcePath).Path
$coreSource = (Resolve-Path -LiteralPath $CoreSourcePath).Path
$smiAdapterSource = (Resolve-Path -LiteralPath $SmiAdapterSourcePath).Path

foreach ($requiredSource in @($source, $coreSource, $smiAdapterSource)) {
    if (-not (Test-Path -LiteralPath $requiredSource -PathType Leaf)) {
        throw "Bridge source does not exist: $requiredSource"
    }
}

$targetDirectory = Split-Path -Parent $TargetPath
if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) { throw "Bridge target directory does not exist: $targetDirectory" }

$coreTargetPath = Join-Path $targetDirectory "ib_bridge_core.py"
$smiAdapterTargetPath = Join-Path $targetDirectory "smi_forward_adapter.py"

$python = Join-Path $targetDirectory ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Existing bridge Python was not found: $python" }
$script:BridgePythonPath = $python

$existingProcesses = @(Get-BridgeProcess)
if ($existingProcesses.Count -gt 1) { throw "More than one ib_bridge.py process is running; restart method is ambiguous." }

$launch = $null
if ($existingProcesses.Count -eq 1) {
    $process = $existingProcesses[0]
    $commandLine = [string]$process.CommandLine
    $executable = [string]$process.ExecutablePath
    $autoStartPath = Join-Path $targetDirectory "Vixale_AutoStart_v3.ps1"
    $knownAutoStart = $false
    if (Test-Path -LiteralPath $autoStartPath -PathType Leaf) {
        $autoStartText = Get-Content -LiteralPath $autoStartPath -Raw
        $knownAutoStart =
            $autoStartText.Contains($targetDirectory) -and
            $autoStartText.Contains($python) -and
            $autoStartText.Contains($TargetPath)
    }
    $commandUsesTarget =
        $commandLine.IndexOf($TargetPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        ($knownAutoStart -and $commandLine.IndexOf("ib_bridge.py", [StringComparison]::OrdinalIgnoreCase) -ge 0)
    if (
        -not $commandUsesTarget -or
        -not (Test-Path -LiteralPath $executable -PathType Leaf)
    ) { throw "The running bridge launch method could not be identified safely." }

    $launch = @{
        ProcessId = [int]$process.ProcessId
        Executable = $executable
        Arguments = "`"$TargetPath`""
    }
}

# Compile every source before touching the running bridge directory.
Invoke-Compile $python $coreSource
Invoke-Compile $python $smiAdapterSource
Invoke-Compile $python $source

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$files = @(
    @{ Source = $source; Target = $TargetPath },
    @{ Source = $coreSource; Target = $coreTargetPath },
    @{ Source = $smiAdapterSource; Target = $smiAdapterTargetPath }
)

foreach ($file in $files) {
    $file.HadTarget = Test-Path -LiteralPath $file.Target -PathType Leaf
    $file.Backup = "$($file.Target).bak-$timestamp"
    if ($file.HadTarget) {
        Copy-Item -LiteralPath $file.Target -Destination $file.Backup
    }
}

try {
    # Copy core + adapter first, then the stable entrypoint last. This prevents
    # a reload watcher from seeing a new entrypoint before its dependencies exist.
    Copy-Item -LiteralPath $coreSource -Destination $coreTargetPath -Force
    Copy-Item -LiteralPath $smiAdapterSource -Destination $smiAdapterTargetPath -Force
    Copy-Item -LiteralPath $source -Destination $TargetPath -Force

    Invoke-Compile $python $coreTargetPath
    Invoke-Compile $python $smiAdapterTargetPath
    Invoke-Compile $python $TargetPath

    if ($launch) {
        Stop-Process -Id $launch.ProcessId -Force
        Start-Sleep -Seconds 1
        Start-Process -FilePath $launch.Executable `
            -ArgumentList $launch.Arguments `
            -WorkingDirectory $targetDirectory `
            -WindowStyle Hidden

        $healthy = $false
        for ($attempt = 1; $attempt -le 15; $attempt++) {
            Start-Sleep -Seconds 1
            try {
                $status = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 3
                if ($status -and ($status.connected -eq $true -or $status.ib_connected -eq $true)) {
                    $healthy = $true
                    break
                }
            } catch {
                # Retry while the existing launch method finishes startup.
            }
        }
        if (-not $healthy) { throw "Bridge health check did not report a connected IB session after restart." }

        Write-Output "Bridge restarted using the existing running process launch method."
        Write-Output "Health check: connected"
    } else {
        Write-Output "No running ib_bridge.py process was found; restart skipped rather than inventing a launch method."
        Write-Output "Health check: skipped because no restart occurred"
    }

    foreach ($file in $files) {
        if ($file.HadTarget) { Write-Output "Backup: $($file.Backup)" }
    }
    Write-Output "Deployed: $TargetPath"
    Write-Output "Deployed: $coreTargetPath"
    Write-Output "Deployed: $smiAdapterTargetPath"
} catch {
    foreach ($file in $files) {
        if ($file.HadTarget -and (Test-Path -LiteralPath $file.Backup -PathType Leaf)) {
            Copy-Item -LiteralPath $file.Backup -Destination $file.Target -Force
        } elseif (-not $file.HadTarget -and (Test-Path -LiteralPath $file.Target -PathType Leaf)) {
            Remove-Item -LiteralPath $file.Target -Force
        }
    }

    foreach ($file in $files) {
        if (Test-Path -LiteralPath $file.Target -PathType Leaf) {
            Invoke-Compile $python $file.Target
        }
    }

    if ($launch) {
        Get-BridgeProcess | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 1
        Start-Process -FilePath $launch.Executable `
            -ArgumentList $launch.Arguments `
            -WorkingDirectory $targetDirectory `
            -WindowStyle Hidden
    }
    throw
}
