# PowerShell script for fast sandbox monitoring of file system changes
# Run with administrative privileges for %ProgramData% and All Users Startup folder

# Define paths to monitor
$paths = @(
    $env:LOCALAPPDATA,
    $env:ProgramData,
    "$env:USERPROFILE\Documents",
    $env:TEMP,
    $env:APPDATA,
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup", # Per-user Startup
    "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"  # All Users Startup
)

# Function to capture snapshot of files and folders in a path (top-level only)
function Get-FolderSnapshot {
    param ($path)
    $snapshot = @{}
    try {
        if (-not (Test-Path $path)) {
            return @{ "Error" = "Path does not exist" }
        }
        # Get top-level items only (no -Recurse)
        $items = Get-ChildItem -Path $path -ErrorAction SilentlyContinue | 
                 Select-Object Name, @{Name="ItemType";Expression={if ($_.PSIsContainer) {"Folder"} else {"File"}}}
        $snapshot["Items"] = $items
        return $snapshot
    } catch {
        return @{ "Error" = "Error accessing path: $_" }
    }
}

# Function to compare two snapshots and detect changes
function Compare-Snapshots {
    param ($before, $after, $path)
    Write-Host "`nChanges in $path :"
    if ($before.ContainsKey("Error") -or $after.ContainsKey("Error")) {
        Write-Host "Cannot compare - Before: $($before["Error"]), After: $($after["Error"])"
        return
    }

    $beforeNames = $before["Items"] | ForEach-Object { "$($_.ItemType):$($_.Name)" } | Sort-Object
    $afterNames = $after["Items"] | ForEach-Object { "$($_.ItemType):$($_.Name)" } | Sort-Object

    # Find new items
    $newItems = $afterNames | Where-Object { $_ -notin $beforeNames }
    # Find deleted items
    $deletedItems = $beforeNames | Where-Object { $_ -notin $afterNames }

    if ($newItems.Count -eq 0 -and $deletedItems.Count -eq 0) {
        Write-Host "No changes detected"
    } else {
        if ($newItems.Count -gt 0) {
            Write-Host "New items:"
            $newItems | ForEach-Object { Write-Host "  $_" }
        }
        if ($deletedItems.Count -gt 0) {
            Write-Host "Deleted items:"
            $deletedItems | ForEach-Object { Write-Host "  $_" }
        }
    }
}

# Stage 1: Take snapshot before execution
$beforeSnapshots = @{}
Write-Host "Taking snapshot before execution..."
foreach ($path in $paths) {
    $beforeSnapshots[$path] = Get-FolderSnapshot -path $path
}

# Stage 2: Execute the uploaded file and wait 10 seconds, then kill the process
Write-Host "`nExecuting uploaded file..."

# Start the script as a separate process
$process = Start-Process -FilePath "powershell.exe" -ArgumentList "-File `"$tempScriptPath`"" -PassThru -ErrorAction SilentlyContinue
Write-Host "Started process with ID: $($process.Id)"

# Wait for 10 seconds
Start-Sleep -Seconds 10

# Terminate the process
Write-Host "Terminating process..."
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
Write-Host "Process terminated."

# Stage 3: Take snapshot after execution
$afterSnapshots = @{}
Write-Host "`nTaking snapshot after execution..."
foreach ($path in $paths) {
    $afterSnapshots[$path] = Get-FolderSnapshot -path $path
}

# Stage 4: Compare snapshots
Write-Host "`nComparing snapshots..."
foreach ($path in $paths) {
    Compare-Snapshots -before $beforeSnapshots[$path] -after $afterSnapshots[$path] -path $path
}

Write-Host "`nScript execution completed."