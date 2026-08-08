/* NothingAppX DSP — spike da fase 2b.
 *
 * Pergunta binaria: o Equalizer APO carrega um VST2 nosso, escrito em Rust,
 * dentro do pipeline de audio do Windows?
 *
 * Prova: este plugin corta 12 dB de tudo. Se o volume despencar quando a
 * linha `VSTPlugin:` entrar na config, a cadeia esta' provada — e o proximo
 * passo e' portar para ca' o compressor calibrado do web/motor_audio.js
 * (limiar -30 dBFS, razao derivada do ganho, metade da perda em repouso).
 */

#[macro_use]
extern crate vst;

use vst::prelude::*;

const GANHO: f32 = 0.25; // -12 dB: inaudivel nao e'; perigoso tambem nao

struct ProvaNothingAppX;

impl Default for ProvaNothingAppX {
    fn default() -> Self { ProvaNothingAppX }
}

impl Plugin for ProvaNothingAppX {
    fn new(_host: HostCallback) -> Self { ProvaNothingAppX }

    fn get_info(&self) -> Info {
        Info {
            name: "NothingAppX Prova".to_string(),
            vendor: "NothingAppX".to_string(),
            unique_id: 0x4E41_5058, // "NAPX"
            inputs: 2,
            outputs: 2,
            category: Category::Effect,
            ..Default::default()
        }
    }

    fn process(&mut self, buffer: &mut AudioBuffer<f32>) {
        let (entradas, mut saidas) = buffer.split();
        for canal in 0..saidas.len() {
            let e = entradas.get(canal.min(entradas.len() - 1));
            let s = saidas.get_mut(canal);
            for (amostra_e, amostra_s) in e.iter().zip(s.iter_mut()) {
                *amostra_s = amostra_e * GANHO;
            }
        }
    }
}

plugin_main!(ProvaNothingAppX);
