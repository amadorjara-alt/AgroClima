"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  const client = window.supabaseClient;
  if (!client) return;
  const $ = id => document.getElementById(id);
  const message = (node, value, error = false) => {
    if (!node) return;
    node.textContent = value;
    node.classList.toggle("error", error);
  };
  document.querySelectorAll("[data-toggle-password]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const input = $(toggle.dataset.togglePassword);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      toggle.setAttribute("aria-pressed", String(!visible));
      toggle.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
      toggle.classList.toggle("is-visible", !visible);
    });
  });
  try {
    const { data: { session } } = await client.auth.getSession();
    if (session && /(?:login|register)\.html$/.test(location.pathname)) {
      location.replace("dashboard.html");
      return;
    }
  } catch { /* Las operaciones siguientes informan el error de autenticación. */ }
  if (new URLSearchParams(location.search).get("confirm") === "1") {
    message($("confirmationNotice"), "Confirma tu correo antes de acceder al panel.", true);
  }

  const login = $("loginForm");
  document.querySelectorAll("[data-google-auth]").forEach(button => button.addEventListener("click", async () => {
    const messageNode = $("loginMessage") || $("registerMessage");
    const label = button.querySelector("span");
    const originalLabel = label?.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Conectando con Google…";
    try {
      const redirectTo = new URL("dashboard.html", location.href).href;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (error) {
      message(messageNode, "No se pudo iniciar sesión con Google. Inténtalo de nuevo.", true);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (label) label.textContent = originalLabel;
    }
  }));

  if (login) login.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("loginButton"); button.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
      if (error) {
        if (/email not confirmed|email_not_confirmed|confirm your email/i.test(error.message || "")) throw new Error("Confirma tu correo desde el enlace que enviamos antes de iniciar sesión.");
        throw error;
      }
      if (!data?.user?.email_confirmed_at) {
        await client.auth.signOut();
        throw new Error("Confirma tu correo desde el enlace que enviamos antes de iniciar sesión.");
      }
      if (!data?.session) throw new Error("No se pudo establecer la sesión.");
      location.replace("dashboard.html");
    } catch (error) {
      message($("loginMessage"), error.message.includes("Invalid login") ? "Correo o contraseña incorrectos." : error.message, true);
      button.disabled = false;
    }
  });

  const register = $("registerForm");
  if (register) register.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("registerButton"); button.disabled = true;
    try {
      if ($("registerPassword").value !== $("confirmPassword").value) throw new Error("Las contraseñas no coinciden.");
      const { data, error } = await client.auth.signUp({
        email: $("registerEmail").value.trim(),
        password: $("registerPassword").value,
        options: { emailRedirectTo: new URL("login.html", location.href).href }
      });
      if (error) throw error;
      if (data.session && data.user?.email_confirmed_at) location.replace("dashboard.html");
      else {
        if (data.session) await client.auth.signOut();
        message($("registerMessage"), "Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.");
        register.reset(); button.disabled = false;
      }
    } catch (error) {
      message($("registerMessage"), error.message, true); button.disabled = false;
    }
  });

  const recovery = $("recoveryForm");
  if (recovery) recovery.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("recoveryButton"); button.disabled = true;
    try {
      const redirectTo = new URL("reset-password.html", location.href).href;
      const { error } = await client.auth.resetPasswordForEmail($("recoveryEmail").value.trim(), { redirectTo });
      if (error) throw error;
      message($("recoveryMessage"), "Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.");
      recovery.reset();
    } catch (error) {
      message($("recoveryMessage"), error.message, true);
    } finally { button.disabled = false; }
  });

  const reset = $("resetPasswordForm");
  if (reset) reset.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("resetPasswordButton"); button.disabled = true;
    try {
      if ($("newPassword").value !== $("confirmNewPassword").value) throw new Error("Las contraseñas no coinciden.");
      const { error } = await client.auth.updateUser({ password: $("newPassword").value });
      if (error) throw error;
      message($("resetPasswordMessage"), "Contraseña actualizada. Ya puedes iniciar sesión.");
      reset.reset();
    } catch (error) {
      message($("resetPasswordMessage"), error.message, true);
    } finally { button.disabled = false; }
  });
});

