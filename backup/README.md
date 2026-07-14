# Backup noturno do cofre de documentos

Espelha o bucket R2 `zero-pontos-docs` para o disco da máquina que roda o backup
(ideal: o servidor local que já hospeda a pasta de rede, pois fica ligado).
Mantém 7 dias de "lixeira" local para recuperar exclusões acidentais.

## Instalação (uma vez, na máquina do backup)

### 1. Criar o token de acesso (somente leitura) na Cloudflare

Dashboard → **R2** → **Manage R2 API Tokens** → **Create API Token**:

- Nome: `backup-leitura`
- Permissão: **Object Read only**
- Bucket: `zero-pontos-docs`

Anote **Access Key ID**, **Secret Access Key** e o **endpoint** mostrado
(formato `https://<account-id>.r2.cloudflarestorage.com`). O token só lê —
mesmo vazando, ninguém apaga nem altera nada no cofre.

### 2. Instalar o rclone

```powershell
winget install Rclone.Rclone
```

### 3. Configurar o remote `r2docs`

```powershell
rclone config create r2docs s3 provider=Cloudflare access_key_id=SEU_ACCESS_KEY secret_access_key=SEU_SECRET endpoint=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
```

Teste:

```powershell
rclone ls r2docs:zero-pontos-docs
```

Deve listar os arquivos do cofre.

### 4. Testar o script

```powershell
powershell -ExecutionPolicy Bypass -File backup-r2.ps1
```

Confere a pasta `%USERPROFILE%\Backups\zero-pontos-docs` e o log
`%USERPROFILE%\Backups\backup-r2.log`.

### 5. Agendar (diário, 23h)

Em PowerShell **como administrador** (ajuste o caminho do script):

```powershell
schtasks /Create /TN "Backup R2 Zero Pontos" /TR "powershell -ExecutionPolicy Bypass -File C:\CAMINHO\backup-r2.ps1" /SC DAILY /ST 23:00 /RU SYSTEM
```

## Recuperação

- Arquivo apagado por engano do cofre: procurar em
  `%USERPROFILE%\Backups\zero-pontos-docs-lixeira\AAAA-MM-DD\`.
- Restaurar tudo para o bucket (exige token com escrita, criar na hora):
  `rclone sync %USERPROFILE%\Backups\zero-pontos-docs r2docs-rw:zero-pontos-docs`
