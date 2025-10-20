# Fund STAGING Devnet Wallets
# Run this script to fund STAGING wallets with devnet SOL

Write-Host "`n💰 Funding STAGING Wallets with Devnet SOL..." -ForegroundColor Cyan

$wallets = @{
    "Sender" = "AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z"
    "Receiver" = "5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4"
    "Admin" = "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R"
    "FeeCollector" = "8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ"
}

$amounts = @{
    "Sender" = 5
    "Receiver" = 5
    "Admin" = 3
    "FeeCollector" = 3
}

foreach ($name in $wallets.Keys) {
    $address = $wallets[$name]
    $amount = $amounts[$name]
    
    Write-Host "`nFunding $name ($amount SOL)..." -ForegroundColor Yellow
    Write-Host "  Address: $address"
    
    $result = solana airdrop $amount $address --url devnet 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Success!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Failed: $result" -ForegroundColor Red
        Write-Host "  Tip: Wait a few minutes and try again (rate limit)" -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds 2
}

Write-Host "`n📊 Checking Balances..." -ForegroundColor Cyan

foreach ($name in $wallets.Keys) {
    $address = $wallets[$name]
    $balance = solana balance $address --url devnet
    Write-Host "  $name : $balance"
}

Write-Host "`n✅ Funding complete!" -ForegroundColor Green
Write-Host "If any wallet failed, wait 5-10 minutes and run this script again.`n"

