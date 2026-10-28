# QRGen eremedium — Free Multi-Line QR Code Generator

A 100% free, web-based QR code generator that specialises in **text on different lines**.
Type or paste as many lines as you want — every line break is preserved inside the QR code.

- **No sign-up, no watermarks, no ads, no limits**
- **Nothing is uploaded** — everything runs in your browser, so it also works fully offline
- Full Unicode support (Hindi/Devanagari, Arabic, emoji, …)

## Quick start

Just double-click **`index.html`** — it opens and works in any modern browser.

Or serve it locally (nicer URLs, works from any device on your network):

```bat
start-server.bat
```

then open <http://localhost:8765>.

## Features

| Feature | Details |
|---|---|
| Multi-line text | Line breaks are preserved exactly as typed |
| Live preview | Regenerates as you type |
| Error correction | L (7%), M (15%), Q (25%), H (30%) — higher survives stains/covering |
| Module shapes | Square (classic), Rounded, Dots |
| Quiet zone | 0–10 modules of white border |
| Colours | Foreground/background pickers + 7 presets |
| Export | PNG (256–2048 px) or SVG (vector, infinite scaling) |
| Quick insert | Ready templates for Wi-Fi, website link, UPI payment, contact card (vCard) |
| Dark mode | Light/dark theme, remembered between visits |
| Smart filenames | Downloads are named after your first line, e.g. `qr-name-ada-lovelace.png` |

## Files

```
QRGenEremedium/
├── index.html          # The app page
├── app.js              # All app logic (rendering, export, settings)
├── css/style.css       # Light/dark themes, responsive layout
├── js/qrcode.js        # QR engine (kazuhikoarase/qrcode-generator, MIT license)
├── start-server.bat    # Optional local server launcher (Windows)
└── README.md
```

## Deploying for free

It is a static site with zero build steps — host it anywhere free:

- **GitHub Pages** — push this folder to a repo → Settings → Pages → deploy
- **Netlify / Vercel / Cloudflare Pages** — drag & drop this folder
- Or keep it as a local bookmark / offline HTML file

## Notes

- "QR Code" is a registered trademark of DENSO WAVE INCORPORATED; this project uses the
  open MIT-licensed `qrcode-generator` engine by Kazuhiko Arase.
- QR codes hold up to ~2,953 bytes (version 40, ECC L). The counter shows your usage;
  if you hit the limit, shorten the text or lower the error correction level.
