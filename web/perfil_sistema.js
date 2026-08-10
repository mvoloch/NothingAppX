/* NothingAppX — perfil de correcao para o sistema de audio.
 *
 * POR QUE ISTO EXISTE
 *
 * O "Perfil sonoro pessoal" do app oficial roda no TELEFONE, sobre o audio,
 * antes de ele ser codificado e enviado (ver a evidencia em audiometria.js).
 * Nenhum comando Bluetooth liga aquilo de fora — a correcao simplesmente nao
 * mora no fone.
 *
 * O unico jeito de chegar ao mesmo resultado num PC e' fazer o mesmo: mexer no
 * audio antes que ele saia. Uma pagina de navegador nao alcanca o audio do
 * sistema, mas alcanca o teclado e o disco — entao ela GERA a configuracao, e
 * quem aplica e' um equalizador de sistema que voce ja' escolheu instalar.
 *
 * Nao distribuimos driver nenhum. Escrevemos um arquivo de texto.
 *
 * O QUE ISTO GANHA sobre o equalizador do proprio fone
 *
 *   fone (comando 0xF041)      este perfil
 *   -------------------------  ----------------------------------
 *   3 bandas fixas             uma banda por frequencia medida
 *   igual nos dois ouvidos     esquerdo e direito independentes
 *   -6 a +6 dB                 sem esse teto
 *
 * Ouvido assimetrico e' comum, e o equalizador do fone nao tem como tratar.
 * Aqui tem.
 *
 * O QUE ISTO *NAO* E'
 *
 * Nao e' a Audiodo reimplementada. Eles quase certamente fazem mais do que
 * equalizacao estatica — compressao por banda e modelagem de recrutamento de
 * sonoridade sao praxe nessa area. Isto aqui e' um banco de filtros fixo,
 * derivado dos seus limiares. E' um degrau acima das tres bandas do fone, e
 * um degrau abaixo do que o app do telefone entrega. Sem promessa maior.
 */

"use strict";

(() => {

/* Q de cada filtro. As frequencias medidas estao espacadas em oitavas
 * (250, 500, 1k, 2k, 4k, 8k), e Q = 1.41 da' uma largura de banda de ~1 oitava:
 * os filtros se encostam sem se somar demais na sobreposicao. */
const Q_PADRAO = 1.41;

/** Ganhos por ouvido: quanto cada frequencia precisa ser reforcada, em dB. */
function ganhosPorOrelha(passos, { suavizacao = 0.6, limite = 12 } = {}) {
  const fora = {};
  for (const lado of ["esquerda", "direita"]) {
    const meus = passos.filter((p) => p.orelha === lado && p.limiar !== null);
    if (meus.length < 2) { fora[lado] = []; continue; }
    // A referencia e' a media DO PROPRIO ouvido. Assim a assimetria entre os
    // dois lados nao vira ganho geral — ela ja' e' tratada pelo `deslocamento`.
    const media = meus.reduce((s, p) => s + p.limiar, 0) / meus.length;
    fora[lado] = meus.map((p) => ({
      hz: p.hz,
      db: Math.max(-limite, Math.min(limite,
          Math.round((p.limiar - media) * suavizacao * 10) / 10)),
    }));
  }

  /* Compensacao de assimetria: se um ouvido precisou de mais volume no geral,
   * ele leva um ganho fixo a mais. Metade da diferenca para cada lado, para
   * nao deslocar a imagem estereo de uma vez so'. */
  const mediaDe = (lado) => {
    const v = passos.filter((p) => p.orelha === lado && p.limiar !== null).map((p) => p.limiar);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const dif = mediaDe("direita") - mediaDe("esquerda");
  const desloc = Math.max(-6, Math.min(6, Math.round((dif / 2) * 10) / 10));
  return { ganhos: fora, deslocamento: { esquerda: -desloc, direita: desloc } };
}

/** Maior ganho aplicado em qualquer banda — vira atenuacao de entrada. */
function picoDb({ ganhos, deslocamento }) {
  let pico = 0;
  for (const lado of ["esquerda", "direita"])
    for (const b of ganhos[lado] || [])
      pico = Math.max(pico, b.db + deslocamento[lado]);
  return pico;
}

/* Pico REAL da cascata de filtros, avaliando a resposta em frequencia dos
 * biquads (formulas do Audio EQ Cookbook de R. Bristow-Johnson — as mesmas
 * que o Equalizer APO implementa para o filtro PK). A soma cega dos ganhos
 * de pico superestima: um filtro largo em 1 kHz nao entrega o ganho inteiro
 * la' em 8 kHz. Medido em campo (08/08, perfil com +11.5 dB em 8 kHz): a
 * soma pedia -15.8 dB de preamp; a resposta real pede menos. Cada dB a
 * menos de preamp e' volume que o usuario nao perde. */
function dbBiquadPk(fc, ganhoDb, q, f, fs = 48000) {
  const a = Math.pow(10, ganhoDb / 40);
  const w0 = (2 * Math.PI * fc) / fs;
  const alfa = Math.sin(w0) / (2 * q);
  const b0 = 1 + alfa * a, b1 = -2 * Math.cos(w0), b2 = 1 - alfa * a;
  const a0 = 1 + alfa / a, a1 = b1, a2 = 1 - alfa / a;
  const w = (2 * Math.PI * f) / fs;
  const mag2 = (c0, c1, c2) =>
    c0 * c0 + c1 * c1 + c2 * c2 +
    2 * (c0 * c1 + c1 * c2) * Math.cos(w) +
    2 * c0 * c2 * Math.cos(2 * w);
  return 10 * Math.log10(mag2(b0, b1, b2) / mag2(a0, a1, a2));
}

/* Folga espectral: musica real cai ~4.5 dB/oitava acima de 2 kHz, entao um
 * reforco de agudos quase nunca encontra sinal em escala cheia — nao precisa
 * de headroom integral. Descontar essa folga derruba o preamp (no perfil de
 * campo de 09/08: de -12.3 para ~-4 dB) e encolhe o degrau de volume ao
 * ligar/desligar a correcao, que era a queixa do usuario. Custo assumido:
 * numa gravacao atipicamente brilhante pode haver clipe raro e suave.
 * Degrau zero de verdade so com compressor dinamico (fase 2b). */
function folgaMusicalDb(f) {
  if (f <= 2000) return 0;
  return Math.min(12, 4.5 * Math.log2(f / 2000));
}

function respostaPicoDb({ ganhos, deslocamento }, { comFolga = false } = {}) {
  let pico = 0;
  for (const lado of ["esquerda", "direita"]) {
    const filtros = [];
    const desloc = deslocamento[lado];
    if (desloc) filtros.push({ hz: 1000, db: desloc, q: 0.3 });
    for (const b of ganhos[lado] || []) filtros.push({ hz: b.hz, db: b.db, q: Q_PADRAO });
    if (!filtros.length) continue;
    // grade logaritmica de 20 Hz a 20 kHz; 120 pontos bastam para filtros Q<=1.41
    for (let i = 0; i <= 120; i++) {
      const f = 20 * Math.pow(1000, i / 120);
      let soma = 0;
      for (const flt of filtros) soma += dbBiquadPk(flt.hz, flt.db, flt.q, f);
      if (comFolga) soma -= folgaMusicalDb(f);
      pico = Math.max(pico, soma);
    }
  }
  return pico;
}

/* --------------------------------------------------------- Equalizer APO
 * Formato de texto do Equalizer APO (Windows, GPL). Sintaxe conforme a
 * documentacao do projeto: `Preamp:`, `Channel:` e `Filter N:` numerados.
 *
 * NAO foi testado aqui — este projeto nao instala o Equalizer APO. Se ele
 * recusar o arquivo, o problema esta' nesta funcao, nao no seu teste.
 */
function equalizerApo(perfil, { nomeFone = "" } = {}) {
  const pico = respostaPicoDb(perfil, { comFolga: true });
  const l = [];
  l.push("# Perfil de audicao gerado pelo NothingAppX");
  if (nomeFone) l.push(`# Aparelho: ${nomeFone}`);
  l.push("# Aplique no dispositivo de saida do seu fone, nao no padrao do sistema.");
  l.push("");
  l.push(`Preamp: ${(-(pico + 1)).toFixed(1)} dB`);
  l.push("");

  let n = 0;
  for (const [lado, canal] of [["esquerda", "L"], ["direita", "R"]]) {
    const bandas = perfil.ganhos[lado] || [];
    if (!bandas.length) continue;
    l.push(`Channel: ${canal}`);
    const desloc = perfil.deslocamento[lado];
    if (desloc) l.push(`Filter ${++n}: ON PK Fc 1000 Hz Gain ${desloc.toFixed(1)} dB Q 0.3`);
    for (const b of bandas)
      l.push(`Filter ${++n}: ON PK Fc ${b.hz} Hz Gain ${b.db.toFixed(1)} dB Q ${Q_PADRAO}`);
    l.push("");
  }
  return l.join("\n");
}

/* ------------------------------------------------------------ tabela crua
 * Os mesmos numeros sem sintaxe de ferramenta nenhuma, para quem usa PipeWire,
 * EasyEffects, um plugin VST ou quer conferir a conta. Preferi isto a gerar uma
 * configuracao de PipeWire que eu nao teria como verificar aqui. */
function tabela(perfil) {
  const linhas = ["ouvido,frequencia_hz,ganho_db,q,tipo"];
  for (const lado of ["esquerda", "direita"]) {
    const d = perfil.deslocamento[lado];
    if (d) linhas.push(`${lado},1000,${d.toFixed(1)},0.3,ganho_geral`);
    for (const b of perfil.ganhos[lado] || [])
      linhas.push(`${lado},${b.hz},${b.db.toFixed(1)},${Q_PADRAO},pico`);
  }
  return linhas.join("\n");
}

/** Dispara o download de um texto como arquivo. */
function baixar(nome, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.perfilSistema = { ganhosPorOrelha, equalizerApo, tabela, baixar, picoDb,
                         respostaPicoDb, Q_PADRAO };

})();
