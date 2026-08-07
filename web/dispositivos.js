/* NothingAppX — catalogo de aparelhos.
 *
 * O app nao e' de um fone so'. Cada modelo da Nothing e da CMF tem um conjunto
 * diferente de recursos, e e' esta tabela que decide quais cartoes aparecem.
 * Sem ela, o app mostraria "Ultra bass" para um Ear (Stick), que nao tem.
 *
 * ---------------------------------------------------------------------------
 * PROCEDENCIA — importa, e' um projeto aberto
 *
 * Os codigos de modelo (B181, B184...), os nomes Bluetooth e as capacidades de
 * cada aparelho sao FATOS sobre hardware, lidos dos arquivos de configuracao do
 * app oficial durante trabalho de interoperabilidade. Sao dados, nao codigo: um
 * numero de modelo e uma frequencia de filtro nao sao mais autorais do que a
 * voltagem de uma tomada. Estao aqui reorganizados na nossa propria estrutura.
 *
 * O que NAO entrou, e nao deve entrar: codigo, textos de interface, icones,
 * fontes, animacoes ou imagens do app oficial. E' o que mantem este projeto
 * publicavel e honesto. "Irmao, nao copia."
 *
 * ---------------------------------------------------------------------------
 * CONFIRMADO vs A CONFIRMAR
 *
 * `confirmado: true` significa que ALGUEM rodou este app contra o aparelho e
 * verificou os comandos de verdade. Hoje so' o B184 tem isso, porque e' o unico
 * que tivemos em maos.
 *
 * Para os demais, a tabela de bytes do ANC e o formato dos payloads sao
 * ASSUMIDOS iguais. E' uma aposta razoavel — a familia compartilha o protocolo
 * — mas e' uma aposta. Se voce tem um desses fones e algo se comporta errado,
 * abra uma issue: o painel ?diag existe exatamente para levantar a tabela real
 * do seu modelo em oito cliques. Foi assim que a do B184 saiu.
 */

"use strict";

(() => {

/* Bitmask de modos de ANC que o aparelho aceita (campo `ancLevel` na origem).
 * O significado de cada bit AINDA NAO FOI DECIFRADO. Guardamos o numero cru
 * porque ele e' um fato util, e derivamos so' o que da' para sustentar:
 * 63 e' o valor dos aparelhos com escala completa de niveis; valores menores
 * aparecem em fones sem niveis intermediarios. Nao invente o resto. */
const ESCALA_COMPLETA = 63;

/** Recursos padrao: tudo que a familia toda tem. Cada modelo tira o que falta. */
const BASE = {
  anc: true, eq: true, gestos: true, bateria: true, firmware: true,
  ultraBass: false, espacial: false, dupla: false, audiodo: false,
  latencia: true, testeVedacao: false, dirac: false,
};

/* Filtros do equalizador de 3 bandas: frequencia central e fator Q.
 *
 * CORRECAO IMPORTANTE. Estes valores vieram primeiro do catalogo de
 * capacidades do app oficial, que para o B184 diz 140 / 980 / 6900 Hz com Q
 * 0.8 / 0.7 / 1.0. A captura HCI desmentiu: o que o app REALMENTE manda para
 * o aparelho, dentro do proprio payload do EQ, e' 140 / 980 / 3500 Hz com Q
 * 0.8 / 0.66 / 1.0. Como as frequencias viajam no comando, e' o que vai no ar
 * que molda o som. Onde as duas fontes discordam, vale o Bluetooth.
 *
 * O template de envio vive em protocolo.js (EQ_SECOES); aqui ficam so' os
 * valores usados para desenhar a curva, que precisam ser os mesmos. */
const EQ_CMF     = { grave: [140, 0.8], medio: [980, 0.66], agudo: [3500, 1.0] };
const EQ_NOTHING = { grave: [140, 0.8], medio: [980, 0.7], agudo: [3400, 1.0] };
const EQ_HEADPHONE = { grave: [140, 0.8], medio: [980, 0.7], agudo: [3500, 1.0] };

const CATALOGO = [
  // ---------------------------------------------------------------- CMF
  { id: "B184", nome: "CMF Buds 2 Plus", bt: "CMF Buds 2 Plus", marca: "CMF",
    confirmado: true, ancMask: 63, eq: EQ_CMF,
    recursos: { ultraBass: true, espacial: true, dupla: true, audiodo: true,
                testeVedacao: true, dirac: true } },

  { id: "B179", nome: "CMF Buds 2", bt: "CMF Buds 2", marca: "CMF",
    ancMask: 63, eq: EQ_CMF,
    recursos: { ultraBass: true, espacial: true, dupla: true,
                testeVedacao: true, dirac: true } },

  { id: "B185", nome: "CMF Buds 2a", bt: "CMF Buds 2a", marca: "CMF",
    ancMask: 49, eq: EQ_CMF,
    recursos: { ultraBass: true, dupla: true, dirac: true } },

  { id: "B168", nome: "CMF Buds", bt: "CMF Buds", marca: "CMF",
    ancMask: 49, eq: EQ_CMF,
    recursos: { ultraBass: true, dupla: true, dirac: true } },

  { id: "B163", nome: "CMF Buds Pro", bt: "Buds Pro", marca: "CMF",
    ancMask: 55, eq: EQ_NOTHING, recursos: {} },

  { id: "B187", nome: "CMF Buds Pro 2", bt: "CMF Buds Pro 2", marca: "CMF",
    ancMask: 63, eq: EQ_CMF,
    recursos: { ultraBass: true, espacial: true, dupla: true,
                testeVedacao: true, dirac: true } },

  { id: "B172", nome: "CMF Buds Pro 2", bt: "CMF Buds Pro 2", marca: "CMF",
    ancMask: 63, eq: EQ_CMF, nota: "revisao anterior do Buds Pro 2",
    recursos: { ultraBass: true, espacial: true, dupla: true,
                testeVedacao: true, dirac: true } },

  { id: "B189", nome: "CMF Clip Pro", bt: "CMF Clip Pro", marca: "CMF",
    ancMask: null, eq: EQ_NOTHING,
    recursos: { anc: false, ultraBass: true, espacial: true, dupla: true, dirac: true } },

  { id: "B164", nome: "CMF Neckband Pro", bt: "Neckband Pro", marca: "CMF",
    ancMask: 63, eq: EQ_CMF,
    recursos: { ultraBass: true, espacial: true, dupla: true } },

  { id: "B175", nome: "CMF Headphone Pro", bt: "CMF Headphone Pro", marca: "CMF",
    ancMask: 63, eq: EQ_HEADPHONE,
    recursos: { espacial: true, dupla: true, audiodo: true, dirac: true } },

  // ------------------------------------------------------------ Nothing
  { id: "B181", nome: "Nothing Ear (1)", bt: "Nothing ear (1)", marca: "Nothing",
    ancMask: 53, eq: EQ_NOTHING, recursos: {} },

  { id: "B155", nome: "Nothing Ear (2)", bt: "Ear (2)", marca: "Nothing",
    ancMask: 63, eq: { grave: [140, 0.8], medio: [980, 0.7], agudo: [3400, 1.0] },
    recursos: { dupla: true, testeVedacao: true } },

  { id: "B157", nome: "Nothing Ear (Stick)", bt: "Ear (Stick)", marca: "Nothing",
    ancMask: 33, eq: { grave: [140, 0.8], medio: [980, 0.66], agudo: [3500, 1.0] },
    recursos: { anc: false } },

  { id: "B171", nome: "Nothing Ear", bt: "Nothing Ear", marca: "Nothing",
    ancMask: 63, eq: EQ_NOTHING,
    recursos: { ultraBass: true, dupla: true, testeVedacao: true } },

  { id: "B162", nome: "Nothing Ear (a)", bt: "Nothing Ear (a)", marca: "Nothing",
    ancMask: 63, eq: EQ_NOTHING,
    recursos: { ultraBass: true, dupla: true, testeVedacao: true } },

  { id: "B183", nome: "Nothing Ear (a)", bt: "Nothing Ear (a)", marca: "Nothing",
    ancMask: 63, eq: EQ_NOTHING, nota: "revisao posterior do Ear (a)",
    recursos: { ultraBass: true, dupla: true, testeVedacao: true } },

  { id: "B173", nome: "Nothing Ear (3)", bt: "Nothing Ear (3)", marca: "Nothing",
    ancMask: 63, eq: EQ_NOTHING,
    recursos: { ultraBass: true, espacial: true, dupla: true, audiodo: true,
                testeVedacao: true } },

  { id: "B190", nome: "Nothing Ear (3a)", bt: "Nothing Ear (3a)", marca: "Nothing",
    ancMask: 63, eq: EQ_NOTHING,
    recursos: { espacial: true, dupla: true, testeVedacao: true } },

  { id: "B174", nome: "Nothing Ear (open)", bt: "Nothing Ear (open)", marca: "Nothing",
    ancMask: null, eq: EQ_NOTHING, recursos: { anc: false, dupla: true } },

  { id: "B170", nome: "Nothing Headphone (1)", bt: "Nothing Headphone (1)", marca: "Nothing",
    ancMask: 63, eq: EQ_HEADPHONE,
    recursos: { ultraBass: true, espacial: true, dupla: true } },

  { id: "B186", nome: "Nothing Headphone (a)", bt: "Nothing Headphone (a)", marca: "Nothing",
    ancMask: 63, eq: EQ_HEADPHONE,
    recursos: { ultraBass: true, espacial: true, dupla: true } },
];

// Completa cada entrada com os padroes e normaliza.
for (const d of CATALOGO) {
  d.recursos = { ...BASE, ...d.recursos };
  d.confirmado = d.confirmado === true;
  // So' consideramos que ha' escolha de nivel de ANC na escala completa.
  // Nos demais mostramos apenas Cancelamento / Transparencia / Desligado.
  d.recursos.ancNiveis = d.recursos.anc && d.ancMask === ESCALA_COMPLETA;
}

const PADRAO = CATALOGO.find((d) => d.id === "B184");

/** Acha o aparelho pelo nome Bluetooth. Tolerante a caixa e a espacos. */
function porNomeBluetooth(nome) {
  if (!nome) return null;
  const n = String(nome).trim().toLowerCase();
  return CATALOGO.find((d) => d.bt.toLowerCase() === n)
      || CATALOGO.find((d) => n.includes(d.bt.toLowerCase()))
      || null;
}

const porId = (id) => CATALOGO.find((d) => d.id === id) || null;

/* Codigos de gesto e de acao, lidos da configuracao do app oficial e
 * conferidos contra a captura HCI do B184: os 33 bytes que o fone respondeu ao
 * comando 49176 batem byte a byte com o padrao de fabrica descrito la'. */
const GESTOS = { 2: "gesto.toqueDuplo", 3: "gesto.toqueTriplo",
                 7: "gesto.segurar",   9: "gesto.duploSegurar" };

const ACOES = {
  1:  "acao.nenhuma",      2:  "acao.playPause",   3:  "acao.atender",
  4:  "acao.recusar",      8:  "acao.anterior",    9:  "acao.proxima",
  10: "acao.ruido",        11: "acao.assistente",  18: "acao.volumeMais",
  19: "acao.volumeMenos",  22: "acao.ruido",       31: "acao.noticias",
};

// 0x02 e 0x03 no primeiro byte de cada registro de gesto.
const LADOS = { 2: "lado.esquerdo", 3: "lado.direito" };

/* Quais acoes cada gesto aceita. Nao e' arbitrario: o aparelho recusa
 * combinacoes fora desta lista, e o app oficial nem as oferece. Atender e
 * recusar chamada nao aparecem porque sao fixos, nao configuraveis. */
const ACOES_POR_GESTO = {
  2: [2, 8, 9, 11, 1],       // toque duplo
  3: [8, 9, 11, 1],          // toque triplo
  7: [10, 11, 1],            // tocar e segurar
  9: [18, 19, 11, 1],        // toque duplo e segurar
};

window.dispositivos = { CATALOGO, PADRAO, porNomeBluetooth, porId,
                        GESTOS, ACOES, LADOS, ACOES_POR_GESTO, ESCALA_COMPLETA };

})();
