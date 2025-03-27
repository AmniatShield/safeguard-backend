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
$destinationPath = "./sample.exe"
Download-File -url $downloadUrl -destinationPath $destinationPath

# 2. Send file contents to a server
$filePath = "./logs.log"
$serverUrl = "https://192.168.122.1:3000/analyze"
Send-File-Contents -filePath $filePath -serverUrl $serverUrl
