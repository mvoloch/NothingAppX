/* NothingAppX — motor de correcao auditiva em tempo real.
 *
 * ---------------------------------------------------------------------------
 * O PROBLEMA QUE ELE RESOLVE, E QUE UM EQUALIZADOR NAO RESOLVE
 *
 * Perda auditiva quase nunca e' uma perda de volume uniforme. Ela COMPRIME a
 * faixa dinamica: o som fraco desaparece, mas o som forte continua tao alto
 * quanto para quem ouve bem. O fenomeno tem nome — recrutamento de sonoridade.
 *
 * Um equalizador estatico nao tem como tratar isso. Ele aplica os mesmos +8 dB
 * em 6 kHz para um sussurro e para um prato de bateria: acerta no sussurro e
 * agride no prato. E' por isso que "EQ derivado de audiograma" costuma soar
 * duro e cansar o ouvido depois de meia hora.
 *
 * A correcao certa e' ganho DEPENDENTE DO NIVEL, por banda e por ouvido:
 * muito reforco no que e' quieto, pouco no que ja' e' alto. Isso e' compressao
 * multibanda, e e' o que este arquivo faz.
 *
 * ---------------------------------------------------------------------------
 * COMO O SINAL CHEGA AQUI
 *
 * Uma pagina nao enxerga o audio do sistema. O caminho e' um cabo virtual
 * (VB-CABLE, VoiceMeeter ou equivalente): o Windows toca no cabo, este motor
 * captura a entrada do cabo, processa, e devolve no fone.
 *
 *     Windows -> [cabo virtual] -> este motor -> fone Bluetooth
 *
 * Custa uns milissegundos de atraso — irrelevante para musica, ruim para jogo.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE AINDA NAO E'
 *
 * Continua sendo menos do que um motor comercial maduro. Nao ha' modelo de
 * mascaramento, nao ha' deteccao de fala, e a divisao em tres bandas e' grossa
 * perto das dezenas que eles usam. Mas o mecanismo central — ganho que varia
 * com o nivel, por ouvido — esta' aqui, e era ele que faltava.
 */

"use strict";

(() => {

/* Bandas. Cruzamentos em 500 Hz e 3 kHz: as tres regioes onde a audicao
 * costuma se degradar de forma diferente (corpo, fala, brilho). */
const CORTES = [500, 3000];

/* Regra da metade. Prescricoes classicas de amplificacao nao aplicam a perda
 * inteira — aplicam por volta da metade dela —, justamente porque o ouvido com
 * recrutamento nao precisa de tudo aquilo nos niveis altos. Aqui a metade e' o
 * ganho de repouso (som quieto), e ele cai sozinho conforme o sinal sobe. */
const FRACAO_GANHO = 0.5;

const JOELHO_DB = 18;       // transicao larga, para nao "bombear"
const ATAQUE = 0.012;
const LIBERACAO = 0.18;

/* Abaixo disso a banda nem ganha compressor: filtro e ganho puro. Correcao
 * zero tem que ser transparencia de verdade, nao "quase". */
const BYPASS_DB = 0.25;

/* A compressao recua o reforco — e para no zero. A primeira versao descia o
 * limiar conforme o ganho subia, e o resultado (medido em 07/08/2026) era som
 * forte saindo ATENUADO: -8 dB a -6 dBFS com 20 dB prescritos. Errado — quem
 * ouve pouco nao precisa de som forte mais baixo, precisa dele igual.
 *
 * Agora o limiar e' fixo e a razao e' que vem do ganho, calibrada para o
 * reforco de repouso se esgotar exatamente em 0 dBFS:
 *   reducao(0 dBFS) = (0 - LIMIAR)*(1 - 1/razao) = ganho*FRACAO_GANHO
 * Abaixo do limiar, ganho cheio; em fundo de escala, ganho zero; negativo,
 * nunca. As razoes ficam suaves (1.2-2.5 para perdas tipicas). */
const LIMIAR_DB = -30;
const razaoPara = (ganhoDb) => {
  const alvo = Math.min(ganhoDb * FRACAO_GANHO, -LIMIAR_DB - 6);  // teto: razao 5
  return 1 / (1 - alvo / -LIMIAR_DB);
};

/* Armadilha paga em 07/08/2026: o DynamicsCompressorNode aplica sozinho um
 * "makeup gain" — por especificacao, ele amplifica TUDO, mesmo abaixo do
 * limiar (medimos +4,8 dB com correcao zero). A cura e' medir essa maquiagem
 * num contexto offline, com um tom a -60 dBFS (abaixo de qualquer limiar
 * nosso, onde a curva e' linear e so' a maquiagem age), e descontar do ganho
 * da banda. Medimos em vez de calcular pela formula da spec porque o que vale
 * e' o que ESTE navegador faz, nao o que o texto promete. */
const _maquiagem = new Map();
async function ganhoMaquiagem(ganhoDb) {
  const razao = razaoPara(ganhoDb);
  const chave = razao.toFixed(4);
  if (_maquiagem.has(chave)) return _maquiagem.get(chave);
  const fs = 48000, dur = 0.5, nivel = -60;
  const ctx = new OfflineAudioContext(1, fs * dur, fs);
  const osc = ctx.createOscillator();
  osc.frequency.value = 1000;
  const amp = ctx.createGain();
  amp.gain.value = Math.pow(10, nivel / 20);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = LIMIAR_DB;
  comp.ratio.value = razao; comp.knee.value = JOELHO_DB;
  comp.attack.value = ATAQUE; comp.release.value = LIBERACAO;
  osc.connect(amp).connect(comp).connect(ctx.destination);
  osc.start();
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0).slice(Math.floor(fs * 0.25));
  const rms = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
  const db = 20 * Math.log10(rms * Math.SQRT2 || 1e-9) - nivel;
  _maquiagem.set(chave, db);
  return db;
}

class Motor {
  constructor() {
    this.ctx = null;
    this.fonte = null;
    this.ligado = false;
    this.bandas = [];        // {gain, comp} por ouvido e banda
  }

  /** perfil = saida de perfilSistema.ganhosPorOrelha */
  async ligar(idEntrada, perfil, { latencia = "playback" } = {}) {
    await this.desligar();
    this.ctx = new AudioContext({ latencyHint: latencia });

    const midia = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: idEntrada ? { exact: idEntrada } : undefined,
               echoCancellation: false, noiseSuppression: false,
               autoGainControl: false, channelCount: 2 },
    });
    this.fonte = midia;

    const entrada = this.ctx.createMediaStreamSource(midia);
    const divisor = this.ctx.createChannelSplitter(2);
    const juntar = this.ctx.createChannelMerger(2);
    entrada.connect(divisor);

    // desconto da maquiagem do compressor, medido uma vez por valor de ganho
    const desconto = new Map();
    for (const lado of ["esquerda", "direita"]) {
      for (const db of this._ganhosPorBanda(perfil, lado)) {
        if (db > BYPASS_DB && !desconto.has(db)) desconto.set(db, await ganhoMaquiagem(db));
      }
    }

    ["esquerda", "direita"].forEach((lado, canal) => {
      for (const cadeia of this._cadeiaDeUmOuvido(perfil, lado, desconto)) {
        divisor.connect(cadeia.entrada, canal);
        cadeia.saida.connect(juntar, 0, canal);
      }
    });

    juntar.connect(this.ctx.destination);
    this.ligado = true;
    return this.ctx.baseLatency ?? 0;
  }

  /** Uma cadeia por banda: filtro -> compressor -> ganho.
   *  Banda sem reforco (db <= BYPASS_DB) fica so' com filtro e ganho — nada de
   *  compressor, nada de maquiagem para descontar. */
  _cadeiaDeUmOuvido(perfil, lado, desconto) {
    const ganhos = this._ganhosPorBanda(perfil, lado);
    return ganhos.map((db, i) => {
      const filtros = this._filtrosDaBanda(i);
      const saida = this.ctx.createGain();
      let no = filtros[0];
      for (const f of filtros.slice(1)) { no.connect(f); no = f; }

      let comp = null;
      if (db > BYPASS_DB) {
        comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = LIMIAR_DB;
        comp.ratio.value = razaoPara(db);
        comp.knee.value = JOELHO_DB;
        comp.attack.value = ATAQUE;
        comp.release.value = LIBERACAO;
        no.connect(comp);
        no = comp;
        // ganho de repouso ja' limpo da maquiagem que o compressor embute
        saida.gain.value = Math.pow(10, (db * FRACAO_GANHO - (desconto.get(db) ?? 0)) / 20);
      } else {
        saida.gain.value = Math.pow(10, (db * FRACAO_GANHO) / 20);
      }
      no.connect(saida);
      this.bandas.push({ lado, banda: i, db, comp, saida });
      return { entrada: filtros[0], saida };
    });
  }

  _filtrosDaBanda(i) {
    const criar = (tipo, hz) => {
      const f = this.ctx.createBiquadFilter();
      f.type = tipo; f.frequency.value = hz; f.Q.value = 0.707;
      return f;
    };
    if (i === 0) return [criar("lowpass", CORTES[0])];
    if (i === 1) return [criar("highpass", CORTES[0]), criar("lowpass", CORTES[1])];
    return [criar("highpass", CORTES[1])];
  }

  /** Junta as frequencias medidas nas tres bandas do motor. */
  _ganhosPorBanda(perfil, lado) {
    const medidas = perfil.ganhos[lado] || [];
    const desloc = perfil.deslocamento?.[lado] || 0;
    const faixas = [(hz) => hz < CORTES[0],
                    (hz) => hz >= CORTES[0] && hz < CORTES[1],
                    (hz) => hz >= CORTES[1]];
    return faixas.map((dentro) => {
      const v = medidas.filter((m) => dentro(m.hz)).map((m) => m.db);
      const media = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      return media + desloc;
    });
  }

  async desligar() {
    this.fonte?.getTracks().forEach((t) => t.stop());
    if (this.ctx) { try { await this.ctx.close(); } catch {} }
    this.ctx = null; this.fonte = null; this.bandas = []; this.ligado = false;
  }

  /** Reducao instantanea de cada compressor, em dB. Para o medidor da tela. */
  reducao() {
    return this.bandas.map((b) => ({ lado: b.lado, banda: b.banda,
                                     db: b.comp ? b.comp.reduction : 0 }));
  }
}

/* ---------------------------------------------------------------- medicao
 * Monta a MESMA cadeia num contexto offline e mede o ganho real de ponta a
 * ponta para um tom, em varios niveis de entrada. E' assim que se comprova que
 * o ganho depende do nivel — e nao apenas que o codigo roda sem erro.
 */
async function medirGanho(ganhoDb, hz, niveisDbFS) {
  const fora = [];
  const desconto = ganhoDb > BYPASS_DB ? await ganhoMaquiagem(ganhoDb) : 0;
  for (const nivel of niveisDbFS) {
    const dur = 1.2, fs = 48000;
    const ctx = new OfflineAudioContext(1, fs * dur, fs);
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const amp = ctx.createGain();
    amp.gain.value = Math.pow(10, nivel / 20);

    const g = ctx.createGain();
    g.gain.value = Math.pow(10, (ganhoDb * FRACAO_GANHO - desconto) / 20);
    let no = amp;
    if (ganhoDb > BYPASS_DB) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = LIMIAR_DB;
      comp.ratio.value = razaoPara(ganhoDb); comp.knee.value = JOELHO_DB;
      comp.attack.value = ATAQUE; comp.release.value = LIBERACAO;
      no.connect(comp);
      no = comp;
    }

    osc.connect(amp);
    no.connect(g).connect(ctx.destination);
    osc.start();
    const buf = await ctx.startRendering();
    // RMS da segunda metade, ja' com o compressor acomodado
    const d = buf.getChannelData(0).slice(Math.floor(fs * 0.6));
    const rms = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
    const saidaDb = 20 * Math.log10(rms * Math.SQRT2 || 1e-9);
    fora.push({ entrada: nivel, saida: +saidaDb.toFixed(1),
                ganho: +(saidaDb - nivel).toFixed(1) });
  }
  return fora;
}

window.motorAudio = { Motor, medirGanho, ganhoMaquiagem, CORTES, FRACAO_GANHO,
                      BYPASS_DB, LIMIAR_DB, razaoPara };

})();
