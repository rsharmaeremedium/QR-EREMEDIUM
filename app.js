/* ================= QRGen eremedium — app logic =================
   Everything runs client-side. No network calls, no tracking.
   QR engine: qrcode-generator (MIT) — loaded from js/qrcode.js
*/
(function () {
  'use strict';

  // Full Unicode / emoji support (instead of the library's SJIS default)
  if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  }

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    input: $('input'),
    ecl: $('ecl'),
    shape: $('shape'),
    margin: $('margin'),
    marginVal: $('marginVal'),
    pngSize: $('pngSize'),
    fgColor: $('fgColor'),
    bgColor: $('bgColor'),
    presets: $('presets'),
    canvas: $('canvas'),
    previewFrame: $('previewFrame'),
    placeholder: $('placeholder'),
    stats: $('stats'),
    message: $('message'),
    downloadPng: $('downloadPng'),
    downloadSvg: $('downloadSvg'),
    copyBtn: $('copyBtn'),
    themeToggle: $('themeToggle'),
    panelSingle: $('panelSingle'),
    panelBatch: $('panelBatch'),
    tabs: document.querySelectorAll('.tab'),
    batchInput: $('batchInput'),
    batchEcl: $('batchEcl'),
    batchShape: $('batchShape'),
    batchMargin: $('batchMargin'),
    batchMarginVal: $('batchMarginVal'),
    batchPngSize: $('batchPngSize'),
    batchFormat: $('batchFormat'),
    batchFg: $('batchFg'),
    batchBg: $('batchBg'),
    batchStats: $('batchStats'),
    batchGrid: $('batchGrid'),
    batchDownload: $('batchDownload'),
    batchClear: $('batchClear'),
    batchMessage: $('batchMessage')
  };

  var STORE_KEY = 'qrgen-eremedium-settings';
  var BATCH_KEY = 'qrgen-eremedium-batch';
  var lastQR = null; // last generated qrcode object
  var activeTab = 'single';

  /* ---------------- Settings persistence ---------------- */
  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        ecl: els.ecl.value,
        shape: els.shape.value,
        margin: els.margin.value,
        pngSize: els.pngSize.value,
        fg: els.fgColor.value,
        bg: els.bgColor.value,
        theme: document.documentElement.getAttribute('data-theme'),
        tab: activeTab
      }));
    } catch (e) { /* storage may be unavailable (private mode) — ignore */ }
  }

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (s.ecl) els.ecl.value = s.ecl;
      if (s.shape) els.shape.value = s.shape;
      if (s.margin != null) els.margin.value = s.margin;
      if (s.pngSize) els.pngSize.value = s.pngSize;
      if (s.fg) els.fgColor.value = s.fg;
      if (s.bg) els.bgColor.value = s.bg;
      if (s.theme) document.documentElement.setAttribute('data-theme', s.theme);
      if (s.tab) showTab(s.tab, false);
    } catch (e) { /* ignore corrupt settings */ }
  }

  /* ---------------- Colour presets ---------------- */
  var PALETTES = [
    { fg: '#000000', bg: '#ffffff', name: 'Classic' },
    { fg: '#1e3a8a', bg: '#f0fdf4', name: 'Navy on mint' },
    { fg: '#7c2d12', bg: '#fef3c7', name: 'Amber' },
    { fg: '#ffffff', bg: '#4f46e5', name: 'Inverted' },
    { fg: '#111827', bg: '#fbcfe8', name: 'Pink' },
    { fg: '#064e3b', bg: '#ccfbf1', name: 'Teal' },
    { fg: '#831843', bg: '#ffe4e6', name: 'Rose' }
  ];

  function buildPresets() {
    PALETTES.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.title = p.name;
      b.setAttribute('aria-label', 'Colour preset: ' + p.name);
      b.style.background = 'linear-gradient(135deg, ' + p.fg + ' 0 50%, ' + p.bg + ' 50% 100%)';
      b.addEventListener('click', function () {
        els.fgColor.value = p.fg;
        els.bgColor.value = p.bg;
        update();
      });
      els.presets.appendChild(b);
    });
  }

  function markActivePreset() {
    var fg = els.fgColor.value.toLowerCase();
    var bg = els.bgColor.value.toLowerCase();
    var nodes = els.presets.querySelectorAll('.preset');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('active',
        PALETTES[i].fg.toLowerCase() === fg && PALETTES[i].bg.toLowerCase() === bg);
    }
  }

  /* ---------------- Quick-insert templates ---------------- */
  var TEMPLATES = {
    wifi: 'WIFI:T:WPA;S:MyNetwork;P:my-password;;',
    link: 'https://www.example.com',
    upi: 'upi://pay?pa=name@upi&pn=My%20Name&am=100&cu=INR',
    contact: 'BEGIN:VCARD\nVERSION:3.0\nFN:Your Name\nTEL:+91 98765 43210\nEMAIL:you@example.com\nEND:VCARD'
  };

  Array.prototype.forEach.call(document.querySelectorAll('[data-insert]'), function (btn) {
    btn.addEventListener('click', function () {
      var kind = btn.getAttribute('data-insert');
      if (kind === 'clear') {
        els.input.value = '';
      } else {
        els.input.value = TEMPLATES[kind] || '';
      }
      els.input.focus();
      update();
    });
  });

  /* ---------------- QR building & rendering ---------------- */
  function getOptions() {
    return {
      ecl: els.ecl.value,
      shape: els.shape.value,
      margin: parseInt(els.margin.value, 10),
      fg: els.fgColor.value,
      bg: els.bgColor.value,
      exportSize: parseInt(els.pngSize.value, 10)
    };
  }

  function buildQR(text, ecl) {
    var qr = qrcode(0, ecl); // typeNumber 0 => auto-detect smallest version
    qr.addData(text);
    qr.make();
    return qr;
  }

  // Draw one module with the selected shape, in canvas units.
  function drawModule(ctx, x, y, s, shape) {
    if (shape === 'dots') {
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'rounded') {
      var r = s * 0.36;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + s, y, x + s, y + s, r);
      ctx.arcTo(x + s, y + s, x, y + s, r);
      ctx.arcTo(x, y + s, x, y, r);
      ctx.arcTo(x, y, x + s, y, r);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x, y, s, s); // integer coords + integer size => no seams, no anti-aliasing
    }
  }

  // Draw the QR into a canvas whose bitmap is already at integer module size.
  function drawQR(qr, canvas, opt, unit) {
    var count = qr.getModuleCount();
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opt.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = opt.fg;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          drawModule(ctx, (c + opt.margin) * unit, (r + opt.margin) * unit, unit, opt.shape);
        }
      }
    }
  }

  // Render a crisp QR into `canvas` at exactly `targetPx` (used for PNG export
  // and batch thumbnails). Modules stay integer-sized; the final jump to the
  // exact size is a nearest-neighbour upscale, so edges never blur.
  function renderExact(qr, canvas, opt, targetPx) {
    var total = qr.getModuleCount() + opt.margin * 2;
    var unit = Math.max(1, Math.floor(targetPx / total));
    var side = unit * total;

    canvas.width = side;
    canvas.height = side;
    drawQR(qr, canvas, opt, unit);

    if (targetPx > side) {
      var out = document.createElement('canvas');
      out.width = out.height = targetPx;
      var octx = out.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(canvas, 0, 0, targetPx, targetPx);

      canvas.width = canvas.height = targetPx;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(out, 0, 0);
    }
  }

  // On-screen preview: size the bitmap so one module = a whole number of
  // device pixels (crisp at any zoom), matching the frame width.
  function renderPreview(qr, opt) {
    var canvas = els.canvas;
    var total = qr.getModuleCount() + opt.margin * 2;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var frameW = els.previewFrame.clientWidth;
    var cssW = frameW ? Math.min(340, frameW - 36) : 340; // 36 = frame padding
    var unit = Math.max(1, Math.floor((cssW * dpr) / total));
    var side = unit * total;

    canvas.width = side;
    canvas.height = side;
    drawQR(qr, canvas, opt, unit);
    canvas.style.width = canvas.style.height = (side / dpr) + 'px';
  }

  function buildSvgString(qr, opt) {
    var count = qr.getModuleCount();
    var total = count + opt.margin * 2;
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + (total * 8) + '" height="' + (total * 8) + '" shape-rendering="' + (opt.shape === 'square' ? 'crispEdges' : 'geometricPrecision') + '">',
      '<rect width="' + total + '" height="' + total + '" fill="' + opt.bg + '"/>'
    ];

    if (opt.shape === 'square') {
      var d = '';
      for (var r = 0; r < count; r++) {
        for (var c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            d += 'M' + (c + opt.margin) + ' ' + (r + opt.margin) + 'h1v1h-1z';
          }
        }
      }
      parts.push('<path d="' + d + '" fill="' + opt.fg + '"/>');
    } else {
      var shapes = '';
      for (var r2 = 0; r2 < count; r2++) {
        for (var c2 = 0; c2 < count; c2++) {
          if (qr.isDark(r2, c2)) {
            var x = c2 + opt.margin + 0.5;
            var y = r2 + opt.margin + 0.5;
            if (opt.shape === 'dots') {
              shapes += '<circle cx="' + x + '" cy="' + y + '" r="0.46"/>';
            } else {
              shapes += '<rect x="' + (x - 0.5) + '" y="' + (y - 0.5) + '" width="1" height="1" rx="0.36"/>';
            }
          }
        }
      }
      parts.push('<g fill="' + opt.fg + '">' + shapes + '</g>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  /* ---------------- Stats & messages ---------------- */
  function updateStats(text, qr) {
    var chars = text.length;
    var lines = text === '' ? 0 : text.split('\n').length;
    var bytes = new Blob([text]).size; // UTF-8 byte length
    var info = lines + (lines === 1 ? ' line · ' : ' lines · ') +
               chars + ' chars · ' + bytes + ' B';
    if (qr) {
      var version = (qr.getModuleCount() - 17) / 4;
      info += ' · v' + version + ' (' + qr.getModuleCount() + '×' + qr.getModuleCount() + ')';
    }
    els.stats.textContent = info;
  }

  function showMessage(text, type) {
    els.message.textContent = text || '';
    els.message.className = 'message' + (type ? ' ' + type : '');
  }

  /* ---------------- Scanability helpers ---------------- */
  function relLum(hex) {
    var n = parseInt(hex.slice(1), 16);
    var ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // Phone cameras scan by contrast, so warn when the colours are too close.
  function contrastWarn(opt) {
    var a = relLum(opt.fg), b = relLum(opt.bg);
    var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio < 3 ? 'Low-contrast colours can be hard to scan \u2014 a darker foreground on a lighter background works best.' : '';
  }

  /* ---------------- Main update ---------------- */
  function update() {
    var text = els.input.value;
    els.marginVal.textContent = els.margin.value;
    markActivePreset();
    updateStats(text, null);

    if (!text.trim()) {
      lastQR = null;
      els.canvas.style.display = 'none';
      els.placeholder.style.display = 'block';
      setButtonsEnabled(false);
      showMessage('');
      saveSettings();
      return;
    }

    var opt = getOptions();
    var qr;
    try {
      qr = buildQR(text, opt.ecl);
    } catch (err) {
      lastQR = null;
      els.canvas.style.display = 'none';
      els.placeholder.style.display = 'block';
      setButtonsEnabled(false);
      showMessage('Text is too long for a single QR code at this error level. Shorten it or lower the error correction.', 'error');
      saveSettings();
      return;
    }

    lastQR = qr;
    renderPreview(qr, opt);
    els.canvas.style.display = 'block';
    els.placeholder.style.display = 'none';
    setButtonsEnabled(true);
    updateStats(text, qr);
    var warn = contrastWarn(opt);
    showMessage(warn, warn ? 'warn' : '');
    saveSettings();
  }

  function setButtonsEnabled(on) {
    els.downloadPng.disabled = !on;
    els.downloadSvg.disabled = !on;
    els.copyBtn.disabled = !on;
  }

  /* ---------------- Downloads ---------------- */
  function slugify(text) {
    var firstLine = text.split('\n')[0].trim().slice(0, 40);
    var slug = firstLine.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug ? 'qr-' + slug : 'qrcode';
  }

  function triggerDownload(href, filename) {
    var a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadURL(url, filename, keepAliveMs) {
    triggerDownload(url, filename);
    if (keepAliveMs) setTimeout(function () { URL.revokeObjectURL(url); }, keepAliveMs);
    showMessage('Saved \u201C' + filename + '\u201D \u2014 look in your browser\u2019s Downloads folder.', 'ok');
  }

  els.downloadPng.addEventListener('click', function () {
    if (!lastQR) return;
    var text = els.input.value;
    var opt = getOptions();
    var off = document.createElement('canvas');
    renderExact(lastQR, off, opt, opt.exportSize);
    var name = slugify(text) + '.png';
    if (off.toBlob) {
      off.toBlob(function (blob) {
        // Fall back to a data URL if the browser refuses blob download
        downloadURL(blob ? URL.createObjectURL(blob) : off.toDataURL('image/png'),
                    name, blob ? 2000 : 0);
      }, 'image/png');
    } else {
      downloadURL(off.toDataURL('image/png'), name, 0);
    }
  });

  els.downloadSvg.addEventListener('click', function () {
    if (!lastQR) return;
    var svg = buildSvgString(lastQR, getOptions());
    var name = slugify(els.input.value) + '.svg';
    var url;
    try {
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      downloadURL(url, name, 2000);
    } catch (e) {
      downloadURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), name, 0);
    }
  });

  els.copyBtn.addEventListener('click', function () {
    if (!els.input.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(els.input.value).then(function () {
        showMessage('Text copied to clipboard.', 'ok');
      }, function () {
        showMessage('Could not copy — select the text and copy manually.', 'error');
      });
    } else {
      els.input.select();
      document.execCommand('copy');
      showMessage('Text copied to clipboard.', 'ok');
    }
  });

  /* ---------------- Theme toggle ---------------- */
  els.themeToggle.addEventListener('click', function () {
    var root = document.documentElement;
    root.setAttribute('data-theme',
      root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    saveSettings();
  });

  /* ---------------- Wiring ---------------- */
  var debounceTimer = null;
  function debouncedUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(update, 180);
  }

  els.input.addEventListener('input', debouncedUpdate);

  [els.ecl, els.shape, els.fgColor, els.bgColor].forEach(function (el) {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });

  els.margin.addEventListener('input', update);
  els.pngSize.addEventListener('change', saveSettings);

  /* ---------------- Tabs ---------------- */
  function showTab(name, persist) {
    activeTab = name === 'batch' ? 'batch' : 'single';
    els.panelSingle.hidden = activeTab === 'batch';
    els.panelBatch.hidden = activeTab !== 'batch';
    Array.prototype.forEach.call(els.tabs, function (t) {
      var on = t.getAttribute('data-tab') === activeTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (activeTab === 'single' && lastQR) renderPreview(lastQR, getOptions());
    if (persist !== false) saveSettings();
  }

  Array.prototype.forEach.call(els.tabs, function (t) {
    t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
  });

  /* ---------------- Batch mode ---------------- */
  var batchEntries = [];
  var batchTimer = null;

  function getBatchOptions() {
    return {
      ecl: els.batchEcl.value,
      shape: els.batchShape.value,
      margin: parseInt(els.batchMargin.value, 10),
      fg: els.batchFg.value,
      bg: els.batchBg.value,
      exportSize: parseInt(els.batchPngSize.value, 10),
      format: els.batchFormat.value
    };
  }

  function saveBatchSettings() {
    try { localStorage.setItem(BATCH_KEY, JSON.stringify(getBatchOptions())); }
    catch (e) { /* storage unavailable — ignore */ }
  }

  function loadBatchSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(BATCH_KEY) || 'null');
      if (!s) {
        // First run: match the style chosen on the Single tab
        var m = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {};
        if (m.ecl) els.batchEcl.value = m.ecl;
        if (m.shape) els.batchShape.value = m.shape;
        if (m.margin != null) els.batchMargin.value = m.margin;
        if (m.pngSize) els.batchPngSize.value = m.pngSize;
        if (m.fg) els.batchFg.value = m.fg;
        if (m.bg) els.batchBg.value = m.bg;
        return;
      }
      if (s.ecl) els.batchEcl.value = s.ecl;
      if (s.shape) els.batchShape.value = s.shape;
      if (s.margin != null) els.batchMargin.value = s.margin;
      if (s.pngSize) els.batchPngSize.value = s.pngSize;
      if (s.fg) els.batchFg.value = s.fg;
      if (s.bg) els.batchBg.value = s.bg;
      if (s.format) els.batchFormat.value = s.format;
    } catch (e) { /* ignore corrupt settings */ }
  }

  function sanitizeFileName(s) {
    return (s || '')
      .replace(/[\\/:*?"<>|]/g, '')   // characters Windows/filesystems reject
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '')
      .slice(0, 60);
  }

  function deriveNameFromUrl(url) {
    try {
      var u = new URL(url);
      var seg = u.pathname.split('/').filter(Boolean).pop() || u.hostname.replace(/^www\./, '');
      return sanitizeFileName(seg) || 'qrcode';
    } catch (e) {
      return sanitizeFileName(url.replace(/^https?:\/\//, '')) || 'qrcode';
    }
  }

  function uniqueName(base, seen) {
    var name = base, n = 2;
    while (seen[name]) { name = base + '-' + n; n++; }
    seen[name] = true;
    return name;
  }

  // Each line: "file name, URL" (comma or Tab). File name optional.
  function parseBatch(text) {
    var entries = [], problems = [], seen = Object.create(null);
    text.split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;

      var name = '', url = '';
      var tabIdx = line.indexOf('\t'), commaIdx = line.indexOf(',');
      if (tabIdx !== -1) {
        name = line.slice(0, tabIdx).trim();
        url = line.slice(tabIdx + 1).trim();
      } else if (commaIdx !== -1) {
        var before = line.slice(0, commaIdx).trim(), after = line.slice(commaIdx + 1).trim();
        if (/^https?:\/\//i.test(before) && !/^https?:\/\//i.test(after)) {
          url = line; // the URL itself contains a comma — whole line is the URL
        } else {
          name = before; url = after;
        }
      } else {
        url = line; // no name given — derive it from the URL
      }

      if (!url) { problems.push('line ' + (i + 1) + ': no URL'); return; }
      entries.push({ file: uniqueName(sanitizeFileName(name) || deriveNameFromUrl(url), seen), url: url, line: i + 1 });
    });
    return { entries: entries, problems: problems };
  }

  function setBatchMessage(text, type) {
    els.batchMessage.textContent = text || '';
    els.batchMessage.className = 'message' + (type ? ' ' + type : '');
  }

  function batchUpdate() {
    var opt = getBatchOptions();
    els.batchMarginVal.textContent = opt.margin;
    els.batchPngSize.disabled = opt.format === 'svg'; // size only applies to PNG
    els.batchGrid.innerHTML = '';
    batchEntries = [];

    var parsed = parseBatch(els.batchInput.value);
    var ready = 0, failed = 0;

    parsed.entries.forEach(function (e) {
      var card = document.createElement('div');
      card.className = 'batch-card';
      var ok = false;
      try {
        var qr = buildQR(e.url, opt.ecl);
        var c = document.createElement('canvas');
        renderExact(qr, c, opt, 140);
        c.className = 'batch-thumb';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', 'QR preview for ' + e.file);
        card.appendChild(c);
        e.qr = qr;
        ok = true;
        ready++;
      } catch (err) {
        var bad = document.createElement('div');
        bad.className = 'batch-thumb batch-bad';
        bad.textContent = 'Too long';
        card.appendChild(bad);
        failed++;
      }
      var nm = document.createElement('div');
      nm.className = 'batch-name';
      nm.textContent = e.file + '.' + opt.format;
      nm.title = e.url;
      card.appendChild(nm);
      els.batchGrid.appendChild(card);
      e.ok = ok;
      batchEntries.push(e);
    });

    var bits = [ready + ' ready'];
    if (failed) bits.push(failed + ' too long');
    if (parsed.problems.length) bits.push(parsed.problems.length + ' skipped');
    els.batchStats.textContent = bits.join(' \u00B7 ');

    var warn = contrastWarn(opt);
    if (warn) setBatchMessage(warn, 'warn');
    else if (parsed.problems.length) {
      setBatchMessage('Skipped: ' + parsed.problems.slice(0, 3).join('; ') +
        (parsed.problems.length > 3 ? ' \u2026' : ''), 'error');
    } else setBatchMessage('');

    els.batchDownload.disabled = ready === 0;
    saveBatchSettings();
  }

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
           '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function downloadBatchZip() {
    var list = batchEntries.filter(function (e) { return e.ok; });
    if (!list.length) return;

    var opt = getBatchOptions();
    els.batchDownload.disabled = true;
    setBatchMessage('Preparing ' + list.length + ' file' + (list.length === 1 ? '' : 's') + '\u2026');

    Promise.all(list.map(function (e) {
      if (opt.format === 'svg') {
        return Promise.resolve({ name: e.file + '.svg', data: buildSvgString(e.qr, opt) });
      }
      var c = document.createElement('canvas');
      renderExact(e.qr, c, opt, opt.exportSize);
      return new Promise(function (resolve, reject) {
        c.toBlob(function (blob) {
          if (!blob) { reject(new Error('PNG export failed')); return; }
          blob.arrayBuffer().then(function (buf) {
            resolve({ name: e.file + '.png', data: new Uint8Array(buf) });
          });
        }, 'image/png');
      });
    })).then(function (files) {
      var zipBlob = QRZip.create(files);
      var name = 'qr-batch-' + stamp() + '.zip';
      var url = URL.createObjectURL(zipBlob);
      triggerDownload(url, name);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      batchUpdate(); // refresh stats + button state
      setBatchMessage('Saved \u201C' + name + '\u201D with ' + files.length +
        ' file' + (files.length === 1 ? '' : 's') + ' \u2014 look in your browser\u2019s Downloads folder.', 'ok');
    }).catch(function (err) {
      batchUpdate();
      setBatchMessage('Could not build the ZIP: ' + (err && err.message ? err.message : err), 'error');
    });
  }

  function onBatchChange() { batchUpdate(); }

  els.batchInput.addEventListener('input', function () {
    clearTimeout(batchTimer);
    batchTimer = setTimeout(batchUpdate, 250);
  });

  [els.batchEcl, els.batchShape, els.batchFg, els.batchBg].forEach(function (el) {
    el.addEventListener('input', onBatchChange);
    el.addEventListener('change', onBatchChange);
  });

  els.batchMargin.addEventListener('input', onBatchChange);
  els.batchPngSize.addEventListener('change', onBatchChange);
  els.batchFormat.addEventListener('change', onBatchChange);

  els.batchClear.addEventListener('click', function () {
    els.batchInput.value = '';
    batchUpdate();
    els.batchInput.focus();
  });

  els.batchDownload.addEventListener('click', downloadBatchZip);

  /* ---------------- Resize: keep the preview crisp ---------------- */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (activeTab === 'single' && lastQR) renderPreview(lastQR, getOptions());
    }, 150);
  });

  /* ---------------- Init ---------------- */
  // A refresh (F5 / Ctrl+F5) is treated as "reset to defaults": saved settings
  // only survive closing and reopening the browser, not a page reload.
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload') {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(BATCH_KEY);
    }
  } catch (e) { /* storage unavailable — ignore */ }

  loadSettings();
  buildPresets();
  loadBatchSettings();
  batchUpdate();
  update();

  // Remember cursor position so quick-insert templates can be tweaked easily
  els.input.focus();
})();
