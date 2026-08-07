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

const DB_MINIMO = -75;      // piso do teste: melhor que isso nao distinguimos
const DB_MAXIMO = -12;      // teto de seguranca — nao chega perto de doer

/* Metodo: escada de Hughson-Westlake modificada, o padrao clinico desde 1944
 * e o mesmo desenho dos testes da Samsung/Apple/Audiodo — bipes PULSADOS em
 * nivel FIXO e resposta binaria (ouvi / nao ouvi). Ouviu: desce 10 dB. Nao
 * ouviu: sobe 5 dB. Limiar = nivel confirmado 2 vezes durante subidas.
 *
 * A primeira versao usava rampa continua ("toque quando ouvir"), e o proprio
 * usuario apontou o defeito: o tempo de reacao e a atencao entram na medida.
 * Com niveis fixos a resposta e' binaria e isso desaparece. Tons pulsados
 * porque sao mais faceis de perceber no limiar (preferidos por 2/3 dos
 * ouvintes na literatura de audiometria).
 *
 * Passo que estoura o teto sem resposta continua censurado: teto + penalidade,
 * marcado como sem resposta — o limiar real esta' acima do alcance do teste. */
const NIVEL_INICIAL = -40;  // primeiro bipe claramente audivel para audicao tipica
const DESCE_DB = 10;
const SOBE_DB = 5;
const CONFIRMACOES = 2;     // "sim" na subida, duas vezes no mesmo nivel
const MAX_APRESENTACOES = 18;  // trava de seguranca por passo
const PULSOS = 3;
const PULSO_S = 0.22;
const INTERVALO_S = 0.24;
const PENALIDADE_SEM_RESPOSTA = 6;

class Audiometria {
  constructor() {
    this.ctx = null;
    this.passos = [];
    for (const orelha of ORELHAS)
      for (const hz of FREQUENCIAS) this.passos.push({ orelha, hz, limiar: null });
    this.indice = 0;
    this.tocando = null;
    this._novaEscada();
  }

  _novaEscada() {
    this.nivel = NIVEL_INICIAL;
    this.subindo = false;
    this.confirmacoes = new Map();   // nivel -> quantos "ouvi" durante subida
    this.apresentacoes = 0;
  }

  get passo() { return this.passos[this.indice]; }
  get total() { return this.passos.length; }
  get terminou() { return this.indice >= this.passos.length; }

  async _contexto() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  /** Toca a apresentacao atual: PULSOS bipes no nivel FIXO da escada.
   *  Resolve quando os bipes terminam, ou antes se `parar()` for chamado. */
  async apresentar(aoProgredir) {
    const ctx = await this._contexto();
    const p = this.passo;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const pan = ctx.createStereoPanner();

    osc.type = "sine";
    osc.frequency.value = p.hz;
    pan.pan.value = p.orelha === "esquerda" ? -1 : 1;

    const t0 = ctx.currentTime + 0.05;
    const g = Math.pow(10, this.nivel / 20);
    const dur = PULSOS * PULSO_S + (PULSOS - 1) * INTERVALO_S;
    vol.gain.setValueAtTime(0, ctx.currentTime);
    for (let i = 0; i < PULSOS; i++) {
      const ini = t0 + i * (PULSO_S + INTERVALO_S);
      // 10 ms de subida/descida para o bipe nao estalar
      vol.gain.setValueAtTime(0, ini);
      vol.gain.linearRampToValueAtTime(g, ini + 0.01);
      vol.gain.setValueAtTime(g, ini + PULSO_S - 0.01);
      vol.gain.linearRampToValueAtTime(0, ini + PULSO_S);
    }

    osc.connect(vol).connect(pan).connect(ctx.destination);
    osc.start();
    osc.stop(t0 + dur + 0.05);

    return new Promise((resolve) => {
      const encerrar = () => {
        if (!this.tocando) return;
        this.tocando = null;
        clearInterval(relogio);
        vol.gain.cancelScheduledValues(ctx.currentTime);
        vol.gain.setValueAtTime(0, ctx.currentTime);
        try { osc.stop(ctx.currentTime + 0.02); } catch {}
        resolve();
      };
      this.tocando = encerrar;
      const relogio = setInterval(() => {
        if (!this.tocando) return;
        const f = Math.min(1, (ctx.currentTime - t0) / dur);
        aoProgredir?.(Math.max(0, f));
        if (f >= 1) encerrar();
      }, 60);
    });
  }

  /** Interrompe a apresentacao em curso (ex.: a pessoa ja respondeu). */
  parar() { this.tocando?.(); }

  /** Resposta binaria da pessoa ao bipe. Move a escada; quando um limiar
   *  fecha, registra e avanca ao proximo passo.
   *  Devolve { fechouPasso } — e `terminou` diz se o teste todo acabou. */
  responder(ouviu) {
    this.apresentacoes++;
    let fim = null;                       // { limiar, ouvido }

    if (ouviu) {
      if (this.subindo) {
        const n = (this.confirmacoes.get(this.nivel) || 0) + 1;
        this.confirmacoes.set(this.nivel, n);
        if (n >= CONFIRMACOES) fim = { limiar: this.nivel, ouvido: true };
        else { this.subindo = false; this.nivel -= DESCE_DB; }
      } else if (this.nivel - DESCE_DB < DB_MINIMO) {
        fim = { limiar: DB_MINIMO, ouvido: true };   // ouve melhor que o piso
      } else {
        this.nivel -= DESCE_DB;
      }
    } else {
      this.subindo = true;
      if (this.nivel + SOBE_DB > DB_MAXIMO) {
        fim = { limiar: DB_MAXIMO + PENALIDADE_SEM_RESPOSTA, ouvido: false };
      } else {
        this.nivel += SOBE_DB;
      }
    }

    if (!fim && this.apresentacoes >= MAX_APRESENTACOES) {
      // respostas inconsistentes: usa o menor nivel ouvido na subida, se houve
      const sims = [...this.confirmacoes.keys()];
      fim = sims.length
        ? { limiar: Math.min(...sims), ouvido: true }
        : { limiar: DB_MAXIMO + PENALIDADE_SEM_RESPOSTA, ouvido: false };
    }

    if (fim) {
      const p = this.passos[this.indice];
      p.limiar = fim.limiar;
      p.ouvido = fim.ouvido;
      this.indice++;
      this._novaEscada();
    }
    return { fechouPasso: !!fim };
  }

  /** Passos em que a escada estourou o teto sem resposta. */
  semResposta() { return this.passos.filter((p) => p.ouvido === false); }

  reiniciar() {
    for (const p of this.passos) { p.limiar = null; p.ouvido = undefined; }
    this.indice = 0;
    this._novaEscada();
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
                       BANDAS, DB_MINIMO, DB_MAXIMO, NIVEL_INICIAL,
                       DESCE_DB, SOBE_DB, CONFIRMACOES };

})();
