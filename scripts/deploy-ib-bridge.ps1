[CmdletBinding()]
param(
    [string]$SourcePath = (Join-Path $PSScriptRoot "..\bridge\ib_bridge.py"),
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
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Bridge source does not exist: $SourcePath" }

$targetDirectory = Split-Path -Parent $TargetPath
if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) { throw "Bridge target directory does not exist: $targetDirectory" }

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

Invoke-Compile $python $source

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$TargetPath.bak-$timestamp"
$hadTarget = Test-Path -LiteralPath $TargetPath -PathType Leaf
if ($hadTarget) { Copy-Item -LiteralPath $TargetPath -Destination $backup }

try {
    Copy-Item -LiteralPath $source -Destination $TargetPath -Force
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

    Write-Output "Backup: $backup"
    Write-Output "Deployed: $TargetPath"
} catch {
    if ($hadTarget -and (Test-Path -LiteralPath $backup -PathType Leaf)) {
        Copy-Item -LiteralPath $backup -Destination $TargetPath -Force
        Invoke-Compile $python $TargetPath
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
    }
    throw
}
