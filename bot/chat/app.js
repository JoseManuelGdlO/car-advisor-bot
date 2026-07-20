// Vendedores para pruebas multi-tenant. Sustituye el UUID de B por un usuario real con catálogo en tu backend.
const CHAT_OWNERS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Catálogo A (demo local)",
  },
  {
    id: "bab219f0-9e32-4416-a4f5-a9790bbc1499",
    label: "Suzuki",
  },
  {
    id: "748dab00-e01e-4f82-a658-848cf630197e",
    label: "Delsy",
  },
];

// Incrementa cuando cambien ids o labels en CHAT_OWNERS para invalidar selección en caché.
const CHAT_OWNERS_REVISION = "2026-07-09-suzuki-delsy";
const OWNER_STORAGE_KEY = "chat_owner_user_id";
const OWNER_REVISION_STORAGE_KEY = "chat_owner_revision";

const TEST_AD_GREETING = "Hola!, Quiero más información";

/** Payload CTWA de prueba: Suzuki Swift Boostergreen 2026. */
const TEST_AD_CAMPAIGN_SWIFT = {
  message: TEST_AD_GREETING,
  ad_context: {
    isAd: true,
    title: "Suzuki Swift Boostergreen 2026",
    body: "Conoce el nuevo Swift Boostergreen 2026. Escríbenos para más información.",
    sourceId: "test-ad-swift-boostergreen-2026",
    sourceUrl: "https://fb.me/test-swift-boostergreen",
    sourceApp: "facebook",
    ctwaClid: "test-ctwa-clid-swift-boostergreen",
    mediaUrl: null,
    greetingMessageBody: TEST_AD_GREETING,
  },
};

/** Payload CTWA: Suzuki Dzire (vacaciones, seguro + placas). */
const TEST_AD_CAMPAIGN_DZIRE = {
  message: TEST_AD_GREETING,
  ad_context: {
    isAd: true,
    title: "Suzuki Durango ☀️🚗 Estas vacaciones viaja con comodidad",
    body:
      "☀️🚗 Estas vacaciones viaja con comodidad, ahorro y la emoción de estrenar.\n\n" +
      "Llévate tu Suzuki Dzire con increíbles beneficios:\n" +
      "🎁 Incluye:\n✅ 1 año de seguro\n✅ Placas gratis\n\n" +
      "Disfruta cada kilómetro con quien más quieres y haz de estas vacaciones un viaje inolvidable.\n\n" +
      "¡Te esperamos para que estrenes hoy mismo!\n\n" +
      "📍Suzuki Durango en nuestra nueva ubicación\n" +
      "Blvd. Francisco Villa 1727 Cd. Industrial, Guadalupe. 34220\n\n" +
      "Ponte en contacto con nosotros:\n📲(618) 119 8246\nó mándanos un inbox",
    sourceId: "test-ad-dzire-vacaciones",
    sourceUrl: "https://fb.me/test-dzire-vacaciones",
    sourceApp: "facebook",
    ctwaClid: "test-ctwa-clid-dzire-vacaciones",
    mediaUrl: null,
    greetingMessageBody: TEST_AD_GREETING,
  },
};

/** Payload CTWA: Suzuki Fronx BoosterGreen (vacaciones, desde $454,990). */
const TEST_AD_CAMPAIGN_FRONX = {
  message: TEST_AD_GREETING,
  ad_context: {
    isAd: true,
    title: "Suzuki Durango ☀️🏖️ Estas vacaciones estrena la aventura",
    body:
      "☀️🏖️ Estas vacaciones estrena la aventura que siempre has querido.\n\n" +
      "Con la Suzuki Fronx BoosterGreen, cada viaje comienza con más estilo, tecnología y eficiencia.\n\n" +
      "🚗 Precio desde $454,990\n" +
      "🎁 Además llévate:\n✅ 1 año de seguro\n✅ Tanque lleno\n✅ Placas gratis\n\n" +
      "Prepara las maletas, elige el destino… ¡nosotros te ayudamos con el resto!\n\n" +
      "➡️ Ven y estrena estas vacaciones:\n" +
      "📍Suzuki Durango en nuestra nueva ubicación\n" +
      "Blvd. Francisco Villa 1727 Cd. Industrial, Guadalupe. 34220\n\n" +
      "Ponte en contacto con nosotros:\n📲(618) 119 8246\nó mándanos un inbox",
    sourceId: "test-ad-fronx-boostergreen-vacaciones",
    sourceUrl: "https://fb.me/test-fronx-boostergreen",
    sourceApp: "facebook",
    ctwaClid: "test-ctwa-clid-fronx-boostergreen",
    mediaUrl: null,
    greetingMessageBody: TEST_AD_GREETING,
  },
};

/** Payload CTWA: Jimny 5-door (texto parcial de campaña). */
const TEST_AD_CAMPAIGN_JIMNY = {
  message: TEST_AD_GREETING,
  ad_context: {
    isAd: true,
    title: "Suzuki Jimny 5-door",
    body:
      "🚗🇲🇽🇯🇵  Hay aventuras que no se cuentan...\n" +
      "Se viven con JIMNY 5-door. 🤩🤘",
    sourceId: "test-ad-jimny-5door",
    sourceUrl: "https://fb.me/test-jimny-5door",
    sourceApp: "facebook",
    ctwaClid: "test-ctwa-clid-jimny-5door",
    mediaUrl: null,
    greetingMessageBody: TEST_AD_GREETING,
  },
};

/**
 * Payload CTWA: anuncio de servicio / taller (sin modelo de venta).
 * Útil para probar skip_no_vehicle_match.
 */
const TEST_AD_CAMPAIGN_SERVICIO = {
  message: TEST_AD_GREETING,
  ad_context: {
    isAd: true,
    title: "Suzuki Durango 🛠️✨ No lo pienses más",
    body:
      "Suzuki Durango 🛠️✨ No lo pienses más, dale a tu SUZUKI el cuidado que merece.\n \n" +
      "Agenda  tu servicio de mantenimiento \n" +
      "📲 618 158 7539\n" +
      "ó mándanos un inbox Te damos la bienvenida. Completa el siguiente formulario para registrarte.",
    sourceId: "test-ad-suzuki-servicio",
    sourceUrl: "https://fb.me/test-suzuki-servicio",
    sourceApp: "facebook",
    ctwaClid: "test-ctwa-clid-suzuki-servicio",
    mediaUrl: null,
    greetingMessageBody: TEST_AD_GREETING,
  },
};

const TEST_AD_CAMPAIGNS = {
  swift: TEST_AD_CAMPAIGN_SWIFT,
  dzire: TEST_AD_CAMPAIGN_DZIRE,
  fronx: TEST_AD_CAMPAIGN_FRONX,
  jimny: TEST_AD_CAMPAIGN_JIMNY,
  servicio: TEST_AD_CAMPAIGN_SERVICIO,
};

class ChatInterface {
  // python3 -m http.server 8090
  static BOT_MESSAGE_SEPARATOR = "<<BOT_MSG_BREAK>>";
  static MESSAGE_DEBOUNCE_MS = 6000;
  constructor() {
    this.messagesContainer = document.getElementById("chat-messages");
    this.userInput = document.getElementById("user-input");
    this.sendBtn = document.getElementById("send-btn");
    this.resetBtn = document.getElementById("reset-btn");
    this.simulateAdButtons = Array.from(
      document.querySelectorAll("[data-ad-campaign]")
    );
    this.typingIndicator = document.getElementById("typing-indicator");
    this.statusElement = document.getElementById("status");
    this.charCount = document.getElementById("char-count");

    this.userIdInput = document.getElementById("user-id");
    this.ownerSelect = document.getElementById("owner-user-id");
    this.ownerDisplay = document.getElementById("owner-display");
    this.apiUrlInput = document.getElementById("api-url");
    this.backendUrlInput = document.getElementById("backend-url");

    this.currentNodeElement = document.getElementById("current-node");
    this.selectedCarElement = document.getElementById("selected-car");
    this.financingPlanElement = document.getElementById("financing-plan");
    this.promotionElement = document.getElementById("promotion");

    this.previousOwnerId = null;
    this.armedAdContext = null;
    this.pendingMessages = [];
    this.pendingAdContext = null;
    this.debounceTimer = null;
    this.typingTimer = null;
    this.isFlushingMessages = false;
    this.init();
  }

  setStatus(text, color) {
    if (!this.statusElement) {
      return;
    }
    this.statusElement.textContent = text;
    this.statusElement.style.color = color;
  }

  init() {
    this.initOwnerSelector();

    this.sendBtn.addEventListener("click", () => this.sendMessage());
    this.userInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
    });

    this.userInput.addEventListener("input", () => {
      this.updateCharCount();
      this.autoResize();
    });

    this.resetBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.resetConversation();
    });

    for (const btn of this.simulateAdButtons) {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        const key = btn.getAttribute("data-ad-campaign");
        this.simulateAdCampaign(key);
      });
    }

    if (this.ownerSelect) {
      this.ownerSelect.addEventListener("change", () => {
        void this.onOwnerChange();
      });
    }

    this.renderWelcomeMessage();
  }

  initOwnerSelector() {
    if (!this.ownerSelect) {
      return;
    }

    this.ownerSelect.innerHTML = "";
    for (const owner of CHAT_OWNERS) {
      const option = document.createElement("option");
      option.value = owner.id;
      option.textContent = owner.label;
      this.ownerSelect.appendChild(option);
    }

    const storedRevision = localStorage.getItem(OWNER_REVISION_STORAGE_KEY);
    const storedOwnerId = localStorage.getItem(OWNER_STORAGE_KEY);
    const revisionMatches = storedRevision === CHAT_OWNERS_REVISION;
    const validStored =
      revisionMatches && CHAT_OWNERS.some((owner) => owner.id === storedOwnerId);
    if (validStored && storedOwnerId) {
      this.ownerSelect.value = storedOwnerId;
    } else if (CHAT_OWNERS.length) {
      this.ownerSelect.value = CHAT_OWNERS[0].id;
      localStorage.removeItem(OWNER_STORAGE_KEY);
    }
    localStorage.setItem(OWNER_REVISION_STORAGE_KEY, CHAT_OWNERS_REVISION);

    this.previousOwnerId = this.getOwnerUserId();
    this.updateOwnerDisplay();
  }

  getOwnerUserId() {
    if (!this.ownerSelect) {
      return "";
    }
    return String(this.ownerSelect.value || "").trim();
  }

  updateOwnerDisplay() {
    if (!this.ownerDisplay) {
      return;
    }
    const ownerId = this.getOwnerUserId();
    if (!ownerId) {
      this.ownerDisplay.textContent = "—";
      return;
    }
    const short =
      ownerId.length > 20 ? `${ownerId.slice(0, 8)}…${ownerId.slice(-4)}` : ownerId;
    this.ownerDisplay.textContent = short;
    this.ownerDisplay.title = ownerId;
  }

  persistOwnerSelection() {
    const ownerId = this.getOwnerUserId();
    if (ownerId) {
      localStorage.setItem(OWNER_STORAGE_KEY, ownerId);
      localStorage.setItem(OWNER_REVISION_STORAGE_KEY, CHAT_OWNERS_REVISION);
    }
    this.updateOwnerDisplay();
  }

  buildChatPayload(message, userId, adContext = null) {
    const payload = {
      user_id: userId,
      message,
      platform: "web",
      owner_user_id: this.getOwnerUserId(),
      persist_to_backend: true,
    };
    if (adContext && adContext.isAd === true) {
      payload.ad_context = adContext;
    }
    return payload;
  }

  simulateAdCampaign(campaignKey = "swift") {
    const campaign = TEST_AD_CAMPAIGNS[campaignKey] || TEST_AD_CAMPAIGN_SWIFT;
    // Solo prellena el mensaje y deja armado el contexto CTWA; se envía al presionar enviar.
    this.armedAdContext = campaign.ad_context;
    this.userInput.value = campaign.message;
    this.updateCharCount();
    this.autoResize();
    this.userInput.focus();
    const label = campaign.ad_context?.title || campaignKey;
    this.setStatus(`Campaña CTWA lista (${label}) — presiona enviar`, "#fde68a");
  }

  hasChatMessages() {
    return Boolean(this.messagesContainer?.querySelector(".message"));
  }

  clearSessionPanel() {
    if (this.currentNodeElement) {
      this.currentNodeElement.textContent = "-";
    }
    if (this.selectedCarElement) {
      this.selectedCarElement.textContent = "-";
    }
    if (this.financingPlanElement) {
      this.financingPlanElement.textContent = "-";
    }
    if (this.promotionElement) {
      this.promotionElement.textContent = "-";
    }
  }

  async onOwnerChange() {
    const newOwnerId = this.getOwnerUserId();
    const previousOwnerId = this.previousOwnerId;

    if (newOwnerId === previousOwnerId) {
      this.persistOwnerSelection();
      return;
    }

    if (this.hasChatMessages()) {
      const ok = confirm(
        "Al cambiar de vendedor se reinicia la sesión del bot para este teléfono. ¿Continuar?"
      );
      if (!ok) {
        this.ownerSelect.value = previousOwnerId || CHAT_OWNERS[0]?.id || "";
        this.updateOwnerDisplay();
        return;
      }
    }

    const userId = (this.userIdInput?.value || "").trim();
    if (userId) {
      this.setInputState(false);
      try {
        await this.resetSessionOnServer(userId, { skipConfirm: true });
      } catch (error) {
        const msg = error?.message || String(error);
        alert(`No se pudo reiniciar la sesión: ${msg}`);
        this.ownerSelect.value = previousOwnerId || CHAT_OWNERS[0]?.id || "";
        this.updateOwnerDisplay();
        this.setInputState(true);
        return;
      } finally {
        this.setInputState(true);
      }
    } else {
      this.renderWelcomeMessage();
      this.clearSessionPanel();
    }

    this.previousOwnerId = newOwnerId;
    this.persistOwnerSelection();
    this.setStatus("Vendedor cambiado — sesión reiniciada", "#d1fae5");
  }

  renderWelcomeMessage() {
    this.messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="avatar-large">🚘</div>
        <h2>Car Advisor Bot</h2>
        <p>Escribe un mensaje para comenzar la conversación.</p>
      </div>
    `;
  }

  updateCharCount() {
    const length = this.userInput.value.length;
    this.charCount.textContent = `${length}/500`;
  }

  autoResize() {
    this.userInput.style.height = "auto";
    this.userInput.style.height = `${this.userInput.scrollHeight}px`;
  }

  getApiBase() {
    if (!this.apiUrlInput) {
      return "";
    }
    return String(this.apiUrlInput.value || "").trim();
  }

  getBackendBase() {
    if (!this.backendUrlInput) {
      return "";
    }
    return String(this.backendUrlInput.value || "").trim();
  }

  getChatEndpoint() {
    const baseUrl = this.getApiBase();
    return baseUrl ? `${baseUrl}/chat` : "/chat";
  }

  getResetEndpoint() {
    const baseUrl = this.getApiBase();
    return baseUrl ? `${baseUrl}/reset` : "/reset";
  }

  async sendMessage(prefilledMessage = null, options = {}) {
    const text = (prefilledMessage ?? this.userInput.value).trim();
    const userId = this.userIdInput.value.trim();
    const armedAdContext = this.armedAdContext;
    const adContext = options.adContext || armedAdContext || null;
    const displayBadge = options.displayBadge || (armedAdContext ? "📢 Campaña CTWA" : null);

    if (!userId) {
      alert("Ingresa un ID de usuario.");
      return;
    }

    if (!this.getOwnerUserId()) {
      alert("Selecciona un vendedor (catálogo).");
      return;
    }

    if (!text) {
      return;
    }

    this.armedAdContext = null;
    this.addMessage(text, "user", { badge: displayBadge });
    this.userInput.value = "";
    this.updateCharCount();
    this.autoResize();
    this.userInput.focus();

    this.pendingMessages.push(text);
    if (adContext && this.pendingAdContext == null) {
      this.pendingAdContext = adContext;
    }
    this.scheduleMessageFlush(userId);
  }

  scheduleMessageFlush(userId) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }

    this.setStatus("Agrupando mensajes…", "#fde68a");
    this.typingTimer = setTimeout(() => this.showTyping(), 350);

    if (this.isFlushingMessages) {
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushPendingMessages(userId);
    }, ChatInterface.MESSAGE_DEBOUNCE_MS);
  }

  async flushPendingMessages(userId) {
    if (this.isFlushingMessages || !this.pendingMessages.length) {
      return;
    }

    const joinedMessage = this.pendingMessages.join("\n");
    const adContext = this.pendingAdContext;
    this.pendingMessages = [];
    this.pendingAdContext = null;
    this.isFlushingMessages = true;

    try {
      const response = await this.sendToAPI(joinedMessage, userId, adContext);

      if (response.bot_suppressed) {
        this.setStatus("Bot en pausa — mensaje registrado", "#fde68a");
      } else {
        this.addBotReplyBlocks(response.reply);
        this.setStatus(
          adContext ? "Campaña CTWA enviada — En línea" : "En línea",
          "#d1fae5"
        );
      }
      this.updateSessionInfo(response);
    } catch (error) {
      this.addMessage(
        "Lo sentimos, hubo un error inesperado, por favor espera un momento y vuelve a intentarlo.",
        "bot"
      );
      this.setStatus("Desconectado", "#fecaca");
    } finally {
      if (this.typingTimer) {
        clearTimeout(this.typingTimer);
        this.typingTimer = null;
      }
      this.hideTyping();
      this.isFlushingMessages = false;

      if (this.pendingMessages.length) {
        this.scheduleMessageFlush(userId);
      }
    }
  }

  async sendToAPI(message, userId, adContext = null) {
    const response = await fetch(this.getChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildChatPayload(message, userId, adContext)),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.detail) {
          detail = String(errorPayload.detail);
        }
      } catch (parseError) {
        // Ignora errores de parseo y usa detail por defecto.
      }
      throw new Error(detail);
    }

    return response.json();
  }

  updateSessionInfo(data) {
    if (this.currentNodeElement) {
      this.currentNodeElement.textContent = data.current_node || "-";
    }
    if (this.selectedCarElement) {
      this.selectedCarElement.textContent = data.selected_car || "-";
    }
    if (this.financingPlanElement) {
      this.financingPlanElement.textContent = data.financing_plan || "-";
    }
    if (this.promotionElement) {
      this.promotionElement.textContent = data.promotion || "-";
    }
  }

  async resetSessionOnServer(userId, { skipConfirm = false } = {}) {
    this.clearPendingMessages();
    const resetUrl = this.getResetEndpoint();
    const response = await fetch(resetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        platform: "web",
      }),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.detail) {
          detail = String(errorPayload.detail);
        } else if (errorPayload?.message) {
          detail = String(errorPayload.message);
        }
      } catch {
        // Ignora parseo y usa detail por defecto.
      }
      throw new Error(detail);
    }

    this.renderWelcomeMessage();
    this.clearSessionPanel();
    this.userInput.value = "";
    this.updateCharCount();
    this.autoResize();
    if (!skipConfirm) {
      this.setStatus("Sesión reiniciada", "#d1fae5");
    }
  }

  clearPendingMessages() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    this.pendingMessages = [];
    this.pendingAdContext = null;
    this.armedAdContext = null;
    this.hideTyping();
  }

  async resetConversation() {
    if (!confirm("¿Quieres limpiar la conversación actual?")) {
      return;
    }

    const userId = (this.userIdInput?.value || "").trim();
    if (!userId) {
      alert("Ingresa un ID de usuario para reiniciar la sesión en el servidor.");
      return;
    }

    this.setInputState(false);
    try {
      await this.resetSessionOnServer(userId);
    } catch (error) {
      const msg = error?.message || String(error);
      alert(
        `No se pudo reiniciar la sesión en el servidor: ${msg}. Comprueba la API URL y recarga la página (el navegador puede estar usando un app.js en caché).`
      );
      this.setStatus("Error al reiniciar", "#fecaca");
    } finally {
      this.setInputState(true);
    }
  }

  addMessage(text, sender, options = {}) {
    const welcomeMsg = this.messagesContainer.querySelector(".welcome-message");
    if (welcomeMsg) {
      welcomeMsg.remove();
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const time = new Date().toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const formattedText = this.formatText(text);
    const badge = options.badge
      ? `<div class="message-ad-badge">${this.escapeHtml(options.badge)}</div>`
      : "";

    messageDiv.innerHTML = `
      <div class="message-content">
        ${badge}
        ${formattedText}
        <div class="message-time">${time}</div>
      </div>
    `;

    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  addBotReplyBlocks(rawReply) {
    const normalized = String(rawReply || "").trim();
    if (!normalized) {
      this.addMessage("Sin respuesta.", "bot");
      return;
    }
    const blocks = normalized
      .split(ChatInterface.BOT_MESSAGE_SEPARATOR)
      .map((block) => block.trim())
      .filter(Boolean);
    if (!blocks.length) {
      this.addMessage(normalized, "bot");
      return;
    }
    blocks.forEach((block) => this.addMessage(block, "bot"));
  }

  formatText(text) {
    let formatted = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/_(.+?)_/g, "<em>$1</em>");
    formatted = this.renderInlineImages(formatted);
    return formatted;
  }

  renderInlineImages(formattedText) {
    const lines = String(formattedText || "").split("<br>");
    const imageLineRegex = /^\s*-?\s*((?:https?:\/\/[^\s<]+|\/uploads\/autobot\/[^\s<]+)\.(?:png|jpg|jpeg|gif|webp))\s*$/i;
    const processed = lines.map((line) => {
      const match = line.match(imageLineRegex);
      if (!match) return line;
      const rawPath = match[1];
      const baseUrl = this.getBackendBase() || this.getApiBase();
      const src = rawPath.startsWith("/") && baseUrl ? `${baseUrl}${rawPath}` : rawPath;
      return `<img src="${src}" alt="Imagen del vehiculo" class="chat-inline-image" loading="lazy">`;
    });
    return processed.join("<br>");
  }

  showTyping() {
    this.typingIndicator.style.display = "flex";
    this.scrollToBottom();
  }

  hideTyping() {
    this.typingIndicator.style.display = "none";
  }

  setInputState(enabled) {
    this.userInput.disabled = !enabled;
    this.sendBtn.disabled = !enabled;
    for (const btn of this.simulateAdButtons) {
      btn.disabled = !enabled;
    }

    if (enabled) {
      this.userInput.focus();
    }
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new ChatInterface();
});
