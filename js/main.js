/* ============================================================
   COMPRASMART AI
   Archivo: js/main.js
   Núcleo general de la aplicación
   ============================================================ */

"use strict";

(() => {

    // ========================================================
    // 1. EVITAR INICIALIZACIÓN DUPLICADA
    // ========================================================

    if (window.CompraSmart) {
        console.warn(
            "CompraSmart AI: el núcleo ya está inicializado."
        );
        return;
    }


    // ========================================================
    // 2. SELECTORES GENERALES
    // ========================================================

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        Array.from(parent.querySelectorAll(selector));


    // ========================================================
    // 3. FORMATO DE MONEDA
    // ========================================================

    const currencyFormatters = new Map();

    function formatCurrency(value, currency = "PEN") {

        if (value === null || value === undefined || value === "") {
            return "—";
        }

        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return "—";
        }

        try {

            if (!currencyFormatters.has(currency)) {

                currencyFormatters.set(
                    currency,
                    new Intl.NumberFormat("es-PE", {
                        style: "currency",
                        currency,
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })
                );

            }

            return currencyFormatters.get(currency).format(amount);

        } catch (error) {

            console.error(
                "CompraSmart AI: error al formatear moneda:",
                error
            );

            return `${currency} ${amount.toFixed(2)}`;

        }

    }


    // ========================================================
    // 4. FORMATO DE FECHAS
    // ========================================================

    function formatDate(value, options = {}) {

        if (!value) return "—";

        const date = value instanceof Date
            ? value
            : new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        try {

            return new Intl.DateTimeFormat("es-PE", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                ...options
            }).format(date);

        } catch (error) {

            console.error(
                "CompraSmart AI: error al formatear fecha:",
                error
            );

            return "—";

        }

    }


    // ========================================================
    // 5. FORMATO DE NÚMEROS
    // ========================================================

    function formatNumber(value, decimals = 2) {

        if (value === null || value === undefined || value === "") {
            return "—";
        }

        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "—";
        }

        const precision = Number.isInteger(decimals)
            ? Math.min(20, Math.max(0, decimals))
            : 2;

        return new Intl.NumberFormat("es-PE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: precision
        }).format(number);

    }


    // ========================================================
    // 6. PROTECCIÓN DE TEXTO HTML
    // ========================================================

    function escapeHTML(value) {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return String(value ?? "").replace(
            /[&<>"']/g,
            character => entities[character]
        );

    }


    // ========================================================
    // 7. NOTIFICACIONES
    // ========================================================

    let toastContainer = null;

    function getToastContainer() {

        if (
            toastContainer &&
            document.body.contains(toastContainer)
        ) {
            return toastContainer;
        }

        toastContainer = $("#toastContainer");

        if (!toastContainer) {

            toastContainer = document.createElement("div");
            toastContainer.id = "toastContainer";

            toastContainer.setAttribute("role", "status");
            toastContainer.setAttribute("aria-live", "polite");
            toastContainer.setAttribute("aria-atomic", "false");

            Object.assign(toastContainer.style, {
                position: "fixed",
                right: "20px",
                bottom: "20px",
                zIndex: "9999",
                display: "grid",
                gap: "10px",
                width: "max-content",
                maxWidth: "min(380px, calc(100vw - 40px))",
                pointerEvents: "none"
            });

            document.body.appendChild(toastContainer);

        }

        return toastContainer;

    }


    function showToast(message, type = "info", duration = 4000) {

        if (!message) return;

        const container = getToastContainer();
        const toast = document.createElement("div");

        const styles = {

            success: {
                background: "#e8f7ef",
                color: "#176b42",
                border: "#b9e8cd",
                icon: "✓"
            },

            error: {
                background: "#fdecec",
                color: "#a52d2d",
                border: "#f5c5c5",
                icon: "!"
            },

            warning: {
                background: "#fff5df",
                color: "#805900",
                border: "#f1dfae",
                icon: "!"
            },

            info: {
                background: "#edf3ff",
                color: "#244d86",
                border: "#cbdcff",
                icon: "i"
            }

        };

        const selectedStyle = styles[type] || styles.info;

        toast.setAttribute("role", "status");

        Object.assign(toast.style, {
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: selectedStyle.background,
            color: selectedStyle.color,
            border: `1px solid ${selectedStyle.border}`,
            fontSize: "14px",
            fontWeight: "600",
            lineHeight: "1.5",
            boxShadow: "0 5px 20px rgba(0,0,0,.10)",
            overflowWrap: "anywhere",
            pointerEvents: "auto",
            opacity: "1",
            transition: "opacity .2s ease, transform .2s ease"
        });

        const icon = document.createElement("span");

        icon.textContent = selectedStyle.icon;

        Object.assign(icon.style, {
            display: "grid",
            placeItems: "center",
            flexShrink: "0",
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "rgba(0,0,0,.06)"
        });

        const text = document.createElement("span");
        text.textContent = String(message);

        toast.append(icon, text);
        container.appendChild(toast);

        const timeout = Math.max(
            1000,
            Number(duration) || 4000
        );

        window.setTimeout(() => {

            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";

            window.setTimeout(() => {

                toast.remove();

                if (!container.children.length) {

                    container.remove();

                    if (toastContainer === container) {
                        toastContainer = null;
                    }

                }

            }, 220);

        }, timeout);

    }


    // ========================================================
    // 8. NAVEGACIÓN
    // ========================================================

    function navigateTo(path, replace = false) {

        if (typeof path !== "string" || !path.trim()) {

            console.error(
                "CompraSmart AI: ruta de navegación inválida."
            );

            return;

        }

        if (replace) {
            window.location.replace(path);
        } else {
            window.location.href = path;
        }

    }


    // ========================================================
    // 9. VALIDACIÓN DE ARCHIVOS DE FACTURAS
    // ========================================================

    const invoiceConfig = Object.freeze({

        maxSize: 900000,

        allowedExtensions: [
            "jpg",
            "jpeg",
            "png",
            "pdf"
        ],

        allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "application/pdf"
        ]

    });


    function validateInvoiceFile(file) {

        if (!file) {

            return {
                valid: false,
                message: "Selecciona un archivo."
            };

        }

        if (
            typeof File === "undefined" ||
            !(file instanceof File)
        ) {

            return {
                valid: false,
                message: "El archivo seleccionado no es válido."
            };

        }

        if (file.size === 0) {

            return {
                valid: false,
                message: "El archivo está vacío."
            };

        }

        if (file.size > invoiceConfig.maxSize) {

            return {
                valid: false,
                message: "El archivo supera el límite gratuito de 900 KB."
            };

        }

        const extension = file.name
            .split(".")
            .pop()
            .toLowerCase();

        if (!invoiceConfig.allowedExtensions.includes(extension)) {

            return {
                valid: false,
                message: "Formato no permitido. Usa JPG, PNG, WEBP o PDF."
            };

        }

        if (
            !invoiceConfig.allowedMimeTypes.includes(file.type)
        ) {

            return {
                valid: false,
                message: "El tipo de archivo no coincide con los formatos permitidos."
            };

        }

        return {
            valid: true,
            message: "Archivo válido."
        };

    }


    // ========================================================
    // 10. VALIDACIÓN DE CAMPOS
    // ========================================================

    function validateEmail(email) {

        const value = String(email ?? "").trim();

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    }


    function validateRUC(value) {

        return /^\d{11}$/.test(
            String(value ?? "").trim()
        );

    }


    // ========================================================
    // 11. DISPONIBILIDAD DE SUPABASE
    // ========================================================

    function getSupabaseClient() {

        return window.supabaseClient || null;

    }


    function isSupabaseAvailable() {

        const client = getSupabaseClient();

        return Boolean(
            client &&
            client.auth &&
            typeof client.from === "function"
        );

    }


    // ========================================================
    // 12. ESTADO DE BOTONES
    // ========================================================

    function setButtonLoading(
        button,
        loading,
        text = "Procesando..."
    ) {

        if (!button) return;

        if (loading) {

            if (!button.dataset.originalHTML) {
                button.dataset.originalHTML = button.innerHTML;
            }

            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.textContent = text;

        } else {

            button.disabled = false;
            button.removeAttribute("aria-busy");

            if (button.dataset.originalHTML !== undefined) {

                button.innerHTML = button.dataset.originalHTML;

                delete button.dataset.originalHTML;

            }

        }

    }


    // ========================================================
    // 13. API PÚBLICA
    // ========================================================

    window.CompraSmart = Object.freeze({

        $,
        $$,

        formatCurrency,
        formatDate,
        formatNumber,

        escapeHTML,

        showToast,
        navigateTo,

        validateInvoiceFile,
        validateEmail,
        validateRUC,

        getSupabaseClient,
        isSupabaseAvailable,

        setButtonLoading

    });


    // ========================================================
    // 14. INICIALIZACIÓN
    // ========================================================

    console.info(
        "CompraSmart AI: núcleo general inicializado correctamente."
    );

})();
