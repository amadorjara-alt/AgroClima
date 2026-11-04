/* ============================================================
   COMPRASMART AI
   Archivo: js/integrations.js
   Centro de integraciones y gestión de proveedores
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

    // Elementos indispensables para el funcionamiento.
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

    if (missingElements.length > 0) {
        console.error(
            "CompraSmart AI: faltan elementos HTML:",
            missingElements
        );
        return;
    }


    // ========================================================
    // 2. PROVEEDORES
    // ========================================================

    const providers = Object.freeze({

        ocrspace: {
            name: "OCR.space",
            description: "API gratuita para leer PDF, JPG y PNG. Guarda aquí la clave del grupo; se cifra en el servidor.",
            model: "OCR Engine 2"
        },
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
    // 3. ESTADOS
    // ========================================================

    const integrationStates = {};
    const integrationMetadata = {};
    let projectOCRKeyConfigured = false;

    Object.keys(providers).forEach(id => {
        integrationStates[id] = "pending";
    });


    // ========================================================
    // 4. ESTADÍSTICAS
    // ========================================================

    const stats = {
        total: $("totalIntegrations"),
        configured: $("configuredIntegrations"),
        pending: $("pendingIntegrations")
    };

    function updateStatistics() {

        const total = Object.keys(providers).length;

        const configured = Object.values(integrationStates)
            .filter(state => state === "configured" || state === "verified").length;

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
    // 5. NOTIFICACIONES
    // ========================================================

    function notify(message, type = "info") {

        if (
            app &&
            typeof app.showToast === "function"
        ) {
            app.showToast(message, type);
        } else {
            console.info("CompraSmart AI:", message);
        }
    }


    // ========================================================
    // 6. MENSAJES DEL MODAL
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

        // Conservamos la clase original del HTML.
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
    // 7. ESTADOS DE PROVEEDORES
    // ========================================================

    function updateProviderStatus(
        providerId,
        state,
        message = ""
    ) {

        if (!providers[providerId]) {
            console.warn(
                "CompraSmart AI: proveedor desconocido:",
                providerId
            );
            return false;
        }

        const validStates = [
            "pending",
            "configured",
            "verified",
            "error"
        ];

        if (!validStates.includes(state)) {
            return false;
        }

        const statusElement = $(`status-${providerId}`);

        if (!statusElement) {
            console.warn(
                `No se encontró status-${providerId} en el HTML.`
            );
            return false;
        }

        integrationStates[providerId] = state;

        statusElement.className = "status";

        if (state === "verified") {

            statusElement.classList.add("verified");

            statusElement.textContent =
                message || "Conexión verificada";

        } else if (state === "configured") {
            statusElement.classList.add("pending");
            statusElement.textContent = message || "Configurada · conexión pendiente de prueba";
        } else if (state === "error") {

            statusElement.classList.add("error");

            statusElement.textContent =
                message || "Error de conexión";

        } else {

            statusElement.classList.add("pending");

            statusElement.textContent =
                message || "Pendiente de configuración";
        }

        updateStatistics();

        return true;
    }


    // ========================================================
    // 8. MODAL
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

        previousBodyOverflow =
            document.body.style.overflow;

        elements.form.reset();

        clearModalMessage();

        if (elements.modalTitle) {
            elements.modalTitle.textContent = provider.name;
        }

        if (elements.modalDescription) {
            elements.modalDescription.textContent =
                provider.description + (providerId === 'ocrspace' && projectOCRKeyConfigured && !integrationMetadata[providerId]
                    ? ' La clave del proyecto ya está guardada en Supabase. No es necesario volver a introducirla; una clave personal tendría prioridad en tu cuenta.' : '');
        }

        elements.provider.value = providerId;

        if (elements.model) {
            elements.model.value = integrationMetadata[providerId]?.model || provider.model;
        }

        elements.apiKey.type = "password";
        elements.apiKey.required = !integrationMetadata[providerId];
        elements.apiKey.placeholder = integrationMetadata[providerId] ? "Guardada: deja vacío para conservarla" : "Introduce tu clave API";
        const deleteButton = $("deleteIntegration");
        if (deleteButton) deleteButton.hidden = !integrationMetadata[providerId];

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

        elements.modal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.style.overflow = "hidden";

        window.requestAnimationFrame(() => {
            elements.apiKey.focus();
        });
    }


    function closeModal() {

        elements.modal.classList.add("hidden");

        elements.modal.setAttribute(
            "aria-hidden",
            "true"
        );

        elements.form.reset();

        clearModalMessage();

        elements.apiKey.type = "password";

        document.body.style.overflow =
            previousBodyOverflow;

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
    // 9. EVENTOS DE PROVEEDORES
    // ========================================================

    document.querySelectorAll("[data-integration]")
        .forEach(button => {

            button.addEventListener("click", () => {
                openModal(button.dataset.integration);
            });

        });


    // ========================================================
    // 10. CERRAR MODAL
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
    // 11. MOSTRAR / OCULTAR CLAVE
    // ========================================================

    elements.toggleKey?.addEventListener(
        "click",
        () => {

            const visible =
                elements.apiKey.type === "text";

            elements.apiKey.type = visible
                ? "password"
                : "text";

            elements.toggleKey.setAttribute(
                "aria-pressed",
                String(!visible)
            );

            elements.toggleKey.setAttribute(
                "aria-label",
                visible
                    ? "Mostrar clave API"
                    : "Ocultar clave API"
            );

            const icon =
                elements.toggleKey.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-eye", visible);
                icon.classList.toggle("fa-eye-slash", !visible);
            }
        }
    );


    // ========================================================
    // 12. VALIDAR FORMULARIO
    // ========================================================

    function validateForm() {

        const providerId = elements.provider.value;

        const apiKey = elements.apiKey.value.trim();

        if (!providers[providerId]) {
            return "Selecciona un proveedor válido.";
        }

        if (!apiKey) {
            return integrationMetadata[providerId] ? null : "Introduce la clave API del proveedor.";
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
    // 13. ENVIAR FORMULARIO
    // ========================================================

    elements.form.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            clearModalMessage();

            const validationError = validateForm();

            if (validationError) {
                showModalMessage(
                    validationError,
                    "error"
                );
                return;
            }

            saveIntegrationSecurely().catch(error => {
                console.error("CompraSmart AI: error al guardar integración:", error);
                showModalMessage(
                    error.message || "No se pudo guardar la integración. Verifica la configuración del servidor.",
                    "error"
                );
                notify("No se pudo guardar la clave API.", "error");
            });
        }
    );




    // ========================================================
    // 14. ALMACENAMIENTO SEGURO EN SUPABASE EDGE FUNCTION
    // ========================================================

    function getSupabaseClient() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof app?.getSupabaseClient === "function") {
            return app.getSupabaseClient();
        }
        return null;
    }

    async function invokeCredentialVault(payload) {
        const client = getSupabaseClient();
        if (!client?.functions?.invoke || !client?.auth?.getSession) {
            throw new Error("Supabase no está inicializado. Recarga la página e inicia sesión.");
        }

        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();
        if (sessionError) throw sessionError;

        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) {
            throw new Error("Tu sesión no está activa. Inicia sesión nuevamente.");
        }

        const { data, error } = await client.functions.invoke(
            "manage-integration",
            {
                body: payload,
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );

        if (error) {
            let detail = error.message || "Error al comunicarse con el servidor seguro.";
            const context = error.context;
            if (context && typeof context.clone === "function") {
                try {
                    const body = await context.clone().json();
                    if (body?.error || body?.message) {
                        detail = body.error || body.message;
                    }
                } catch { /* conservar mensaje original */ }
                if (context.status) detail = `HTTP ${context.status}: ${detail}`;
            }
            throw new Error(detail);
        }

        if (!data?.success) {
            throw new Error(data?.error || "El servidor no confirmó la operación.");
        }
        return data;
    }

    async function saveIntegrationSecurely() {
        const providerId = elements.provider.value;
        const apiKey = elements.apiKey.value.trim();
        const model = elements.model?.value.trim() || providers[providerId].model;

        elements.saveButton.disabled = true;
        const originalButton = elements.saveButton.innerHTML;
        elements.saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
        showModalMessage("Enviando la credencial al servidor mediante una conexión segura…", "info");

        try {
            await invokeCredentialVault({ action: "save", provider: providerId, apiKey, model });
            elements.apiKey.value = "";
            integrationMetadata[providerId] = { provider: providerId, model };
            updateProviderStatus(providerId, "configured", "Configurada · conexión pendiente de prueba");
            showModalMessage("La clave se guardó cifrada en el servidor. No se conserva en este navegador.", "success");
            notify(`${providers[providerId].name}: configuración guardada de forma segura.`, "success");
            window.setTimeout(closeModal, 1100);
        } finally {
            elements.saveButton.disabled = false;
            elements.saveButton.innerHTML = originalButton;
        }
    }

    async function loadSavedIntegrations() {
        try {
            const result = await invokeCredentialVault({ action: "list" });
            const saved = Array.isArray(result.integrations) ? result.integrations : [];
            projectOCRKeyConfigured = result.services?.ocrspace?.configured === true && result.services.ocrspace.source === 'project';
            Object.keys(providers).forEach(id => {
                const item = saved.find(entry => entry.provider === id);
                if (item) integrationMetadata[id] = item;
                else delete integrationMetadata[id];
                updateProviderStatus(
                    id,
                    item || (id === 'ocrspace' && projectOCRKeyConfigured) ? "configured" : "pending",
                    item ? "Configurada · conexión pendiente de prueba" : id === 'ocrspace' && projectOCRKeyConfigured
                        ? "Clave del proyecto guardada · prueba pendiente con factura" : "Pendiente de configuración"
                );
            });
        } catch (error) {
            console.warn("CompraSmart AI: no se pudieron cargar estados de integraciones:", error.message);
            Object.keys(providers).forEach(id => updateProviderStatus(id, "error", "No se pudo consultar el estado · reintenta"));
        }
    }

    $("deleteIntegration")?.addEventListener("click", async () => {
        const providerId = elements.provider.value;
        if (!providers[providerId] || !integrationMetadata[providerId]) return;
        if (!window.confirm(`¿Eliminar la clave guardada de ${providers[providerId].name}? Necesitarás guardar otra clave para volver a utilizar el servicio.`)) return;
        const button = $("deleteIntegration");
        button.disabled = true;
        try {
            await invokeCredentialVault({ action: "delete", provider: providerId });
            delete integrationMetadata[providerId];
            updateProviderStatus(providerId, "pending");
            closeModal();
            notify("Credencial eliminada del servidor.", "success");
        } catch (error) { showModalMessage(error.message, "error"); }
        finally { button.disabled = false; }
    });

    // La carga de estados se ejecuta después de establecer los estados iniciales.

    // ========================================================
    // 15. MENÚ MÓVIL
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

        elements.mobileButton.addEventListener(
            "click",
            () => {

                const isOpen =
                    elements.sidebar.classList.toggle("open");

                elements.mobileButton.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );
            }
        );

        elements.sidebar.querySelectorAll("a")
            .forEach(link => {
                link.addEventListener(
                    "click",
                    closeMobileMenu
                );
            });
    }


    // ========================================================
    // 15. TECLA ESCAPE
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
    // 16. PERFIL DE USUARIO
    // ========================================================

    async function loadUserProfile() {

        if (
            !app ||
            typeof app.getSupabaseClient !== "function"
        ) {
            return;
        }

        const client = app.getSupabaseClient();

        if (!client || !client.auth) {
            return;
        }

        try {

            const { data, error } =
                await client.auth.getUser();

            if (error || !data || !data.user) {
                return;
            }

            const user = data.user;
            const metadata = user.user_metadata || {};

            let business = null;
            const { data: businessData, error: businessError } = await client
                .from("businesses")
                .select("business_name, owner_name")
                .eq("user_id", user.id)
                .limit(1)
                .maybeSingle();

            if (businessError) {
                console.warn("No se pudo consultar el perfil comercial:", businessError.message);
            } else {
                business = businessData;
            }

            const ownerName =
                business?.owner_name || metadata.owner_name ||
                metadata.full_name || metadata.name || user.email || "Mi cuenta";

            const businessName =
                business?.business_name || metadata.business_name || "Mi negocio";

            if (elements.profileOwnerName) {
                elements.profileOwnerName.textContent =
                    ownerName;
            }

            if (elements.profileBusinessName) {
                elements.profileBusinessName.textContent =
                    businessName;
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
    // 17. INICIALIZACIÓN
    // ========================================================

    Object.keys(providers).forEach(providerId => {

        updateProviderStatus(
            providerId,
            "pending",
            "Pendiente de configuración"
        );
    });

    updateStatistics();

    // Consultar el estado guardado una vez que los valores iniciales ya existen.
    loadSavedIntegrations();
    loadUserProfile();

    const authClient = getSupabaseClient();
    authClient?.auth?.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            window.setTimeout(() => loadSavedIntegrations(), 0);
            window.setTimeout(() => loadUserProfile(), 0);
        } else if (event === "SIGNED_OUT") {
            Object.keys(integrationMetadata).forEach(id => delete integrationMetadata[id]);
            Object.keys(providers).forEach(providerId => {
                updateProviderStatus(providerId, "pending", "Pendiente de configuración");
            });
        }
    });


    // ========================================================
    // 18. API DEL MÓDULO
    // ========================================================

    window.CompraSmartIntegrations = Object.freeze({

        openModal,
        closeModal,
        updateProviderStatus,
        updateStatistics,
        reloadSavedIntegrations: loadSavedIntegrations,

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
