"""Servidor estatico de desenvolvimento do NothingAppX.

Existe por um motivo so: `python -m http.server` manda Last-Modified e nenhum
Cache-Control, entao o Chrome guarda os arquivos por heuristica e nao revalida.
Na pratica, voce edita o .js, recarrega, e a pagina continua rodando a versao
velha — sem nenhum aviso. Ja custou um diagnostico errado aqui.

Este daqui manda `no-store` em tudo. Recarregou, e a versao do disco.

    python servidor.py [porta]
"""

import io
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).parent / "web"

# src="app.js" / href="style.css" -> acrescenta ?v=<mtime>
REF = re.compile(r'\b(src|href)="(?!https?:|//|data:)([^"?#]+\.(?:js|css))"')


class SemCache(SimpleHTTPRequestHandler):
    """Nao guarda nada, e ainda carimba a versao nos assets do HTML.

    O `no-store` sozinho nao basta: ele impede novas gravacoes, mas nao expira
    o que o navegador ja tinha guardado antes. O ?v=<mtime> muda a URL quando o
    arquivo muda, entao a entrada velha simplesmente deixa de ser consultada.
    """

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        caminho = Path(self.translate_path(self.path))
        if caminho.is_dir():
            caminho = caminho / "index.html"
        if caminho.suffix.lower() not in (".html", ".htm") or not caminho.is_file():
            return super().send_head()

        def carimbar(m):
            alvo = caminho.parent / m.group(2)
            if not alvo.is_file():
                return m.group(0)
            return f'{m.group(1)}="{m.group(2)}?v={int(alvo.stat().st_mtime)}"'

        corpo = REF.sub(carimbar, caminho.read_text(encoding="utf-8")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        return io.BytesIO(corpo)

    def log_message(self, formato, *args):
        # o log padrao polui o terminal com uma linha por asset
        if args and isinstance(args[0], str) and " /" in args[0]:
            return
        super().log_message(formato, *args)


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    manipulador = partial(SemCache, directory=str(RAIZ))
    with ThreadingHTTPServer(("127.0.0.1", porta), manipulador) as s:
        print(f"NothingAppX em http://localhost:{porta}  (sem cache)")
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            print("\nencerrado")


if __name__ == "__main__":
    main()
