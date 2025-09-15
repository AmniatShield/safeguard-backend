$scriptDir = Split-Path -Parent $PSCommandPath
Set-Location -Path $scriptDir


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


# Function 1: Download a file from a given URL
function Download-File {
    param(
        [string]$url,  # URL to download the file from
        [string]$destinationPath  # Local path where the file should be saved
    )

    try {
        Write-Host "Downloading file from $url to $destinationPath..."
        Invoke-WebRequest -Uri $url -OutFile $destinationPath
        Write-Host "Download completed."
    } catch {
        Write-Host "Error downloading the file: $_"
    }
}

# Function 2: Read contents of a text file and send it to a server with a POST request
function Send-File-Contents {
    param(
        [string]$filePath,  # Path to the text file
        [string]$serverUrl  # URL of the server to send the POST request to
    )
        $curlPath = "sysinternals\curl.exe"
    try {
        & $curlPath -X POST $serverUrl `
  -H "Content-Type: multipart/form-data" `
  -F "file=@$filePath;type=text/plain"
        Write-Host "Response from server: $response"
    } catch {
        Write-Host "Error sending file contents: $_"
    }
}

# 1. Download a file
$downloadUrl = "http://192.168.122.1:3000/download"
$sampleFilePath = ".\sample.exe"
Download-File -url $downloadUrl -destinationPath $sampleFilePath

$flossTool = "sysinternals\floss.exe"
$handleTool = "sysinternals\handle64.exe"
# Define output directory and file paths
$outputDir    = "AnalysisOutput"
$stringsOutput = "$outputDir\StringsOutput.txt"
$baselineFile = "$outputDir\HKCU_Baseline.reg"
$postFile     = "$outputDir\HKCU_Post.reg"
$diffFile     = "$outputDir\HKCU_Diff.txt"
$openHandles  = "$outputDir\handles.txt"
$fileDiffs    = "$outputDir\fileDiffs.txt"
$logFile      = "logs.log"
$ConnectionFile = "$outputDir\connect.txt"
# Ensure the output directory exists
if (-not (Test-Path $outputDir)) {
    New-Item -Path $outputDir -ItemType Directory | Out-Null
}

# Stage 1: Take snapshot before execution
$beforeSnapshots = @{}
Write-Host "Taking snapshot before execution..."
foreach ($path in $paths) {
    $beforeSnapshots[$path] = Get-FolderSnapshot -path $path
}


# Extract strings from the target executable using the Strings tool
Write-Output "Extracting strings from: $sampleFilePath"
Start-Process -FilePath $flossTool -ArgumentList "--only static 8 -q `"$sampleFilePath`"" -RedirectStandardOutput $stringsOutput -NoNewWindow -Wait

# Export the baseline snapshot of the HKCU hive
Write-Output "Exporting baseline HKCU registry snapshot..."
reg export HKCU $baselineFile /y

Write-Output "Starting target process: $sampleFilePath"
$process = Start-Process -FilePath $sampleFilePath -PassThru
$pidd = $process.Id

# Allow the process to initialize
Start-Sleep -Seconds 5

# Let the process run for 1 minute
Write-Output "Running process for 1 minute..."
Start-Sleep -Seconds 5
# Get Open File Handles
Start-Process -FilePath $handleTool -ArgumentList "-p $pidd" -RedirectStandardOutput $openHandles -NoNewWindow -Wait
# Get Network connections
$connections = Get-NetTCPConnection | Where-Object { $_.OwningProcess -eq $pidd }
# Attempt to stop the process if it's still running
Write-Output "Stopping target process (PID: $($process.pidd))..."
try {
    $process.Refresh()
    if (-not $process.HasExited) {
        Stop-Process -Id $pidd -Force
        Write-Output "Process stopped."
    } else {
        Write-Output "Process has already terminated."
    }
}
catch {
    Write-Output "Error stopping process: $_"
}

# Export the post-process snapshot of the HKCU hive
Write-Output "Exporting post-process HKCU registry snapshot..."
reg export HKCU $postFile /y

$afterSnapshots = @{}
Write-Host "`nTaking snapshot after execution..."
foreach ($path in $paths) {
    $afterSnapshots[$path] = Get-FolderSnapshot -path $path
}


# Compare the two registry snapshots
Write-Output "Comparing registry snapshots..."
$baselineContent = Get-Content $baselineFile -ErrorAction SilentlyContinue
$postContent     = Get-Content $postFile -ErrorAction SilentlyContinue
$diff = Compare-Object -ReferenceObject $baselineContent -DifferenceObject $postContent

# Compare snapshots
Write-Host "`nComparing snapshots..."
foreach ($path in $paths) {
    Compare-Snapshots -before $beforeSnapshots[$path] -after $afterSnapshots[$path] -path $path | Out-File -FilePath $fileDiffs -Append
}

# Save the differences to a diff file
$diff | Out-File -FilePath $diffFile

$connections | Format-Table -Property LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Out-File -FilePath $ConnectionFile

Write-Output "Strings extraction completed. Output saved to: $stringsOutput"
Write-Output "Registry changes have been logged to: $diffFile"
Write-Output "Connections made by the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $ConnectionFile | Out-File -FilePath $logFile -Append
Write-Output "static Strings extracted from the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $stringsOutput | Out-File -FilePath $logFile -Append
Write-Output "Registry changes made by the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $diffFile | Out-File -FilePath $logFile -Append
Write-Output "Open file handles made by the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $openHandles | Out-File -FilePath $logFile -Append
Write-Output "File changes made by the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $fileDiffs | Out-File -FilePath $logFile -Append
# 2. Send file contents to a server
$serverUrl = "http://192.168.122.1:3000/analyze"
Send-File-Contents -filePath $logFile -serverUrl $serverUrl
