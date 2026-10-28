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
    placeholder: $('placeholder'),
    stats: $('stats'),
    message: $('message'),
    downloadPng: $('downloadPng'),
    downloadSvg: $('downloadSvg'),
    copyBtn: $('copyBtn'),
    themeToggle: $('themeToggle')
  };

  var STORE_KEY = 'qrgen-eremedium-settings';
  var lastQR = null; // last generated qrcode object

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
        theme: document.documentElement.getAttribute('data-theme')
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
      ctx.fillRect(x, y, s + 0.5, s + 0.5); // +0.5 closes hairline seams
    }
  }

  function renderCanvas(qr, canvas, opt, pixelSize) {
    var count = qr.getModuleCount();
    var total = count + opt.margin * 2;
    var size = pixelSize || canvas.width;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var phys = Math.max(total, Math.floor(size * dpr)); // physical pixels
    var scale = phys / total;                            // may be fractional
    var unit = Math.floor(scale);                        // crisp integer modules
    if (unit < 1) unit = 1;
    var side = unit * total;

    canvas.width = side;
    canvas.height = side;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opt.bg;
    ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = opt.fg;

    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          drawModule(ctx, (c + opt.margin) * unit, (r + opt.margin) * unit, unit, opt.shape);
        }
      }
    }
  }

  function buildSvgString(qr, opt) {
    var count = qr.getModuleCount();
    var total = count + opt.margin * 2;
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + (total * 8) + '" height="' + (total * 8) + '" shape-rendering="crispEdges">',
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
    renderCanvas(qr, els.canvas, opt);
    els.canvas.style.display = 'block';
    els.placeholder.style.display = 'none';
    setButtonsEnabled(true);
    updateStats(text, qr);
    showMessage('');
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
    renderCanvas(lastQR, off, opt, opt.exportSize);
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

  /* ---------------- Init ---------------- */
  loadSettings();
  buildPresets();
  update();

  // Remember cursor position so quick-insert templates can be tweaked easily
  els.input.focus();
})();
