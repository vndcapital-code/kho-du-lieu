// Chuyển giọng nói thành chữ bằng Whisper, chạy ngay trên máy người dùng
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';
env.allowLocalModels = false;

let asr = null, key = '';
async function getAsr(model, device, id) {
  const k = model + '|' + device;
  if (asr && key === k) return asr;
  const opts = {
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: p => self.postMessage({ type: 'dl', id, p })
  };
  try { asr = await pipeline('automatic-speech-recognition', model, opts); }
  catch (e) {
    if (device !== 'webgpu') throw e;
    asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback: opts.progress_callback });
  }
  key = k;
  return asr;
}

self.onmessage = async e => {
  const { type, id, audio, offset, model, device, language } = e.data;
  if (type !== 'run') return;
  try {
    const run = await getAsr(model, device, id);
    const opt = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true };
    if (language) opt.language = language;
    const out = await run(audio, opt);
    const chunks = (out.chunks || [{ timestamp: [0, 0], text: out.text }]).map(c => ({ t: (c.timestamp?.[0] || 0) + offset, text: c.text }));
    self.postMessage({ type: 'done', id, chunks });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: 'Lỗi chuyển giọng nói: ' + (err && err.message || err) });
  }
};
