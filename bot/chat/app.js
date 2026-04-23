class ChatInterface {
  constructor() {
    this.messagesContainer = document.getElementById("chat-messages");
    this.userInput = document.getElementById("user-input");
    this.sendBtn = document.getElementById("send-btn");
    this.resetBtn = document.getElementById("reset-btn");
    this.typingIndicator = document.getElementById("typing-indicator");
    this.statusElement = document.getElementById("status");
    this.charCount = document.getElementById("char-count");

    this.userIdInput = document.getElementById("user-id");
    this.apiUrlInput = document.getElementById("api-url");

    this.currentNodeElement = document.getElementById("current-node");
    this.selectedCarElement = document.getElementById("selected-car");

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

  getApiBase() {
    if (!this.apiUrlInput) {
      return "";
    }
    return String(this.apiUrlInput.value || "").trim();
  }

  getChatEndpoint() {
    const baseUrl = this.getApiBase();
    return baseUrl ? `${baseUrl}/chat` : "/chat";
  }

  getResetEndpoint() {
    const baseUrl = this.getApiBase();
    return baseUrl ? `${baseUrl}/reset` : "/reset";
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
      this.updateSessionInfo(response);

      this.setStatus("En línea", "#d1fae5");
    } catch (error) {
      this.hideTyping();
      this.addMessage(
        "No fue posible obtener respuesta del servidor. Verifica la API URL o inténtalo de nuevo.",
        "bot"
      );
      this.setStatus("Desconectado", "#fecaca");
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
    if (this.currentNodeElement) {
      this.currentNodeElement.textContent = data.current_node || "-";
    }
    if (this.selectedCarElement) {
      this.selectedCarElement.textContent = data.selected_car || "-";
    }
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

    const resetUrl = this.getResetEndpoint();
    this.setInputState(false);
    try {
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
      if (this.currentNodeElement) {
        this.currentNodeElement.textContent = "-";
      }
      if (this.selectedCarElement) {
        this.selectedCarElement.textContent = "-";
      }
      this.userInput.value = "";
      this.updateCharCount();
      this.autoResize();
      this.setStatus("Sesión reiniciada", "#d1fae5");
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
