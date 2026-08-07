/* NothingAppX — lógica de interface.
   O transporte Bluetooth (Web Serial sobre RFCOMM) entra no próximo passo. */

"use strict";

const { t, aplicarTraducoes, definirIdioma, obterIdioma, IDIOMAS } = window.i18n;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------- presets
// `valor` é o número que viaja no protocolo (escrita 61469 / leitura 49232).
// A numeração vem do ear-web e é coerente com a captura, onde este aparelho
// reportou 1 com o Rock ativo.
//
// `bandas` (graves, médios, agudos) continua ESTIMADO das capturas de tela do
// app oficial — não é leitura do aparelho. Serve só para desenhar a miniatura.
// Trocar pelos números reais quando a tela do EQ personalizado ler o 49220.
const PRESETS = {
  equilibrado:{ valor: 0, rotulo: "eq.equilibrado", bandas: [3, 3, 3] },
  rock:       { valor: 1, rotulo: "eq.rock",        bandas: [4, 4, 3] },
  eletronica: { valor: 2, rotulo: "eq.eletronica",  bandas: [5, 4, 5] },
  pop:        { valor: 3, rotulo: "eq.pop",         bandas: [4, 5, 1] },
  vocais:     { valor: 4, rotulo: "eq.vocais",      bandas: [2, 6, 0] },
  classica:   { valor: 5, rotulo: "eq.classica",    bandas: [2, 5, 4] },
  custom:     { valor: 6, rotulo: "eq.custom",      bandas: [0, 0, 0] },
};
const PRESET_POR_VALOR = Object.fromEntries(
  Object.entries(PRESETS).map(([nome, p]) => [p.valor, nome]));

// ------------------------------------------------------------- estado
const disp = window.dispositivos;

const estado = {
  conectado: false,
  modelo: null,             // entrada do catálogo — decide quais cartões existem
  nome: null,
  bateria: { l: null, r: null, estojo: null },
  anc: { modo: null, nivel: null },
  bass: { ligado: false, nivel: 0 },
  perfil: false,
  eq: "rock",
  eqBandas: null,           // quando o usuário edita o Personalizado
  eqAvancado: false,        // 49231/61519 — o fone reportou ligado na captura
  gestos: null,             // lista decodificada de 49176
  audiometria: null,        // [graves, medios, agudos] em dB, do nosso teste
  espacial: null,           // null = nunca tocado; não há comando de leitura
  perfilSistema: null,      // ganhos por ouvido, para o equalizador do sistema
  controles: null,
  latencia: false,
  dupla: false,
  firmware: null,
  codec: null,
};

// ------------------------------------------------------------- render
function render() {
  document.body.classList.toggle("conectado", estado.conectado);
  $("ponto-conexao").classList.toggle("on", estado.conectado);
  document.querySelector(".hero").classList.toggle("conectado", estado.conectado);

  $("nome-dispositivo").textContent = estado.conectado ? estado.nome : t("app.semDispositivo");
  $("btn-conectar").hidden = estado.conectado;

  bateria("l", "bat.esquerdo", estado.bateria.l);
  bateria("r", "bat.direito", estado.bateria.r);
  $("bat-case-wrap").hidden = estado.bateria.estojo === null;
  if (estado.bateria.estojo !== null) bateria("c", "bat.estojo", estado.bateria.estojo);

  // ANC
  const m = estado.anc.modo;
  $("anc-estado").textContent =
    m === null ? "—"
    : m === 1 && estado.anc.nivel !== null ? `${t("estado.ligado")} · ${t("anc.nivel." + estado.anc.nivel)}`
    : t("anc.modo." + m);
  document.querySelectorAll("[data-anc]").forEach((b) => b.classList.toggle("ativo", Number(b.dataset.anc) === m));

  const podeNivel = m === 1;
  $("niveis-anc").classList.toggle("inerte", !podeNivel);
  document.querySelectorAll("[data-nivel]").forEach((b) =>
    b.classList.toggle("ativo", Number(b.dataset.nivel) === estado.anc.nivel));

  // Ultra bass
  $("bass-estado").textContent = estado.bass.ligado
    ? `${t("estado.ligado")} · ${t("bass.nivel", { n: estado.bass.nivel })}`
    : t("estado.desligado");
  $("bass-toggle").setAttribute("aria-checked", String(estado.bass.ligado));
  $("bass-nivel").classList.toggle("inerte", !estado.bass.ligado);
  document.querySelectorAll("#bass-nivel button").forEach((b) =>
    b.querySelector("i").classList.toggle(
      "on", estado.bass.ligado && Number(b.dataset.bass) <= estado.bass.nivel));

  // baixa latência
  $("latencia-estado").textContent = t(estado.latencia ? "estado.ligado" : "estado.desligado");
  $("latencia-toggle").setAttribute("aria-checked", String(estado.latencia));

  // demais
  $("perfil-estado").textContent = t(estado.perfil ? "estado.ligado" : "estado.desligado");
  $("perfil-toggle").setAttribute("aria-checked", String(estado.perfil));
  $("eq-estado").textContent = t(PRESETS[estado.eq].rotulo);

  const lista = gestosLegiveis();
  $("controles-estado").textContent = lista.length
    ? t("controles.gestos", { n: lista.length })
    : estado.controles ? t(estado.controles) : "—";
  // o mapa completo no title: o cartão é pequeno, a tela dedicada vem depois
  $("cartao-controles").title = lista.map((g) => `${g.lado}: ${g.gesto} → ${g.acao}`).join("\n");

  document.querySelectorAll("[data-espacial]").forEach((b) =>
    b.classList.toggle("ativo", estado.espacial !== null
                       && (Number(b.dataset.espacial) === 1) === estado.espacial));

  aplicarRecursos();
  $("dupla-estado").textContent = t(estado.dupla ? "estado.ligado" : "estado.desligado");
  $("sobre-estado").textContent = estado.nome || "—";
  $("rodape-firmware").textContent = estado.firmware ? t("rodape.firmware", { v: estado.firmware }) : "—";
  $("rodape-codec").textContent = t("rodape.codec", { c: estado.codec || "—" });

  desenharEQ(bandasAtuais());
}

function bandasAtuais() {
  return estado.eq === "custom" && estado.eqBandas ? estado.eqBandas : PRESETS[estado.eq].bandas;
}

function bateria(qual, chave, valor) {
  $(`bat-${qual}-txt`).textContent = valor === null ? `${t(chave)} —` : `${t(chave)} ${valor}%`;
  $(`bat-${qual}-barra`).style.width = `${valor ?? 0}%`;
}

// --------------------------------------------- equalizador tri-lóbulo
// O raio em cada ângulo é a soma de três gaussianas centradas nas bandas.
// É isso que produz a forma orgânica em vez de um triângulo — e é o que
// permite animar a transição entre presets interpolando só três números.
function desenharEQ(bandas) {
  const cv = $("eq-mini");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const lado = 120;
  cv.width = cv.height = lado * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, lado, lado);

  const cx = lado / 2, cy = lado / 2;
  const ang = [Math.PI * 1.5, Math.PI * 0.833, Math.PI * 0.167];   // médios, graves, agudos
  const val = [bandas[1], bandas[0], bandas[2]];
  const base = 22, ganho = 2.9, larg = 1.02;

  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const th = (i / 200) * Math.PI * 2;
    let r = base;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(((th - ang[k] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      r += (val[k] * ganho + 7) * Math.exp(-(d * d) / (2 * larg * larg));
    }
    pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]);
  }

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();

  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 54);
  g.addColorStop(0, "rgba(255,255,255,.04)");
  g.addColorStop(1, "rgba(255,255,255,.19)");
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.2; ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
}

// ------------------------------------------------------------- eventos
/* Bytes do ANC — MEDIDOS no CMF Buds 2 Plus, nao portados de outro modelo.
 *
 * Procedencia: painel ?diag deste app, 07/08/2026. Cada byte de 0x00 a 0x07 foi
 * enviado ao aparelho e o efeito julgado de ouvido, com ruido ambiente:
 *     0x00 ignorado    0x01 ALTO     0x02 MEDIO   0x03 BAIXO
 *     0x04 ADAPTATIVO  0x05 OFF      0x06 ignorado 0x07 TRANSPARENCIA
 *
 * As duas versoes anteriores deste mapa vinham da tabela do ear-web, que e do
 * Nothing Ear (1). Nenhuma batia: por isso o Alto soava fraco e o Adaptativo
 * soava mais forte que o Alto. A escala real e ordinal e decrescente (1=forte),
 * o oposto do que a tabela de referencia sugeria.
 *
 * Uma ressalva honesta: 0x04 foi descrito como "parece igual ao 0x02 ou 0x03".
 * E o esperado de um modo adaptativo num ambiente estavel — ele se acomoda ao
 * ruido do momento —, mas e o unico valor da tabela ainda nao distinguido dos
 * vizinhos por escuta direta. Confirmar variando muito o ruido ambiente.
 */
const BYTE_ANC = {
  0: 0x03,   // Baixo
  1: 0x02,   // Medio
  2: 0x01,   // Alto
  3: 0x04,   // Adaptativo
};
const BYTE_TRANSPARENCIA = 0x07;
const BYTE_DESLIGADO     = 0x05;

function aplicarANC() {
  const m = estado.anc.modo;
  let b;
  if (m === 1)      b = BYTE_ANC[estado.anc.nivel] ?? BYTE_ANC[2];
  else if (m === 2) b = BYTE_TRANSPARENCIA;
  else              b = BYTE_DESLIGADO;
  // o ack do 0xF00F é só um "ok" (00), não devolve o estado — então relemos
  escrever(CMD.DEFINIR_ANC, [0x01, b, 0x00],
           { reler: CMD.LER_ANC, aplicar: (p) => { const a = dec.anc(p);
                                                   estado.anc = { modo: a.modo, nivel: a.nivel }; } });
}

document.querySelectorAll("[data-anc]").forEach((b) => b.addEventListener("click", () => {
  estado.anc.modo = Number(b.dataset.anc);
  if (estado.anc.modo === 1 && estado.anc.nivel === null) estado.anc.nivel = 2;
  render();
  aplicarANC();
}));

document.querySelectorAll("[data-nivel]").forEach((b) => b.addEventListener("click", () => {
  if (estado.anc.modo !== 1) return;
  estado.anc.nivel = Number(b.dataset.nivel);
  render();
  aplicarANC();
}));

/* Ultra bass.
 * Liga/desliga e nível são o MESMO comando: [ligado, nivel*2]. A versão
 * anterior mandava dois comandos e errava os dois — 61519 (que é o "EQ
 * avançado", não o bass) com o byte de ligado fixo em 0x01, e o nível sem
 * dividir por 2 na leitura. Como o valor lido realimentava a escrita, o nível
 * dobrava a cada abertura do app: 8, 16, 32... e o interruptor nunca desligava
 * nada, porque o primeiro byte era sempre 1. */
function aplicarBass() {
  escrever(CMD.DEFINIR_ULTRA_BASS,
           [estado.bass.ligado ? 0x01 : 0x00, estado.bass.nivel * 2],
           { reler: CMD.LER_ULTRA_BASS, aplicar: (p) => { estado.bass = dec.ultraBass(p); } });
}

$("bass-toggle").addEventListener("click", () => {
  estado.bass.ligado = !estado.bass.ligado;
  if (estado.bass.ligado && !estado.bass.nivel) estado.bass.nivel = 3;
  render();
  aplicarBass();
});

document.querySelectorAll("#bass-nivel button").forEach((b) =>
  b.addEventListener("click", () => {
    estado.bass.nivel = Number(b.dataset.bass);
    estado.bass.ligado = true;
    render();
    aplicarBass();
  }));

$("latencia-toggle").addEventListener("click", () => {
  estado.latencia = !estado.latencia;
  render();
  // 1 = ligado, 2 = desligado. Não é 0/1, e o comando não é o 61444: aquele é
  // a detecção in-ear, que era o que este botão vinha mandando.
  escrever(CMD.DEFINIR_LATENCIA, [estado.latencia ? 0x01 : 0x02, 0x00],
           { reler: CMD.LER_LATENCIA, aplicar: (p) => { estado.latencia = dec.latencia(p); } });
});

/* Áudio espacial. Formato [valor, 0x00], como os outros ajustes de 2 bytes.
 * Duas capturas independentes mostram 0xF052 indo a 00 e depois 01 exatamente
 * quando o usuário mexeu neste controle. Não temos comando de LEITURA, então
 * não dá para confirmar relendo — o estado inicial fica desconhecido até você
 * clicar. Por isso o cartão não afirma nada antes do primeiro toque. */
document.querySelectorAll("[data-espacial]").forEach((b) => b.addEventListener("click", () => {
  estado.espacial = Number(b.dataset.espacial) === 1;
  render();
  escrever(CMD.DEFINIR_ESPACIAL, [estado.espacial ? 0x01 : 0x00, 0x00]);
}));

$("perfil-toggle").addEventListener("click", () => {
  estado.perfil = !estado.perfil;
  render();
  // Payload de 1 byte, sem o 0x00 de enchimento dos outros — foi o que a
  // captura mostrou. E aqui o próprio ack devolve o valor, então ele serve
  // de confirmação e dispensa uma releitura.
  escrever(CMD.DEFINIR_PERFIL, [estado.perfil ? 0x01 : 0x00],
           { peloAck: true, aplicar: (p) => { estado.perfil = dec.booleano(p); } });
});

function trocarPreset(nome) {
  estado.eq = nome;
  render();
  montarPainelEQ();
  escrever(CMD.DEFINIR_PRESET, [PRESETS[nome].valor, 0x00],
           { reler: CMD.LER_PRESET, aplicar: (p) => { aplicarPreset(p); montarPainelEQ(); } });
}

// ------------------------------------------------------ painel do EQ
/* Os ganhos dos presets ainda são estimativa das capturas de tela (escala 0–6,
 * que viramos em ±6 dB). As FREQUÊNCIAS e os fatores Q, não: são os filtros
 * reais do modelo. Por isso a curva já vale a pena — a forma está certa mesmo
 * com a altura aproximada. */
const emDb = (bandas) => bandas.map((b) => (b - 3) * 2);

/** Ganhos em dB. No Personalizado são reais — vêm do fone ou do seu ajuste. */
function ganhosDb() {
  return estado.eq === "custom"
    ? (estado.eqBandas || [0, 0, 0])
    : emDb(PRESETS[estado.eq].bandas);
}

/* Editor das três bandas. Só aparece no preset Personalizado, que é o único
 * em que o aparelho aceita ganhos arbitrários. A faixa é de -6 a +6 dB, que é
 * o que o app oficial usa — foi o intervalo varrido na captura. */
function montarBandas() {
  const caixa = $("eq-bandas");
  caixa.hidden = estado.eq !== "custom";
  if (caixa.hidden) return;
  caixa.querySelectorAll(".linha-banda").forEach((e) => e.remove());

  const g = ganhosDb();
  ["eq.graves", "eq.medios", "eq.agudos"].forEach((chave, i) => {
    const linha = document.createElement("div");
    linha.className = "linha-banda";
    const rot = document.createElement("label");
    rot.textContent = t(chave);
    const faixa = document.createElement("input");
    Object.assign(faixa, { type: "range", min: -6, max: 6, step: 1, value: g[i] });
    const db = document.createElement("span");
    db.className = "db";
    const mostrar = (v) => { db.textContent = `${v > 0 ? "+" : ""}${v} dB`; };
    mostrar(Number(faixa.value));

    faixa.addEventListener("input", () => {
      const bandas = ganhosDb().slice();
      bandas[i] = Number(faixa.value);
      estado.eqBandas = bandas;
      mostrar(bandas[i]);
      window.telas.desenharCurva($("eq-curva"), estado.modelo.eq, bandas);
    });
    // só manda quando o dedo solta: arrastar dispararia dezenas de envios
    faixa.addEventListener("change", () => {
      escrever(CMD.DEFINIR_EQ_CUSTOM, window.protocolo.montarEqCustom(ganhosDb()));
      render();
    });

    linha.append(rot, faixa, db);
    caixa.appendChild(linha);
  });
}

function montarPainelEQ() {
  const f = estado.modelo?.eq;
  if (!f) return;
  window.telas.desenharCurva($("eq-curva"), f, ganhosDb());
  montarBandas();

  $("eq-nota").textContent =
    t("eq.nota", { m: estado.modelo.nome, g: f.grave[0], m2: f.medio[0], a: f.agudo[0] })
    + "  " + t("eq.notaEstimada");

  const alvo = $("lista-presets");
  alvo.innerHTML = "";
  for (const [nome, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.className = "preset" + (nome === estado.eq ? " ativo" : "");
    b.textContent = t(p.rotulo);
    b.addEventListener("click", () => trocarPreset(nome));
    alvo.appendChild(b);
  }
}

$("cartao-eq").addEventListener("click", () => { montarPainelEQ(); window.telas.abrir("painel-eq"); });
$("eq-voltar").addEventListener("click", () => window.telas.fechar("painel-eq"));

// ------------------------------------------------ painel dos controles
/* Escrita de gesto: [quantidade, lado, comum, gesto, ação] — um registro por
 * envio. O mesmo formato de 4 bytes por registro que a leitura devolve. */
function montarPainelGestos() {
  const alvo = $("lista-gestos");
  alvo.innerHTML = "";
  if (!estado.gestos?.length) {
    alvo.innerHTML = `<p class="painel-nota">${t("app.semDispositivo")}</p>`;
    return;
  }
  for (const g of estado.gestos) {
    const linha = document.createElement("div");
    linha.className = "linha-gesto";

    const rot = document.createElement("div");
    rot.className = "rot";
    rot.innerHTML = `${t(disp.GESTOS[g.tipo] || "—")}<small>${t(disp.LADOS[g.fone] || "—")}</small>`;

    const sel = document.createElement("select");
    const opcoes = disp.ACOES_POR_GESTO[g.tipo] || [g.acao];
    const lista = opcoes.includes(g.acao) ? opcoes : [g.acao, ...opcoes];
    for (const a of lista) {
      const o = document.createElement("option");
      o.value = a; o.textContent = t(disp.ACOES[a] || "—");
      if (a === g.acao) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => {
      const acao = Number(sel.value);
      g.acao = acao;
      render();
      escrever(CMD.DEFINIR_GESTOS, [0x01, g.fone, g.comum, g.tipo, acao],
               { reler: CMD.LER_GESTOS,
                 aplicar: (p) => { estado.gestos = dec.gestos(p); montarPainelGestos(); } });
    });

    linha.append(rot, sel);
    alvo.appendChild(linha);
  }
}

// -------------------------------------------- painel do teste de audição
/* O Perfil sonoro pessoal do app oficial é calibrado pelo SDK da Audiodo e
 * não está ao nosso alcance — o comando 0xF05D só liga e desliga o que já foi
 * criado lá. Este é o nosso equivalente: mede os limiares e aplica a correção
 * pelo equalizador personalizado, que é o que de fato controlamos. */
const teste = new window.audiometria.Audiometria();

function faseAudio(qual) {
  for (const id of ["audio-inicio", "audio-teste", "audio-fim"])
    $(id).hidden = id !== `audio-${qual}`;
}

function mostrarPasso() {
  const p = teste.passo;
  $("audio-passo").innerHTML =
    t("audio.passo", { orelha: t("audio.orelha." + p.orelha), hz: p.hz })
    + `<small>${t("audio.contador", { i: teste.indice + 1, n: teste.total })}</small>`;
  $("audio-barra").style.width = "0%";
}

async function rodarPasso() {
  mostrarPasso();
  const { db, ouvido } = await teste.tocar((fracao) => {
    $("audio-barra").style.width = `${Math.round(fracao * 100)}%`;
  });
  if (teste.registrar(db, ouvido)) { await new Promise((r) => setTimeout(r, 650)); rodarPasso(); }
  else mostrarResultado();
}

function mostrarResultado() {
  faseAudio("fim");
  const medias = teste.mediaPorFrequencia();
  const bandas = window.audiometria.bandasSugeridas(medias);
  estado.audiometria = bandas;

  // reaproveita a curva do EQ para desenhar a correção sugerida
  window.telas.desenharCurva($("audio-grafico"), estado.modelo.eq, bandas);

  // perfil por ouvido, para o equalizador de sistema
  estado.perfilSistema = window.perfilSistema.ganhosPorOrelha(teste.passos);
  const apo = window.perfilSistema.equalizerApo(estado.perfilSistema,
                                                { nomeFone: estado.modelo?.nome });
  $("sis-previa").textContent = apo;

  const dif = teste.assimetria();
  $("audio-resumo").textContent =
    t("audio.resultado", { g: bandas[0], m: bandas[1], a: bandas[2] }) + " " +
    (Math.abs(dif) >= 4
      ? t("audio.assimetria", { lado: t("audio.orelha." + (dif > 0 ? "direita" : "esquerda")),
                                db: Math.abs(Math.round(dif)) })
      : t("audio.simetrico"));

  // Passos sem resposta: o limiar real esta' ACIMA do alcance do teste. Um ou
  // dois sao informacao (perda naquela frequencia); muitos indicam volume
  // baixo demais para o teste valer.
  const nr = teste.semResposta();
  if (nr.length) {
    const lista = nr.map((p) => `${p.hz} Hz (${t("audio.orelha." + p.orelha)})`).join(", ");
    $("audio-resumo").textContent += " " +
      t(nr.length >= 4 ? "audio.semRespostaMuitos" : "audio.semResposta",
        { n: nr.length, lista });
  }
}

const arquivoSeguro = (s) => String(s || "fone").replace(/[^\w.-]+/g, "_").toLowerCase();

// --------------------------------------------- correção ao vivo (motor)
/* O motor processa a entrada escolhida (microfone ou cabo virtual) com a
 * compressao por ouvido e devolve na saida padrao — o fone. So funciona com
 * um perfil medido; por isso mora dentro do resultado do teste. */
const motor = new window.motorAudio.Motor();
let medidorTimer = null;

async function listarEntradas() {
  const sel = $("motor-entrada");
  const atual = sel.value;
  const aparelhos = await navigator.mediaDevices.enumerateDevices();
  sel.innerHTML = "";
  aparelhos.filter((d) => d.kind === "audioinput").forEach((d, i) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || t("motor.entradaN", { n: i + 1 });
    sel.appendChild(o);
  });
  if (atual) sel.value = atual;
  else {
    // preferir o cabo virtual — capturar o microfone do proprio fone derruba
    // o Bluetooth para o perfil maos-livres (qualidade de telefone)
    const cabo = [...sel.options].find((o) => /cable|vb-?audio|virtual/i.test(o.textContent));
    if (cabo) sel.value = cabo.value;
  }
}

/** A entrada escolhida e' o microfone de um fone Bluetooth? */
const entradaEhFone = (rotulo) =>
  /hands-?free|headset|buds|\bear\b/i.test(rotulo || "");

/** A entrada parece um cabo virtual / loopback (a unica que faz sentido)? */
const entradaEhCabo = (rotulo) =>
  /cable|vb-?audio|virtual|voicemeeter|loopback|stereo mix|mixagem/i.test(rotulo || "");
$("motor-entrada").addEventListener("focus", listarEntradas);

function desenharMedidor() {
  const alvo = $("motor-medidor");
  const linhas = motor.reducao();
  if (alvo.childElementCount !== linhas.length) {
    alvo.innerHTML = linhas.map(() => '<div class="faixa"><i></i></div>').join("");
  }
  linhas.forEach((b, i) => {
    const pct = Math.min(1, Math.abs(b.db) / 18) * 100;
    alvo.children[i].firstElementChild.style.width = pct + "%";
  });
}

$("motor-ligar").addEventListener("click", async () => {
  const btn = $("motor-ligar");
  if (motor.ligado) {
    clearInterval(medidorTimer); medidorTimer = null;
    await motor.desligar();
    $("motor-medidor").hidden = true;
    $("motor-ganhos").textContent = "";
    btn.textContent = t("motor.ligar");
    return;
  }
  if (!estado.perfilSistema) return;
  btn.disabled = true;
  try {
    await motor.ligar($("motor-entrada").value || undefined, estado.perfilSistema);
    await listarEntradas();               // com a permissão dada, vêm os nomes
    // Capturamos o microfone do proprio fone? Isso mata o codec (maos-livres).
    // Melhor desligar e avisar do que tocar em qualidade de telefone.
    const rotulo = motor.rotuloEntrada();
    if (entradaEhFone(rotulo)) {
      await motor.desligar();
      alert(t("motor.entradaErrada"));
      return;
    }
    // Microfone de verdade? Entao nao ha' audio do sistema para corrigir —
    // so' entraria o som da sala dentro do fone. Recusar e ensinar o cabo.
    if (rotulo && !entradaEhCabo(rotulo)) {
      await motor.desligar();
      alert(t("motor.semCabo"));
      return;
    }
    // Quanto o SEU perfil pede, por banda: se for quase zero, nao ha' mesmo
    // diferenca para ouvir — e isso merece estar escrito, nao suposto.
    const porLado = { esquerda: [0, 0, 0], direita: [0, 0, 0] };
    for (const b of motor.bandas)
      porLado[b.lado][b.banda] = Math.round(b.db * window.motorAudio.FRACAO_GANHO * 10) / 10;
    $("motor-ganhos").textContent = t("motor.repouso",
      { e: porLado.esquerda.join(" / "), d: porLado.direita.join(" / ") });
    $("motor-medidor").hidden = false;
    medidorTimer = setInterval(desenharMedidor, 120);
    btn.textContent = t("motor.desligar");
  } catch (e) {
    alert(t("motor.falha") + ": " + (e?.message || e));
  } finally {
    btn.disabled = false;
  }
});

$("sis-apo").addEventListener("click", () => window.perfilSistema.baixar(
  `perfil_${arquivoSeguro(estado.modelo?.nome)}.txt`,
  window.perfilSistema.equalizerApo(estado.perfilSistema, { nomeFone: estado.modelo?.nome })));

$("sis-csv").addEventListener("click", () => window.perfilSistema.baixar(
  `perfil_${arquivoSeguro(estado.modelo?.nome)}.csv`,
  window.perfilSistema.tabela(estado.perfilSistema)));

$("audio-comecar").addEventListener("click", () => { faseAudio("teste"); rodarPasso(); });
$("audio-ouvi").addEventListener("click", () => teste.parar());
$("audio-refazer").addEventListener("click", () => { teste.reiniciar(); faseAudio("inicio"); });

$("audio-aplicar").addEventListener("click", () => {
  estado.eq = "custom";
  estado.eqBandas = estado.audiometria.slice();
  render();
  escrever(CMD.DEFINIR_PRESET, [PRESETS.custom.valor, 0x00]);
  setTimeout(() => escrever(CMD.DEFINIR_EQ_CUSTOM,
                            window.protocolo.montarEqCustom(estado.eqBandas)), 250);
  window.telas.fechar("painel-audio");
  montarPainelEQ();
  window.telas.abrir("painel-eq");
});

$("audio-voltar").addEventListener("click", () => { teste.parar(); window.telas.fechar("painel-audio"); });

// o cartão abre o teste; o interruptor continua ligando o perfil do app oficial
document.querySelector('[data-recurso="audiodo"]').addEventListener("click", (e) => {
  if (e.target.closest("#perfil-toggle")) return;
  faseAudio(teste.terminou ? "fim" : "inicio");
  window.telas.abrir("painel-audio");
});

$("cartao-controles").addEventListener("click", () => {
  montarPainelGestos(); window.telas.abrir("painel-gestos");
});
$("gestos-voltar").addEventListener("click", () => window.telas.fechar("painel-gestos"));

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  teste.parar();
  ["painel-eq", "painel-gestos", "painel-audio"].forEach(window.telas.fechar);
});

function aplicarPreset(p) {
  const nome = PRESET_POR_VALOR[dec.preset(p)];
  if (nome) estado.eq = nome;
}

$("btn-conectar").addEventListener("click", conectar);

// ------------------------------------------------------- modelo do aparelho
/* Qual fone estamos controlando decide o que a tela mostra. Um Ear (Stick) não
 * tem ANC; um Buds Pro não tem Ultra bass. Em vez de espalhar `if` pela
 * interface, cada cartão declara de que recurso depende (data-recurso) e esta
 * função liga ou desliga o cartão inteiro.
 *
 * A escolha é manual porque a Web Serial não expõe o nome Bluetooth da porta —
 * ela devolve só o UUID do serviço. Fica salva entre sessões. */
function aplicarRecursos() {
  const r = estado.modelo?.recursos;
  document.querySelectorAll("[data-recurso]").forEach((el) => {
    el.hidden = r ? !r[el.dataset.recurso] : false;
  });
  $("niveis-anc").hidden = !(r && r.ancNiveis);
  $("aviso-modelo").hidden = !estado.modelo || estado.modelo.confirmado;
}

function montarSeletorModelo() {
  const sel = $("seletor-modelo");
  const salvo = localStorage.getItem("modelo");
  estado.modelo = disp.porId(salvo) || disp.PADRAO;
  sel.innerHTML = "";
  for (const d of disp.CATALOGO) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.nome + (d.confirmado ? " ✓" : "");
    if (d.id === estado.modelo.id) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => {
    estado.modelo = disp.porId(sel.value) || disp.PADRAO;
    localStorage.setItem("modelo", estado.modelo.id);
    render();
  });
}

/** Lista de gestos já traduzida, a partir do que o fone respondeu. */
function gestosLegiveis() {
  if (!estado.gestos) return [];
  return estado.gestos.map((g) => ({
    lado: t(disp.LADOS[g.fone] || "lado.direito"),
    gesto: t(disp.GESTOS[g.tipo] || "—"),
    acao: t(disp.ACOES[g.acao] || "—"),
  }));
}

// ------------------------------------------------------------- idioma
function montarSeletorIdioma() {
  const sel = $("seletor-idioma");
  sel.innerHTML = "";
  for (const { cod, nome } of IDIOMAS) {
    const o = document.createElement("option");
    o.value = cod; o.textContent = nome;
    if (cod === obterIdioma()) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => definirIdioma(sel.value));
}
document.addEventListener("idioma:mudou", render);

// ------------------------------------------------------------- conexão
const { Conexao, CMD, dec } = window.protocolo;
const link = new Conexao();

link.addEventListener("desconectado", () => {
  estado.conectado = false;
  render();
});

async function conectar() {
  // no app empacotado a ponte nativa dispensa o Web Serial
  if (!window.__TAURI__ && !("serial" in navigator)) { alert(t("aviso.semSerial")); return; }

  const btn = $("btn-conectar");
  btn.disabled = true;
  try {
    await link.conectar();
    // A ponte nativa (Tauri) sabe o nome Bluetooth real do fone — Web Serial
    // nao. Quando ele vem, o modelo se escolhe sozinho.
    const auto = link.nomeAparelho && disp.porNomeBluetooth(link.nomeAparelho);
    if (auto) {
      estado.modelo = auto;
      localStorage.setItem("modelo", auto.id);
      $("seletor-modelo").value = auto.id;
    }
    estado.conectado = true;
    estado.nome = estado.modelo?.nome || "—";
    render();
    await lerTudo();
  } catch (e) {
    if (e && e.name === "NotFoundError") return;          // usuário fechou o seletor
    console.error(e);
    const msg = String(e?.message || e);
    alert(msg.includes("CANAL_OCUPADO") ? t("aviso.canalOcupado")
                                        : "Falha ao conectar: " + msg);
  } finally {
    btn.disabled = false;
  }
}

/** Uma leitura por vez: o fone responde mal a rajadas. */
async function lerTudo() {
  const passos = [
    [CMD.LER_FIRMWARE,     (p) => { estado.firmware = dec.firmware(p); }],
    [CMD.LER_BATERIA,      (p) => { const b = dec.bateria(p);
                                    estado.bateria = { l: b.l, r: b.r, estojo: b.estojo }; }],
    [CMD.LER_ANC,          (p) => { const a = dec.anc(p);
                                    estado.anc = { modo: a.modo, nivel: a.nivel }; }],
    [CMD.LER_ULTRA_BASS,   (p) => { estado.bass = dec.ultraBass(p); }],
    [CMD.LER_PRESET,       aplicarPreset],
    [CMD.LER_EQ_AVANCADO,  (p) => { estado.eqAvancado = dec.booleano(p); }],
    [CMD.LER_GESTOS,       (p) => { estado.gestos = dec.gestos(p); }],
    [CMD.LER_LATENCIA,     (p) => { estado.latencia = dec.latencia(p); }],
    // Palpite: o app oficial nunca leu este comando na captura, só escreveu o
    // 61533. Se não existir, cai no timeout e vira um aviso no console — o
    // que já é a resposta que a gente quer.
    [CMD.LER_PERFIL,       (p) => { estado.perfil = dec.booleano(p); }],
  ];
  for (const [cmd, aplicar] of passos) {
    try {
      const r = await link.pedir(cmd);
      aplicar(r.payload);
    } catch (e) {
      console.warn(`comando ${cmd} sem resposta:`, e.message);
    }
    render();
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** Envia sem travar a interface; falha vira aviso no console, não exceção solta. */
function enviar(cmd, payload) {
  if (!link.conectada) return;
  link.enviar(cmd, payload).catch((e) => console.warn("envio falhou:", e.message));
}

/* Escreve um ajuste e confere no aparelho o que de fato aconteceu.
 *
 * O fone é a fonte da verdade, não o nosso estado. Depois de mandar, ou
 * lemos o recurso de volta (`reler`) ou aproveitamos o ack quando ele devolve
 * o valor (`peloAck`), e reescrevemos o estado com o que voltou.
 *
 * Isso existe porque três recursos ficaram meses mentindo "ligado" na tela sem
 * nada acontecer no fone. Com a releitura, um comando errado se denuncia
 * sozinho: o botão volta ao lugar em vez de fingir que aplicou. Custa uma ida
 * e volta de ~200 ms por clique, e vale cada um deles. */
async function escrever(cmd, payload, { reler, peloAck, aplicar } = {}) {
  if (!link.conectada) return;
  try {
    if (peloAck) {
      aplicar((await link.pedir(cmd, payload)).payload);
    } else {
      await link.enviar(cmd, payload);
      if (reler === undefined) return;
      await new Promise((r) => setTimeout(r, 180));
      aplicar((await link.pedir(reler)).payload);
    }
  } catch (e) {
    console.warn(`ajuste ${cmd} não confirmado pelo fone:`, e.message);
  }
  render();
}

function demonstracao() {
  Object.assign(estado, {
    conectado: true,
    nome: estado.modelo?.nome || "CMF Buds 2 Plus",
    bateria: { l: 100, r: 100, estojo: null },
    anc: { modo: 1, nivel: 2 },
    bass: { ligado: true, nivel: 4 },
    perfil: true,
    eq: "rock",
    controles: "controles.padrao",
    latencia: false,
    dupla: false,
    firmware: "1.0.1.54",
    codec: "AAC",
  });
  render();
}

// --------------------------------------------------- diagnóstico do ANC
// Abrir com ?diag. Manda cada byte cru e deixa VOCE dizer o que ouviu.
// Foi assim que a tabela de bytes acima foi levantada, em 07/08/2026 — os
// rotulos abaixo sao o resultado daquela sessao. Fica no projeto porque o mesmo
// teste tera de ser refeito em cada modelo novo (Ear, Ear (a), Buds Pro...).
const DIAG_ANC = ["ignorado", "alto", "médio", "baixo",
                  "adaptativo?", "desligado", "ignorado", "transparência"];

function montarDiagnostico() {
  const cx = document.createElement("section");
  cx.className = "cartao";
  cx.style.borderTop = "2px solid #E0353F";
  cx.innerHTML = `
    <h3>Diagnóstico do ANC</h3>
    <p class="sub">Manda o byte cru para o fone. Os rótulos são o que foi medido
       de ouvido no CMF Buds 2 Plus — refaça o teste em outro modelo.</p>
    <div id="diag-botoes" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"></div>
    <p class="sub" id="diag-ultimo" style="margin-top:12px">—</p>`;
  document.querySelector(".tela").appendChild(cx);

  const alvo = cx.querySelector("#diag-botoes");
  for (let b = 0; b <= 7; b++) {
    const bt = document.createElement("button");
    bt.innerHTML = `0x0${b}<br><small style="opacity:.55">${DIAG_ANC[b]}</small>`;
    bt.style.cssText =
      "padding:9px 0;border:none;border-radius:10px;background:#26292C;color:#fff;" +
      "font-family:inherit;font-size:12px;line-height:1.5;cursor:pointer";
    bt.addEventListener("click", () => {
      if (!link.conectada) { alert("Conecte primeiro."); return; }
      enviar(CMD.DEFINIR_ANC, [0x01, b, 0x00]);
      cx.querySelector("#diag-ultimo").textContent =
        `enviado 0x0${b} — esperado: ${DIAG_ANC[b]}`;
      [...alvo.children].forEach((x) => (x.style.background = "#26292C"));
      bt.style.background = "#E0353F";
    });
    alvo.appendChild(bt);
  }
}

// ------------------------------------------------------------- início
montarSeletorModelo();
montarSeletorIdioma();
if (new URLSearchParams(location.search).has("diag")) {
  window.addEventListener("DOMContentLoaded", montarDiagnostico);
  if (document.readyState !== "loading") montarDiagnostico();
}
aplicarTraducoes();
if (new URLSearchParams(location.search).has("demo")) demonstracao();
render();
