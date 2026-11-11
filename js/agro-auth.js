"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const client = window.supabaseClient;
  if (!client) return;

  const $ = id => document.getElementById(id);
  const report = (node, text, isError = false) => {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("error", isError);
  };
  const clearLocalSession = async () => {
    if (typeof window.agroSignOutLocal === "function") return window.agroSignOutLocal();
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (!error) return true;
    } catch { /* Se intenta limpiar el almacenamiento local como respaldo. */ }
    try {
      localStorage.removeItem("sb-fledooqwmwrjufeihoqn-auth-token");
      try { sessionStorage.removeItem("sb-fledooqwmwrjufeihoqn-auth-token"); } catch { /* No siempre está disponible. */ }
      return true;
    } catch { return false; }
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

  const query = new URLSearchParams(location.search);
  if (query.get("logout") === "1") {
    report($("confirmationNotice"), "Sesión cerrada. Puedes iniciar sesión con otra cuenta.");
  } else if (query.get("confirm") === "1") {
    report($("confirmationNotice"), "Confirma tu correo desde el enlace que enviamos antes de acceder.", true);
  } else if (query.get("reason") === "expired") {
    report($("confirmationNotice"), "Tu sesión venció. Inicia sesión de nuevo.", true);
  }

  const callback = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (callback.get("type") === "signup") {
    report($("confirmationNotice"), "Correo confirmado. Ahora inicia sesión con tu cuenta.");
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  // Nunca se usa una sesión guardada en el navegador como permiso para saltar al panel.
  // Se valida con Auth y se limpia si pertenece a una cuenta eliminada o sin confirmar.
  try {
    const { data: { session } = {} } = await client.auth.getSession();
    if (session) {
      const { data, error } = await client.auth.getUser();
      const user = data?.user;
      if (error || !user) {
        await clearLocalSession();
      } else if (user.email && !user.email_confirmed_at) {
        await clearLocalSession();
        if (!query.has("logout")) report($("confirmationNotice"), "Confirma tu correo desde el enlace que enviamos antes de acceder.", true);
      }
    }
  } catch {
    // Un error de red no debe enviar al usuario al panel ni ocultar el formulario.
  }

  document.querySelectorAll("[data-google-auth]").forEach(button => button.addEventListener("click", async () => {
    const messageNode = $("loginMessage") || $("registerMessage");
    const label = button.querySelector("span");
    const originalLabel = label?.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Conectando con Google…";
    try {
      const redirectTo = new URL("dashboard.html", location.href).href;
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) throw error;
    } catch {
      report(messageNode, "No se pudo iniciar sesión con Google. Inténtalo de nuevo.", true);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (label) label.textContent = originalLabel;
    }
  }));

  const login = $("loginForm");
  if (login) login.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("loginButton");
    button.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("password").value
      });
      if (error) {
        if (/email not confirmed|email_not_confirmed|confirm your email/i.test(error.message || "")) {
          throw new Error("Confirma tu correo desde el enlace que enviamos antes de iniciar sesión.");
        }
        throw error;
      }
      if (data?.user?.email && !data.user.email_confirmed_at) {
        await clearLocalSession();
        throw new Error("Confirma tu correo desde el enlace que enviamos antes de iniciar sesión.");
      }
      if (!data?.session || !data?.user) throw new Error("No se pudo validar la sesión. Inténtalo de nuevo.");
      location.replace("dashboard.html");
    } catch (error) {
      const errorText = error?.message || "No se pudo iniciar sesión. Inténtalo de nuevo.";
      report($("loginMessage"), /invalid login|invalid credentials/i.test(errorText) ? "Correo o contraseña incorrectos." : errorText, true);
      button.disabled = false;
    }
  });

  const register = $("registerForm");
  if (register) register.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("registerButton");
    button.disabled = true;
    try {
      if ($("registerPassword").value !== $("confirmPassword").value) throw new Error("Las contraseñas no coinciden.");

      // El registro por correo siempre termina en la pantalla de confirmación,
      // aunque el navegador conservara una sesión anterior.
      const { data: { session: previousSession } = {} } = await client.auth.getSession();
      if (previousSession && !(await clearLocalSession())) {
        throw new Error("No se pudo limpiar la sesión anterior. Recarga esta página e inténtalo otra vez.");
      }

      const { data, error } = await client.auth.signUp({
        email: $("registerEmail").value.trim(),
        password: $("registerPassword").value,
        options: { emailRedirectTo: new URL("login.html", location.href).href }
      });
      if (error) throw error;
      if (!data?.user) throw new Error("No se pudo crear la cuenta. Inténtalo de nuevo.");
      if (data.session) await clearLocalSession();

      register.reset();
      report($("registerMessage"), data.user.email_confirmed_at
        ? "El correo ya está confirmado. Ahora puedes iniciar sesión."
        : "Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.");
    } catch (error) {
      report($("registerMessage"), error?.message || "No se pudo crear la cuenta. Inténtalo de nuevo.", true);
    } finally {
      button.disabled = false;
    }
  });

  const recovery = $("recoveryForm");
  if (recovery) recovery.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("recoveryButton");
    button.disabled = true;
    try {
      const redirectTo = new URL("reset-password.html", location.href).href;
      const { error } = await client.auth.resetPasswordForEmail($("recoveryEmail").value.trim(), { redirectTo });
      if (error) throw error;
      report($("recoveryMessage"), "Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.");
      recovery.reset();
    } catch (error) {
      report($("recoveryMessage"), error?.message || "No se pudo enviar el enlace.", true);
    } finally { button.disabled = false; }
  });

  const reset = $("resetPasswordForm");
  if (reset) reset.addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("resetPasswordButton");
    button.disabled = true;
    try {
      if ($("newPassword").value !== $("confirmNewPassword").value) throw new Error("Las contraseñas no coinciden.");
      const { error } = await client.auth.updateUser({ password: $("newPassword").value });
      if (error) throw error;
      report($("resetPasswordMessage"), "Contraseña actualizada. Ya puedes iniciar sesión.");
      reset.reset();
    } catch (error) {
      report($("resetPasswordMessage"), error?.message || "No se pudo actualizar la contraseña.", true);
    } finally { button.disabled = false; }
  });
});
