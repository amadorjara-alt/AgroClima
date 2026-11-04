"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  const app = window.CompraSmart;
  const client = app?.getSupabaseClient?.();
  const form = document.getElementById("resetPasswordForm");
  const message = document.getElementById("resetPasswordMessage");
  const button = document.getElementById("resetPasswordButton");
  const password = document.getElementById("newPassword");
  const confirm = document.getElementById("confirmNewPassword");
  const showMessage = (text, type = "info") => {
    if (!message) return;
    message.textContent = text;
    message.className = text ? `form-message ${type}` : "form-message";
  };
  document.querySelectorAll("[data-toggle-password]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const input = document.getElementById(toggle.dataset.togglePassword);
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      toggle.setAttribute("aria-label", reveal ? "Ocultar contraseña" : "Mostrar contraseña");
      toggle.setAttribute("aria-pressed", String(reveal));
      const icon = toggle.querySelector("i");
      icon?.classList.toggle("fa-eye", !reveal);
      icon?.classList.toggle("fa-eye-slash", reveal);
    });
  });
  if (!client || !form) {
    if (button) button.disabled = true;
    form?.addEventListener("submit", event => event.preventDefault());
    showMessage("No se pudo inicializar el servicio de autenticación.", "error");
    return;
  }
  button.disabled = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (password.value.length < 8) {
      showMessage("La contraseña debe tener al menos 8 caracteres.", "error");
      password.focus(); return;
    }
    if (password.value !== confirm.value) {
      showMessage("Las contraseñas no coinciden.", "error");
      confirm.focus(); return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Actualizando...";
    try {
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) throw error;
      showMessage("Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.", "success");
      form.reset();
      window.setTimeout(() => window.location.replace("login.html"), 1800);
    } catch (error) {
      console.error("Error al restablecer contraseña:", error);
      showMessage(error.message || "No se pudo actualizar la contraseña. Solicita un nuevo enlace.", "error");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = 'Actualizar contraseña <span aria-hidden="true">→</span>';
    }
  });
});
