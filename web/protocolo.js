/* NothingAppX — transporte e protocolo Nothing/CMF.
 *
 * Baseado no formato de quadro documentado no projeto ear-web (GPL-3.0),
 * que este projeto credita e cuja licenca herda. Os decodificadores e o
 * enquadramento com buffer sao implementacao propria.
 *
 * Quadro:
 *   [0]=0x55 [1]=0x60 [2]=0x01 [3:5]=comando uint16 LE
 *   [5]=tamanho do payload [6]=0x00 [7]=id da operacao
 *   [8:8+n]=payload  [-2:]=CRC-16/MODBUS LE
 *
 * Resposta = pedido com o bit 15 zerado (0xC007 -> 0x4007, 0xF00F -> 0x700F).
 * Descoberto na captura HCI de 07/08/2026.
 */

"use strict";

(() => {

const SPP_UUID = "aeac4a03-dff5-498f-843a-34487cf133eb";
const MAGIC = [0x55, 0x60, 0x01];

/* Em que casco estamos.
 *
 * `window.__TAURI__` existe nos tres sistemas, mas os comandos nativos variam
 * por SO — usar so ele como teste fazia o app do Linux tentar `bt_conectar` e
 * oferecer a instalacao do Equalizer APO quando ainda nao existiam la'.
 * `PONTE.capaz` = a ponte completa (fone + correcao de sistema) existe neste
 * SO: hoje Windows (WinRT + EqAPO) e Linux (BlueZ + PipeWire); mac ainda nao.
 * `PONTE.pronta` resolve com a resposta do backend; ate' la' `capaz` e' false,
 * que e' o lado seguro (esconde o que talvez nao exista). */
const PONTE = { capaz: false, so: null };
PONTE.pronta = (async () => {
  const core = window.__TAURI__?.core;
  if (!core) return false;
  PONTE.so = await core.invoke("plataforma").catch(() => null);
  PONTE.capaz = PONTE.so === "windows" || PONTE.so === "linux";
  return PONTE.capaz;
})();
window.PONTE = PONTE;

/* Tabela de comandos.
 *
 * Cada linha esta marcada com a sua procedencia. Isso importa: a primeira
 * versao deste arquivo misturou comandos de familias diferentes e tres
 * recursos ficaram mudos ou destrutivos por causa disso.
 *
 *   [captura]  visto no ar entre o app oficial e ESTE aparelho (07/08/2026)
 *   [ear-web]  lido no codigo do ear-web; formato confiavel, uso a confirmar
 *   [palpite]  ainda nao confirmado de nenhuma das duas formas
 *
 * Armadilha ja paga: 0xF04F NAO e o liga/desliga do Ultra bass — e o
 * "EQ avancado". O Ultra bass inteiro (liga/desliga + nivel) cabe em 0xF051.
 */
const CMD = {
  LER_BATERIA:         49159,  // 0xC007  [captura]
  LER_ANC:             49182,  DEFINIR_ANC:          61455,  // 0xC01E/0xF00F [captura]
  LER_FIRMWARE:        49218,  // 0xC042  [captura]

  // Ultra bass: um unico comando carrega ligado + nivel, nos DOIS sentidos.
  // Leitura 0xC04E devolve [ligado, nivel*2]; escrita 0xF051 recebe o mesmo.
  // Niveis 1..5 viajam como 2,4,6,8,10.                    [captura + ear-web]
  LER_ULTRA_BASS:      49230,  DEFINIR_ULTRA_BASS:   61521,

  // Preset do equalizador. Este aparelho usa o par "listening mode"
  // (0xC050 / 0xF01D), nao o par 0xC01F/0xF010 dos modelos antigos: a captura
  // mostra o app oficial lendo 0xC050 e nunca 0xC01F.   [captura / ear-web]
  LER_PRESET:          49232,  DEFINIR_PRESET:       61469,
  LER_EQ_CUSTOM:       49220,  DEFINIR_EQ_CUSTOM:    61505,  // [ear-web]
  LER_EQ_AVANCADO:     49231,  DEFINIR_EQ_AVANCADO:  61519,  // [captura/ear-web]

  // Baixa latencia: 1 = ligado, 2 = desligado. Nao e 0/1.          [ear-web]
  LER_LATENCIA:        49217,  DEFINIR_LATENCIA:     61504,

  LER_GESTOS:          49176,  DEFINIR_GESTOS:       61443,  // [captura/ear-web]
  LER_IN_EAR:          49166,  DEFINIR_IN_EAR:       61444,  // [ear-web]
  LOCALIZAR:           61442,  // [ear-web]

  // Perfil sonoro pessoal: payload de 1 byte so, sem o 0x00 de enchimento
  // que os outros usam. O fone devolve o mesmo byte como ack.       [captura]
  DEFINIR_PERFIL:      61533,  LER_PERFIL:           49245,  // leitura e [palpite]

  // Audio espacial. Duas capturas independentes agora mostram o mesmo padrao
  // (00 depois 01) no momento em que o usuario mexeu nesse controle.  [captura]
  DEFINIR_ESPACIAL:    61522,

  // Conexao dupla: 0xF01A liga/desliga (payload de 1 byte). A lista de
  // aparelhos pareados sai do 0xC028, pedida por indice (00, 01, 02...).
  // ATENCAO: a resposta traz os NOMES dos aparelhos em texto puro. Nunca
  // registre em log nem publique uma captura sem limpar isso.        [captura]
  DEFINIR_DUPLA:       61466,  LER_PAREADOS:         49192,
};

/* Equalizador personalizado — layout confirmado byte a byte na captura de
 * 07/08/2026, com o usuario arrastando as tres bandas.
 *
 *   [0]      quantidade de bandas (3)
 *   [1..4]   float32 LE: ganho total = -max(0, ganhos)
 *   [5..17]  banda: [id, ganho f32, frequencia f32, Q f32]
 *   [18..30] idem
 *   [31..43] idem
 *   [44..52] nove bytes zerados
 *
 * As frequencias e os Q viajam DENTRO do payload, entao sao estes os valores
 * que moldam o som — e nao os do catalogo de capacidades do app oficial, que
 * para este aparelho diz 6900 Hz / Q 0.7 e nao bate com o que ele manda no ar.
 * Onde as duas fontes discordam, vale o que passou pelo Bluetooth.
 */
const EQ_SECOES = [
  { id: 0x01, freq: 980,  q: 0.66, banda: 1 },   // medios
  { id: 0x02, freq: 3500, q: 1.00, banda: 2 },   // agudos
  { id: 0x00, freq: 140,  q: 0.80, banda: 0 },   // graves
];

/** `bandas` = [graves, medios, agudos] em dB, faixa util de -6 a +6. */
function montarEqCustom(bandas) {
  const buf = new Uint8Array(53);
  const dv = new DataView(buf.buffer);
  buf[0] = EQ_SECOES.length;
  // O piso em zero importa: com todas as bandas negativas o app oficial manda
  // -0.0, com o bit de sinal ligado. Confere em 11 de 11 quadros da captura.
  dv.setFloat32(1, -Math.max(0, ...bandas), true);
  let o = 5;
  for (const s of EQ_SECOES) {
    buf[o] = s.id;
    dv.setFloat32(o + 1, bandas[s.banda], true);
    dv.setFloat32(o + 5, s.freq, true);
    dv.setFloat32(o + 9, s.q, true);
    o += 13;
  }
  return buf;                       // os ultimos 9 bytes ficam zerados
}

/** Le o payload do EQ personalizado de volta para [graves, medios, agudos]. */
function lerEqCustom(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const fora = [0, 0, 0];
  let o = 5;
  for (const s of EQ_SECOES) { fora[s.banda] = dv.getFloat32(o + 1, true); o += 13; }
  return fora;
}

const resposta = (cmd) => cmd & 0x7fff;

function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc & 0xffff;
}

function montarQuadro(cmd, payload = [], opId = 1) {
  const cab = [...MAGIC, cmd & 0xff, (cmd >> 8) & 0xff, payload.length, 0x00, opId & 0xff];
  const corpo = Uint8Array.from([...cab, ...payload]);
  const c = crc16(corpo);
  return Uint8Array.from([...corpo, c & 0xff, (c >> 8) & 0xff]);
}

/** Extrai quadros completos e validados de um buffer, devolvendo o resto. */
function extrairQuadros(buf) {
  const quadros = [];
  let i = 0;
  while (i + 10 <= buf.length) {
    if (!(buf[i] === 0x55 && buf[i + 1] === 0x60 && buf[i + 2] === 0x01)) { i++; continue; }
    const n = buf[i + 5];
    const fim = i + 8 + n + 2;
    if (fim > buf.length) break;                     // quadro ainda incompleto
    const q = buf.subarray(i, fim);
    const esperado = q[fim - i - 2] | (q[fim - i - 1] << 8);
    if (crc16(q.subarray(0, q.length - 2)) !== esperado) { i++; continue; }
    quadros.push({
      cmd: q[3] | (q[4] << 8),
      op: q[7],
      payload: q.subarray(8, 8 + n),
    });
    i = fim;
  }
  return { quadros, resto: buf.subarray(i) };
}

// ------------------------------------------------------------ decodificadores
const dec = {
  bateria(p) {
    const mapa = { 0x02: "l", 0x03: "r", 0x04: "estojo" };
    const out = { l: null, r: null, estojo: null, carregando: {} };
    const n = p[0];
    for (let i = 0; i < n; i++) {
      const chave = mapa[p[1 + i * 2]];
      if (!chave) continue;
      const bruto = p[2 + i * 2];
      out[chave] = bruto & 0x7f;
      out.carregando[chave] = (bruto & 0x80) === 0x80;
    }
    return out;
  },
  /* ANC. Tabela byte -> significado MEDIDA no CMF Buds 2 Plus (07/08/2026),
   * enviando cada valor de 0x00 a 0x07 pelo painel ?diag e julgando de ouvido:
   *   0x01 Alto   0x02 Medio   0x03 Baixo   0x04 Adaptativo
   *   0x05 Desligado          0x07 Transparencia
   *   0x00 e 0x06 sao ignorados pelo aparelho.
   * Nao use a tabela do ear-web aqui: ela e do Nothing Ear (1) e a ordem e outra.
   * Devolve {modo, nivel} no vocabulario da nossa interface:
   *   modo 0 = desligado, 1 = cancelamento, 2 = transparencia
   *   nivel 0 = baixo, 1 = medio, 2 = alto, 3 = adaptativo
   */
  anc(p) {
    const b = p[1];
    const niveis = { 0x03: 0, 0x02: 1, 0x01: 2, 0x04: 3 };
    if (b === 0x05) return { modo: 0, nivel: null, bruto: [...p] };
    if (b === 0x07) return { modo: 2, nivel: null, bruto: [...p] };
    const n = niveis[b];
    return { modo: n === undefined ? null : 1, nivel: n ?? null, bruto: [...p] };
  },
  firmware(p) { return new TextDecoder().decode(p); },

  /* Baixa latencia: 1 = ligado, 2 = desligado. O aparelho respondeu 0x02 na
   * captura, com o modo desligado na tela — por isso "!== 1" seria igual a
   * "=== 2" aqui, mas escrevo o positivo para nao herdar 0x00 como "ligado". */
  latencia(p) { return p[0] === 1; },

  /* Ultra bass. Um so payload descreve o recurso inteiro: [ligado, nivel*2].
   * Os niveis 1..5 viajam dobrados (2,4,6,8,10) — a captura mostrou o app
   * oficial varrendo exatamente esses cinco valores.
   * O /2 e obrigatorio: sem ele o valor lido realimenta a escrita e o nivel
   * dobra a cada volta (8 -> 16 -> 32 ...), que foi o bug relatado. */
  ultraBass(p) {
    const bruto = p[1] ?? 0;
    return { ligado: p[0] === 1, nivel: Math.min(5, Math.max(0, Math.round(bruto / 2))) };
  },

  /** Preset do equalizador: um byte so. Ver PRESETS em app.js. */
  preset(p) { return p[0]; },

  /** Booleano simples de 1 byte (perfil pessoal, EQ avancado). */
  booleano(p) { return p[0] === 1; },
  gestos(p) {
    const n = p[0], lista = [];
    for (let i = 0; i < n; i++) {
      lista.push({ fone: p[1 + i * 4], comum: p[2 + i * 4], tipo: p[3 + i * 4], acao: p[4 + i * 4] });
    }
    return lista;
  },
};

// ------------------------------------------------------------------- conexao
/* Dois transportes, um protocolo. No app empacotado (Tauri) os bytes passam
 * pela ponte nativa (RFCOMM direto, sem porta COM virtual); no navegador,
 * pelo Web Serial. Tudo acima do byte cru — framing, CRC, comandos — e' o
 * mesmo codigo nos dois casos. */
class Conexao extends EventTarget {
  constructor() {
    super();
    this.porta = null;
    this.escritor = null;
    this.nativo = false;           // ponte Tauri ativa?
    this.nomeAparelho = null;
    this._soltarEventos = null;
    this.opId = 0;
    this.buffer = new Uint8Array(0);
    this.aguardando = new Map();   // cmdResposta -> resolve
  }

  get conectada() { return this.porta !== null || this.nativo; }

  async conectar(porta = null) {
    await PONTE.pronta;
    if (PONTE.capaz) return this._conectarNativo();
    if (!("serial" in navigator)) throw new Error("SEM_WEB_SERIAL");
    this.porta = porta || await navigator.serial.requestPort({
      allowedBluetoothServiceClassIds: [SPP_UUID],
      filters: [{ bluetoothServiceClassId: SPP_UUID }],
    });
    await this.porta.open({ baudRate: 9600 });
    this.escritor = this.porta.writable.getWriter();
    this._lerSempre();
    this.dispatchEvent(new Event("conectado"));
  }

  async _conectarNativo() {
    const { core, event } = window.__TAURI__;
    const soltar = [
      await event.listen("bt-dados", (ev) => this._receber(Uint8Array.from(ev.payload))),
      await event.listen("bt-caiu", () => this.desconectar()),
    ];
    this._soltarEventos = () => soltar.forEach((f) => f());
    try {
      this.nomeAparelho = await core.invoke("bt_conectar");
    } catch (e) {
      this._soltarEventos(); this._soltarEventos = null;
      throw new Error(typeof e === "string" ? e : "FALHA_CONEXAO");
    }
    this.nativo = true;
    this.dispatchEvent(new Event("conectado"));
  }

  async desconectar() {
    if (!this.conectada) return;
    if (this.nativo) {
      this.nativo = false;
      this._soltarEventos?.(); this._soltarEventos = null;
      try { await window.__TAURI__.core.invoke("bt_desconectar"); } catch {}
    }
    try { this.escritor?.releaseLock(); await this.porta?.close(); } catch {}
    this.porta = null; this.escritor = null;
    this.dispatchEvent(new Event("desconectado"));
  }

  /** Junta bytes crus ao buffer e despacha os quadros completos. */
  _receber(bytes) {
    const junto = new Uint8Array(this.buffer.length + bytes.length);
    junto.set(this.buffer); junto.set(bytes, this.buffer.length);
    const { quadros, resto } = extrairQuadros(junto);
    this.buffer = resto;
    for (const q of quadros) {
      const p = this.aguardando.get(q.cmd);
      if (p) { this.aguardando.delete(q.cmd); p(q); }
      this.dispatchEvent(new CustomEvent("quadro", { detail: q }));
    }
  }

  async _lerSempre() {
    const leitor = this.porta.readable.getReader();
    try {
      while (true) {
        const { value, done } = await leitor.read();
        if (done) break;
        if (value) this._receber(value);
      }
    } catch (e) {
      this.dispatchEvent(new CustomEvent("erro", { detail: e }));
    } finally {
      leitor.releaseLock();
      this.desconectar();
    }
  }

  async enviar(cmd, payload = []) {
    if (!this.conectada) throw new Error("SEM_CONEXAO");
    this.opId = (this.opId + 1) & 0xff;
    const quadro = montarQuadro(cmd, payload, this.opId);
    if (this.nativo) {
      await window.__TAURI__.core.invoke("bt_enviar", { dados: Array.from(quadro) });
    } else {
      await this.escritor.write(quadro);
    }
  }

  /** Envia e espera a resposta correspondente (bit 15 zerado). */
  async pedir(cmd, payload = [], msTimeout = 2500) {
    const alvo = resposta(cmd);
    const espera = new Promise((res, rej) => {
      this.aguardando.set(alvo, res);
      setTimeout(() => {
        if (this.aguardando.has(alvo)) { this.aguardando.delete(alvo); rej(new Error("TIMEOUT")); }
      }, msTimeout);
    });
    await this.enviar(cmd, payload);
    return espera;
  }
}

window.protocolo = { Conexao, CMD, dec, crc16, montarQuadro, extrairQuadros, resposta,
                     montarEqCustom, lerEqCustom, EQ_SECOES, SPP_UUID };

})();
