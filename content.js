// ==== content.js ====
// Inserta un badge con el peso en el header del POS (.pos-branding)
// Expone connectScale()/disconnectScale() para que el popup controle la balanza
// Con F9 calcula EAN-13 y lo envía al background (que hace el POST al emulador C#)

let port, reader, writer, keepReading = false;
let frameStarted = false, frameBuffer = [];
const decoder = new TextDecoder();
let weight = "00000";
let prefix = "20";
let product = "00000";

// ---- utilidades ----
function pad(str, len) { return String(str).padStart(len, "0").slice(-len); }

// ==== 0) Estilos para agrandar y mejorar contraste ====
function ensureStyles() {
  if (document.getElementById("ext-scale-style")) return;
  const css = document.createElement("style");
  css.id = "ext-scale-style";
  css.textContent = `
    /* Tamaño y presencia del visor */
    #ext-scale-panel{
      font-size: 20px;           /* más grande */
      line-height: 1.1;
      font-weight: 800;          /* bien marcado */
      padding: 6px 12px;         /* más aire */
      border-radius: 6px;
      letter-spacing: .2px;
    }
    /* Cuando está OK (verde) aumenta contraste */
    #ext-scale-panel.bg-success{
      color: #fff !important;                 /* texto blanco */
      text-shadow: 0 1px 1px rgba(0,0,0,.55); /* realce para legibilidad */
      border: 2px solid #155724;              /* borde verde oscuro */
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }
    /* Amarillo: ya usamos text-dark desde JS, solo reforzamos */
    #ext-scale-panel.bg-warning{
      border: 1px solid rgba(0,0,0,.1);
    }
    /* Rojo de error: contraste fuerte */
    #ext-scale-panel.bg-danger{
      color: #fff !important;
      text-shadow: 0 1px 1px rgba(0,0,0,.55);
    }
  `;
  document.head.appendChild(css);
}
ensureStyles();

// ==== 1) Badge dentro de .pos-branding (espera a que exista) ====
let badgeEl = null;

function ensureBadge() {
  const branding = document.querySelector('.pos-branding');
  if (!branding || badgeEl) return;

  // Crear badge
  badgeEl = document.createElement('span');
  badgeEl.id = 'ext-scale-panel';
  badgeEl.className = 'badge bg-secondary ms-3 align-self-center';
  badgeEl.textContent = 'Peso: 00000';
  branding.appendChild(badgeEl);
}

ensureBadge();
// Por si el POS tarda en montar el header:
const obs = new MutationObserver(() => ensureBadge());
obs.observe(document.documentElement, { childList: true, subtree: true });

// ==== 2) Helpers visuales del badge ====
function setBadge(text, cls) {
  ensureBadge();
  if (!badgeEl) return;
  badgeEl.textContent = text;
  badgeEl.className = 'badge ' + cls + ' ms-3 align-self-center';
}
function showStable(p)   { setBadge(`Peso: ${p}`, 'bg-success'); }
function showUnstable()  { setBadge('Peso no estable', 'bg-warning text-dark'); }
function showError(txt)  { setBadge(txt, 'bg-danger'); }

// ==== 3) Configuración (prefijo y producto) desde storage ====
chrome.storage.sync.get({ prefix: "20", product: "00000" }, prefs => {
  prefix  = prefs.prefix;
  product = prefs.product;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.prefix)  prefix  = changes.prefix.newValue;
  if (changes.product) product = changes.product.newValue;
});

// ==== 4) Conexión / Desconexión Serial (llamadas desde popup) ====
async function connectScale() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    keepReading = true;
    showError("Conectado");
    writeLoop();
    readLoop();
  } catch (e) {
    console.error(e);
    showError("Error conexión");
  }
}
async function disconnectScale() {
  try {
    keepReading = false;
    if (reader) await reader.cancel();
    if (writer) await writer.close();
    if (port)   await port.close();
    showError("Desconectado");
  } catch (e) {
    console.error(e);
    showError("Error desconectar");
  }
}

// Exponer para que popup.js pueda llamarlas
window.connectScale = connectScale;
window.disconnectScale = disconnectScale;

// ==== 5) Loop de escritura (ENQ) y lectura (STX ... ETX) ====
async function writeLoop() {
  while (keepReading) {
    try {
      await writer.write(new Uint8Array([0x05])); // ENQ
    } catch(_) {}
    frameStarted = false; frameBuffer = [];
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function readLoop() {
  while (keepReading) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch(_) {
      break;
    }
    if (!chunk || chunk.done) break;
    const bytes = Array.from(chunk.value || []);
    handleData(bytes);
  }
}

function handleData(bytes) {
  for (let b of bytes) {
    if (b === 0x02) { // STX
      frameStarted = true;
      frameBuffer = [];
    } else if (b === 0x03 && frameStarted) { // ETX
      const raw = decoder.decode(new Uint8Array(frameBuffer)).trim();
      weight = pad(raw, 5);
      showStable(weight);
      try { writer.write(new Uint8Array([0x06])); } catch(_) {} // ACK
      frameStarted = false;
    } else if (b === 0x11) { // WACK
      showUnstable();
    } else if (b === 0x15) { // NACK
      showError("Error");
    } else if (frameStarted) {
      frameBuffer.push(b);
    }
  }
}

// ==== 6) Enviar EAN-13 al emulador C# por background + F9 ====
function calcEAN13() {
  const core = prefix + product + weight; // 12 dígitos
  let sum = 0;
  for (let i = 11; i >= 0; i--) {
    const d = parseInt(core[i], 10);
    sum += d * (((12 - i) % 2) ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

function simulateScan() {
  const ean13 = calcEAN13();
  console.log("[EXT] EAN13:", ean13);

  chrome.runtime.sendMessage(
    { action: "sendToEmulator", ean: ean13 },
    (res) => {
      if (res?.success) {
        console.log("[EXT] Enviado al emulador (bg OK)");
      } else {
        console.error("[EXT] Error emulador:", res?.error);
      }
    }
  );
}

window.addEventListener("keydown", e => {
  if (e.key === "F9") {
    e.preventDefault();
    simulateScan();
  }
});
