# NothingAppX

Um app de desktop, aberto, para controlar fones Nothing e CMF — sem depender do
celular.

A Nothing só oferece controle pelo app Android/iOS. Quem trabalha no computador
o dia inteiro fica sem ANC, sem equalizador e sem os gestos, ou tem que pegar o
telefone toda vez. Isso resolve.

Duas formas de usar, mesmo código, nada sobe para lugar nenhum — a conversa é
direta com o fone, por Bluetooth RFCOMM:

**App de desktop (Tauri).** Baixe o instalador da sua plataforma na página de
[releases](../../releases), ou compile você mesmo:

```bash
npm install && npx tauri build
```

No Windows o app fala RFCOMM nativo — sem porta COM virtual, sem navegador.
Para desenvolver: `npx tauri dev`.

**No navegador**, com **Web Serial** (Chrome, Edge ou Opera 117+):

```bash
python servidor.py
```

Depois abra `http://localhost:8790` e clique em Conectar.

A interface vive em [`web/`](web/), o casco nativo em [`src-tauri/`](src-tauri/)
— o Rust só transporta bytes; todo o protocolo mora em
[`web/protocolo.js`](web/protocolo.js), igual nos dois modos.

## Aparelhos

O catálogo em [`web/dispositivos.js`](web/dispositivos.js) cobre 21 modelos das duas
marcas — de Ear (1) a Ear (3a), de CMF Buds a Headphone Pro. Cada um declara os
recursos que tem, e a tela mostra só o que existe naquele fone: um Ear (Stick)
não ganha cartão de ANC, um Buds Pro não ganha Ultra bass.

Um modelo marcado com **✓** foi testado contra hardware real. Os demais aparecem
com um aviso, porque as tabelas de bytes foram assumidas iguais às da família —
é uma aposta razoável, não um fato. Se você tem um desses fones, veja
**Contribuindo** abaixo: dá para confirmar o seu em oito cliques.

| | |
|---|---|
| Testado em hardware | CMF Buds 2 Plus (B184) |
| Assumido pela família | os outros 20 |

## O que funciona

- Bateria de cada fone e do estojo
- Cancelamento de ruído: modos, e os quatro níveis onde o aparelho tem
- Ultra bass: liga/desliga e nível 1–5
- Equalizador: os seis presets
- Teste de audição próprio, com correção pelo equalizador
- Áudio espacial (sem leitura de estado: o fone não responde a uma)
- Modo baixa latência
- Controles: leitura do mapa de gestos
- Versão de firmware
- Português, inglês e espanhol

## O que ainda não

- **Conexão dupla** — existe no protocolo, não implementado
- **Codecs / LDAC** — ver abaixo
- **Editor de gestos** — hoje só lê, não grava
- **EQ personalizado** — o preset existe, o editor de bandas não
- **Perfil sonoro pessoal (Audiodo)** — o interruptor existe, mas a correção
  não roda no fone: ela roda no telefone, sobre o áudio, antes de ser enviado.
  Comprovado por A/B — o mesmo fone, com o perfil ligado, soa cru quando a
  fonte é o PC. Nenhum app de PC replica isso por comando Bluetooth: para ter
  o mesmo efeito é preciso processar o áudio no pipeline do sistema. Em troca há um **teste de
  audição próprio**, que mede seus limiares e corrige pelo equalizador de 3
  bandas — mais modesto, e honesto sobre isso.
- **Atualização de firmware** — fora de escopo, e é onde se transforma um fone
  em peso de papel

### Sobre LDAC

Não dá, e não é falta de vontade. O codec é negociado pela pilha Bluetooth do
sistema operacional, não pelo app — o Windows não tem LDAC, e nenhum programa em
espaço de usuário resolve isso. No Windows os codecs disponíveis são SBC, AAC e
aptX conforme o driver. No Linux, com PipeWire, o LDAC funciona e é configurado
lá, fora daqui.

## Como isso foi descoberto

Interoperabilidade: o objetivo é fazer hardware que você comprou conversar com um
programa livre. Três fontes, em ordem de confiança:

1. **Captura HCI do Bluetooth** entre o app oficial e o aparelho. É a fonte mais
   forte — mostra o que os dois de fato trocam.
2. **Arquivos de configuração** do app oficial (JSON em texto puro): códigos de
   modelo, capacidades por aparelho, frequências dos filtros do equalizador.
3. **[`ferramentas/ler_dex.py`](ferramentas/ler_dex.py)**, que lê tabelas de
   símbolos de `.dex` sem precisar de Java.

O que sai daí é **fato** — um número de comando, um layout de bytes, uma
frequência de corte — e entra reimplementado, do nosso jeito. O que é
**expressão** — código, textos, ícones, fontes, animações — não entra, nem
copiado nem adaptado.

No código, cada afirmação carrega a procedência: `[captura]` para o que foi visto
no ar, `[ear-web]` para o que veio de outro projeto livre, `[palpite]` para o que
ainda não foi confirmado. Se estiver escrito que algo foi medido, foi medido.

E todo ajuste **relê o aparelho depois de escrever**. Se um comando estiver
errado, o botão volta sozinho ao lugar em vez de fingir que funcionou — foi
assim que quatro bugs apareceram.

## Contribuindo

O jeito mais útil de ajudar é **confirmar um modelo**. Abra
`http://localhost:8790/?diag` com o seu fone conectado: o painel manda cada byte
de ANC cru e você diz o que ouviu. Oito cliques, e o seu modelo sai da coluna
"assumido". Foi exatamente assim que a tabela do B184 foi levantada — depois de
duas tentativas erradas por dedução.

Capturas HCI de recursos que ainda não implementamos — conexão dupla,
localizar fone, desligamento automático — também valem muito.

## Créditos

O formato do quadro e vários números de comando vêm do
[ear-web](https://github.com/radiance-project/ear-web), sob GPL-3.0. Este projeto
credita, herda a licença e devolve o que descobriu.

## Licença

GPL-3.0.

Não é um produto da Nothing Technology Limited, nem afiliado a ela. "Nothing" e
"CMF" são marcas dos seus donos.
