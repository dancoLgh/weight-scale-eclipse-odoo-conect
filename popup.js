document.addEventListener("DOMContentLoaded", () => {
  const inpPref    = document.getElementById("prefix");
  const inpProd    = document.getElementById("product");
  const btnSave    = document.getElementById("save");
  const btnConnect = document.getElementById("connect-btn");
  const btnDisc    = document.getElementById("disconnect-btn");

  chrome.storage.sync.get({ prefix: "20", product: "00000" }, prefs => {
    inpPref.value = prefs.prefix;
    inpProd.value = prefs.product;
  });

  btnSave.addEventListener("click", () => {
    const prefix  = (inpPref.value || "").padStart(2, "0").slice(-2);
    const product = (inpProd.value || "").padStart(5, "0").slice(-5);
    chrome.storage.sync.set({ prefix, product }, () => {
      const old = btnSave.textContent;
      btnSave.textContent = "Guardado ✔";
      setTimeout(() => (btnSave.textContent = old), 1000);
    });
  });

  function execInActiveTab(fn) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id || !tab.url) return;

      // No inyectar en chrome://, edge://, about:, file://
      if (!/^https?:\/\//i.test(tab.url)) {
        alert("Abre el POS (http/https). No se puede inyectar en: " + tab.url);
        return;
      }

      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn });
    });
  }

  btnConnect.addEventListener("click", () => {
    execInActiveTab(() => {
      if (typeof window.connectScale === "function") window.connectScale();
      else console.warn("[POPUP] window.connectScale no existe");
    });
    btnConnect.disabled = true;
    btnDisc.disabled = false;
  });

  btnDisc.addEventListener("click", () => {
    execInActiveTab(() => {
      if (typeof window.disconnectScale === "function") window.disconnectScale();
      else console.warn("[POPUP] window.disconnectScale no existe");
    });
    btnDisc.disabled = true;
    btnConnect.disabled = false;
  });
});
