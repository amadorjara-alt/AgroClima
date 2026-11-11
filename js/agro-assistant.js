"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const client = window.supabaseClient;
  const panel = document.getElementById("assistantPanel");
  const toggle = document.getElementById("assistantToggle");
  const close = document.getElementById("assistantClose");
  const form = document.getElementById("assistantForm");
  const input = document.getElementById("assistantInput");
  const messagesNode = document.getElementById("assistantMessages");
  const suggestions = document.getElementById("assistantSuggestions");
  if (!panel || !toggle || !form || !input || !messagesNode) return;
  const history = [];
  let sending = false;

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus(); else toggle.focus();
  }
  function addMessage(text, role = "model", extraClass = "") {
    const node = document.createElement("div");
    node.className = `assistant-message${role === "user" ? " user" : ""}${extraClass ? ` ${extraClass}` : ""}`;
    node.textContent = text;
    messagesNode.append(node);
    messagesNode.scrollTop = messagesNode.scrollHeight;
    return node;
  }
  async function ask(question) {
    const text = question.trim();
    if (!text || sending || !client?.functions?.invoke) return;
    sending = true;
    input.value = "";
    addMessage(text, "user");
    history.push({ role: "user", text });
    if (history.length > 8) history.splice(0, history.length - 8);
    suggestions.hidden = true;
    const pending = addMessage("Estoy revisando tu consulta…", "model", "pending");
    form.querySelector("button[type=submit]").disabled = true;
    try {
      const { data, error } = await client.functions.invoke("agroclima-support", { body: { messages: history } });
      if (error) {
        let detail = error.message || "No se pudo conectar con el asistente.";
        try { const body = await error.context?.clone?.().json(); detail = body?.error || body?.message || detail; } catch { /* Usa el mensaje del SDK. */ }
        throw new Error(detail);
      }
      const reply = String(data?.reply || "No recibí una respuesta. Intenta de nuevo.").slice(0, 5000);
      pending.textContent = reply;
      pending.classList.remove("pending");
      history.push({ role: "model", text: reply });
      if (history.length > 8) history.splice(0, history.length - 8);
    } catch (error) {
      pending.textContent = `${error.message} Puedes revisar la pestaña Integraciones para configurar Gemini.`;
      pending.classList.remove("pending");
    } finally {
      sending = false;
      form.querySelector("button[type=submit]").disabled = false;
      input.focus();
    }
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.querySelectorAll("[data-assistant-open]").forEach(button => button.addEventListener("click", () => setOpen(true)));
  close?.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", event => { event.preventDefault(); ask(input.value); });
  suggestions?.querySelectorAll("button").forEach(button => button.addEventListener("click", () => ask(button.textContent)));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
});
