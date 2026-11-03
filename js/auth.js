/* ============================================================
   COMPRASMART AI
   Archivo: js/auth.js
   Autenticación, registro y recuperación de contraseña
   Supabase Auth
   ============================================================ */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // 1. CONFIGURACIÓN
    // ========================================================

    const $ = id => document.getElementById(id);

    const app = window.CompraSmart;

    const client =
        typeof app?.getSupabaseClient === "function"
            ? app.getSupabaseClient()
            : null;

    const loginForm = $("loginForm");
    const registerForm = $("registerForm");

    // Evita ejecutar operaciones sin conexión inicializada.
    if (!client || !client.auth) {

        console.error(
            "CompraSmart AI: cliente Supabase no disponible."
        );

        setMessage(
            $("loginMessage"),
            "No se pudo inicializar el servicio de autenticación. Revisa js/supabase.js.",
            "error"
        );

        setMessage(
            $("registerMessage"),
            "No se pudo inicializar el servicio de autenticación. Revisa js/supabase.js.",
            "error"
        );

        return;
    }


    // ========================================================
    // 2. MENSAJES
    // ========================================================

    function setMessage(element, message = "", type = "info") {

        if (!element) return;

        const validTypes = [
            "success",
            "error",
            "warning",
            "info"
        ];

        const selectedType = validTypes.includes(type)
            ? type
            : "info";

        element.textContent = message;

        element.className = message
            ? `form-message ${selectedType}`
            : "form-message";

        if (message) {

            element.setAttribute(
                "role",
                selectedType === "error" ? "alert" : "status"
            );

        }
    }


    // ========================================================
    // 3. ESTADO DE LOS BOTONES
    // ========================================================

    function setLoading(button, loading, defaultText) {

        if (!button) return;

        if (loading) {

            if (!button.dataset.originalHTML) {
                button.dataset.originalHTML =
                    button.innerHTML;
            }

            button.disabled = true;

            button.setAttribute(
                "aria-busy",
                "true"
            );

            button.textContent = "Procesando...";

        } else {

            button.disabled = false;

            button.setAttribute(
                "aria-busy",
                "false"
            );

            if (button.dataset.originalHTML) {

                button.innerHTML =
                    button.dataset.originalHTML;

                delete button.dataset.originalHTML;

            } else {

                button.textContent = defaultText;

            }
        }
    }


    // ========================================================
    // 4. TRADUCCIÓN DE ERRORES
    // ========================================================

    function getErrorMessage(error) {

        const message =
            String(error?.message || "").toLowerCase();

        if (
            message.includes("invalid login credentials") ||
            message.includes("invalid_credentials")
        ) {
            return "Correo electrónico o contraseña incorrectos.";
        }

        if (
            message.includes("already registered") ||
            message.includes("user already registered") ||
            message.includes("already exists")
        ) {
            return "Este correo electrónico ya está registrado.";
        }

        if (
            message.includes("password should be") ||
            message.includes("password is too short")
        ) {
            return "La contraseña no cumple los requisitos de seguridad.";
        }

        if (
            message.includes("email not confirmed") ||
            message.includes("email_not_confirmed")
        ) {
            return "Debes confirmar tu correo electrónico antes de ingresar.";
        }

        if (
            message.includes("rate limit") ||
            message.includes("too many requests")
        ) {
            return "Has realizado demasiados intentos. Espera unos minutos.";
        }

        if (
            message.includes("network") ||
            message.includes("fetch") ||
            message.includes("failed to fetch")
        ) {
            return "No se pudo conectar con el servidor. Comprueba tu conexión.";
        }

        if (
            message.includes("signup is disabled")
        ) {
            return "El registro de nuevas cuentas está deshabilitado.";
        }

        return "No se pudo completar la operación. Inténtalo nuevamente.";
    }


    // ========================================================
    // 5. VALIDACIÓN DE CORREO
    // ========================================================

    function isValidEmail(email) {

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }


    // ========================================================
    // 6. MOSTRAR Y OCULTAR CONTRASEÑAS
    // ========================================================

    function togglePassword(button, input) {

        if (!button || !input) return;

        const show = input.type === "password";

        input.type = show
            ? "text"
            : "password";

        button.setAttribute(
            "aria-label",
            show ? "Ocultar contraseña" : "Mostrar contraseña"
        );

        button.setAttribute(
            "aria-pressed",
            String(show)
        );

        const icon = button.querySelector("i");

        if (icon) {

            icon.classList.toggle("fa-eye", !show);

            icon.classList.toggle("fa-eye-slash", show);

        }
    }


    // Botón del formulario de inicio de sesión.
    const loginPasswordToggle = $("togglePassword");

    if (loginPasswordToggle) {

        loginPasswordToggle.addEventListener(
            "click",
            () => togglePassword(
                loginPasswordToggle,
                $("password")
            )
        );
    }


    // Botones del formulario de registro.
    document.querySelectorAll("[data-toggle-password]")
        .forEach(button => {

            button.addEventListener("click", () => {

                const input = $(
                    button.dataset.togglePassword
                );

                togglePassword(button, input);

            });

        });


    // ========================================================
    // 7. INICIO DE SESIÓN
    // ========================================================

    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const email = $("email");
                const password = $("password");
                const message = $("loginMessage");
                const button = $("loginButton");

                if (
                    !email ||
                    !password ||
                    !message ||
                    !button
                ) {

                    console.error(
                        "CompraSmart AI: faltan elementos del formulario de inicio de sesión."
                    );

                    return;
                }

                const emailValue =
                    email.value.trim();

                const passwordValue =
                    password.value;

                if (!emailValue || !passwordValue) {

                    setMessage(
                        message,
                        "Completa tu correo electrónico y contraseña.",
                        "error"
                    );

                    return;
                }

                if (!isValidEmail(emailValue)) {

                    setMessage(
                        message,
                        "Ingresa un correo electrónico válido.",
                        "error"
                    );

                    email.focus();

                    return;
                }

                setMessage(message);

                setLoading(
                    button,
                    true,
                    "Iniciar sesión"
                );

                try {

                    const { data, error } =
                        await client.auth.signInWithPassword({

                            email: emailValue,

                            password: passwordValue

                        });

                    if (error) {
                        throw error;
                    }

                    if (!data?.user || !data?.session) {

                        throw new Error(
                            "No se pudo establecer una sesión."
                        );
                    }

                    setMessage(
                        message,
                        "Inicio de sesión correcto. Redirigiendo...",
                        "success"
                    );

                    window.location.replace(
                        "dashboard.html"
                    );

                } catch (error) {

                    console.error(
                        "CompraSmart AI: error de inicio de sesión:",
                        error?.message || error
                    );

                    setMessage(
                        message,
                        getErrorMessage(error),
                        "error"
                    );

                    setLoading(
                        button,
                        false,
                        "Iniciar sesión"
                    );
                }
            }
        );
    }


    // ========================================================
    // 8. RECUPERACIÓN DE CONTRASEÑA
    // ========================================================

    const forgotPasswordButton =
        $("forgotPasswordButton");

    if (forgotPasswordButton) {

        forgotPasswordButton.addEventListener(
            "click",
            async () => {

                const email = $("email");
                const message = $("loginMessage");

                if (!email || !message) return;

                const emailValue =
                    email.value.trim();

                if (!isValidEmail(emailValue)) {

                    setMessage(
                        message,
                        "Primero introduce un correo electrónico válido.",
                        "error"
                    );

                    email.focus();

                    return;
                }

                forgotPasswordButton.disabled = true;

                try {

                    const redirectURL = new URL(
                        "reset-password.html",
                        window.location.href
                    ).href;

                    const { error } =
                        await client.auth.resetPasswordForEmail(
                            emailValue,
                            {
                                redirectTo: redirectURL
                            }
                        );

                    if (error) {
                        throw error;
                    }

                    setMessage(
                        message,
                        "Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.",
                        "success"
                    );

                } catch (error) {

                    console.error(
                        "CompraSmart AI: error de recuperación:",
                        error?.message || error
                    );

                    setMessage(
                        message,
                        getErrorMessage(error),
                        "error"
                    );

                } finally {

                    forgotPasswordButton.disabled = false;

                }
            }
        );
    }


    // ========================================================
    // 9. REGISTRO DE CUENTA
    // ========================================================

    if (registerForm) {

        registerForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const businessName = $("businessName");
                const ownerName = $("ownerName");
                const email = $("registerEmail");
                const password = $("registerPassword");
                const confirmPassword = $("confirmPassword");
                const acceptTerms = $("acceptTerms");
                const message = $("registerMessage");
                const button = $("registerButton");

                if (
                    !businessName ||
                    !ownerName ||
                    !email ||
                    !password ||
                    !confirmPassword ||
                    !acceptTerms ||
                    !message ||
                    !button
                ) {

                    console.error(
                        "CompraSmart AI: faltan elementos del formulario de registro."
                    );

                    return;
                }

                const business = businessName.value.trim();

                const owner = ownerName.value.trim();

                const emailValue = email.value.trim();

                const passwordValue = password.value;

                const confirmValue = confirmPassword.value;


                // Validar campos.
                if (
                    !business ||
                    !owner ||
                    !emailValue ||
                    !passwordValue ||
                    !confirmValue
                ) {

                    setMessage(
                        message,
                        "Completa todos los campos obligatorios.",
                        "error"
                    );

                    return;
                }


                // Validar correo.
                if (!isValidEmail(emailValue)) {

                    setMessage(
                        message,
                        "Ingresa un correo electrónico válido.",
                        "error"
                    );

                    email.focus();

                    return;
                }


                // Validar contraseña.
                if (passwordValue.length < 8) {

                    setMessage(
                        message,
                        "La contraseña debe tener al menos 8 caracteres.",
                        "error"
                    );

                    password.focus();

                    return;
                }


                // Confirmar contraseña.
                if (passwordValue !== confirmValue) {

                    setMessage(
                        message,
                        "Las contraseñas no coinciden.",
                        "error"
                    );

                    confirmPassword.focus();

                    return;
                }


                // Aceptación de condiciones.
                if (!acceptTerms.checked) {

                    setMessage(
                        message,
                        "Debes aceptar las condiciones de uso.",
                        "error"
                    );

                    return;
                }


                setMessage(message);

                setLoading(
                    button,
                    true,
                    "Crear mi cuenta"
                );


                try {

                    const { data, error } =
                        await client.auth.signUp({

                            email: emailValue,

                            password: passwordValue,

                            options: {

                                data: {

                                    business_name: business,

                                    owner_name: owner

                                }

                            }

                        });

                    if (error) {
                        throw error;
                    }


                    // Comprobar respuesta del registro.
                    if (!data?.user) {

                        throw new Error(
                            "No se recibió la información de la cuenta."
                        );
                    }


                    // Registro con sesión inmediata.
                    if (data.session) {

                        setMessage(
                            message,
                            "Tu cuenta fue creada correctamente. Redirigiendo...",
                            "success"
                        );

                        window.location.replace(
                            "dashboard.html"
                        );

                        return;
                    }


                    // Registro que requiere confirmación por correo.
                    setMessage(
                        message,
                        "Tu cuenta fue creada. Revisa tu correo electrónico y confirma tu dirección antes de iniciar sesión.",
                        "success"
                    );

                    registerForm.reset();

                    setLoading(
                        button,
                        false,
                        "Crear mi cuenta"
                    );

                } catch (error) {

                    console.error(
                        "CompraSmart AI: error de registro:",
                        error?.message || error
                    );

                    setMessage(
                        message,
                        getErrorMessage(error),
                        "error"
                    );

                    setLoading(
                        button,
                        false,
                        "Crear mi cuenta"
                    );
                }
            }
        );
    }


    // ========================================================
    // 10. COMPROBAR SESIÓN
    // ========================================================

    const currentPage =
        window.location.pathname.toLowerCase();

    const isAuthPage =
        currentPage.endsWith("login.html") ||
        currentPage.endsWith("register.html");

    if (isAuthPage) {

        client.auth.getSession()
            .then(({ data, error }) => {

                if (error) {

                    console.error(
                        "CompraSmart AI: no se pudo comprobar la sesión:",
                        error.message
                    );

                    return;
                }

                if (data?.session) {

                    window.location.replace(
                        "dashboard.html"
                    );
                }
            })
            .catch(error => {

                console.error(
                    "CompraSmart AI: error al comprobar la sesión:",
                    error?.message || error
                );

            });
    }


    // ========================================================
    // 11. EVENTOS DE AUTENTICACIÓN
    // ========================================================

    client.auth.onAuthStateChange((event) => {

        if (event === "SIGNED_OUT") {

            console.info(
                "CompraSmart AI: sesión cerrada."
            );

        }

    });


    // ========================================================
    // 12. INICIALIZACIÓN
    // ========================================================

    console.info(
        "CompraSmart AI: módulo de autenticación inicializado correctamente."
    );

});


