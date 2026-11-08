param([ValidateSet('Expand','Compress')][string]$Action,[string]$Source,[string]$Destination)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'Expand') {
    Expand-Archive -LiteralPath $Source -DestinationPath $Destination
} else {
    $items = @(Get-ChildItem -LiteralPath $Source -Force | Select-Object -ExpandProperty FullName)
    Compress-Archive -LiteralPath $items -DestinationPath $Destination -CompressionLevel Optimal
}
