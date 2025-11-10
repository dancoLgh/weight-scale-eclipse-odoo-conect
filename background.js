// background.js
// Recibe mensajes del content y hace el POST al emulador C# (127.0.0.1:12345)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "sendToEmulator" && msg?.ean) {
    fetch("http://127.0.0.1:12345/", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: msg.ean + "\n"
    })
    .then(() => {
      console.log("[BG] Enviado al emulador:", msg.ean);
      sendResponse({ success: true });
    })
    .catch(err => {
      console.error("[BG] Error POST → emulador:", err);
      sendResponse({ success: false, error: String(err) });
    });
    return true; // respuesta async
  }
});
