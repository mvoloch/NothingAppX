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
        let erro = |e: windows::core::Error| e.message().to_string();
        let id = RfcommServiceId::FromUuid(GUID::from_u128(SPP_UUID)).map_err(erro)?;
        let seletor = RfcommDeviceService::GetDeviceSelector(&id).map_err(erro)?;
        let achados = DeviceInformation::FindAllAsyncAqsFilter(&seletor)
            .map_err(erro)?.join().map_err(erro)?;
        if achados.Size().map_err(erro)? == 0 {
            return Err("nenhum fone pareado com o servico Nothing".into());
        }
        let alvo = achados.GetAt(0).map_err(erro)?;
        let nome = alvo.Name().map_err(erro)?.to_string();
        let servico = RfcommDeviceService::FromIdAsync(&alvo.Id().map_err(erro)?)
            .map_err(erro)?.join().map_err(erro)?;
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
    let construtor = tauri::Builder::default().setup(|app| {
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
        .invoke_handler(tauri::generate_handler![bt_conectar, bt_enviar, bt_desconectar]);

    construtor
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
