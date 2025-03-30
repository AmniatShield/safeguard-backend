# Specify the target process executable and Strings tool path
$targetExe = "C:\Users\WarrioR\Desktop\worm.exe"  # <-- Change to your target process
$stringsTool = "C:\Users\WarrioR\Desktop\strings64.exe"    # <-- Change to the path of Strings tool

# Define output directory and file paths
$outputDir    = "C:\Users\WarrioR\Desktop\AnalysisOutput"
$stringsOutput = "$outputDir\StringsOutput.txt"
$baselineFile = "$outputDir\HKCU_Baseline.reg"
$postFile     = "$outputDir\HKCU_Post.reg"
$diffFile     = "$outputDir\HKCU_Diff.txt"
$ConnectionFile = "$outputDir\connect.txt"

# Ensure the output directory exists
if (-not (Test-Path $outputDir)) {
    New-Item -Path $outputDir -ItemType Directory | Out-Null
}

# Start the target process and capture the process object
Write-Output "Starting target process: $targetExe"
$process = Start-Process -FilePath $targetExe -PassThru

# Allow the process to initialize
Start-Sleep -Seconds 10

# Extract strings from the target executable using the Strings tool
Write-Output "Extracting strings from: $targetExe"
Start-Process -FilePath $stringsTool -ArgumentList "-nobanner -n 6 -o -a -u `"$targetExe`"" -RedirectStandardOutput $stringsOutput -NoNewWindow -Wait

# Export the baseline snapshot of the HKCU hive
Write-Output "Exporting baseline HKCU registry snapshot..."
reg export HKCU $baselineFile /y

# Let the process run for some minute
Write-Output "Running process for 2 minute..."
Start-Sleep -Seconds 120

# Capture network connections associated with the process after it has run
$connections = Get-NetTCPConnection | Where-Object { $_.OwningProcess -eq $process.Id }

# Attempt to stop the process if it's still running
Write-Output "Stopping target process (PID: $($process.Id))..."
try {
    $process.Refresh()
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        Write-Output "Process stopped."
    } else {
        Write-Output "Process has already terminated."
    }
}
catch {
    Write-Output "Error stopping process: $_"
}

# Output the connections to file
$connections | Format-Table -Property LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Out-File -FilePath $ConnectionFile

# Export the post-process snapshot of the HKCU hive
Write-Output "Exporting post-process HKCU registry snapshot..."
reg export HKCU $postFile /y

# Compare the two registry snapshots
Write-Output "Comparing registry snapshots..."
$baselineContent = Get-Content $baselineFile -ErrorAction SilentlyContinue
$postContent     = Get-Content $postFile -ErrorAction SilentlyContinue
$diff = Compare-Object -ReferenceObject $baselineContent -DifferenceObject $postContent

# Save the differences to a diff file
$diff | Out-File -FilePath $diffFile

Write-Output "Strings extraction completed. Output saved to: $stringsOutput"
Write-Output "Registry changes have been logged to: $diffFile"
