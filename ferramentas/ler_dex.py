"""Le as tabelas de simbolos de arquivos .dex (bytecode Android) sem Java.

Serve para consultar FATOS de protocolo num app oficial — numeros de comando,
nomes de recurso, formato de payload — durante o trabalho de interoperabilidade.
Nao decompila e nao reconstroi codigo: le as tabelas de strings, de tipos e de
metodos, que o formato .dex guarda em claro.

A distincao importa para este projeto. O que se extrai daqui e' FATO (um numero,
um layout de bytes, o nome de um recurso) e entra reimplementado, do nosso
jeito. O que e' EXPRESSAO (codigo, textos, icones, fontes) nao entra, nem
copiado nem adaptado. E' o que mantem o projeto publicavel.

    python ler_dex.py app.apk --resumo
    python ler_dex.py app.apk --buscar bass anc equaliz
    python ler_dex.py app.apk --classes nothing

Formato .dex: https://source.android.com/docs/core/runtime/dex-format
"""

import argparse
import re
import struct
import sys
import zipfile
from pathlib import Path

CAB = {  # nome -> (deslocamento do tamanho, deslocamento do offset)
    "string_ids": (0x38, 0x3C),
    "type_ids":   (0x40, 0x44),
    "field_ids":  (0x50, 0x54),
    "method_ids": (0x58, 0x5C),
}


def uleb128(dados, i):
    """Devolve (valor, novo_indice). Inteiro de tamanho variavel do .dex."""
    valor = desloc = 0
    while True:
        b = dados[i]
        i += 1
        valor |= (b & 0x7F) << desloc
        if not b & 0x80:
            return valor, i
        desloc += 7


class Dex:
    def __init__(self, dados: bytes):
        if dados[:4] != b"dex\n":
            raise ValueError("nao e um .dex (assinatura ausente)")
        self.d = dados
        self.tam = {k: struct.unpack_from("<I", dados, a)[0] for k, (a, _) in CAB.items()}
        self.off = {k: struct.unpack_from("<I", dados, b)[0] for k, (_, b) in CAB.items()}
        self._strings = None

    @property
    def strings(self):
        """Tabela de strings. E' onde ficam nomes de classe, metodo e literais."""
        if self._strings is None:
            fora = []
            base = self.off["string_ids"]
            for k in range(self.tam["string_ids"]):
                p = struct.unpack_from("<I", self.d, base + k * 4)[0]
                _, p = uleb128(self.d, p)            # tamanho em UTF-16, dispensavel
                fim = self.d.index(b"\x00", p)
                fora.append(self.d[p:fim].decode("utf-8", "replace"))
            self._strings = fora
        return self._strings

    def tipos(self):
        """Descritores de classe: Lcom/exemplo/Coisa; -> com.exemplo.Coisa"""
        s, base = self.strings, self.off["type_ids"]
        for k in range(self.tam["type_ids"]):
            i = struct.unpack_from("<I", self.d, base + k * 4)[0]
            d = s[i]
            if d.startswith("L") and d.endswith(";"):
                yield d[1:-1].replace("/", ".")

    def metodos(self):
        """(classe, nome do metodo) — 8 bytes por entrada."""
        s, base = self.strings, self.off["method_ids"]
        tipos = []
        tb = self.off["type_ids"]
        for k in range(self.tam["type_ids"]):
            tipos.append(s[struct.unpack_from("<I", self.d, tb + k * 4)[0]])
        for k in range(self.tam["method_ids"]):
            cls, _proto, nome = struct.unpack_from("<HHI", self.d, base + k * 8)
            yield tipos[cls][1:-1].replace("/", "."), s[nome]

    def campos(self):
        """(classe, nome do campo) — constantes nomeadas moram aqui."""
        s, base = self.strings, self.off["field_ids"]
        tipos = []
        tb = self.off["type_ids"]
        for k in range(self.tam["type_ids"]):
            tipos.append(s[struct.unpack_from("<I", self.d, tb + k * 4)[0]])
        for k in range(self.tam["field_ids"]):
            cls, _tipo, nome = struct.unpack_from("<HHI", self.d, base + k * 8)
            yield tipos[cls][1:-1].replace("/", "."), s[nome]


def carregar(caminho: Path):
    """Aceita um .dex solto ou um .apk (le todos os classes*.dex de dentro)."""
    if caminho.suffix.lower() == ".dex":
        yield caminho.name, Dex(caminho.read_bytes())
        return
    z = zipfile.ZipFile(caminho)
    nomes = sorted(n for n in z.namelist()
                   if re.fullmatch(r"classes\d*\.dex", n.rsplit("/", 1)[-1]))
    if not nomes:
        raise SystemExit("nenhum classes*.dex dentro do arquivo")
    for n in nomes:
        yield n, Dex(z.read(n))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("arquivo")
    p.add_argument("--resumo", action="store_true")
    p.add_argument("--buscar", nargs="+", metavar="TERMO",
                   help="strings que contenham qualquer um dos termos")
    p.add_argument("--classes", nargs="+", metavar="TERMO")
    p.add_argument("--metodos", nargs="+", metavar="TERMO")
    p.add_argument("--campos", nargs="+", metavar="TERMO")
    p.add_argument("--limite", type=int, default=200)
    p.add_argument("--min", type=int, default=3, help="tamanho minimo da string")
    args = p.parse_args()

    partes = list(carregar(Path(args.arquivo)))

    if args.resumo:
        for nome, d in partes:
            print(f"{nome:16} strings {d.tam['string_ids']:>7}  "
                  f"tipos {d.tam['type_ids']:>6}  metodos {d.tam['method_ids']:>7}")
        total = sum(d.tam["string_ids"] for _, d in partes)
        print(f"{'TOTAL':16} strings {total:>7}")

    def varrer(rotulo, gerador, termos):
        alvos = [t.lower() for t in termos]
        vistos, n = set(), 0
        print(f"\n===== {rotulo}: {' '.join(termos)} " + "=" * 20)
        for nome, d in partes:
            for item in gerador(d):
                texto = item if isinstance(item, str) else f"{item[0]}.{item[1]}"
                if len(texto) < args.min or texto in vistos:
                    continue
                b = texto.lower()
                if any(a in b for a in alvos):
                    vistos.add(texto)
                    print(f"  [{nome}] {texto}")
                    n += 1
                    if n >= args.limite:
                        print(f"  ... cortado em {args.limite} (use --limite)")
                        return
        print(f"  {n} resultado(s)")

    if args.buscar:
        varrer("STRINGS", lambda d: d.strings, args.buscar)
    if args.classes:
        varrer("CLASSES", lambda d: d.tipos(), args.classes)
    if args.metodos:
        varrer("METODOS", lambda d: d.metodos(), args.metodos)
    if args.campos:
        varrer("CAMPOS", lambda d: d.campos(), args.campos)


if __name__ == "__main__":
    main()
