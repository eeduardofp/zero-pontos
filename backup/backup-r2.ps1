# ─── Backup noturno do cofre de documentos (R2 → disco local) ───
# Espelha o bucket zero-pontos-docs para uma pasta local via rclone.
# Pré-requisito: rclone instalado e remote "r2docs" configurado
# (ver backup\README.md). Agendar diário no Task Scheduler.

param(
  [string]$Destino = "$env:USERPROFILE\Backups\zero-pontos-docs"
)

$log = Join-Path (Split-Path $Destino -Parent) "backup-r2.log"
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Iniciando backup..." | Out-File $log -Append -Encoding utf8

# sync = espelho fiel do bucket. Exclusões acidentais no bucket também
# somem da cópia — por isso o backup roda DEPOIS do dia de trabalho e
# mantemos 7 dias de lixeira local com --backup-dir.
$lixeira = Join-Path (Split-Path $Destino -Parent) "zero-pontos-docs-lixeira\$(Get-Date -Format 'yyyy-MM-dd')"
rclone sync r2docs:zero-pontos-docs $Destino --backup-dir $lixeira --log-file $log --log-level INFO

if ($LASTEXITCODE -eq 0) {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup concluído com sucesso." | Out-File $log -Append -Encoding utf8
} else {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERRO: rclone saiu com código $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
}

# Limpa lixeiras com mais de 7 dias
$lixeiraRaiz = Join-Path (Split-Path $Destino -Parent) "zero-pontos-docs-lixeira"
if (Test-Path $lixeiraRaiz) {
  Get-ChildItem $lixeiraRaiz -Directory | Where-Object {
    $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and ([datetime]$_.Name) -lt (Get-Date).AddDays(-7)
  } | Remove-Item -Recurse -Force -Confirm:$false
}
