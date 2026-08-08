/* NothingAppX — casco nativo (Tauri).
 *
 * O Rust faz UMA coisa aqui: abrir o canal RFCOMM (SPP) com o fone e
 * transportar bytes crus nos dois sentidos. Todo o protocolo — framing, CRC,
 * comandos, decodificacao — continua no JavaScript (web/protocolo.js), que e'
 * a mesma base que roda no navegador. Assim existe um unico lugar onde o
 * protocolo mora, e este arquivo nao precisa saber o que os bytes significam.
 *
 * Comandos expostos ao webview:
 *   bt_conectar()    -> nome do aparelho; comeca a emitir eventos "bt-dados"
 *   bt_enviar(dados) -> escreve bytes crus no canal
 *   bt_desconectar()
 * Evento "bt-caiu" avisa quando a leitura morre (fone desligou/saiu de alcance).
 *
 * Viabilidade provada em 07/08/2026 pelo spike-rfcomm/ (bateria lida por este
 * mesmo caminho). Por ora so Windows; em Linux/mac o app abre e cai para o
 * Web Serial se o webview expuser, senao reporta sem transporte.
 */

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
mod bt {
    use windows::core::GUID;
    use windows::Devices::Bluetooth::Rfcomm::{RfcommDeviceService, RfcommServiceId};
    use windows::Devices::Enumeration::DeviceInformation;
    use windows::Networking::Sockets::StreamSocket;
    use windows::Storage::Streams::{DataReader, DataWriter, InputStreamOptions};

    // UUID SPP da Nothing/CMF — o mesmo de web/protocolo.js
    const SPP_UUID: u128 = 0xaeac4a03_dff5_498f_843a_34487cf133eb;

    pub struct Canal {
        _socket: StreamSocket,
        escritor: DataWriter,
        pub nome: String,
    }

    // Os objetos WinRT usados aqui sao "agile" (thread-safe por contrato COM);
    // o wrapper so' torna isso visivel ao compilador.
    unsafe impl Send for Canal {}

    pub fn conectar() -> Result<(Canal, DataReader), String> {
        // 0x80072740 (WSAEADDRINUSE): outro processo segura o canal SPP —
        // quase sempre outra copia deste app. Reproduzido e confirmado em
        // 07/08/2026: com a outra instancia fechada, conecta na hora, mesmo
        // com o fone ja conectado ao Windows.
        let erro = |e: windows::core::Error| {
            if e.code().0 as u32 == 0x8007_2740 { "CANAL_OCUPADO".to_string() }
            else { e.message().to_string() }
        };
        let id = RfcommServiceId::FromUuid(GUID::from_u128(SPP_UUID)).map_err(erro)?;
        let seletor = RfcommDeviceService::GetDeviceSelector(&id).map_err(erro)?;
        let achados = DeviceInformation::FindAllAsyncAqsFilter(&seletor)
            .map_err(erro)?.join().map_err(erro)?;
        if achados.Size().map_err(erro)? == 0 {
            return Err("nenhum fone pareado com o servico Nothing".into());
        }
        let alvo = achados.GetAt(0).map_err(erro)?;
        let servico = RfcommDeviceService::FromIdAsync(&alvo.Id().map_err(erro)?)
            .map_err(erro)?.join().map_err(erro)?;
        // o nome que interessa e' o do FONE ("CMF Buds 2 Plus"), nao o do
        // servico ("NTAPP") — e' por ele que a interface reconhece o modelo
        let nome = servico
            .Device()
            .and_then(|d| d.Name())
            .map(|n| n.to_string())
            .unwrap_or_else(|_| alvo.Name().map(|n| n.to_string()).unwrap_or_default());
        let socket = StreamSocket::new().map_err(erro)?;
        socket
            .ConnectAsync(
                &servico.ConnectionHostName().map_err(erro)?,
                &servico.ConnectionServiceName().map_err(erro)?,
            )
            .map_err(erro)?.join().map_err(erro)?;
        let escritor = DataWriter::CreateDataWriter(&socket.OutputStream().map_err(erro)?)
            .map_err(erro)?;
        let leitor = DataReader::CreateDataReader(&socket.InputStream().map_err(erro)?)
            .map_err(erro)?;
        leitor.SetInputStreamOptions(InputStreamOptions::Partial).map_err(erro)?;
        Ok((Canal { _socket: socket, escritor, nome }, leitor))
    }

    pub fn enviar(canal: &Canal, dados: &[u8]) -> Result<(), String> {
        let erro = |e: windows::core::Error| e.message().to_string();
        canal.escritor.WriteBytes(dados).map_err(erro)?;
        canal.escritor.StoreAsync().map_err(erro)?.join().map_err(erro)?;
        Ok(())
    }

    /// Le ate' 1024 bytes; Ok(vazio) significa canal encerrado do outro lado.
    pub fn ler(leitor: &DataReader) -> Result<Vec<u8>, String> {
        let erro = |e: windows::core::Error| e.message().to_string();
        let n = leitor.LoadAsync(1024).map_err(erro)?.join().map_err(erro)?;
        let mut buf = vec![0u8; n as usize];
        if n > 0 {
            leitor.ReadBytes(&mut buf).map_err(erro)?;
        }
        Ok(buf)
    }
}

#[cfg(windows)]
struct Estado(Mutex<Option<bt::Canal>>);

/* ---------------------------------------------------------- Equalizer APO
 * Fase 2a do DSP: o perfil por ouvido escrito DIRETO na pasta de config do
 * Equalizer APO, que roda dentro do pipeline de audio do Windows. Sem cabo
 * virtual, sem risco de derrubar o codec, e a correcao sobrevive ao app
 * fechado — exatamente o que o Android faz com o efeito da Audiodo.
 * O EqAPO rele a config ao salvar; o efeito e' imediato. */

#[cfg(windows)]
const APO_ARQUIVO: &str = "NothingAppX.txt";
#[cfg(windows)]
const APO_INCLUDE: &str = "Include: NothingAppX.txt";

#[cfg(windows)]
fn apo_pasta() -> Option<std::path::PathBuf> {
    // instalacao padrao; cobre x64 e x86
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(base) = std::env::var(var) {
            let dir = std::path::Path::new(&base).join("EqualizerAPO").join("config");
            if dir.join("config.txt").exists() {
                return Some(dir);
            }
        }
    }
    None
}

#[cfg(windows)]
#[tauri::command]
fn apo_detectar() -> Option<String> {
    apo_pasta().map(|d| d.to_string_lossy().into_owned())
}

#[cfg(windows)]
#[tauri::command]
fn apo_aplicar(perfil: String) -> Result<(), String> {
    let erro = |e: std::io::Error| {
        if e.kind() == std::io::ErrorKind::PermissionDenied { "SEM_PERMISSAO".into() }
        else { e.to_string() }
    };
    let dir = apo_pasta().ok_or("APO_AUSENTE")?;
    std::fs::write(dir.join(APO_ARQUIVO), perfil).map_err(erro)?;
    let cfg = dir.join("config.txt");
    let texto = std::fs::read_to_string(&cfg).map_err(erro)?;
    if !texto.lines().any(|l| l.trim() == APO_INCLUDE) {
        std::fs::write(&cfg, format!("{}\r\n{}\r\n", texto.trim_end(), APO_INCLUDE))
            .map_err(erro)?;
    }
    Ok(())
}

/* ------------------------------------------------ endpoint de audio padrao
 * O Windows registra APOs POR ENDPOINT (por dispositivo de saida). Para
 * ativar o EqAPO no fone sem o usuario abrir o Device Selector, precisamos
 * saber qual endpoint esta' tocando agora — e' nele que o registro entra. */
#[cfg(windows)]
mod audio {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };

    /// GUID (com chaves) do endpoint de reproducao padrao, ex.
    /// "{baf4dbde-58d4-4375-ad0e-0e3571b7963e}". O id completo vem como
    /// "{0.0.0.00000000}.{guid}"; so o trecho final interessa ao registro.
    pub fn endpoint_padrao() -> Result<String, String> {
        unsafe {
            // a runtime pode ja ter inicializado COM nesta thread; nao e' fatal
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let erro = |e: windows::core::Error| e.message().to_string();
            let enumerador: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(erro)?;
            let disp = enumerador
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(erro)?;
            let id = disp.GetId().map_err(erro)?;
            let texto = id.to_string().map_err(|e| e.to_string())?;
            CoTaskMemFree(Some(id.0 as *const _));
            texto
                .rsplit('.')
                .next()
                .map(str::to_string)
                .ok_or_else(|| "id de endpoint inesperado".into())
        }
    }
}

// CLSIDs COM do Equalizer APO 1.4.2 (SFX/MFX) e as chaves de efeito do
// endpoint onde eles entram — o mesmo que o Device Selector grava.
#[cfg(windows)]
const EQAPO_SFX: &str = "{EACD2258-FCAC-4FF4-B36D-419E924A6D79}";
#[cfg(windows)]
const EQAPO_MFX: &str = "{EC1CC9CE-FAED-4822-828A-82A81A6F018F}";
#[cfg(windows)]
const PKEY_FX: &str = "{d04e05a6-594b-4fb6-a80d-01af5eed7d1d}";
#[cfg(windows)]
const PKEY_COMPOSITE: &str = "{d3993a3f-99c2-4402-b5ec-a92a0367664b}";

/// Roda um trecho de PowerShell ELEVADO (um pedido de administrador na tela).
/// O resultado volta por arquivo porque um processo elevado nao compartilha
/// stdout com quem o lancou. "UAC_RECUSADO" = o usuario negou o pedido.
#[cfg(windows)]
fn rodar_elevado(nome: &str, corpo: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const SEM_JANELA: u32 = 0x0800_0000;
    let script = std::env::temp_dir().join(format!("nothingappx-{nome}.ps1"));
    let resultado = std::env::temp_dir().join(format!("nothingappx-{nome}.resultado"));
    let _ = std::fs::remove_file(&resultado);
    let completo = format!(
        "$ErrorActionPreference = 'Stop'\ntry {{\n{corpo}\n'OK' | Out-File -Encoding utf8 '{res}'\n}} catch {{\n\"ERRO: $_\" | Out-File -Encoding utf8 '{res}'\n}}\n",
        corpo = corpo,
        res = resultado.display(),
    );
    std::fs::write(&script, completo).map_err(|e| e.to_string())?;
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command"])
        .arg(format!(
            "Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
            script.display()
        ))
        .creation_flags(SEM_JANELA)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("UAC_RECUSADO".into());
    }
    let texto = std::fs::read_to_string(&resultado).unwrap_or_default();
    let texto = texto.trim_start_matches('\u{feff}').trim().to_string();
    if texto.starts_with("OK") {
        Ok(texto)
    } else if texto.is_empty() {
        Err("SEM_RESULTADO".into())
    } else {
        Err(texto)
    }
}

/// O endpoint padrao ja tem o Equalizer APO registrado?
#[cfg(windows)]
#[tauri::command]
fn apo_endpoint_registrado() -> Result<serde_json::Value, String> {
    let guid = audio::endpoint_padrao()?;
    let caminho = format!(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render\\{guid}\\FxProperties"
    );
    let hklm = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);
    let registrado = hklm
        .open_subkey(&caminho)
        .ok()
        .map(|k| {
            [",5", ",6", ",7"].iter().any(|sufixo| {
                k.get_value::<String, _>(format!("{PKEY_FX}{sufixo}"))
                    .map(|v| {
                        let v = v.to_uppercase();
                        v.contains(&EQAPO_SFX[1..9]) || v.contains(&EQAPO_MFX[1..9])
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    Ok(serde_json::json!({ "endpoint": guid, "registrado": registrado }))
}

/* Registra o Equalizer APO no endpoint padrao — o equivalente de marcar o
 * dispositivo no Device Selector, sem GUI. Validado em campo (07-08/08/2026,
 * endpoint Bluetooth com driver Intel SST): gravar SFX/MFX basta; valores
 * "composite" so sao removidos quando ORFAOS (CLSID inexistente no sistema),
 * caso real observado apos desinstalacao — apontavam para efeito que nao
 * existe e derrubavam a cadeia. Backup .reg fica em ProgramData\NothingAppX. */
/* Os tres comandos abaixo demoram (UAC + instalador + reinicio de servico).
 * Comando sincrono no Tauri roda na thread PRINCIPAL e congela a janela ate
 * voltar — visto em campo em 08/08 (app travado durante o apo_instalar).
 * Por isso: async + spawn_blocking, a espera acontece fora do event loop. */

#[cfg(windows)]
#[tauri::command]
async fn apo_registrar() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(apo_registrar_corpo)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn apo_registrar_corpo() -> Result<(), String> {
    let guid = audio::endpoint_padrao()?;
    let corpo = format!(
        r#"$guid = '{guid}'
$sub = "SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$guid\FxProperties"
$pasta = "$env:ProgramData\NothingAppX"
New-Item -ItemType Directory -Force $pasta | Out-Null
reg export "HKLM\$sub" "$pasta\backup-fx-$($guid.Trim('{{}}')).reg" /y | Out-Null
$k = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine','Registry64').OpenSubKey($sub, 'ReadWriteSubTree', 'QueryValues, SetValue')
if ($null -eq $k) {{ throw 'FX_AUSENTE' }}
$k.SetValue('{pkey_fx},5', '{sfx}')
$k.SetValue('{pkey_fx},6', '{mfx}')
foreach ($sufixo in '5','6','7') {{
    $nome = '{pkey_composite},' + $sufixo
    try {{ $ids = [string]$k.GetValue($nome) }} catch {{ continue }}
    if (-not $ids) {{ continue }}
    $vivos = @($ids -split '\s+' | Where-Object {{ $_ -and (Test-Path "Registry::HKEY_CLASSES_ROOT\CLSID\$_") }})
    if ($vivos.Count -eq 0) {{ try {{ $k.DeleteValue($nome) }} catch {{}} }}
}}
$k.Close()
Restart-Service Audiosrv -Force"#,
        guid = guid,
        pkey_fx = PKEY_FX,
        pkey_composite = PKEY_COMPOSITE,
        sfx = EQAPO_SFX,
        mfx = EQAPO_MFX,
    );
    rodar_elevado("registra-eqapo", &corpo).map(|_| ())
}

/// Reinicia o servico de audio (pedido de administrador). Necessario quando o
/// EqAPO nao rele a config sozinho — visto em campo: a releitura ao vivo pode
/// quebrar e so' a re-inicializacao do APO aplica as mudancas.
#[cfg(windows)]
#[tauri::command]
async fn apo_reativar() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        rodar_elevado("reinicia-audio", "Restart-Service Audiosrv -Force").map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

/* Instala o Equalizer APO (GPL) SEM download: o instalador oficial 1.4.2 vem
 * embutido no pacote do app e roda silencioso (/S, NSIS) ja elevado. Se o
 * recurso nao estiver no pacote (build de desenvolvimento), cai para o
 * download oficial do SourceForge como antes. */
#[cfg(windows)]
#[tauri::command]
async fn apo_instalar(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || apo_instalar_corpo(app))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn apo_instalar_corpo(app: AppHandle) -> Result<(), String> {
    const URL: &str =
        "https://sourceforge.net/projects/equalizerapo/files/1.4.2/EqualizerAPO-x64-1.4.2.exe/download";
    let embutido = app
        .path()
        .resolve("eqapo/EqualizerAPO-x64-1.4.2.exe", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());
    let instalador = match embutido {
        Some(p) => p,
        None => {
            let destino = std::env::temp_dir().join("EqualizerAPO-x64-1.4.2.exe");
            let ok = std::process::Command::new("curl.exe")
                .args(["-L", "-s", "-o"])
                .arg(&destino)
                .arg(URL)
                .status()
                .map_err(|e| e.to_string())?
                .success();
            let tamanho = std::fs::metadata(&destino).map(|m| m.len()).unwrap_or(0);
            if !ok || tamanho < 5_000_000 {
                return Err("DOWNLOAD_FALHOU".into());
            }
            destino
        }
    };
    rodar_elevado(
        "instala-eqapo",
        &format!("Start-Process '{}' -ArgumentList '/S' -Wait", instalador.display()),
    )?;
    if apo_pasta().is_none() {
        return Err("INSTALACAO_FALHOU".into());
    }
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
fn apo_remover() -> Result<(), String> {
    let Some(dir) = apo_pasta() else { return Ok(()) };
    let cfg = dir.join("config.txt");
    if let Ok(texto) = std::fs::read_to_string(&cfg) {
        let novo: Vec<&str> = texto.lines().filter(|l| l.trim() != APO_INCLUDE).collect();
        std::fs::write(&cfg, format!("{}\r\n", novo.join("\r\n").trim_end()))
            .map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(dir.join(APO_ARQUIVO));
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
fn bt_conectar(app: AppHandle, estado: State<Estado>) -> Result<String, String> {
    let (canal, leitor) = bt::conectar()?;
    let nome = canal.nome.clone();
    *estado.0.lock().unwrap() = Some(canal);

    let app2 = app.clone();
    std::thread::spawn(move || {
        // leitor e' "agile" como o resto; so' esta thread o usa
        loop {
            match bt::ler(&leitor) {
                Ok(dados) if !dados.is_empty() => {
                    let _ = app2.emit("bt-dados", dados);
                }
                _ => {
                    let _ = app2.emit("bt-caiu", ());
                    if let Some(estado) = app2.try_state::<Estado>() {
                        *estado.0.lock().unwrap() = None;
                    }
                    break;
                }
            }
        }
    });
    Ok(nome)
}

#[cfg(windows)]
#[tauri::command]
fn bt_enviar(estado: State<Estado>, dados: Vec<u8>) -> Result<(), String> {
    match estado.0.lock().unwrap().as_ref() {
        Some(canal) => bt::enviar(canal, &dados),
        None => Err("sem conexao".into()),
    }
}

#[cfg(windows)]
#[tauri::command]
fn bt_desconectar(estado: State<Estado>) {
    // derrubar o socket encerra a thread de leitura no proximo ler()
    *estado.0.lock().unwrap() = None;
}

#[cfg(all(test, windows))]
mod testes {
    /// Precisa de um dispositivo de audio real; roda com `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn endpoint_padrao_responde() {
        let guid = super::audio::endpoint_padrao().expect("endpoint padrao");
        assert!(guid.starts_with('{') && guid.ends_with('}'), "guid cru: {guid}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Instancia unica: abrir o app de novo so traz a janela existente para
    // frente. Duas copias vivas = a segunda nunca conecta (CANAL_OCUPADO).
    let construtor = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(janela) = app.get_webview_window("main") {
                let _ = janela.unminimize();
                let _ = janela.set_focus();
            }
        }))
        .setup(|app| {
        if cfg!(debug_assertions) {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
        }
        Ok(())
    });

    #[cfg(windows)]
    let construtor = construtor
        .manage(Estado(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![bt_conectar, bt_enviar, bt_desconectar,
                                                 apo_detectar, apo_aplicar, apo_instalar,
                                                 apo_remover, apo_endpoint_registrado,
                                                 apo_registrar, apo_reativar]);

    construtor
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
