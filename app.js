// Kho Dữ Liệu – VND CAPITAL. Mọi chuyển đổi chạy trong trình duyệt.
const CDN = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs',
  xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs',
  jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  gsi: 'https://accounts.google.com/gsi/client',
  reader: 'https://r.jina.ai/'
};
const CFG = window.KHO_CONFIG || {};
const $ = s => document.querySelector(s);

// ---------- tiện ích ----------
const _scripts = {};
function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (!_scripts[src]) _scripts[src] = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => ok(globalName ? window[globalName] : true);
    s.onerror = () => fail(new Error('Không tải được thư viện: ' + src));
    document.head.appendChild(s);
  });
  return _scripts[src];
}
const _mods = {};
const mod = url => (_mods[url] ||= import(url));
async function JSZip() { const m = await mod(CDN.jszip); return m.default || m; }

const pad = n => String(n).padStart(2, '0');
function nowStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function stamp(d = new Date()) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }
function hms(s) { s = Math.max(0, Math.floor(s || 0)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; }
function size(b) { if (b == null) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (i ? b.toFixed(1) : b) + ' ' + u[i]; }
function slug(s) {
  return (s || 'du-lieu').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'du-lieu';
}
const ext = n => ((n || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const estTok = s => Math.ceil((s || '').length / 3.5);
const fmtNum = n => n.toLocaleString('vi-VN');

// Làm gọn văn bản để tốn ít token: bỏ khoảng trắng thừa, dòng trống lặp, dòng trùng liền nhau
function compact(t) {
  const lines = String(t || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n');
  const out = []; let blank = false, prev = null;
  for (let l of lines) {
    l = l.replace(/[ \t\f\v]+/g, ' ').trim();
    if (!l) { if (!blank && out.length) out.push(''); blank = true; continue; }
    if (l === prev) continue;
    out.push(l); prev = l; blank = false;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

// HTML -> Markdown gọn (đầu mục, đoạn, danh sách, bảng)
function htmlToMd(html, pickMain = false) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let root = doc.body || doc.documentElement;
  if (pickMain) root = doc.querySelector('article') || doc.querySelector('main') || root;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'NAV', 'FOOTER', 'ASIDE', 'FORM', 'BUTTON', 'TEMPLATE', 'HEAD']);
  const cellText = n => n.textContent.replace(/\s+/g, ' ').trim().replace(/\|/g, '/');
  function walk(n, depth) {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || SKIP.has(n.tagName)) return '';
    const t = n.tagName;
    if (pickMain && t === 'HEADER' && n !== root) return '';
    const kids = () => Array.from(n.childNodes).map(c => walk(c, depth)).join('');
    if (/^H[1-6]$/.test(t)) return `\n\n${'#'.repeat(+t[1])} ${n.textContent.replace(/\s+/g, ' ').trim()}\n\n`;
    if (t === 'BR') return '\n';
    if (t === 'P' || t === 'DIV' || t === 'SECTION' || t === 'ARTICLE' || t === 'BLOCKQUOTE' || t === 'PRE') return `\n${kids()}\n`;
    if (t === 'UL' || t === 'OL') {
      let i = 0;
      return '\n' + Array.from(n.children).filter(c => c.tagName === 'LI').map(li => {
        i++; const inner = Array.from(li.childNodes).map(c => walk(c, depth + 1)).join('').replace(/\n+/g, ' ').trim();
        return `${'  '.repeat(depth)}${t === 'OL' ? i + '.' : '-'} ${inner}`;
      }).join('\n') + '\n';
    }
    if (t === 'TABLE') {
      const rows = Array.from(n.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(cellText));
      const ok = rows.filter(r => r.some(c => c));
      if (!ok.length) return '';
      const w = Math.max(...ok.map(r => r.length));
      const line = r => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
      return '\n' + [line(ok[0]), '|' + ' --- |'.repeat(w), ...ok.slice(1).map(line)].join('\n') + '\n';
    }
    if (t === 'IMG') { const a = (n.getAttribute('alt') || '').trim(); return a ? `[Ảnh: ${a}]` : ''; }
    return kids();
  }
  return compact(walk(root, 0));
}

// ---------- OCR (đọc chữ trong ảnh) ----------
let _ocr = null, _ocrLang = '';
async function ocrWorker() {
  const lang = $('#ocr').value;
  if (_ocr && _ocrLang === lang) return _ocr;
  if (_ocr) { try { await _ocr.terminate(); } catch (e) {} }
  const T = await loadScript(CDN.tesseract, 'Tesseract');
  _ocr = await T.createWorker(lang.split('+'));
  _ocrLang = lang;
  return _ocr;
}
async function ocr(img) {
  const w = await ocrWorker();
  const { data } = await w.recognize(img);
  return { text: compact(data.text), conf: Math.round(data.confidence || 0) };
}

// ---------- Chuyển đổi từng loại ----------
async function convPdf(file, item) {
  const pdfjs = await mod(CDN.pdf);
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = doc.numPages, pages = []; let ocrPages = 0;
  for (let i = 1; i <= n; i++) {
    item.prog(i / n * 0.95, `Trang ${i}/${n}`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // gom chữ theo dòng (toạ độ y), nối có khoảng cách
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], w: it.width, s: it.str, h: Math.abs(it.transform[3]) || 10 });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, arr]) => {
      arr.sort((a, b) => a.x - b.x); let s = '', end = null;
      for (const p of arr) { if (end != null && p.x - end > p.h * 0.15 && !s.endsWith(' ') && !p.s.startsWith(' ')) s += ' '; s += p.s; end = p.x + p.w; }
      return s;
    });
    let text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 25) { // trang scan → đọc chữ bằng OCR
      item.prog(i / n * 0.95, `Trang ${i}/${n}: bản scan, đang đọc chữ…`);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const r = await ocr(c); text = r.text; ocrPages++;
      if (text) text = `(đọc từ ảnh scan, độ tin cậy ${r.conf}%)\n` + text;
    }
    pages.push(compact(text));
    page.cleanup();
  }
  // bỏ đầu trang / chân trang lặp lại (chỉ xét 2 dòng đầu và 2 dòng cuối mỗi trang; giữ nguyên ở trang 1)
  if (n >= 4) {
    const key = l => l.replace(/\d+/g, '#');
    const edge = p => { const a = p.split('\n').filter(Boolean); return a.length <= 4 ? a : [...a.slice(0, 2), ...a.slice(-2)]; };
    const cnt = new Map();
    pages.forEach(p => new Set(edge(p).map(key)).forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1)));
    const rep = new Set([...cnt].filter(([k, c]) => c >= n * 0.6 && k.length < 120).map(([k]) => k));
    if (rep.size) for (let i = 1; i < n; i++) {
      const a = pages[i].split('\n'); const ne = a.length;
      if (ne <= 5) continue;
      pages[i] = a.filter((l, j) => !((j < 2 || j >= ne - 2) && rep.has(key(l)))).join('\n');
    }
  }
  const body = pages.map((p, i) => `## Trang ${i + 1}\n${p || '(trang trống)'}`).join('\n\n');
  return { body, meta: { loai: 'PDF', so_trang: n, trang_scan_doc_ocr: ocrPages } };
}

async function convDocx(file) {
  const mammoth = await loadScript(CDN.mammoth, 'mammoth');
  const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return { body: htmlToMd(r.value), meta: { loai: 'Word' } };
}

function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch (e) { return new TextDecoder('windows-1258').decode(u8); }
}

function csvCell(v) { v = String(v ?? '').replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

async function convSheet(file, item) {
  const XLSX = await mod(CDN.xlsx);
  const buf = await file.arrayBuffer();
  const wb = ext(file.name) === 'csv' ? XLSX.read(decodeText(buf), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'array', cellDates: true });
  const parts = []; let total = 0;
  wb.SheetNames.forEach((name, si) => {
    item.prog((si + 1) / wb.SheetNames.length * 0.95, `Trang tính ${si + 1}/${wb.SheetNames.length}`);
    const ws = wb.Sheets[name];
    let rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    rows = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(c => c));
    const hidden = wb.Workbook?.Sheets?.[si]?.Hidden ? ' – trang ẩn' : '';
    if (!rows.length) { parts.push(`## Trang tính: ${name}${hidden}\n(trống)`); return; }
    const w = Math.max(...rows.map(r => r.length));
    const used = Array.from({ length: w }, (_, j) => rows.some(r => r[j]));
    const out = rows.map(r => used.map((u, j) => u ? csvCell(r[j]) : null).filter(v => v !== null).join(',').replace(/,+$/, ''));
    total += rows.length;
    parts.push(`## Trang tính: ${name}${hidden} (${rows.length} dòng × ${used.filter(Boolean).length} cột, dạng CSV)\n${out.join('\n')}`);
  });
  return { body: parts.join('\n\n'), meta: { loai: ext(file.name) === 'csv' ? 'CSV' : 'Excel', so_trang_tinh: wb.SheetNames.length, tong_dong: total } };
}

async function convPptx(file) {
  const Z = await JSZip();
  const zip = await Z.loadAsync(await file.arrayBuffer());
  const num = p => +(p.match(/(\d+)\.xml$/) || [0, 0])[1];
  const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  const textOf = xml => {
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(d.getElementsByTagName('a:p')).map(p => Array.from(p.getElementsByTagName('a:t')).map(t => t.textContent).join('')).filter(s => s.trim()).join('\n');
  };
  const parts = [];
  for (const s of slides) {
    const n = num(s); let t = textOf(await zip.file(s).async('string'));
    const note = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    if (note) { const nt = textOf(await note.async('string')).split('\n').filter(l => !/^\d+$/.test(l.trim())).join('\n'); if (nt.trim()) t += `\nGhi chú: ${nt}`; }
    parts.push(`## Trang chiếu ${n}\n${compact(t) || '(không có chữ)'}`);
  }
  return { body: parts.join('\n\n'), meta: { loai: 'PowerPoint', so_trang_chieu: slides.length } };
}

async function thumb(file, max = 640) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.72));
  return { blob, w: bmp.width, h: bmp.height };
}

async function convImage(file, item) {
  item.prog(0.2, 'Đang đọc chữ trong ảnh…');
  const r = await ocr(file);
  const t = await thumb(file).catch(() => null);
  const coChu = r.text.replace(/\s/g, '').length >= 15 && r.conf >= 35;
  const meta = { loai: 'Ảnh', kich_thuoc_anh: t ? `${t.w}×${t.h}` : '', do_tin_cay_doc_chu: r.conf + '%' };
  if (t) item.extra = { name: 'anh-thu-nho.jpg', blob: t.blob, mime: 'image/jpeg' };
  const body = coChu ? r.text : `(Ảnh không có chữ đọc được${t ? ' – đã lưu kèm ảnh thu nhỏ để xem khi cần' : ''})${r.text ? '\nChữ nhận được (độ tin cậy thấp): ' + r.text : ''}`;
  return { body, meta };
}

async function convText(file) {
  const e = ext(file.name); const raw = decodeText(await file.arrayBuffer());
  if (e === 'html' || e === 'htm') return { body: htmlToMd(raw, true), meta: { loai: 'Trang HTML' } };
  if (e === 'json') { try { return { body: JSON.stringify(JSON.parse(raw)), meta: { loai: 'JSON' } }; } catch (x) {} }
  if (e === 'xml') return { body: compact(raw.replace(/>\s+</g, '><')), meta: { loai: 'XML' } };
  return { body: compact(raw), meta: { loai: 'Văn bản' } };
}

// ----- Giọng nói → chữ (Whisper chạy trên máy) -----
let _asr = null, _gpu = null;
async function hasGpu() {
  if (_gpu !== null) return _gpu;
  try { _gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { _gpu = false; }
  return _gpu;
}
function asrWorker() {
  if (!_asr) _asr = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  return _asr;
}
function asrRun(payload, onMsg) {
  return new Promise((ok, fail) => {
    const w = asrWorker();
    const h = e => {
      const d = e.data; if (d.id !== payload.id) return;
      if (d.type === 'dl') onMsg && onMsg(d);
      else if (d.type === 'done') { w.removeEventListener('message', h); ok(d); }
      else if (d.type === 'error') { w.removeEventListener('message', h); fail(new Error(d.message)); }
    };
    w.addEventListener('message', h);
    w.postMessage(payload, [payload.audio.buffer]);
  });
}
async function convMedia(file, item) {
  item.prog(0.02, 'Đang tách tiếng…');
  const buf = await file.arrayBuffer();
  let audio, dur;
  try {
    const ctx = new AudioContext({ sampleRate: 16000 });
    const ab = await ctx.decodeAudioData(buf);
    ctx.close();
    dur = ab.duration;
    audio = ab.getChannelData(0);
    if (ab.numberOfChannels > 1) { const b = ab.getChannelData(1); const m = new Float32Array(audio.length); for (let i = 0; i < m.length; i++) m[i] = (audio[i] + b[i]) / 2; audio = m; }
  } catch (e) { throw new Error('Trình duyệt không đọc được phần tiếng của tệp này (thử đổi sang MP4/MP3/M4A/WAV).'); }
  const gpu = await hasGpu();
  const model = $('#moHinh').value, language = $('#ngonNgu').value || null;
  const SEG = 16000 * 300; // xử lý từng đoạn 5 phút
  const segs = Math.ceil(audio.length / SEG);
  const chunks = []; const t0 = Date.now();
  for (let s = 0; s < segs; s++) {
    const part = audio.slice(s * SEG, Math.min(audio.length, (s + 1) * SEG));
    const done = s / segs;
    const eta = s ? ` · còn khoảng ${Math.ceil((Date.now() - t0) / s * (segs - s) / 60000)} phút` : '';
    item.prog(0.05 + done * 0.93, `Chuyển giọng nói thành chữ: đoạn ${s + 1}/${segs} (${hms(s * 300)}/${hms(dur)})${eta}`);
    const r = await asrRun({ type: 'run', id: item.id + '_' + s, audio: part, offset: s * 300, model, device: gpu ? 'webgpu' : 'wasm', language }, d => {
      if (d.p && d.p.status === 'progress' && d.p.total) item.prog(0.05 + done * 0.93, `Tải bộ chuyển giọng nói lần đầu: ${Math.round(d.p.loaded / d.p.total * 100)}% (${d.p.file})`);
    });
    chunks.push(...r.chunks);
  }
  // gộp thành đoạn ~60 giây, mỗi đoạn có mốc thời gian
  const paras = []; let cur = null;
  for (const c of chunks) {
    const txt = (c.text || '').trim(); if (!txt) continue;
    if (!cur || c.t - cur.t >= 60) { cur = { t: c.t, s: txt }; paras.push(cur); }
    else if (!cur.s.endsWith(txt)) cur.s += ' ' + txt;
  }
  const isVideo = (file.type || '').startsWith('video') || ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(ext(file.name));
  const body = paras.length ? paras.map(p => `[${hms(p.t)}] ${p.s}`).join('\n') : '(Không nhận được lời nói)';
  return { body, meta: { loai: isVideo ? 'Video' : 'Ghi âm', thoi_luong: hms(dur), may: gpu ? 'card đồ họa' : 'CPU', mo_hinh: model.split('/')[1], ngon_ngu: language || 'tự nhận' } };
}

// ----- Link web -----
const VIDEO_LINK = /(youtube\.com|youtu\.be|tiktok\.com|fb\.watch|vimeo\.com)|facebook\.com\/.*(videos?|watch|reel)/i;
async function convLink(url, item) {
  if (VIDEO_LINK.test(url)) throw new Error('Link video (YouTube/TikTok/Facebook) chưa làm được ở bản web vì trình duyệt chặn tải video. Tạm thời: tải video về máy rồi đưa tệp video vào app.');
  item.prog(0.3, 'Đang đọc trang…');
  let text = '', title = '';
  try {
    const r = await fetch(CDN.reader + url, { headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    text = await r.text();
    title = (text.match(/^Title:\s*(.+)$/m) || [])[1] || '';
    text = text.replace(/^[\s\S]*?Markdown Content:\s+/, '');
  } catch (e) { throw new Error('Không đọc được trang (' + e.message + '). Trang có thể cần đăng nhập hoặc chặn truy cập tự động.'); }
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1');
  if (title) item.title = title.trim();
  return { body: compact(text), meta: { loai: 'Trang web' } };
}

// ---------- Hàng đợi ----------
const KIND = {
  pdf: 'pdf', docx: 'docx', xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'sheet', pptx: 'pptx',
  jpg: 'img', jpeg: 'img', png: 'img', webp: 'img', bmp: 'img', gif: 'img',
  zip: 'zip', txt: 'text', md: 'text', json: 'text', xml: 'text', html: 'text', htm: 'text', log: 'text',
  mp3: 'media', wav: 'media', m4a: 'media', aac: 'media', ogg: 'media', oga: 'media', flac: 'media', opus: 'media',
  mp4: 'media', m4v: 'media', mov: 'media', webm: 'media', mkv: 'media', avi: 'media'
};
const UNSUP = { doc: 'Word đời cũ (.doc): mở bằng Word rồi lưu thành .docx.', ppt: 'PowerPoint đời cũ (.ppt): lưu lại thành .pptx.', rar: 'Tệp RAR: giải nén bằng WinRAR/7-Zip rồi đưa các tệp bên trong hoặc nén lại bằng ZIP.', '7z': 'Tệp 7z: giải nén rồi đưa các tệp bên trong.', heic: 'Ảnh HEIC (iPhone): đổi sang JPG.', tif: 'Ảnh TIFF: đổi sang PNG/JPG.', tiff: 'Ảnh TIFF: đổi sang PNG/JPG.' };
const CONV = { pdf: convPdf, docx: convDocx, sheet: convSheet, pptx: convPptx, img: convImage, text: convText, media: convMedia };

const items = []; let running = false, seq = 0;
function kindOf(name, type) {
  const e = ext(name);
  if (KIND[e]) return KIND[e];
  if (UNSUP[e]) return 'unsup';
  if ((type || '').startsWith('image/')) return 'img';
  if ((type || '').startsWith('audio/') || (type || '').startsWith('video/')) return 'media';
  if ((type || '').startsWith('text/')) return 'text';
  return 'unknown';
}

function addFile(file, parent) {
  const name = parent ? `${parent} › ${file.name}` : file.name;
  const k = kindOf(file.name, file.type);
  const it = newItem({ name, file, kind: k, nguon: parent ? `Trong tệp nén ${parent}` : 'Tệp tải lên', size: file.size });
  if (k === 'unsup') fail(it, UNSUP[ext(file.name)]);
  else if (k === 'unknown') fail(it, 'Chưa hỗ trợ loại tệp này (.' + (ext(file.name) || '?') + ').');
}
function addLink(url) { let nm = url; try { nm = decodeURI(url); } catch (e) {} newItem({ name: nm, url, kind: 'link', nguon: url }); }

function newItem(o) {
  const it = Object.assign({ id: 'm' + (++seq), status: 'cho', p: 0, info: 'Đang chờ' }, o);
  it.prog = (p, info) => { it.p = p; if (info) it.info = info; paint(it); };
  items.push(it); render(); pump();
  return it;
}
function fail(it, msg) { it.status = 'loi'; it.info = msg; paint(it); }

async function pump() {
  if (running) return; running = true;
  try {
    let it;
    while ((it = items.find(x => x.status === 'cho' && !['unsup', 'unknown'].includes(x.kind)))) {
      it.status = 'dang'; it.prog(0.01, 'Đang xử lý…');
      const t0 = Date.now();
      try {
        if (it.kind === 'zip') { await expandZip(it); continue; }
        const r = it.kind === 'link' ? await convLink(it.url, it) : await CONV[it.kind](it.file, it);
        finish(it, r, Date.now() - t0);
        await saveDrive(it);
      } catch (e) { console.error(e); fail(it, e.message || String(e)); }
    }
  } finally { running = false; }
}

async function expandZip(it) {
  const Z = await JSZip();
  const zip = await Z.loadAsync(await it.file.arrayBuffer());
  const files = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(f.name));
  let i = 0;
  for (const f of files) {
    i++; it.prog(i / files.length, `Giải nén ${i}/${files.length}`);
    const blob = await f.async('blob');
    const name = f.name.split('/').pop();
    addFile(new File([blob], name, { type: '' }), `${it.name}/${f.name.split('/').slice(0, -1).join('/')}`.replace(/\/$/, ''));
  }
  it.status = 'xong'; it.p = 1; it.info = `Đã giải nén ${files.length} tệp – mỗi tệp được xử lý riêng bên dưới.`; it.noSave = true; paint(it);
}

function finish(it, r, ms) {
  const title = it.title || (it.file ? it.file.name : it.url);
  const meta = Object.assign({ ten: title, nguon: it.nguon }, it.size ? { dung_luong_goc: size(it.size) } : {}, r.meta, { ngay_xu_ly: nowStr(), thoi_gian_xu_ly: Math.round(ms / 1000) + ' giây' });
  const body = r.body || '(không có nội dung)';
  meta.uoc_tinh_token = fmtNum(estTok(body));
  const head = Object.entries(meta).filter(([, v]) => v !== '' && v != null && v !== 0).map(([k, v]) => `${k}: ${String(v).replace(/\n/g, ' ')}`).join('\n');
  const heads = (body.match(/^#{1,3} .+$/gm) || []);
  const toc = heads.length > 6 && heads.length <= 400 ? `\n\nMục lục: ${heads.map(h => h.replace(/^#+ /, '')).join(' · ')}` : '';
  it.md = `---\n${head}\n---\n# ${title}${toc}\n\n${body}\n`;
  it.meta = meta;
  it.fileName = `${stamp()}_${slug(title.replace(/\.[a-z0-9]+$/i, ''))}.md`;
  it.summary = body.replace(/^\(.*?\)\n/, '').replace(/^#+ .*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 140);
  it.status = 'xong'; it.p = 1;
  it.info = `${meta.loai}${meta.so_trang ? ' · ' + meta.so_trang + ' trang' : ''}${meta.thoi_luong ? ' · ' + meta.thoi_luong : ''} · ~${meta.uoc_tinh_token} token · xong sau ${meta.thoi_gian_xu_ly}`;
  paint(it);
}

// ---------- Google Drive ----------
const Drive = {
  token: null, exp: 0, folder: null, email: '', client: null,
  ready() { return !!CFG.GOOGLE_CLIENT_ID; },
  async init() {
    if (!this.ready()) { $('#dangNhap').textContent = 'Chưa cấu hình Drive'; $('#dangNhap').disabled = true; $('#tk').textContent = 'Kết quả chỉ tải về máy'; return; }
    await loadScript(CDN.gsi, null);
    this.client = google.accounts.oauth2.initTokenClient({ client_id: CFG.GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file', callback: () => {} });
  },
  login(prompt = '') {
    return new Promise((ok, no) => {
      this.client.callback = r => { if (r.error) return no(new Error(r.error)); this.token = r.access_token; this.exp = Date.now() + (r.expires_in - 120) * 1000; ok(); };
      this.client.error_callback = e => no(new Error(e.type || 'Đăng nhập bị huỷ'));
      this.client.requestAccessToken({ prompt });
    });
  },
  live() { return this.token && Date.now() < this.exp; },
  async api(url, opt = {}) {
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + this.token }, opt.headers || {}) }));
    if (!r.ok) throw new Error('Drive báo lỗi ' + r.status + ': ' + (await r.text()).slice(0, 160));
    return r;
  },
  async ensureFolder() {
    const key = 'kho_folder_' + this.email;
    let id = this.folder || localStorage.getItem(key);
    if (id) {
      try { const f = await (await this.api(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`)).json(); if (!f.trashed) { this.folder = id; return id; } } catch (e) {}
    }
    const q = encodeURIComponent(`name='${CFG.DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const l = await (await this.api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)).json();
    if (l.files && l.files.length) id = l.files[0].id;
    else id = (await (await this.api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: CFG.DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).json()).id;
    this.folder = id; localStorage.setItem(key, id); return id;
  },
  async upload(name, blob, mime, fileId) {
    const meta = fileId ? {} : { name, parents: [this.folder] };
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    fd.append('file', blob instanceof Blob ? blob : new Blob([blob], { type: mime }));
    const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,webViewLink` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
    return (await this.api(url, { method: fileId ? 'PATCH' : 'POST', body: fd })).json();
  },
  _idx: Promise.resolve(),
  addIndex(line) { // ghi nối tiếp, tuần tự
    this._idx = this._idx.then(async () => {
      const q = encodeURIComponent(`name='MUC_LUC.md' and '${this.folder}' in parents and trashed=false`);
      const l = await (await this.api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)).json();
      const HEAD = '# MỤC LỤC KHO DỮ LIỆU\nĐọc tệp này trước, rồi chỉ mở đúng tệp cần.\nCột: ngày xử lý | tên | loại | nguồn | ~token | tệp | mô tả ngắn\n';
      let cur = HEAD, id = null;
      if (l.files && l.files.length) { id = l.files[0].id; cur = await (await this.api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).text(); }
      await this.upload('MUC_LUC.md', cur.replace(/\n?$/, '\n') + line + '\n', 'text/markdown', id);
    });
    return this._idx;
  }
};

async function saveDrive(it) {
  if (it.noSave || !it.md || !Drive.ready()) return;
  if (!Drive.live()) { it.driveState = 'chua'; it.info += '\nChưa lưu Drive (chưa đăng nhập).'; paint(it); updBtns(); return; }
  try {
    it.prog(1, it.info.split('\n')[0] + '\nĐang lưu lên Drive…');
    await Drive.ensureFolder();
    let extraLink = '';
    if (it.extra) { const f = await Drive.upload(it.fileName.replace(/\.md$/, '.jpg'), it.extra.blob, it.extra.mime); extraLink = `\nanh_thu_nho: ${f.webViewLink}`; it.md = it.md.replace('\n---\n#', extraLink + '\n---\n#'); }
    const f = await Drive.upload(it.fileName, it.md, 'text/markdown');
    it.driveLink = f.webViewLink;
    const m = it.meta;
    const row = [m.ngay_xu_ly, (m.ten || '').replace(/\|/g, '/'), m.loai + (m.so_trang ? ` ${m.so_trang} trang` : '') + (m.thoi_luong ? ` ${m.thoi_luong}` : ''), (m.nguon || '').replace(/\|/g, '/'), m.uoc_tinh_token, it.fileName, (it.summary || '').replace(/\|/g, '/')].join(' | ');
    await Drive.addIndex(row);
    it.driveState = 'da'; it.info = it.info.split('\n')[0] + '\nĐã lưu vào Drive “' + CFG.DRIVE_FOLDER + '” và ghi vào MUC_LUC.md';
  } catch (e) { it.driveState = 'chua'; it.info = it.info.split('\n')[0] + '\nLưu Drive lỗi: ' + e.message; }
  paint(it); updBtns();
}

// ---------- Giao diện ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NHAN = { cho: 'Đang chờ', dang: 'Đang xử lý', xong: 'Xong', loi: 'Lỗi' };
function render() {
  const ds = $('#ds');
  if (!items.length) return;
  ds.querySelector('.trong')?.remove();
  for (const it of items) if (!document.getElementById(it.id)) {
    const d = document.createElement('div'); d.className = 'muc'; d.id = it.id;
    d.innerHTML = `<div class="dau"><span class="ten"></span><span class="nhan"></span>
      <button class="btn nho" data-a="xem" hidden>Xem</button><button class="btn nho" data-a="tai" hidden>Tải .md</button><a class="btn nho" data-a="drive" target="_blank" rel="noopener" hidden>Mở trên Drive</a></div>
      <div class="thanh"><i></i></div><div class="ttin"></div><div class="xem"></div>`;
    d.querySelector('.ten').textContent = it.name;
    d.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'xem') { const x = d.querySelector('.xem'); x.classList.toggle('mo'); if (!x.textContent) x.textContent = it.md.length > 60000 ? it.md.slice(0, 60000) + '\n…(còn nữa – tải tệp để xem hết)' : it.md; }
      if (a === 'tai') download(it.fileName, it.md);
    });
    ds.prepend(d);
  }
  items.forEach(paint); updBtns();
}
function paint(it) {
  const d = document.getElementById(it.id); if (!d) return;
  const n = d.querySelector('.nhan'); n.className = 'nhan ' + it.status; n.textContent = NHAN[it.status];
  d.querySelector('.thanh').style.display = it.status === 'dang' ? '' : 'none';
  d.querySelector('.thanh i').style.width = Math.round((it.p || 0) * 100) + '%';
  d.querySelector('.ttin').textContent = it.info || '';
  const has = it.status === 'xong' && !!it.md;
  d.querySelector('[data-a=xem]').hidden = !has; d.querySelector('[data-a=tai]').hidden = !has;
  const dl = d.querySelector('[data-a=drive]'); dl.hidden = !it.driveLink; if (it.driveLink) dl.href = it.driveLink;
}
function updBtns() {
  const done = items.filter(x => x.md);
  $('#taiHet').hidden = done.length < 2;
  $('#luuLai').hidden = !items.some(x => x.md && x.driveState === 'chua');
}
function download(name, text, type = 'text/markdown') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type: type + ';charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// nhập tệp
const vung = $('#vung'), chon = $('#chonTep');
vung.onclick = () => chon.click();
vung.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') chon.click(); };
chon.onchange = () => { [...chon.files].forEach(f => addFile(f)); chon.value = ''; };
['dragenter', 'dragover'].forEach(t => vung.addEventListener(t, e => { e.preventDefault(); vung.classList.add('keo'); }));
['dragleave', 'drop'].forEach(t => vung.addEventListener(t, e => { e.preventDefault(); vung.classList.remove('keo'); }));
vung.addEventListener('drop', e => [...e.dataTransfer.files].forEach(f => addFile(f)));

// nhập link: chỉ nhận link http/https hợp lệ
$('#themLink').onclick = () => {
  const lines = $('#link').value.split(/\s+/).map(s => s.trim()).filter(Boolean);
  const bad = [];
  for (const l of lines) {
    let u = null; try { u = new URL(l); } catch (e) {}
    if (!u || !/^https?:$/.test(u.protocol)) bad.push(l); else addLink(u.href);
  }
  $('#loiLink').textContent = bad.length ? 'Không phải link web hợp lệ (phải bắt đầu bằng http:// hoặc https://):\n' + bad.join('\n') : (lines.length ? '' : 'Chưa nhập link nào.');
  $('#link').value = bad.join('\n');
};

$('#taiHet').onclick = async () => {
  const Z = await JSZip(); const z = new Z();
  items.filter(x => x.md).forEach(x => z.file(x.fileName, x.md));
  download(`kho-du-lieu_${stamp()}.zip`, await z.generateAsync({ type: 'blob' }));
};
$('#luuLai').onclick = async () => {
  if (!Drive.live()) { try { await Drive.login(); await afterLogin(); } catch (e) { return alert('Chưa đăng nhập được Google: ' + e.message); } }
  for (const it of items.filter(x => x.md && x.driveState === 'chua')) await saveDrive(it);
};

async function afterLogin() {
  try { const a = await (await Drive.api('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).json(); Drive.email = a.user.emailAddress; } catch (e) {}
  $('#tk').textContent = Drive.email ? 'Đã kết nối Drive\n' + Drive.email : 'Đã kết nối Drive';
  $('#dangNhap').textContent = 'Đổi tài khoản';
  updBtns();
}
$('#dangNhap').onclick = async () => {
  try { await Drive.login(Drive.token ? 'select_account' : ''); await afterLogin(); }
  catch (e) { alert('Chưa đăng nhập được Google: ' + e.message); }
};

(async () => {
  Drive.init().catch(e => { $('#tk').textContent = 'Không tải được đăng nhập Google'; });
  const gpu = await hasGpu();
  $('#goiyMay').textContent = gpu
    ? 'Máy có card đồ họa hỗ trợ: chuyển giọng nói thành chữ sẽ nhanh.'
    : 'Máy không dùng được card đồ họa: video dài sẽ chậm (video 1 tiếng có thể mất trên 1 tiếng). Video dài nên để chạy qua đêm, hoặc chọn “Nhanh”.';
  window.addEventListener('beforeunload', e => { if (items.some(x => x.status === 'dang' || x.status === 'cho' || (x.md && x.driveState === 'chua'))) { e.preventDefault(); e.returnValue = ''; } });
})();

window.__kho = { items, compact, htmlToMd }; // để kiểm thử
