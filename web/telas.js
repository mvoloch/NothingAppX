/* NothingAppX — telas de detalhe (equalizador e controles).
 *
 * Ficam separadas de app.js porque sao paineis inteiros, com estado proprio,
 * e nao pedacos da tela principal.
 */

"use strict";

(() => {

const { t } = window.i18n;
const $ = (id) => document.getElementById(id);

// ============================================================ curva do EQ
/* Resposta em frequencia real dos tres filtros do aparelho.
 *
 * As frequencias centrais e os fatores Q sao FATOS lidos da configuracao do app
 * oficial, por modelo (140 Hz / 980 Hz / 6900 Hz nos CMF; a banda alta muda nos
 * Nothing). Antes disso o app desenhava uma forma decorativa que nao
 * correspondia a nada.
 *
 * Biquads do cookbook do Robert Bristow-Johnson, com fs = 48 kHz. Os shelves
 * usam a forma com Q (e nao com S), que e' o que a origem fornece.
 */
const FS = 48000;

function biquad(tipo, f0, Q, ganhoDb) {
  const A = Math.pow(10, ganhoDb / 40);
  const w0 = (2 * Math.PI * f0) / FS;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Q);
  const raizA = Math.sqrt(A), doisRaizAalpha = 2 * raizA * alpha;
  let b0, b1, b2, a0, a1, a2;

  if (tipo === "pico") {
    b0 = 1 + alpha * A;  b1 = -2 * cw;  b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;  a1 = -2 * cw;  a2 = 1 - alpha / A;
  } else if (tipo === "graveShelf") {
    b0 = A * ((A + 1) - (A - 1) * cw + doisRaizAalpha);
    b1 = 2 * A * ((A - 1) - (A + 1) * cw);
    b2 = A * ((A + 1) - (A - 1) * cw - doisRaizAalpha);
    a0 = (A + 1) + (A - 1) * cw + doisRaizAalpha;
    a1 = -2 * ((A - 1) + (A + 1) * cw);
    a2 = (A + 1) + (A - 1) * cw - doisRaizAalpha;
  } else {                                   // agudoShelf
    b0 = A * ((A + 1) + (A - 1) * cw + doisRaizAalpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cw);
    b2 = A * ((A + 1) + (A - 1) * cw - doisRaizAalpha);
    a0 = (A + 1) - (A - 1) * cw + doisRaizAalpha;
    a1 = 2 * ((A - 1) - (A + 1) * cw);
    a2 = (A + 1) - (A - 1) * cw - doisRaizAalpha;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Magnitude em dB de um biquad numa frequencia. */
function magnitudeDb([b0, b1, b2, a1, a2], f) {
  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(w), s1 = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
  const dr = 1 + a1 * c1 + a2 * c2,  di = -(a1 * s1 + a2 * s2);
  const m = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  return 20 * Math.log10(m || 1e-9);
}

/** Curva combinada das tres bandas, em dB, para os pontos de frequencia dados. */
function curvaEQ(filtros, ganhos, freqs) {
  const secoes = [
    biquad("graveShelf", filtros.grave[0], filtros.grave[1], ganhos[0]),
    biquad("pico",       filtros.medio[0], filtros.medio[1], ganhos[1]),
    biquad("agudoShelf", filtros.agudo[0], filtros.agudo[1], ganhos[2]),
  ];
  return freqs.map((f) => secoes.reduce((s, sec) => s + magnitudeDb(sec, f), 0));
}

/* Escala logaritmica de 20 Hz a 20 kHz — a que corresponde a como se ouve. */
const F_MIN = 20, F_MAX = 20000;
const FREQS = Array.from({ length: 160 }, (_, i) =>
  F_MIN * Math.pow(F_MAX / F_MIN, i / 159));

function desenharCurva(cv, filtros, ganhos) {
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const L = cv.clientWidth || 380, A = cv.clientHeight || 170;
  cv.width = L * dpr; cv.height = A * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, L, A);

  const MAX_DB = 9;
  const x = (f) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * L;
  const y = (db) => A / 2 - (db / MAX_DB) * (A / 2 - 10);

  // grade: as tres frequencias dos filtros, que sao o que importa aqui
  ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,.32)";
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const f of [filtros.grave[0], filtros.medio[0], filtros.agudo[0]]) {
    ctx.beginPath(); ctx.moveTo(x(f), 8); ctx.lineTo(x(f), A - 14); ctx.stroke();
    ctx.fillText(f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`, x(f), A - 3);
  }
  ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(L, y(0));
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.stroke();

  const pts = curvaEQ(filtros, ganhos, FREQS).map((db, i) => [x(FREQS[i]), y(db)]);

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
  const areaFundo = ctx.createLinearGradient(0, 0, 0, A);
  areaFundo.addColorStop(0, "rgba(224,53,63,.28)");
  areaFundo.addColorStop(1, "rgba(224,53,63,0)");
  ctx.save();
  ctx.lineTo(L, y(0)); ctx.lineTo(0, y(0)); ctx.closePath();
  ctx.fillStyle = areaFundo; ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
}

// ============================================================== paineis
function abrir(id) { $(id).hidden = false; document.body.style.overflow = "hidden"; }
function fechar(id) { $(id).hidden = true; document.body.style.overflow = ""; }

window.telas = { desenharCurva, curvaEQ, biquad, abrir, fechar, FREQS };

})();
