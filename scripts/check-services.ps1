$ErrorActionPreference = "Stop"

function Pass($name) {
    Write-Host "[CONNECTED] $name" -ForegroundColor Green
}

function Fail($name, $detail) {
    Write-Host "[FAILED] $name - $detail" -ForegroundColor Red
}

function Skip($name) {
    Write-Host "[NOT CONFIGURED] $name" -ForegroundColor Yellow
}

Write-Host "`n===== MINI BOOK DIAGNOSTIC =====`n"

if (!(Test-Path ".env")) {
    Write-Host "[FAILED] .env tidak ditemukan" -ForegroundColor Red
    exit 1
}

$cfg = @{}

Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+?)\s*=\s*"(.*)"\s*$') {
        $cfg[$matches[1].Trim()] = $matches[2]
    }
}

# SUPABASE
$url = $cfg["VITE_SUPABASE_URL"]
$key = $cfg["VITE_SUPABASE_PUBLISHABLE_KEY"]

if ($url -and $key) {
    try {
        $response = Invoke-RestMethod `
            -Uri "$($url.TrimEnd('/'))/auth/v1/health" `
            -Headers @{ apikey = $key } `
            -TimeoutSec 15

        Pass "Supabase Auth API"
    }
    catch {
        $status = "Unknown"
        $detail = $_.Exception.Message

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader(
                    $_.Exception.Response.GetResponseStream()
                )
                $detail = $reader.ReadToEnd()
                $reader.Dispose()
            } catch {}
        }

        Fail "Supabase Auth API" "HTTP $status - $detail"
    }
} else {
    Skip "Supabase"
}

# GOOGLE BOOKS (server-side secret)
$googleKey = $cfg["GOOGLE_BOOKS_API_KEY"]

if ($googleKey) {
    try {
        $uri = "https://www.googleapis.com/books/v1/volumes?q=harry+potter&maxResults=1&key=$googleKey"
        $response = Invoke-RestMethod -Uri $uri -TimeoutSec 20
        Pass "Google Books API"
    }
    catch {
        Fail "Google Books API" $_.Exception.Message
    }
} else {
    Skip "Google Books API"
}

# APPLICATION HOSTING
$appUrl = $cfg["APP_URL"]

if ($appUrl -and $appUrl -ne "MY_APP_URL") {
    try {
        $response = Invoke-WebRequest -Uri $appUrl -TimeoutSec 20 -UseBasicParsing
        Pass "Application Hosting"
    }
    catch {
        Fail "Application Hosting" $_.Exception.Message
    }
} else {
    Skip "Application Hosting"
}

Write-Host "`n===== TEST COMPLETED ====="
