/* NothingAppX — internacionalização.
   Adicionar um idioma = acrescentar um bloco em DICIONARIOS. Nada mais.
   Chaves ausentes caem para o inglês, e depois para a própria chave. */

"use strict";

// Módulo isolado: nada aqui vaza para o escopo global além de window.i18n.
(() => {

const DICIONARIOS = {
  "pt-BR": {
    "app.titulo": "Meus dispositivos",
    "app.conta": "Conta",
    "app.adicionar": "Adicionar dispositivo",
    "app.conectar": "Conectar",
    "app.semDispositivo": "Nenhum fone conectado",
    "bat.esquerdo": "E", "bat.direito": "D", "bat.estojo": "Estojo",

    "anc.titulo": "Cancelamento de ruído",
    "anc.modo.1": "Cancelamento", "anc.modo.2": "Transparência", "anc.modo.0": "Desligado",
    "anc.nivel.0": "Baixo", "anc.nivel.1": "Médio", "anc.nivel.2": "Alto", "anc.nivel.3": "Adaptativo",

    "espacial.titulo": "Áudio espacial",
    "espacial.fixo": "Fixo", "espacial.off": "Desligado",

    "bass.titulo": "Ultra bass", "bass.nivel": "Nível {n}",
    "bass.escolherNivel": "Escolher o nível",
    "perfil.titulo": "Perfil sonoro pessoal",
    "eq.titulo": "Equalizador",
    "eq.equilibrado": "Equilibrado",
    "eq.pop": "Pop", "eq.rock": "Rock", "eq.eletronica": "Eletrônica",
    "eq.vocais": "Realçar vozes", "eq.classica": "Clássica", "eq.custom": "Personalizado",
    "eq.graves": "Graves", "eq.medios": "Médios", "eq.agudos": "Agudos",
    "controles.titulo": "Controles", "controles.padrao": "Padrão",
    "app.modelo": "Modelo do fone",
    "perfil.testar": "Fazer o teste de audição",
    "sis.titulo": "Correção pelo sistema (mais completa)",
    "sis.explica": "O equalizador do fone tem 3 bandas e é igual nos dois ouvidos. Aqui sai uma banda por frequência medida, com esquerdo e direito independentes — mais perto do que o app do telefone faz. Um equalizador de sistema aplica; nós só geramos o arquivo.",
    "sis.baixarApo": "Baixar para Equalizer APO (Windows)",
    "sis.baixarCsv": "Baixar tabela de filtros (qualquer ferramenta)",
    "sis.passos": "Instale o Equalizer APO, marque o dispositivo do seu fone durante a instalação e reinicie. Depois coloque o arquivo na pasta config dele e aponte o config.txt para ele. Se algo recusar o arquivo, me avise: a sintaxe não foi testada aqui.",
    "espacial.aviso": "O comando foi identificado em duas capturas, mas o fone não responde a uma leitura — o app não sabe o estado atual até você escolher.",
    "audio.camada": "Atenção: nossa correção entra COMO preset Personalizado, substituindo o preset que estiver ativo. O Perfil sonoro do app oficial é diferente: ele age numa camada própria, por cima da equalização escolhida, e nós ainda não alcançamos essa camada.",
    "audio.titulo": "Teste de audição",
    "audio.intro": "Vamos tocar tons puros, um ouvido de cada vez, subindo de volume devagar. Toque em «Ouvi» assim que perceber o som — mesmo bem fraquinho. São 12 etapas, uns 3 minutos.",
    "audio.aviso": "Isto não é exame médico e não gera audiograma. Mede a diferença entre as frequências no seu ouvido, com o seu fone — que é o que o equalizador precisa saber. Se suspeitar de perda auditiva, procure um fonoaudiólogo.",
    "audio.comecar": "Começar",
    "audio.ouvi": "Ouvi",
    "audio.dica": "Ambiente silencioso, fone bem encaixado, e escolha o fone como saída de áudio do Windows.",
    "audio.passo": "Ouvido {orelha} · {hz} Hz",
    "audio.contador": "etapa {i} de {n}",
    "audio.orelha.esquerda": "esquerdo", "audio.orelha.direita": "direito",
    "audio.aplicar": "Aplicar no equalizador",
    "audio.refazer": "Refazer o teste",
    "audio.resultado": "Sugestão: graves {g} dB, médios {m} dB, agudos {a} dB.",
    "audio.assimetria": "Seu ouvido {lado} precisou de {db} dB a mais. O equalizador do fone não separa os lados, então aplicamos a média.",
    "audio.simetrico": "Os dois ouvidos ficaram parecidos.",
    "eq.editar": "Ajuste as três bandas. Vai para o fone a cada mudança.",
    "controles.ajuda": "Escolha o que cada gesto faz em cada fone. A mudança vai para o aparelho na hora.",
    "eq.nota": "Curva real dos três filtros do {m}: {g} Hz, {m2} Hz e {a} Hz.",
    "eq.notaEstimada": "Os ganhos de cada preset ainda são estimativa — as frequências não.",
    "aviso.naoConfirmado": "Modelo ainda não testado — ajude a confirmar",
    "gesto.toqueDuplo": "Toque duplo", "gesto.toqueTriplo": "Toque triplo",
    "gesto.segurar": "Tocar e segurar", "gesto.duploSegurar": "Toque duplo e segurar",
    "lado.esquerdo": "Esquerdo", "lado.direito": "Direito",
    "acao.nenhuma": "Nenhuma ação", "acao.playPause": "Tocar / pausar",
    "acao.atender": "Atender", "acao.recusar": "Recusar chamada",
    "acao.anterior": "Faixa anterior", "acao.proxima": "Próxima faixa",
    "acao.ruido": "Controle de ruído", "acao.assistente": "Assistente de voz",
    "acao.volumeMais": "Aumentar volume", "acao.volumeMenos": "Diminuir volume",
    "acao.noticias": "Notícias",
    "controles.gestos": "{n} gestos configurados",
    "latencia.titulo": "Modo baixa latência",
    "dupla.titulo": "Conexão dupla",
    "config.titulo": "Configurações do dispositivo",
    "sobre.titulo": "Sobre",

    "estado.ligado": "Ligado", "estado.desligado": "Desligado",
    "aviso.indisponivel": "Ainda não disponível neste app",
    "aviso.semSerial": "Este navegador não expõe a Web Serial API.\nUse Chrome, Edge ou Opera 117+.",
    "rodape.codec": "codec: {c}", "rodape.firmware": "firmware {v}",
    "idioma": "Idioma",
  },

  "en": {
    "app.titulo": "My devices",
    "app.conta": "Account",
    "app.adicionar": "Add device",
    "app.conectar": "Connect",
    "app.semDispositivo": "No earbuds connected",
    "bat.esquerdo": "L", "bat.direito": "R", "bat.estojo": "Case",

    "anc.titulo": "Noise cancellation",
    "anc.modo.1": "Noise cancellation", "anc.modo.2": "Transparency", "anc.modo.0": "Off",
    "anc.nivel.0": "Low", "anc.nivel.1": "Mid", "anc.nivel.2": "High", "anc.nivel.3": "Adaptive",

    "espacial.titulo": "Spatial audio",
    "espacial.fixo": "Fixed", "espacial.off": "Off",

    "bass.titulo": "Ultra bass", "bass.nivel": "Level {n}",
    "bass.escolherNivel": "Choose the level",
    "perfil.titulo": "Personal Sound Profile",
    "eq.titulo": "Equalizer",
    "eq.equilibrado": "Balanced",
    "eq.pop": "Pop", "eq.rock": "Rock", "eq.eletronica": "Electronic",
    "eq.vocais": "Enhance vocals", "eq.classica": "Classical", "eq.custom": "Custom",
    "eq.graves": "Bass", "eq.medios": "Mid", "eq.agudos": "Treble",
    "controles.titulo": "Controls", "controles.padrao": "Default",
    "app.modelo": "Earbud model",
    "perfil.testar": "Take the hearing test",
    "sis.titulo": "System-wide correction (more complete)",
    "sis.explica": "The earbud equalizer has 3 bands and is identical in both ears. This gives one band per measured frequency, with left and right independent — closer to what the phone app does. A system equalizer applies it; we only generate the file.",
    "sis.baixarApo": "Download for Equalizer APO (Windows)",
    "sis.baixarCsv": "Download filter table (any tool)",
    "sis.passos": "Install Equalizer APO, tick your earbud device during setup and reboot. Then drop the file in its config folder and point config.txt at it. If anything rejects the file, tell us: the syntax was not tested here.",
    "espacial.aviso": "The command was seen in two captures, but the earbuds answer no read for it — the app cannot know the current state until you pick one.",
    "audio.camada": "Note: our correction is applied AS the Custom preset, replacing whichever preset is active. The official Personal Sound Profile is different — it works as its own layer on top of the chosen equalizer, and we have not reached that layer yet.",
    "audio.titulo": "Hearing test",
    "audio.intro": "We play pure tones, one ear at a time, slowly getting louder. Tap «I heard it» as soon as you notice the sound — even very faint. 12 steps, about 3 minutes.",
    "audio.aviso": "This is not a medical exam and does not produce an audiogram. It measures the difference between frequencies in your ear, with your earbuds — which is what an equalizer needs. If you suspect hearing loss, see an audiologist.",
    "audio.comecar": "Start",
    "audio.ouvi": "I heard it",
    "audio.dica": "Quiet room, earbuds seated well, and select them as the system audio output.",
    "audio.passo": "{orelha} ear · {hz} Hz",
    "audio.contador": "step {i} of {n}",
    "audio.orelha.esquerda": "Left", "audio.orelha.direita": "Right",
    "audio.aplicar": "Apply to the equalizer",
    "audio.refazer": "Redo the test",
    "audio.resultado": "Suggested: bass {g} dB, mid {m} dB, treble {a} dB.",
    "audio.assimetria": "Your {lado} ear needed {db} dB more. The earbud equalizer has no left/right split, so we apply the average.",
    "audio.simetrico": "Both ears came out similar.",
    "eq.editar": "Adjust the three bands. Sent to the earbuds on every change.",
    "controles.ajuda": "Choose what each gesture does on each earbud. Changes go to the device right away.",
    "eq.nota": "Real response of the three filters on the {m}: {g} Hz, {m2} Hz and {a} Hz.",
    "eq.notaEstimada": "Preset gains are still estimates — the frequencies are not.",
    "aviso.naoConfirmado": "Model not tested yet — help confirm it",
    "gesto.toqueDuplo": "Double tap", "gesto.toqueTriplo": "Triple tap",
    "gesto.segurar": "Tap and hold", "gesto.duploSegurar": "Double tap and hold",
    "lado.esquerdo": "Left", "lado.direito": "Right",
    "acao.nenhuma": "No action", "acao.playPause": "Play / pause",
    "acao.atender": "Answer call", "acao.recusar": "Decline call",
    "acao.anterior": "Previous track", "acao.proxima": "Next track",
    "acao.ruido": "Noise control", "acao.assistente": "Voice assistant",
    "acao.volumeMais": "Volume up", "acao.volumeMenos": "Volume down",
    "acao.noticias": "News",
    "controles.gestos": "{n} gestures mapped",
    "latencia.titulo": "Low lag mode",
    "dupla.titulo": "Dual connection",
    "config.titulo": "Device settings",
    "sobre.titulo": "About",

    "estado.ligado": "On", "estado.desligado": "Off",
    "aviso.indisponivel": "Not available in this app yet",
    "aviso.semSerial": "This browser does not expose the Web Serial API.\nUse Chrome, Edge or Opera 117+.",
    "rodape.codec": "codec: {c}", "rodape.firmware": "firmware {v}",
    "idioma": "Language",
  },

  "es": {
    "app.titulo": "Mis dispositivos",
    "app.conta": "Cuenta",
    "app.adicionar": "Añadir dispositivo",
    "app.conectar": "Conectar",
    "app.semDispositivo": "Ningún auricular conectado",
    "bat.esquerdo": "I", "bat.direito": "D", "bat.estojo": "Estuche",

    "anc.titulo": "Cancelación de ruido",
    "anc.modo.1": "Cancelación", "anc.modo.2": "Transparencia", "anc.modo.0": "Apagado",
    "anc.nivel.0": "Bajo", "anc.nivel.1": "Medio", "anc.nivel.2": "Alto", "anc.nivel.3": "Adaptativo",

    "espacial.titulo": "Audio espacial",
    "espacial.fixo": "Fijo", "espacial.off": "Apagado",

    "bass.titulo": "Ultra bass", "bass.nivel": "Nivel {n}",
    "bass.escolherNivel": "Elegir el nivel",
    "perfil.titulo": "Perfil de sonido personal",
    "eq.titulo": "Ecualizador",
    "eq.equilibrado": "Equilibrado",
    "eq.pop": "Pop", "eq.rock": "Rock", "eq.eletronica": "Electrónica",
    "eq.vocais": "Realzar voces", "eq.classica": "Clásica", "eq.custom": "Personalizado",
    "eq.graves": "Graves", "eq.medios": "Medios", "eq.agudos": "Agudos",
    "controles.titulo": "Controles", "controles.padrao": "Predeterminado",
    "app.modelo": "Modelo de auricular",
    "perfil.testar": "Hacer la prueba de audición",
    "sis.titulo": "Corrección por el sistema (más completa)",
    "sis.explica": "El ecualizador del auricular tiene 3 bandas e igual en ambos oídos. Aquí sale una banda por frecuencia medida, con izquierdo y derecho independientes — más cerca de lo que hace la app del teléfono. Un ecualizador de sistema lo aplica; nosotros solo generamos el archivo.",
    "sis.baixarApo": "Descargar para Equalizer APO (Windows)",
    "sis.baixarCsv": "Descargar tabla de filtros (cualquier herramienta)",
    "sis.passos": "Instala Equalizer APO, marca tu auricular durante la instalación y reinicia. Luego pon el archivo en su carpeta config y apunta config.txt a él. Si algo rechaza el archivo, avísanos: la sintaxis no se probó aquí.",
    "espacial.aviso": "El comando se vio en dos capturas, pero el auricular no responde a una lectura — la app no sabe el estado actual hasta que elijas.",
    "audio.camada": "Atención: nuestra corrección se aplica COMO preset Personalizado, sustituyendo el preset activo. El Perfil de sonido oficial es distinto: actúa en su propia capa sobre el ecualizador elegido, y aún no alcanzamos esa capa.",
    "audio.titulo": "Prueba de audición",
    "audio.intro": "Reproducimos tonos puros, un oído a la vez, subiendo de volumen despacio. Toca «Lo oí» en cuanto percibas el sonido — aunque sea muy débil. Son 12 etapas, unos 3 minutos.",
    "audio.aviso": "Esto no es un examen médico ni genera un audiograma. Mide la diferencia entre frecuencias en tu oído, con tus auriculares — que es lo que necesita un ecualizador. Si sospechas pérdida auditiva, consulta a un audiólogo.",
    "audio.comecar": "Empezar",
    "audio.ouvi": "Lo oí",
    "audio.dica": "Ambiente silencioso, auriculares bien colocados, y selecciónalos como salida de audio del sistema.",
    "audio.passo": "Oído {orelha} · {hz} Hz",
    "audio.contador": "etapa {i} de {n}",
    "audio.orelha.esquerda": "izquierdo", "audio.orelha.direita": "derecho",
    "audio.aplicar": "Aplicar al ecualizador",
    "audio.refazer": "Repetir la prueba",
    "audio.resultado": "Sugerencia: graves {g} dB, medios {m} dB, agudos {a} dB.",
    "audio.assimetria": "Tu oído {lado} necesitó {db} dB más. El ecualizador del auricular no separa lados, así que aplicamos el promedio.",
    "audio.simetrico": "Ambos oídos resultaron similares.",
    "eq.editar": "Ajusta las tres bandas. Se envía al auricular en cada cambio.",
    "controles.ajuda": "Elige qué hace cada gesto en cada auricular. El cambio va al dispositivo al instante.",
    "eq.nota": "Respuesta real de los tres filtros del {m}: {g} Hz, {m2} Hz y {a} Hz.",
    "eq.notaEstimada": "Las ganancias de cada preset son estimaciones — las frecuencias no.",
    "aviso.naoConfirmado": "Modelo aún sin probar — ayuda a confirmarlo",
    "gesto.toqueDuplo": "Toque doble", "gesto.toqueTriplo": "Toque triple",
    "gesto.segurar": "Mantener pulsado", "gesto.duploSegurar": "Doble toque y mantener",
    "lado.esquerdo": "Izquierdo", "lado.direito": "Derecho",
    "acao.nenhuma": "Ninguna acción", "acao.playPause": "Reproducir / pausar",
    "acao.atender": "Responder", "acao.recusar": "Rechazar llamada",
    "acao.anterior": "Pista anterior", "acao.proxima": "Pista siguiente",
    "acao.ruido": "Control de ruido", "acao.assistente": "Asistente de voz",
    "acao.volumeMais": "Subir volumen", "acao.volumeMenos": "Bajar volumen",
    "acao.noticias": "Noticias",
    "controles.gestos": "{n} gestos configurados",
    "latencia.titulo": "Modo baja latencia",
    "dupla.titulo": "Conexión dual",
    "config.titulo": "Ajustes del dispositivo",
    "sobre.titulo": "Acerca de",

    "estado.ligado": "Activado", "estado.desligado": "Apagado",
    "aviso.indisponivel": "Aún no disponible en esta app",
    "aviso.semSerial": "Este navegador no expone la Web Serial API.\nUsa Chrome, Edge u Opera 117+.",
    "rodape.codec": "códec: {c}", "rodape.firmware": "firmware {v}",
    "idioma": "Idioma",
  },
};

const IDIOMAS = [
  { cod: "pt-BR", nome: "Português" },
  { cod: "en",    nome: "English" },
  { cod: "es",    nome: "Español" },
];

const PADRAO = "en";

function detectar() {
  const salvo = localStorage.getItem("idioma");
  if (salvo && DICIONARIOS[salvo]) return salvo;
  for (const pref of navigator.languages || [navigator.language]) {
    if (DICIONARIOS[pref]) return pref;                       // pt-BR
    const base = String(pref).split("-")[0];
    const achado = Object.keys(DICIONARIOS).find((k) => k.split("-")[0] === base);
    if (achado) return achado;                                // pt -> pt-BR
  }
  return PADRAO;
}

let idiomaAtual = detectar();

/** Traduz uma chave. `vars` substitui {marcadores}. */
function t(chave, vars) {
  const dic = DICIONARIOS[idiomaAtual] || {};
  let s = dic[chave] ?? DICIONARIOS[PADRAO][chave] ?? chave;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Aplica em todo elemento com data-i18n (texto) e data-i18n-attr (atributos). */
function aplicarTraducoes(raiz = document) {
  raiz.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  raiz.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const v = t(el.dataset.i18nTitle);
    el.setAttribute("title", v);
    el.setAttribute("aria-label", v);
  });
  document.documentElement.lang = idiomaAtual;
}

function definirIdioma(cod) {
  if (!DICIONARIOS[cod]) return false;
  idiomaAtual = cod;
  localStorage.setItem("idioma", cod);
  aplicarTraducoes();
  document.dispatchEvent(new CustomEvent("idioma:mudou", { detail: cod }));
  return true;
}

const obterIdioma = () => idiomaAtual;

window.i18n = { t, aplicarTraducoes, definirIdioma, obterIdioma, IDIOMAS };

})();
