"""
Decodifica um btsnoop_hci.log e extrai os quadros do protocolo Nothing/CMF.

Formato do quadro (lido do codigo do ear-web, nao inferido):
    [0]=0x55 [1]=0x60 [2]=0x01 [3:5]=comando uint16 LE
    [5]=tamanho do payload [6]=0x00 [7]=id da operacao
    [8:8+n]=payload  [-2:]=CRC-16/MODBUS LE

Uso:
    python decodificar_btsnoop.py capturas/btsnoop_hci.log
    python decodificar_btsnoop.py capturas/btsnoop_hci.log --linha-do-tempo
    python decodificar_btsnoop.py capturas/btsnoop_hci.log --comando 61455
"""

import struct
import sys
import datetime
import argparse
from collections import Counter, defaultdict

MAGIC = b"\x55\x60\x01"
EPOCH_DELTA_US = 0x00DCDDB30F2F8000  # microssegundos do ano 0 ate 1970

# Comandos conhecidos. Onde o ear-web e a captura discordaram, vale a captura:
# ela e deste aparelho. Duas correcoes que custaram caro e ficam registradas:
#   61519 NAO e "definir ultra bass" — e o EQ avancado (ear-web:
#         setAdvancedEQenabled). O Ultra bass inteiro cabe no 61521.
#   61504 NAO e "definir ANC personalizado" — e o modo de baixa latencia
#         (ear-web: setLatency, 1=ligado 2=desligado).
CONHECIDOS = {
    49159: "ler bateria",          49182: "ler ANC",            61455: "definir ANC",
    49183: "ler EQ (modelos antigos)",  61456: "definir EQ (modelos antigos)",
    49232: "ler preset (modo de escuta)", 61469: "definir preset (modo de escuta)",
    49230: "ler ultra bass [ligado, nivel*2]",
    61521: "definir ultra bass [ligado, nivel*2]",
    49231: "ler EQ avancado",      61519: "definir EQ avancado",
    49228: "ler EQ avancado (v2)", 61505: "definir EQ custom",  49220: "ler EQ custom",
    49218: "ler firmware",         49175: "ler LED do estojo",  61453: "definir LED",
    61460: "teste de vedacao",     49166: "ler in-ear",         61444: "definir in-ear",
    49217: "ler baixa latencia",   61504: "definir baixa latencia (1=on 2=off)",
    49176: "ler gestos",           61443: "definir gestos",
    49184: "ler ANC personalizado",61442: "localizar fone",
    61457: "definir EQ avancado (v2)",
    28753: "  ack ultra bass",
    16462: "  resposta ultra bass",  16464: "  resposta preset",
    16463: "  resposta EQ avancado", 16408: "  resposta gestos",
    16449: "  resposta baixa latencia",
    16391: "  resposta bateria",     16414: "  resposta ANC",
    16450: "  resposta firmware",    28687: "  ack ANC (00 = ok)",

    # --- descobertos na captura de 07/08/2026, por correlacao com as acoes ---
    # Confianca MEDIA: booleano 00->01 disparado entre o ANC e a varredura do
    # Ultra bass. Candidato a Audio espacial, mas NAO confirmado — a janela de
    # tempo tambem admite ser o liga/desliga de outra coisa.
    61522: "??? booleano (candidato a Audio espacial)  [a confirmar]",
    28754: "  ack do anterior",
    # Confianca ALTA: 4a acao; ligado 11:40:02 e desligado 11:43:29, enviado
    # 3x seguidas. O ack devolve o mesmo byte, entao serve de confirmacao.
    61533: "definir Perfil sonoro pessoal (00/01)",
    28765: "  ack Perfil sonoro pessoal",
    # Ainda ambiguo: alternado dentro do fluxo do perfil pessoal.
    61532: "??? booleano acionado na tela do Perfil pessoal",
    28764: "  ack do anterior",
    # Aparece uma unica vez, logo apos o ANC. Payload de 108 bytes com 13
    # registros de contadores crescentes: tem cara de telemetria, nao de ajuste.
    64545: "??? provavel telemetria (pedido)",
    64546: "??? provavel telemetria (pedido)",
    31777: "  resposta telemetria (14 bytes)",
    31778: "  resposta telemetria (108 bytes)",
}


def crc16(dados: bytes) -> int:
    crc = 0xFFFF
    for b in dados:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def ler_registros(caminho):
    """Gera (timestamp_utc, enviado_pelo_host, dados_h4)."""
    with open(caminho, "rb") as f:
        cab = f.read(16)
        if cab[:8] != b"btsnoop\x00":
            raise SystemExit("Nao parece um btsnoop: assinatura ausente.")
        _, datalink = struct.unpack(">II", cab[8:16])
        if datalink != 1002:
            print(f"aviso: datalink {datalink} (esperado 1002 = HCI UART)", file=sys.stderr)
        while True:
            r = f.read(24)
            if len(r) < 24:
                return
            orig, incl, flags, _drops, ts = struct.unpack(">IIIIq", r)
            dados = f.read(incl)
            if len(dados) < incl:
                return
            enviado = (flags & 0x01) == 0     # bit0: 0 = host -> controlador
            yield ts, enviado, dados


def extrair_quadros(caminho):
    total_pacotes = 0
    quadros = []
    for ts, enviado, h4 in ler_registros(caminho):
        total_pacotes += 1
        if not h4 or h4[0] != 0x02:          # 0x02 = ACL
            continue
        buf = h4[1:]
        i = 0
        while True:
            i = buf.find(MAGIC, i)
            if i < 0:
                break
            if i + 8 <= len(buf):
                n = buf[i + 5]
                fim = i + 8 + n + 2
                if fim <= len(buf):
                    q = buf[i:fim]
                    esperado = struct.unpack("<H", q[-2:])[0]
                    if crc16(q[:-2]) == esperado:
                        cmd = struct.unpack("<H", q[3:5])[0]
                        quadros.append({
                            # O Android grava o carimbo no horario LOCAL do aparelho.
                            # Converter para fuso aqui deslocaria tudo (aqui, 3h a menos).
                            "ts": datetime.datetime(1970, 1, 1) + datetime.timedelta(
                                microseconds=ts - EPOCH_DELTA_US),
                            "host": enviado,
                            "cmd": cmd,
                            "op": q[7],
                            "payload": q[8:8 + n],
                        })
                        i = fim
                        continue
            i += 1
    return total_pacotes, quadros


def main():
    p = argparse.ArgumentParser()
    p.add_argument("arquivo")
    p.add_argument("--linha-do-tempo", action="store_true")
    p.add_argument("--comando", type=int, default=None)
    args = p.parse_args()

    total, quadros = extrair_quadros(args.arquivo)

    print(f"pacotes HCI lidos        : {total}")
    print(f"quadros Nothing validados: {len(quadros)}  (CRC conferido)")
    if not quadros:
        print("\nNenhum quadro do protocolo encontrado. O app estava aberto durante a captura?")
        return
    print(f"periodo                  : {quadros[0]['ts']:%H:%M:%S}  ate  {quadros[-1]['ts']:%H:%M:%S}")
    print()

    cont = Counter(q["cmd"] for q in quadros)
    novos = [c for c in cont if c not in CONHECIDOS]

    print("=" * 78)
    print(f"{'CMD':>6}  {'HEX':>6}  {'QTD':>5}  {'DIR':<5}  DESCRICAO")
    print("=" * 78)
    for cmd, n in sorted(cont.items(), key=lambda x: -x[1]):
        dirs = {("host" if q["host"] else "fone") for q in quadros if q["cmd"] == cmd}
        desc = CONHECIDOS.get(cmd, ">>> DESCONHECIDO <<<")
        print(f"{cmd:>6}  0x{cmd:04X}  {n:>5}  {'/'.join(sorted(dirs)):<5}  {desc}")

    if novos:
        print()
        print(f"*** {len(novos)} comandos NAO catalogados: {sorted(novos)}")
        print("    Sao os candidatos a Spatial audio, Perfil sonoro, LDAC e Conexao dupla.")

    if args.linha_do_tempo or args.comando is not None:
        print()
        print("=" * 78)
        print("LINHA DO TEMPO")
        print("=" * 78)
        for q in quadros:
            if args.comando is not None and q["cmd"] != args.comando:
                continue
            seta = "->" if q["host"] else "<-"
            marca = "" if q["cmd"] in CONHECIDOS else "  *NOVO*"
            print(f"{q['ts']:%H:%M:%S.%f}"[:-3]
                  + f" {seta} {q['cmd']:>6} 0x{q['cmd']:04X} "
                  + f"len={len(q['payload']):>2} {q['payload'].hex()}{marca}")


if __name__ == "__main__":
    main()
