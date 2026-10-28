@echo off
rem  Starts a tiny local web server for QRGen and opens the browser.
rem  Requires Python (https://python.org). You can also just double-click index.html.

cd /d "%~dp0"
echo Starting QRGen server on http://localhost:8765 ...
start "" "http://localhost:8765"
python -m http.server 8765
