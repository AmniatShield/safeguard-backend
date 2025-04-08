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

    try {
        # Read the file contents
        $fileContents = Get-Content -Path $filePath -Raw

        # Prepare the HTTP request body
        $body = @{
            "log" = $fileContents
        }

        # Send POST request to the server
        $response = Invoke-RestMethod -Uri $serverUrl -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json)

        Write-Host "Response from server: $response"
    } catch {
        Write-Host "Error sending file contents: $_"
    }
}

# Example Usage:
# 1. Download a file
$downloadUrl = "http://192.168.122.1:3000/download"
$sampleFilePath = ".\sample.exe"
Download-File -url $downloadUrl -destinationPath $sampleFilePath

$stringsTool = ".\sysinternals\strings64.exe"    # <-- Change to the path of Strings tool
# Define output directory and file paths
$outputDir    = ".\AnalysisOutput"
$stringsOutput = "$outputDir\StringsOutput.txt"
$baselineFile = "$outputDir\HKCU_Baseline.reg"
$postFile     = "$outputDir\HKCU_Post.reg"
$diffFile     = "$outputDir\HKCU_Diff.txt"
$logFile      = ".\logs.log"
$ConnectionFile = "$outputDir\connect.txt"
# Ensure the output directory exists
if (-not (Test-Path $outputDir)) {
    New-Item -Path $outputDir -ItemType Directory | Out-Null
}

Write-Output "Starting target process: $sampleFilePath"
$process = Start-Process -FilePath $sampleFilePath -PassThru


# Allow the process to initialize
Start-Sleep -Seconds 10

# Extract strings from the target executable using the Strings tool
Write-Output "Extracting strings from: $sampleFilePath"
Start-Process -FilePath $stringsTool -ArgumentList "-nobanner -n 6 -o -a -u `"$sampleFilePath`"" -RedirectStandardOutput $stringsOutput -NoNewWindow -Wait
.

# Export the baseline snapshot of the HKCU hive
Write-Output "Exporting baseline HKCU registry snapshot..."
reg export HKCU $baselineFile /y

# Let the process run for 1 minute
Write-Output "Running process for 1 minute..."
Start-Sleep -Seconds 60

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

$connections | Format-Table -Property LocalAddress, LocalPort, RemoteAddress, RemotePort, State | Out-File -FilePath $ConnectionFile

Write-Output "Strings extraction completed. Output saved to: $stringsOutput"
Write-Output "Registry changes have been logged to: $diffFile"
Write-Output "Connections made by the sample:\n" | Out-File -FilePath $logFile -Append
Get-Content -Path $ConnectionFile | Out-File -FilePath $logFile -Append
Write-Output "Strings extracted from the sample:" | Out-File -FilePath $logFile -Append
Get-Content -Path $stringsOutput | Out-File -FilePath $logFile -Append
Write-Output "Registry changes made by the sample" | Out-File -FilePath $logFile -Append
Get-Content -Path $diffFile | Out-File -FilePath $logFile -Append
# 2. Send file contents to a server
$serverUrl = "https://192.168.122.1:3000/analyze"
Send-File-Contents -filePath $logFile -serverUrl $serverUrl
