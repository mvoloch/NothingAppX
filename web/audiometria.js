/* NothingAppX — teste de audicao proprio.
 *
 * O app oficial usa o SDK da Audiodo para criar o "Perfil sonoro pessoal".
 *
 * Esse perfil NAO fica no fone. Testado em 07/08/2026, em ordem de forca:
 *   1. DECISIVO — com o perfil ligado e calibrado no telefone, o MESMO fone
 *      tocando a partir do PC soa cru. A correcao nao acompanha o aparelho.
 *   2. Ligar o 0xF05D pelo nosso app nao muda nada no som.
 *   3. O canal ACL do fone trocou 25 KB em toda a captura, sem nenhum pico de
 *      transferencia. Evidencia FRACA, e vale dizer por que: as capturas nao
 *      cobrem o instante em que a calibracao termina, que e' justamente quando
 *      um envio de perfil aconteceria. Sozinha ela nao provaria nada.
 *
 * A leitura que se sustenta: a correcao roda NO TELEFONE, sobre o audio, antes
 * de ser codificado e enviado. O 0xF05D e' um sinalizador de estado. Ou seja,
 * nenhum app de PC replica aquela camada por comando Bluetooth — so' fazendo o
 * mesmo truque, processar o audio antes de sair. Isso exige um efeito de
 * sistema (APO no Windows, filtro no PipeWire), fora do alcance de uma pagina.
 *
 * Entao este teste faz o que da' para fazer daqui: mede e corrige pelo
 * equalizador de 3 bandas do proprio fone. E' menos, e o comentario abaixo
 * explica exatamente quanto menos.
 *
 * A ideia e' a dos audiometros de triagem: tocar tons puros subindo de volume e
 * anotar onde cada um comeca a ser ouvido. Onde voce ouve pior, reforcamos.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO NAO E'
 *
 * Nao e' exame medico, e nao produz audiograma em dB HL. Para isso seria
 * preciso hardware calibrado e uma referencia de pressao sonora conhecida —
 * nada disso existe num PC com um fone Bluetooth.
 *
 * O que ele mede e' a diferenca RELATIVA entre frequencias no seu ouvido, com
 * o seu fone, no seu ambiente. E e' exatamente isso que um equalizador precisa
 * saber. Um desvio absoluto de calibracao afeta todas as frequencias por igual
 * e some quando normalizamos pela media.
 *
 * Se o resultado sugerir perda auditiva de verdade, procure um fonoaudiologo.
 */

"use strict";

(() => {

/* Frequencias de triagem. E' o conjunto classico da audiometria tonal, menos
 * as extremas: abaixo de 250 Hz e acima de 8 kHz um fone intra-auricular
 * comum ja' nao e' confiavel, e o ruido de fundo domina. */
const FREQUENCIAS = [250, 500, 1000, 2000, 4000, 8000];
const ORELHAS = ["esquerda", "direita"];

const DB_MINIMO = -75;      // onde cada tom comeca: inaudivel em qualquer volume
const DB_MAXIMO = -12;      // teto de seguranca — nao chega perto de doer
const SEGUNDOS_RAMPA = 7;   // subida lenta o bastante para o dedo acompanhar

class Audiometria {
  constructor() {
    this.ctx = null;
    this.passos = [];
    for (const orelha of ORELHAS)
      for (const hz of FREQUENCIAS) this.passos.push({ orelha, hz, limiar: null });
    this.indice = 0;
    this.tocando = null;
  }

  get passo() { return this.passos[this.indice]; }
  get total() { return this.passos.length; }
  get terminou() { return this.indice >= this.passos.length; }

  async _contexto() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  /** Toca o tom do passo atual subindo de volume. Resolve com o dB do momento
   *  em que `parar()` for chamado, ou com DB_MAXIMO se a rampa terminar. */
  async tocar(aoProgredir) {
    const ctx = await this._contexto();
    const p = this.passo;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const pan = ctx.createStereoPanner();

    osc.type = "sine";
    osc.frequency.value = p.hz;
    pan.pan.value = p.orelha === "esquerda" ? -1 : 1;

    const t0 = ctx.currentTime;
    const g = (db) => Math.pow(10, db / 20);
    vol.gain.setValueAtTime(g(DB_MINIMO), t0);
    // rampa exponencial: em volume percebido ela sobe de forma uniforme
    vol.gain.exponentialRampToValueAtTime(g(DB_MAXIMO), t0 + SEGUNDOS_RAMPA);

    osc.connect(vol).connect(pan).connect(ctx.destination);
    osc.start();

    return new Promise((resolve) => {
      const encerrar = (db) => {
        if (!this.tocando) return;
        this.tocando = null;
        clearInterval(relogio);
        // corta com uma rampinha para nao estalar no ouvido
        vol.gain.cancelScheduledValues(ctx.currentTime);
        vol.gain.setValueAtTime(vol.gain.value, ctx.currentTime);
        vol.gain.exponentialRampToValueAtTime(g(DB_MINIMO), ctx.currentTime + 0.05);
        osc.stop(ctx.currentTime + 0.08);
        resolve(db);
      };

      const agora = () => {
        const t = Math.min(SEGUNDOS_RAMPA, ctx.currentTime - t0);
        return DB_MINIMO + ((DB_MAXIMO - DB_MINIMO) * t) / SEGUNDOS_RAMPA;
      };

      this.tocando = () => encerrar(agora());
      const relogio = setInterval(() => {
        if (!this.tocando) return;
        const db = agora();
        aoProgredir?.((db - DB_MINIMO) / (DB_MAXIMO - DB_MINIMO));
        if (ctx.currentTime - t0 >= SEGUNDOS_RAMPA) encerrar(DB_MAXIMO);
      }, 60);
    });
  }

  /** Chamado quando a pessoa diz que ouviu. */
  parar() { this.tocando?.(); }

  /** Registra o limiar e avanca. Devolve true se ainda ha' passos. */
  registrar(db) {
    this.passos[this.indice].limiar = db;
    this.indice++;
    return !this.terminou;
  }

  reiniciar() {
    for (const p of this.passos) p.limiar = null;
    this.indice = 0;
  }

  /** Media dos dois ouvidos por frequencia. */
  mediaPorFrequencia() {
    return FREQUENCIAS.map((hz) => {
      const v = this.passos.filter((p) => p.hz === hz && p.limiar !== null).map((p) => p.limiar);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    });
  }

  /** Diferenca entre os ouvidos, em dB. Positivo = ouve pior do lado direito. */
  assimetria() {
    const m = (lado) => {
      const v = this.passos.filter((p) => p.orelha === lado && p.limiar !== null).map((p) => p.limiar);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    };
    return m("direita") - m("esquerda");
  }
}

/* Converte os limiares nas tres bandas que o aparelho aceita.
 *
 * Cada banda fica com a media dos limiares das frequencias que ela cobre,
 * comparada com a media geral. Quem tem limiar mais alto — ou seja, precisou
 * de mais volume para ouvir — ganha reforco.
 *
 * Duas limitacoes honestas:
 *  - O equalizador do fone tem TRES bandas. Nao da' para corrigir um vale
 *    estreito em 6 kHz; da' para inclinar a resposta na direcao certa.
 *  - O comando do EQ nao separa esquerdo e direito, entao aplicamos a media.
 *    A assimetria e' medida e mostrada, mas nao ha' como corrigi-la por aqui.
 */
const BANDAS = [
  { chave: "eq.graves", hz: (f) => f <= 350 },
  { chave: "eq.medios", hz: (f) => f > 350 && f <= 2000 },
  { chave: "eq.agudos", hz: (f) => f > 2000 },
];

const LIMITE_DB = 6;        // faixa que o aparelho aceita
const SUAVIZACAO = 0.5;     // corrige metade do desvio: corrigir tudo soa duro

function bandasSugeridas(medias) {
  const validas = medias.filter((v) => v !== null);
  if (validas.length < 2) return [0, 0, 0];
  const geral = validas.reduce((a, b) => a + b, 0) / validas.length;

  return BANDAS.map((b) => {
    const v = FREQUENCIAS.map((hz, i) => (b.hz(hz) ? medias[i] : null)).filter((x) => x !== null);
    if (!v.length) return 0;
    const media = v.reduce((a, x) => a + x, 0) / v.length;
    const ajuste = (media - geral) * SUAVIZACAO;
    return Math.max(-LIMITE_DB, Math.min(LIMITE_DB, Math.round(ajuste)));
  });
}

window.audiometria = { Audiometria, bandasSugeridas, FREQUENCIAS, ORELHAS,
                       BANDAS, DB_MINIMO, DB_MAXIMO, SEGUNDOS_RAMPA };

})();
