# Extrai APENAS o log Bluetooth de dentro de um bug report do Android.
#
# O bug report completo tem muita coisa pessoal: logs do sistema, lista de apps
# instalados, redes Wi-Fi conhecidas, identificadores de conta. Este script tira
# de la somente o btsnoop_hci.log e ignora todo o resto.
#
#   .\Extrair-Btsnoop.ps1 -Zip "C:\Users\Voloc\Downloads\bugreport-xxxx.zip"
#
# Depois de extrair, apague o .zip original.
#
# Nota: este arquivo e mantido em ASCII de proposito. O PowerShell 5.1 le .ps1
# como ANSI quando nao ha BOM, e acentos viram lixo em maquinas com outro locale.

param(
    [Parameter(Mandatory = $true)][string]$Zip,
    [string]$Destino
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $Zip)) { throw "Nao encontrei o arquivo: $Zip" }
if (-not $Destino) { $Destino = Join-Path (Split-Path -Parent $PSCommandPath) 'capturas' }
New-Item -ItemType Directory -Path $Destino -Force | Out-Null

$arquivo = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Zip))
try {
    $todos = @($arquivo.Entries)
    $alvos = @($todos | Where-Object { $_.Name -match '^btsnoop' })

    Write-Host ""
    Write-Host ("arquivos no bug report : {0}" -f $todos.Count) -ForegroundColor DarkGray
    Write-Host ("logs Bluetooth achados : {0}" -f $alvos.Count) -ForegroundColor Cyan
    Write-Host ""

    if ($alvos.Count -eq 0) {
        Write-Host "Nenhum btsnoop dentro do zip." -ForegroundColor Yellow
        Write-Host "Causa mais comum: a opcao 'Bluetooth HCI snoop log' nao estava ligada," -ForegroundColor Yellow
        Write-Host "ou o Bluetooth nao foi desligado e religado depois de ligar a opcao." -ForegroundColor Yellow
        $pastas = @($todos | ForEach-Object { Split-Path $_.FullName -Parent } |
                   Where-Object { $_ -match 'bluetooth' } | Sort-Object -Unique)
        if ($pastas.Count -gt 0) {
            Write-Host ""
            Write-Host "pastas com 'bluetooth' encontradas no zip:"
            $pastas | ForEach-Object { Write-Host ("  {0}" -f $_) }
        }
        return
    }

    foreach ($e in $alvos) {
        $saida = Join-Path $Destino $e.Name
        [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $saida, $true)
        $kb = [math]::Round($e.Length / 1KB, 1)
        Write-Host ("extraido: {0,-26} {1,9} KB   (origem: {2})" -f $e.Name, $kb, $e.FullName) -ForegroundColor Green
    }

    Write-Host ""
    Write-Host ("destino: {0}" -f $Destino) -ForegroundColor Cyan
    Write-Host "Agora apague o .zip original. Ele tem muito mais do que precisamos." -ForegroundColor Yellow
}
finally { $arquivo.Dispose() }
