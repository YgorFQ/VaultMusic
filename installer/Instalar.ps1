$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
try {
    $runtimePath = Join-Path $packageRoot 'runtime\node.exe'
    if (-not (Test-Path -LiteralPath $runtimePath)) {
        throw 'Este e o codigo-fonte. Baixe o ZIP VaultMusic-Windows-x64 em Releases e extraia todos os arquivos antes de abrir Instalar.cmd.'
    }
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Selecione Mei Music.exe ORIGINAL (versao 1.1.21)'
    $picker.Filter = 'Mei Music|Mei Music.exe'
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
    $originalFolder = Split-Path -Parent $picker.FileName
    $destination = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'VaultMusic\App'
    Write-Host 'Criando sua copia independente. A pasta original sera preservada.'
    & $runtimePath (Join-Path $PSScriptRoot 'install.mjs') --source $originalFolder --destination $destination
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao interrompida. Confira a mensagem acima.' }
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktopPath 'VaultMusic.lnk'))
    $shortcut.TargetPath = Join-Path $destination 'Abrir-VaultMusic.cmd'
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = Join-Path $destination 'Mei Music.exe'
    $shortcut.Save()
    [System.Windows.Forms.MessageBox]::Show("Instalado em: $destination`n`nAbra pelo atalho VaultMusic da area de trabalho.`nPara configurar sua conta, siga docs\CONECTAR-YOUTUBE.md deste pacote.", 'VaultMusic') | Out-Null
} catch {
    Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
