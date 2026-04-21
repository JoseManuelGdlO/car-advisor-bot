class ChatInterface {
  constructor() {
    this.messagesContainer = document.getElementById("chat-messages");
    this.userInput = document.getElementById("user-input");
    this.sendBtn = document.getElementById("send-btn");
    this.resetBtn = document.getElementById("reset-btn");
    this.typingIndicator = document.getElementById("typing-indicator");
    this.statusElement = document.getElementById("status");
    this.charCount = document.getElementById("char-count");
    this.quickOptions = document.getElementById("quick-options");

    this.userIdInput = document.getElementById("user-id");
    this.apiUrlInput = document.getElementById("api-url");

    this.currentNodeElement = document.getElementById("current-node");
    this.selectedCategoryElement = document.getElementById("selected-category");
    this.selectedCarElement = document.getElementById("selected-car");

    this.init();
  }

  init() {
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

    this.resetBtn.addEventListener("click", () => this.resetConversation());

    this.renderWelcomeMessage();
  }

  renderWelcomeMessage() {
    this.messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="avatar-large">🚘</div>
        <h2>Bienvenido a Car Advisor Bot</h2>
        <p>Cuéntame qué tipo de auto buscas y te ayudaré con recomendaciones.</p>
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

  getChatEndpoint() {
    const baseUrl = this.apiUrlInput.value.trim();
    return baseUrl ? `${baseUrl}/chat` : "/chat";
  }

  async sendMessage(prefilledMessage = null) {
    const text = (prefilledMessage ?? this.userInput.value).trim();
    const userId = this.userIdInput.value.trim();

    if (!userId) {
      alert("Ingresa un ID de usuario.");
      return;
    }

    if (!text) {
      return;
    }

    this.addMessage(text, "user");
    this.userInput.value = "";
    this.updateCharCount();
    this.autoResize();

    this.setInputState(false);
    this.showTyping();

    try {
      const response = await this.sendToAPI(text, userId);
      this.hideTyping();

      this.addMessage(response.reply || "Sin respuesta.", "bot");
      this.renderQuickOptions(Array.isArray(response.options) ? response.options : []);
      this.updateSessionInfo(response);

      this.statusElement.textContent = "En línea";
      this.statusElement.style.color = "#d1fae5";
    } catch (error) {
      this.hideTyping();
      this.addMessage(
        "No fue posible obtener respuesta del servidor. Verifica la API URL o inténtalo de nuevo.",
        "bot"
      );
      this.statusElement.textContent = "Desconectado";
      this.statusElement.style.color = "#fecaca";
    } finally {
      this.setInputState(true);
    }
  }

  async sendToAPI(message, userId) {
    const response = await fetch(this.getChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        message,
        platform: "web",
      }),
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
    this.currentNodeElement.textContent = data.current_node || "-";
    this.selectedCategoryElement.textContent = data.selected_category || "-";
    this.selectedCarElement.textContent = data.selected_car || "-";
  }

  resetConversation() {
    if (!confirm("¿Quieres limpiar la conversación actual?")) {
      return;
    }

    this.renderWelcomeMessage();
    this.quickOptions.innerHTML = "";
    this.currentNodeElement.textContent = "-";
    this.selectedCategoryElement.textContent = "-";
    this.selectedCarElement.textContent = "-";
    this.userInput.value = "";
    this.updateCharCount();
    this.autoResize();
  }

  addMessage(text, sender) {
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

    messageDiv.innerHTML = `
      <div class="message-content">
        ${formattedText}
        <div class="message-time">${time}</div>
      </div>
    `;

    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  renderQuickOptions(options) {
    this.quickOptions.innerHTML = "";

    if (!options.length) {
      return;
    }

    options.forEach((optionText) => {
      const button = document.createElement("button");
      button.className = "option-btn";
      button.type = "button";
      button.textContent = optionText;
      button.addEventListener("click", () => this.sendMessage(optionText));
      this.quickOptions.appendChild(button);
    });
  }

  formatText(text) {
    let formatted = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/_(.+?)_/g, "<em>$1</em>");
    return formatted;
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
