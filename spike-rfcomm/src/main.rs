/* Spike RFCOMM — pergunta binaria: o Windows nos deixa abrir o canal SPP do
 * fone direto pela API nativa e trocar um quadro do protocolo Nothing?
 *
 * Sucesso = quadro de bateria valido (magic + CRC conferem) vindo do aparelho.
 * O framing e o CRC sao os mesmos do protocolo.js, transcritos byte a byte.
 */

use windows::core::{Result, GUID};
use windows::Devices::Bluetooth::Rfcomm::{RfcommDeviceService, RfcommServiceId};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Networking::Sockets::StreamSocket;
use windows::Storage::Streams::{DataReader, DataWriter, InputStreamOptions};

const SPP_UUID: &str = "aeac4a03-dff5-498f-843a-34487cf133eb";
const LER_BATERIA: u16 = 0xC007;

fn crc16(bytes: &[u8]) -> u16 {
    let mut crc: u16 = 0xffff;
    for &b in bytes {
        crc ^= b as u16;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xa001 } else { crc >> 1 };
        }
    }
    crc
}

fn montar_quadro(cmd: u16, payload: &[u8], op_id: u8) -> Vec<u8> {
    let mut q = vec![
        0x55, 0x60, 0x01,
        (cmd & 0xff) as u8, (cmd >> 8) as u8,
        payload.len() as u8, 0x00, op_id,
    ];
    q.extend_from_slice(payload);
    let c = crc16(&q);
    q.push((c & 0xff) as u8);
    q.push((c >> 8) as u8);
    q
}

/// Devolve (cmd, payload) do primeiro quadro valido no buffer, se houver.
fn extrair_quadro(buf: &[u8]) -> Option<(u16, &[u8])> {
    let mut i = 0;
    while i + 10 <= buf.len() {
        if buf[i..i + 3] != [0x55, 0x60, 0x01] {
            i += 1;
            continue;
        }
        let n = buf[i + 5] as usize;
        let fim = i + 8 + n + 2;
        if fim > buf.len() {
            return None;
        }
        let q = &buf[i..fim];
        let esperado = q[q.len() - 2] as u16 | ((q[q.len() - 1] as u16) << 8);
        if crc16(&q[..q.len() - 2]) != esperado {
            i += 1;
            continue;
        }
        let cmd = q[3] as u16 | ((q[4] as u16) << 8);
        return Some((cmd, &q[8..8 + n]));
    }
    None
}

fn bateria(p: &[u8]) -> String {
    let nome = |b: u8| match b { 0x02 => "L", 0x03 => "R", 0x04 => "estojo", _ => "?" };
    let n = p.first().copied().unwrap_or(0) as usize;
    let mut partes = Vec::new();
    for i in 0..n {
        let (Some(&id), Some(&bruto)) = (p.get(1 + i * 2), p.get(2 + i * 2)) else { break };
        let carga = if bruto & 0x80 != 0 { " (carregando)" } else { "" };
        partes.push(format!("{} {}%{}", nome(id), bruto & 0x7f, carga));
    }
    partes.join(", ")
}

fn main() -> Result<()> {
    let id = RfcommServiceId::FromUuid(GUID::from_u128(0xaeac4a03_dff5_498f_843a_34487cf133eb))?;
    let seletor = RfcommDeviceService::GetDeviceSelector(&id)?;
    let achados = DeviceInformation::FindAllAsyncAqsFilter(&seletor)?.join()?;

    let total = achados.Size()?;
    println!("aparelhos pareados com o servico Nothing SPP: {total}");
    if total == 0 {
        println!("NEGATIVO: nenhum aparelho pareado expoe o UUID {SPP_UUID}");
        return Ok(());
    }
    for i in 0..total {
        let d = achados.GetAt(i)?;
        println!("  [{i}] {}", d.Name()?);
    }

    let alvo = achados.GetAt(0)?;
    let servico = RfcommDeviceService::FromIdAsync(&alvo.Id()?)?.join()?;
    let socket = StreamSocket::new()?;
    socket
        .ConnectAsync(&servico.ConnectionHostName()?, &servico.ConnectionServiceName()?)?
        .join()?;
    println!("canal RFCOMM aberto com {}", alvo.Name()?);

    let quadro = montar_quadro(LER_BATERIA, &[], 1);
    println!("-> {:02x?}", quadro);
    let escritor = DataWriter::CreateDataWriter(&socket.OutputStream()?)?;
    escritor.WriteBytes(&quadro)?;
    escritor.StoreAsync()?.join()?;
    escritor.DetachStream()?;

    let leitor = DataReader::CreateDataReader(&socket.InputStream()?)?;
    leitor.SetInputStreamOptions(InputStreamOptions::Partial)?;
    let mut acumulado: Vec<u8> = Vec::new();
    for _ in 0..8 {
        let n = leitor.LoadAsync(256)?.join()?;
        if n == 0 {
            break;
        }
        let mut pedaco = vec![0u8; n as usize];
        leitor.ReadBytes(&mut pedaco)?;
        acumulado.extend_from_slice(&pedaco);
        println!("<- {:02x?}", pedaco);
        if let Some((cmd, payload)) = extrair_quadro(&acumulado) {
            if cmd == LER_BATERIA & 0x7fff {
                println!("POSITIVO: bateria {}", bateria(payload));
                return Ok(());
            }
            println!("quadro valido, cmd inesperado {cmd:#06x} — sigo lendo");
        }
    }
    println!("INCONCLUSIVO: canal abriu mas nao veio quadro de bateria valido");
    Ok(())
}
