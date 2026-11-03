
/* ============================================================
   COMPRASMART AI
   Archivo: js/integrations.js
   Centro de integraciones y gestión segura de proveedores
   ============================================================ */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // 1. CONFIGURACIÓN
    // ========================================================

    const app = window.CompraSmart || null;
    const $ = id => document.getElementById(id);

    const elements = {
        modal: $("integrationModal"),
        form: $("integrationForm"),
        modalTitle: $("modalTitle"),
        modalDescription: $("modalDescription"),
        provider: $("providerId"),
        apiKey: $("apiKey"),
        model: $("modelName"),
        toggleKey: $("toggleApiKey"),
        saveButton: $("saveIntegration"),
        message: $("modalMessage"),
        closeButton: $("closeModal"),
        cancelButton: $("cancelModal"),
        backdrop: $("modalBackdrop"),
        sidebar: $("sidebar"),
        mobileButton: $("mobileMenuButton"),
        profileAvatar: $("profileAvatar"),
        profileOwnerName: $("profileOwnerName"),
        profileBusinessName: $("profileBusinessName")
    };

    const requiredElements = [
        "modal",
        "form",
        "provider",
        "apiKey",
        "saveButton",
        "message"
    ];

    const missingElements = requiredElements.filter(
        key => !elements[key]
    );

    if (missingElements.length) {
        console.error(
            "CompraSmart AI: faltan elementos HTML:",
            missingElements
        );
        return;
    }


    // ========================================================
    // 2. CLIENTE SUPABASE
    // ========================================================

    function getSupabaseClient() {

        // Primera opción: cliente global.
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        // Segunda opción: cliente proporcionado por la aplicación.
        if (app && typeof app.getSupabaseClient === "function") {
            return app.getSupabaseClient();
        }

        return null;
    }


    // ========================================================
    // 3. PROVEEDORES
    // ========================================================

    const providers = Object.freeze({
        gemini: {
            name: "Google Gemini",
            description:
                "Conecta los modelos de inteligencia artificial de Google.",
            model: "gemini-2.5-flash"
        },

        openai: {
            name: "OpenAI",
            description:
                "Conecta los modelos de inteligencia artificial de OpenAI.",
            model: "gpt-5"
        },

        serpapi: {
            name: "SerpApi",
            description:
                "Configura el servicio de búsqueda de información en Internet.",
            model: "Google Search"
        },

        firecrawl: {
            name: "Firecrawl",
            description:
                "Configura la extracción y recopilación de contenido web.",
            model: "Web Scraping"
        }
    });


    // ========================================================
    // 4. ESTADOS
    // ========================================================

    const integrationStates = {};

    Object.keys(providers).forEach(id => {
        integrationStates[id] = "pending";
    });


    // ========================================================
    // 5. ESTADÍSTICAS
    // ========================================================

    const stats = {
        total: $("totalIntegrations"),
        configured: $("configuredIntegrations"),
        pending: $("pendingIntegrations")
    };

    function updateStatistics() {

        const total = Object.keys(providers).length;

        const configured = Object.values(integrationStates)
            .filter(state => state === "verified").length;

        const pending = total - configured;

        if (stats.total) {
            stats.total.textContent = String(total);
        }

        if (stats.configured) {
            stats.configured.textContent = String(configured);
        }

        if (stats.pending) {
            stats.pending.textContent = String(pending);
        }
    }


    // ========================================================
    // 6. NOTIFICACIONES
    // ========================================================

    function notify(message, type = "info") {

        if (app && typeof app.showToast === "function") {
            app.showToast(message, type);
        } else {
            console.info("CompraSmart AI:", message);
        }
    }


    // ========================================================
    // 7. MENSAJES
    // ========================================================

    function showModalMessage(message, type = "info") {

        const validTypes = [
            "success",
            "error",
            "warning",
            "info"
        ];

        const selectedType = validTypes.includes(type)
            ? type
            : "info";

        elements.message.textContent = message;
        elements.message.className =
            `integration-message ${selectedType}`;

        elements.message.classList.remove("hidden");

        elements.message.setAttribute(
            "role",
            selectedType === "error" ? "alert" : "status"
        );
    }

    function clearModalMessage() {

        elements.message.textContent = "";
        elements.message.className =
            "integration-message hidden";
    }


    // ========================================================
    // 8. ESTADOS DE LOS PROVEEDORES
    // ========================================================

    function updateProviderStatus(
        providerId,
        state,
        message = ""
    ) {

        if (!providers[providerId]) {
            return false;
        }

        const validStates = [
            "pending",
            "verified",
            "error"
        ];

        if (!validStates.includes(state)) {
            return false;
        }

        // Actualizar primero el estado interno.
        integrationStates[providerId] = state;

        const statusElement = $(`status-${providerId}`);

        if (statusElement) {

            statusElement.className = "status";

            if (state === "verified") {
                statusElement.classList.add("verified");
                statusElement.textContent =
                    message || "Conexión verificada";

            } else if (state === "error") {
                statusElement.classList.add("error");
                statusElement.textContent =
                    message || "Error de conexión";

            } else {
                statusElement.classList.add("pending");
                statusElement.textContent =
                    message || "Pendiente de configuración";
            }
        }

        updateStatistics();

        return true;
    }


    // ========================================================
    // 9. MODAL
    // ========================================================

    let previousFocusedElement = null;
    let previousBodyOverflow = "";

    function openModal(providerId) {

        const provider = providers[providerId];

        if (!provider) {
            notify("Proveedor no válido.", "error");
            return;
        }

        previousFocusedElement = document.activeElement;
        previousBodyOverflow = document.body.style.overflow;

        elements.form.reset();
        clearModalMessage();

        if (elements.modalTitle) {
            elements.modalTitle.textContent = provider.name;
        }

        if (elements.modalDescription) {
            elements.modalDescription.textContent =
                provider.description;
        }

        elements.provider.value = providerId;

        if (elements.model) {
            elements.model.value = provider.model;
        }

        elements.apiKey.type = "password";

        if (elements.toggleKey) {
            elements.toggleKey.setAttribute(
                "aria-pressed",
                "false"
            );

            elements.toggleKey.setAttribute(
                "aria-label",
                "Mostrar clave API"
            );

            const icon = elements.toggleKey.querySelector("i");

            if (icon) {
                icon.classList.add("fa-eye");
                icon.classList.remove("fa-eye-slash");
            }
        }

        elements.modal.classList.remove("hidden");
        elements.modal.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        window.requestAnimationFrame(() => {
            elements.apiKey.focus();
        });
    }

    function closeModal() {

        elements.modal.classList.add("hidden");
        elements.modal.setAttribute("aria-hidden", "true");

        elements.form.reset();
        clearModalMessage();

        elements.apiKey.type = "password";

        document.body.style.overflow = previousBodyOverflow;

        if (elements.toggleKey) {
            elements.toggleKey.setAttribute(
                "aria-pressed",
                "false"
            );
        }

        if (
            previousFocusedElement &&
            typeof previousFocusedElement.focus === "function"
        ) {
            previousFocusedElement.focus();
        }

        previousFocusedElement = null;
    }


    // ========================================================
    // 10. EVENTOS DE PROVEEDORES
    // ========================================================

    document.querySelectorAll("[data-integration]")
        .forEach(button => {

            button.addEventListener("click", () => {
                openModal(button.dataset.integration);
            });

        });


    // ========================================================
    // 11. CERRAR MODAL
    // ========================================================

    elements.closeButton?.addEventListener(
        "click",
        closeModal
    );

    elements.cancelButton?.addEventListener(
        "click",
        closeModal
    );

    elements.backdrop?.addEventListener(
        "click",
        closeModal
    );


    // ========================================================
    // 12. MOSTRAR / OCULTAR CLAVE
    // ========================================================

    elements.toggleKey?.addEventListener("click", () => {

        const visible = elements.apiKey.type === "text";

        elements.apiKey.type = visible ? "password" : "text";

        elements.toggleKey.setAttribute(
            "aria-pressed",
            String(!visible)
        );

        elements.toggleKey.setAttribute(
            "aria-label",
            visible ? "Mostrar clave API" : "Ocultar clave API"
        );

        const icon = elements.toggleKey.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-eye", visible);
            icon.classList.toggle("fa-eye-slash", !visible);
        }
    });


    // ========================================================
    // 13. VALIDACIÓN
    // ========================================================

    function validateForm() {

        const providerId = elements.provider.value;
        const apiKey = elements.apiKey.value.trim();

        if (!providers[providerId]) {
            return "Selecciona un proveedor válido.";
        }

        if (!apiKey) {
            return "Introduce la clave API del proveedor.";
        }

        if (apiKey.length < 8) {
            return "La clave API introducida es demasiado corta.";
        }

        if (apiKey.length > 4096) {
            return "La clave API supera la longitud permitida.";
        }

        return null;
    }


    // ========================================================
    // 14. COMUNICACIÓN CON LA BÓVEDA SEGURA
    // ========================================================

    async function invokeCredentialVault(payload) {

        const client = getSupabaseClient();

        if (!client?.auth || !client?.functions?.invoke) {
            throw new Error(
                "Supabase no está inicializado correctamente."
            );
        }

        // Recuperar la sesión actual.
        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) {
            throw new Error(
                "No se pudo recuperar tu sesión de usuario."
            );
        }

        const session = sessionData?.session;

        if (!session?.access_token) {
            throw new Error(
                "No hay una sesión activa. Inicia sesión nuevamente."
            );
        }

        // Enviar la operación al servidor.
        const { data, error } = await client.functions.invoke(
            "manage-integration",
            {
                body: payload,
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            }
        );

        if (error) {

            let detail =
                error.message ||
                "Error al comunicarse con el servidor seguro.";

            try {
                if (error.context?.json) {
                    const responseBody = await error.context.json();

                    if (responseBody?.error) {
                        detail = responseBody.error;
                    }
                }
            } catch (_) {
                // Mantener el mensaje original.
            }

            throw new Error(detail);
        }

        if (!data?.success) {
            throw new Error(
                data?.error ||
                "El servidor no confirmó la operación."
            );
        }

        return data;
    }


    // ========================================================
    // 15. RECUPERAR INTEGRACIONES GUARDADAS
    // ========================================================

    let loadingIntegrations = false;

    async function loadSavedIntegrations() {

        if (loadingIntegrations) {
            return;
        }

        loadingIntegrations = true;

        try {

            const result = await invokeCredentialVault({
                action: "list"
            });

            const saved = Array.isArray(result.integrations)
                ? result.integrations
                : [];

            // Identificar los proveedores guardados.
            const savedProviders = new Set(
                saved.map(item => item.provider)
            );

            Object.keys(providers).forEach(providerId => {

                if (savedProviders.has(providerId)) {

                    updateProviderStatus(
                        providerId,
                        "verified",
                        "Guardada de forma segura"
                    );

                } else {

                    updateProviderStatus(
                        providerId,
                        "pending",
                        "Pendiente de configuración"
                    );
                }
            });

            console.info(
                "CompraSmart AI: integraciones recuperadas:",
                saved.length
            );

        } catch (error) {

            console.error(
                "CompraSmart AI: error al recuperar integraciones:",
                error
            );

            Object.keys(providers).forEach(providerId => {
                updateProviderStatus(
                    providerId,
                    "pending",
                    "No se pudo verificar"
                );
            });

            notify(
                error.message || "No se pudieron recuperar las integraciones.",
                "error"
            );

        } finally {
            loadingIntegrations = false;
        }
    }


    // ========================================================
    // 16. GUARDAR INTEGRACIÓN
    // ========================================================

    async function saveIntegrationSecurely() {

        const providerId = elements.provider.value;
        const apiKey = elements.apiKey.value.trim();

        const model = elements.model?.value.trim() ||
            providers[providerId].model;

        elements.saveButton.disabled = true;

        const originalButton = elements.saveButton.innerHTML;

        elements.saveButton.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';

        showModalMessage(
            "Enviando la credencial al servidor seguro…",
            "info"
        );

        try {

            await invokeCredentialVault({
                action: "save",
                provider: providerId,
                apiKey,
                model
            });

            // Borrar la clave del formulario.
            elements.apiKey.value = "";

            // Actualizar el estado visual.
            updateProviderStatus(
                providerId,
                "verified",
                "Guardada de forma segura"
            );

            showModalMessage(
                "La credencial se guardó cifrada en Supabase.",
                "success"
            );

            notify(
                `${providers[providerId].name}: credencial guardada.`,
                "success"
            );

            // Volver a consultar el servidor para confirmar.
            await loadSavedIntegrations();

            window.setTimeout(closeModal, 1100);

        } finally {

            elements.saveButton.disabled = false;
            elements.saveButton.innerHTML = originalButton;
        }
    }


    // ========================================================
    // 17. ELIMINAR INTEGRACIÓN
    // ========================================================

    async function deleteIntegration(providerId) {

        if (!providers[providerId]) {
            throw new Error("Proveedor no válido.");
        }

        await invokeCredentialVault({
            action: "delete",
            provider: providerId
        });

        updateProviderStatus(
            providerId,
            "pending",
            "Pendiente de configuración"
        );

        notify(
            `${providers[providerId].name}: integración eliminada.`,
            "success"
        );

        await loadSavedIntegrations();
    }


    // ========================================================
    // 18. ENVÍO DEL FORMULARIO
    // ========================================================

    elements.form.addEventListener("submit", async event => {

        event.preventDefault();

        clearModalMessage();

        const validationError = validateForm();

        if (validationError) {
            showModalMessage(validationError, "error");
            return;
        }

        try {

            await saveIntegrationSecurely();

        } catch (error) {

            console.error(
                "CompraSmart AI: error al guardar:",
                error
            );

            showModalMessage(
                error.message ||
                "No se pudo guardar la integración.",
                "error"
            );

            notify(
                "No se pudo guardar la credencial.",
                "error"
            );
        }
    });


    // ========================================================
    // 19. MENÚ MÓVIL
    // ========================================================

    function closeMobileMenu() {

        if (!elements.sidebar || !elements.mobileButton) {
            return;
        }

        elements.sidebar.classList.remove("open");

        elements.mobileButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    if (elements.sidebar && elements.mobileButton) {

        elements.mobileButton.addEventListener("click", () => {

            const isOpen =
                elements.sidebar.classList.toggle("open");

            elements.mobileButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });

        elements.sidebar.querySelectorAll("a")
            .forEach(link => {
                link.addEventListener("click", closeMobileMenu);
            });
    }


    // ========================================================
    // 20. TECLA ESCAPE
    // ========================================================

    document.addEventListener("keydown", event => {

        if (event.key !== "Escape") {
            return;
        }

        if (!elements.modal.classList.contains("hidden")) {
            closeModal();
        } else {
            closeMobileMenu();
        }
    });


    // ========================================================
    // 21. PERFIL DE USUARIO
    // ========================================================

    async function loadUserProfile() {

        const client = getSupabaseClient();

        if (!client?.auth) {
            return;
        }

        try {

            const { data, error } = await client.auth.getUser();

            if (error || !data?.user) {
                return;
            }

            const user = data.user;
            const metadata = user.user_metadata || {};

            const ownerName =
                metadata.owner_name ||
                metadata.full_name ||
                metadata.name ||
                user.email ||
                "Mi cuenta";

            const businessName =
                metadata.business_name ||
                "CompraSmart AI";

            if (elements.profileOwnerName) {
                elements.profileOwnerName.textContent = ownerName;
            }

            if (elements.profileBusinessName) {
                elements.profileBusinessName.textContent = businessName;
            }

            if (elements.profileAvatar) {
                elements.profileAvatar.textContent =
                    ownerName.trim().charAt(0).toUpperCase() || "U";
            }

        } catch (error) {

            console.error(
                "CompraSmart AI: error al cargar el perfil:",
                error
            );
        }
    }


    // ========================================================
    // 22. INICIALIZACIÓN
    // ========================================================

    Object.keys(providers).forEach(providerId => {

        updateProviderStatus(
            providerId,
            "pending",
            "Consultando servidor seguro…"
        );
    });

    updateStatistics();

    // Recuperar los datos después de inicializar los estados.
    loadUserProfile();
    loadSavedIntegrations();


    // Actualizar integraciones cuando cambie la sesión.
    const client = getSupabaseClient();

    if (client?.auth?.onAuthStateChange) {

        client.auth.onAuthStateChange(event => {

            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                // Evitar ejecutar operaciones asíncronas dentro del callback.
                window.setTimeout(() => {
                    loadSavedIntegrations();
                    loadUserProfile();
                }, 0);
            }

            if (event === "SIGNED_OUT") {

                Object.keys(providers).forEach(providerId => {
                    updateProviderStatus(
                        providerId,
                        "pending",
                        "Inicia sesión para consultar"
                    );
                });
            }
        });
    }


    // ========================================================
    // 23. API DEL MÓDULO
    // ========================================================

    window.CompraSmartIntegrations = Object.freeze({

        openModal,
        closeModal,
        updateProviderStatus,
        updateStatistics,
        loadSavedIntegrations,
        deleteIntegration,

        getProviders() {
            return { ...providers };
        },

        getStates() {
            return { ...integrationStates };
        }
    });


    console.info(
        "CompraSmart AI: centro de integraciones inicializado."
    );

});
