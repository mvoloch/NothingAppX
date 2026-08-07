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
                                                 apo_detectar, apo_aplicar, apo_remover]);

    construtor
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
