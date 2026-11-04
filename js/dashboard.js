
/* ============================================================
   COMPRASMART AI
   Archivo: js/dashboard.js
   Dashboard, proveedores, productos, facturas y compras
   Supabase JS v2
   ============================================================ */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {

    // ========================================================
    // 1. CONFIGURACIÓN GENERAL
    // ========================================================

    const app = window.CompraSmart;
    const supabase = app?.getSupabaseClient();

    const $ = id => document.getElementById(id);

    const BUCKET = "invoices";
    const OCR_FUNCTION = "process-invoice";
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    let currentUser = null;
    let currentBusiness = null;

    let suppliers = [];
    let products = [];
    let invoices = [];
    let priceHistory = [];

    let editingSupplierId = null;
    let editingProductId = null;
    let uploadingInvoice = false;
    let purchaseEvolutionChart = null;
    let categoryDistributionChart = null;

    const state = {
        initialized: false,
        loading: false
    };

    // ========================================================
    // 2. ELEMENTOS GENERALES
    // ========================================================

    const elements = {
        sidebar: $("sidebar"),
        mobileMenu: $("mobileMenuButton"),
        currentDate: $("currentDate"),
        logout: $("logoutButton"),

        profileAvatar: $("profileAvatar"),
        profileBusinessName: $("profileBusinessName"),
        profileOwnerName: $("profileOwnerName"),

        supplierForm: $("supplierForm"),
        supplierName: $("supplierName"),
        supplierRuc: $("supplierRuc"),
        supplierPhone: $("supplierPhone"),
        supplierEmail: $("supplierEmail"),
        supplierAddress: $("supplierAddress"),
        supplierSearch: $("supplierSearch"),
        suppliersBody: $("suppliersTableBody"),
        supplierMessage: $("supplierFormMessage"),
        saveSupplier: $("saveSupplierButton"),
        cancelSupplier: $("cancelSupplierButton"),

        productForm: $("productForm"),
        productName: $("productName"),
        productCategory: $("productCategory"),
        productBrand: $("productBrand"),
        productUnit: $("productUnit"),
        productSearch: $("productSearch"),
        productsBody: $("productsTableBody"),
        productTitle: $("productFormTitle"),
        productMessage: $("productFormMessage"),
        saveProduct: $("saveProductButton"),
        cancelProduct: $("cancelProductButton"),

        invoiceInput: $("invoiceFile"),
        invoiceMessage: $("invoiceUploadMessage"),
        invoiceEmpty: $("invoiceEmptyState"),
        invoiceBody: $("invoicesTableBody"),
        invoiceOcr: $("invoiceOcrResult"),
        invoiceOcrContent: $("invoiceOcrResultContent"),

        comparisonSearch: $("comparisonSearch"),
        comparisonResults: $("comparisonResults"),
        comparisonEmpty: $("comparisonEmptyState"),

        historyBody: $("historyTableBody"),

        settingsBusinessName: $("settingsBusinessName"),
        settingsOwnerName: $("settingsOwnerName"),
        settingsUserEmail: $("settingsUserEmail"),
        settingsUserId: $("settingsUserId")
    };

    // ========================================================
    // 3. VALIDAR CONEXIÓN
    // ========================================================

    if (!supabase) {

        console.error(
            "CompraSmart AI: cliente Supabase no disponible."
        );

        app?.showToast(
            "No se pudo conectar con Supabase. Revisa js/supabase.js.",
            "error"
        );

        return;
    }

    // ========================================================
    // 4. UTILIDADES
    // ========================================================

    function notify(message, type = "info") {

        if (typeof app?.showToast === "function") {
            app.showToast(message, type);
        } else {
            console.info(message);
        }
    }

    function escapeHTML(value) {

        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);

    }

    function formatCurrency(value, currency = "PEN") {

        const amount = Number(value);

        if (!Number.isFinite(amount)) return "—";

        try {

            return new Intl.NumberFormat("es-PE", {
                style: "currency",
                currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);

        } catch {
            return amount.toFixed(2);
        }

    }

    function formatNumber(value, decimals = 2) {

        const amount = Number(value);

        if (!Number.isFinite(amount)) return "0";

        return new Intl.NumberFormat("es-PE", {
            maximumFractionDigits: decimals
        }).format(amount);

    }

    function formatDate(value) {

        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("es-PE", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);

    }

    function getTodayLabel() {

        const value = new Intl.DateTimeFormat("es-PE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(new Date());

        return value.charAt(0).toUpperCase() + value.slice(1);

    }

    function setButtonLoading(button, loading, loadingText = "Procesando...") {

        if (!button) return;

        if (loading) {

            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent.trim();
            }

            button.disabled = true;
            button.textContent = loadingText;

        } else {

            button.disabled = false;

            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }

        }

    }

    function setFormMessage(element, message, type = "info") {

        if (!element) return;

        element.textContent = message || "";
        element.className = message
            ? `form-message ${type}`
            : "form-message";

    }

    function setInvoiceMessage(message, type = "info") {

        if (!elements.invoiceMessage) return;

        elements.invoiceMessage.textContent = message || "";

        elements.invoiceMessage.className =
            `invoice-upload-message ${type}`;

    }

    function showEmptyMessage(element, message, columns = 5) {

        if (!element) return;

        element.innerHTML = `
            <tr>
                <td colspan="${columns}" class="empty-table-message">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;

    }

    function normalizeText(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    // ========================================================
    // 5. FECHA Y NAVEGACIÓN
    // ========================================================

    if (elements.currentDate) {
        elements.currentDate.textContent = getTodayLabel();
    }

    const navigationButtons = [
        ...document.querySelectorAll(".nav-item[data-view]")
    ];

    const dashboardViews = [
        ...document.querySelectorAll(".dashboard-view")
    ];

    function showView(viewName, updateURL = true) {

        const target = $(`view-${viewName}`);

        if (!target) {

            console.warn(
                "CompraSmart AI: sección inexistente:",
                viewName
            );

            return;
        }

        dashboardViews.forEach(view => {
            view.classList.remove("active");
        });

        target.classList.add("active");

        navigationButtons.forEach(button => {

            const active = button.dataset.view === viewName;

            button.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }

        });

        elements.sidebar?.classList.remove("open");

        elements.mobileMenu?.setAttribute("aria-expanded", "false");

        if (updateURL) {

            const newHash = `#view-${viewName}`;

            if (window.location.hash !== newHash) {
                history.replaceState(null, "", newHash);
            }

        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }

    navigationButtons.forEach(button => {

        button.addEventListener("click", () => {
            showView(button.dataset.view);
        });

    });

    document.querySelectorAll("[data-go-view]").forEach(button => {

        button.addEventListener("click", () => {
            showView(button.dataset.goView);
        });

    });

    function loadViewFromHash() {

        const viewName = window.location.hash.replace("#view-", "");

        if (viewName) {
            showView(viewName, false);
        }

    }

    loadViewFromHash();

    window.addEventListener("hashchange", loadViewFromHash);

    // Menú desplegable de configuración.

    const settingsToggle = $("settingsMenuToggle");

    settingsToggle?.addEventListener("click", () => {

        const group = settingsToggle.closest(".sidebar-menu-group");

        if (!group) return;

        const open = group.classList.toggle("open");

        settingsToggle.setAttribute(
            "aria-expanded",
            String(open)
        );

    });

    // Menú móvil.

    elements.mobileMenu?.addEventListener("click", () => {

        if (!elements.sidebar) return;

        const open = elements.sidebar.classList.toggle("open");

        elements.mobileMenu.setAttribute(
            "aria-expanded",
            String(open)
        );

    });

    // ========================================================
    // 6. AUTENTICACIÓN Y NEGOCIO
    // ========================================================

    async function initializeUser() {

        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        currentUser = data.user;

        if (!currentUser) {

            window.location.replace("login.html");

            return false;

        }

        // Mostrar siempre los datos reales de la cuenta autenticada.
        if (elements.settingsUserEmail) {
            elements.settingsUserEmail.textContent =
                currentUser.email || "Correo no disponible";
        }

        if (elements.settingsUserId) {
            elements.settingsUserId.textContent =
                currentUser.id || "Identificador no disponible";
        }

        // Buscar el perfil comercial asociado a este usuario.
        const { data: business, error: businessError } =
            await supabase
                .from("businesses")
                .select("id, user_id, business_name, owner_name")
                .eq("user_id", currentUser.id)
                .limit(1)
                .maybeSingle();

        if (businessError) {
            throw new Error(
                `No se pudo consultar el perfil del negocio: ${businessError.message}`
            );
        }

        currentBusiness = business;

        // El registro original guarda business_name y owner_name en
        // user_metadata. Si aún no existe la fila en businesses, crearla
        // al iniciar sesión por primera vez.
        if (!currentBusiness) {
            const metadata = currentUser.user_metadata || {};
            const businessName = String(
                metadata.business_name || metadata.businessName || "Mi negocio"
            ).trim();
            const ownerName = String(
                metadata.owner_name || metadata.ownerName ||
                currentUser.email?.split("@")[0] || "Usuario"
            ).trim();

            const { data: createdBusiness, error: createError } =
                await supabase
                    .from("businesses")
                    .insert({
                        user_id: currentUser.id,
                        business_name: businessName,
                        owner_name: ownerName
                    })
                    .select("id, user_id, business_name, owner_name")
                    .single();

            if (createError) {
                // Si otra pestaña creó el perfil al mismo tiempo, volver
                // a consultar antes de mostrar un error.
                const { data: retryBusiness, error: retryError } =
                    await supabase
                        .from("businesses")
                        .select("id, user_id, business_name, owner_name")
                        .eq("user_id", currentUser.id)
                        .limit(1)
                        .maybeSingle();

                if (retryError || !retryBusiness) {
                    const detail = createError.code === "42501"
                        ? "Supabase bloqueó la creación por permisos RLS. Se necesita una política INSERT que permita auth.uid() = user_id."
                        : createError.message;
                    throw new Error(
                        `No se pudo crear el perfil del negocio. ${detail}`
                    );
                }

                currentBusiness = retryBusiness;
            } else {
                currentBusiness = createdBusiness;
            }
        }

        updateBusinessProfile();

        return true;

    }

    function updateBusinessProfile() {

        if (!currentBusiness) return;

        const businessName =
            currentBusiness.business_name || "Mi negocio";

        const ownerName =
            currentBusiness.owner_name || "Usuario";

        if (elements.profileBusinessName) {
            elements.profileBusinessName.textContent = businessName;
        }

        if (elements.profileOwnerName) {
            elements.profileOwnerName.textContent = ownerName;
        }

        if (elements.profileAvatar) {

            elements.profileAvatar.textContent =
                ownerName.charAt(0).toUpperCase();

        }

        if (elements.settingsBusinessName) {
            elements.settingsBusinessName.value = businessName;
        }

        if (elements.settingsOwnerName) {
            elements.settingsOwnerName.value = ownerName;
        }

    }

    // ========================================================
    // 7. PROVEEDORES
    // ========================================================

    async function loadSuppliers() {

        if (!elements.suppliersBody) return;

        showEmptyMessage(
            elements.suppliersBody,
            "Cargando proveedores..."
        );

        const { data, error } = await supabase
            .from("suppliers")
            .select("id, name, ruc, phone, email, address, created_at")
            .eq("user_id", currentUser.id)
            .eq("business_id", currentBusiness.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        suppliers = data || [];

        renderSuppliers();

    }

    function renderSuppliers() {

        if (!elements.suppliersBody) return;

        const search = normalizeText(
            elements.supplierSearch?.value
        );

        const filtered = suppliers.filter(supplier => {

            const content = [
                supplier.name,
                supplier.ruc,
                supplier.phone,
                supplier.email,
                supplier.address
            ].join(" ");

            return normalizeText(content).includes(search);

        });

        if (!filtered.length) {

            showEmptyMessage(
                elements.suppliersBody,
                suppliers.length
                    ? "No se encontraron proveedores."
                    : "Aún no hay proveedores registrados."
            );

            return;
        }

        elements.suppliersBody.innerHTML = filtered.map(supplier => `
            <tr>
                <td>${escapeHTML(supplier.name)}</td>
                <td>${escapeHTML(supplier.ruc || "—")}</td>
                <td>${escapeHTML(supplier.phone || "—")}</td>
                <td>${escapeHTML(supplier.email || "—")}</td>
                <td class="supplier-actions">
                    <button
                        type="button"
                        class="supplier-action-button"
                        data-supplier-action="edit"
                        data-id="${escapeHTML(supplier.id)}">
                        Editar
                    </button>
                    <button
                        type="button"
                        class="supplier-action-button"
                        data-supplier-action="delete"
                        data-id="${escapeHTML(supplier.id)}">
                        Eliminar
                    </button>
                </td>
            </tr>
        `).join("");

    }

    function resetSupplierForm() {

        elements.supplierForm?.reset();

        editingSupplierId = null;

        if (elements.saveSupplier) {
            elements.saveSupplier.textContent = "Guardar proveedor";
        }

        setFormMessage(elements.supplierMessage, "");

    }

    elements.cancelSupplier?.addEventListener(
        "click",
        resetSupplierForm
    );

    elements.supplierForm?.addEventListener("submit", async event => {

        event.preventDefault();

        const name = elements.supplierName?.value.trim() || "";
        const ruc = elements.supplierRuc?.value.trim() || "";
        const phone = elements.supplierPhone?.value.trim() || "";
        const email = elements.supplierEmail?.value.trim() || "";
        const address = elements.supplierAddress?.value.trim() || "";

        if (!name) {

            setFormMessage(
                elements.supplierMessage,
                "El nombre del proveedor es obligatorio.",
                "error"
            );

            elements.supplierName?.focus();

            return;

        }

        if (ruc && !/^\d{11}$/.test(ruc)) {

            setFormMessage(
                elements.supplierMessage,
                "El RUC debe contener 11 dígitos.",
                "error"
            );

            elements.supplierRuc?.focus();

            return;

        }

        if (
            email &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {

            setFormMessage(
                elements.supplierMessage,
                "Introduce un correo electrónico válido.",
                "error"
            );

            elements.supplierEmail?.focus();

            return;

        }

        const payload = {
            name,
            ruc: ruc || null,
            phone: phone || null,
            email: email || null,
            address: address || null
        };

        setButtonLoading(elements.saveSupplier, true, "Guardando...");

        try {

            let result;

            if (editingSupplierId) {

                result = await supabase
                    .from("suppliers")
                    .update(payload)
                    .eq("id", editingSupplierId)
                    .eq("user_id", currentUser.id)
                    .eq("business_id", currentBusiness.id);

            } else {

                result = await supabase
                    .from("suppliers")
                    .insert({
                        ...payload,
                        user_id: currentUser.id,
                        business_id: currentBusiness.id
                    });

            }

            if (result.error) throw result.error;

            notify(
                editingSupplierId
                    ? "Proveedor actualizado correctamente."
                    : "Proveedor registrado correctamente.",
                "success"
            );

            resetSupplierForm();

            await Promise.all([
                loadSuppliers(),
                loadDashboardMetrics()
            ]);

        } catch (error) {

            console.error("Error al guardar proveedor:", error);

            setFormMessage(
                elements.supplierMessage,
                error.message || "No se pudo guardar el proveedor.",
                "error"
            );

        } finally {

            setButtonLoading(elements.saveSupplier, false);

        }

    });

    elements.suppliersBody?.addEventListener("click", async event => {

        const button = event.target.closest("[data-supplier-action]");

        if (!button) return;

        const supplier = suppliers.find(
            item => String(item.id) === button.dataset.id
        );

        if (!supplier) return;

        const action = button.dataset.supplierAction;

        if (action === "edit") {

            editingSupplierId = supplier.id;

            elements.supplierName.value = supplier.name || "";
            elements.supplierRuc.value = supplier.ruc || "";
            elements.supplierPhone.value = supplier.phone || "";
            elements.supplierEmail.value = supplier.email || "";
            elements.supplierAddress.value = supplier.address || "";

            elements.saveSupplier.textContent = "Actualizar proveedor";

            setFormMessage(
                elements.supplierMessage,
                "Editando proveedor.",
                "info"
            );

            elements.supplierForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            elements.supplierName.focus();

            return;

        }

        if (action === "delete") {

            const confirmed = window.confirm(
                `¿Deseas eliminar al proveedor "${supplier.name}"?`
            );

            if (!confirmed) return;

            setButtonLoading(button, true, "Eliminando...");

            try {

                const { error } = await supabase
                    .from("suppliers")
                    .delete()
                    .eq("id", supplier.id)
                    .eq("user_id", currentUser.id)
                    .eq("business_id", currentBusiness.id);

                if (error) throw error;

                if (editingSupplierId === supplier.id) {
                    resetSupplierForm();
                }

                notify("Proveedor eliminado correctamente.", "success");

                await Promise.all([
                    loadSuppliers(),
                    loadDashboardMetrics()
                ]);

            } catch (error) {

                console.error("Error al eliminar proveedor:", error);

                notify(
                    "No se pudo eliminar. Comprueba si tiene facturas o movimientos relacionados.",
                    "error"
                );

                setButtonLoading(button, false);

            }

        }

    });

    elements.supplierSearch?.addEventListener(
        "input",
        renderSuppliers
    );

    // ========================================================
    // 8. PRODUCTOS
    // ========================================================

    async function loadProducts() {

        if (!elements.productsBody) return;

        showEmptyMessage(
            elements.productsBody,
            "Cargando productos..."
        );

        const { data, error } = await supabase
            .from("products")
            .select("id, name, category, brand, unit, created_at")
            .eq("user_id", currentUser.id)
            .eq("business_id", currentBusiness.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        products = data || [];

        renderProducts();

    }

    function renderProducts() {

        if (!elements.productsBody) return;

        const search = normalizeText(
            elements.productSearch?.value
        );

        const filtered = products.filter(product => {

            const content = [
                product.name,
                product.category,
                product.brand,
                product.unit
            ].join(" ");

            return normalizeText(content).includes(search);

        });

        if (!filtered.length) {

            showEmptyMessage(
                elements.productsBody,
                products.length
                    ? "No se encontraron productos."
                    : "Aún no hay productos registrados."
            );

            return;

        }

        elements.productsBody.innerHTML = filtered.map(product => `
            <tr>
                <td>${escapeHTML(product.name)}</td>
                <td>${escapeHTML(product.category || "—")}</td>
                <td>${escapeHTML(product.brand || "—")}</td>
                <td>${escapeHTML(product.unit || "—")}</td>
                <td class="supplier-actions">
                    <button
                        type="button"
                        class="supplier-action-button"
                        data-product-action="edit"
                        data-id="${escapeHTML(product.id)}">
                        Editar
                    </button>
                    <button
                        type="button"
                        class="supplier-action-button"
                        data-product-action="delete"
                        data-id="${escapeHTML(product.id)}">
                        Eliminar
                    </button>
                </td>
            </tr>
        `).join("");

    }

    function resetProductForm() {

        elements.productForm?.reset();

        editingProductId = null;

        if (elements.saveProduct) {
            elements.saveProduct.textContent = "Guardar producto";
        }

        if (elements.productTitle) {
            elements.productTitle.textContent = "Registrar producto";
        }

        setFormMessage(elements.productMessage, "");

    }

    elements.cancelProduct?.addEventListener(
        "click",
        resetProductForm
    );

    elements.productForm?.addEventListener("submit", async event => {

        event.preventDefault();

        const name = elements.productName?.value.trim() || "";
        const category = elements.productCategory?.value || "";
        const brand = elements.productBrand?.value.trim() || "";
        const unit = elements.productUnit?.value || "";

        if (!name || !category || !unit) {

            setFormMessage(
                elements.productMessage,
                "Completa el nombre, la categoría y la unidad.",
                "error"
            );

            return;

        }

        const payload = {
            name,
            category,
            brand: brand || null,
            unit
        };

        setButtonLoading(elements.saveProduct, true, "Guardando...");

        try {

            let result;

            if (editingProductId) {

                result = await supabase
                    .from("products")
                    .update(payload)
                    .eq("id", editingProductId)
                    .eq("user_id", currentUser.id)
                    .eq("business_id", currentBusiness.id);

            } else {

                result = await supabase
                    .from("products")
                    .insert({
                        ...payload,
                        user_id: currentUser.id,
                        business_id: currentBusiness.id
                    });

            }

            if (result.error) throw result.error;

            notify(
                editingProductId
                    ? "Producto actualizado correctamente."
                    : "Producto registrado correctamente.",
                "success"
            );

            resetProductForm();

            await Promise.all([
                loadProducts(),
                loadDashboardMetrics()
            ]);

        } catch (error) {

            console.error("Error al guardar producto:", error);

            setFormMessage(
                elements.productMessage,
                error.message || "No se pudo guardar el producto.",
                "error"
            );

        } finally {

            setButtonLoading(elements.saveProduct, false);

        }

    });

    elements.productsBody?.addEventListener("click", async event => {

        const button = event.target.closest("[data-product-action]");

        if (!button) return;

        const product = products.find(
            item => String(item.id) === button.dataset.id
        );

        if (!product) return;

        const action = button.dataset.productAction;

        if (action === "edit") {

            editingProductId = product.id;

            elements.productName.value = product.name || "";
            elements.productCategory.value = product.category || "";
            elements.productBrand.value = product.brand || "";
            elements.productUnit.value = product.unit || "";

            elements.saveProduct.textContent = "Actualizar producto";

            if (elements.productTitle) {
                elements.productTitle.textContent = "Editar producto";
            }

            setFormMessage(
                elements.productMessage,
                "Editando producto.",
                "info"
            );

            elements.productForm.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            elements.productName.focus();

            return;

        }

        if (action === "delete") {

            const confirmed = window.confirm(
                `¿Deseas eliminar el producto "${product.name}"?`
            );

            if (!confirmed) return;

            setButtonLoading(button, true, "Eliminando...");

            try {

                const { error } = await supabase
                    .from("products")
                    .delete()
                    .eq("id", product.id)
                    .eq("user_id", currentUser.id)
                    .eq("business_id", currentBusiness.id);

                if (error) throw error;

                if (editingProductId === product.id) {
                    resetProductForm();
                }

                notify("Producto eliminado correctamente.", "success");

                await Promise.all([
                    loadProducts(),
                    loadDashboardMetrics()
                ]);

            } catch (error) {

                console.error("Error al eliminar producto:", error);

                notify(
                    "No se pudo eliminar. Comprueba si tiene movimientos o facturas relacionados.",
                    "error"
                );

                setButtonLoading(button, false);

            }

        }

    });

    elements.productSearch?.addEventListener(
        "input",
        renderProducts
    );

    // ========================================================
    // 9. FACTURAS: CONSULTA Y PRESENTACIÓN
    // ========================================================

    const invoiceStatusLabels = {
        pending: "Pendiente",
        processing: "Procesando",
        completed: "Procesada",
        failed: "Error"
    };

    async function loadInvoices() {

        if (!elements.invoiceBody) return;

        showEmptyMessage(
            elements.invoiceBody,
            "Cargando facturas...",
            4
        );

        const { data, error } = await supabase
            .from("invoices")
            .select(
                "id, invoice_number, issue_date, total_amount, currency, file_path, ocr_status, created_at"
            )
            .eq("user_id", currentUser.id)
            .eq("business_id", currentBusiness.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        invoices = data || [];

        renderInvoices();

    }

    function renderInvoices() {

        if (!elements.invoiceBody) return;

        if (elements.invoiceEmpty) {
            elements.invoiceEmpty.hidden = invoices.length > 0;
        }

        if (!invoices.length) {

            showEmptyMessage(
                elements.invoiceBody,
                "Todavía no hay facturas registradas.",
                4
            );

            return;

        }

        elements.invoiceBody.innerHTML = invoices.map(invoice => {

            const fileName = invoice.file_path
                ? invoice.file_path.split("/").pop()
                : "Factura";

            const status = invoice.ocr_status || "pending";

            return `
                <tr>
                    <td>
                        ${escapeHTML(
                            invoice.invoice_number || fileName
                        )}
                    </td>
                    <td>${formatDate(invoice.issue_date || invoice.created_at)}</td>
                    <td>${formatCurrency(
                        invoice.total_amount,
                        invoice.currency || "PEN"
                    )}</td>
                    <td>
                        <span class="invoice-status ${escapeHTML(status)}">
                            ${escapeHTML(
                                invoiceStatusLabels[status] || status
                            )}
                        </span>
                    </td>
                    <td class="supplier-actions">
                        <button
                            type="button"
                            class="supplier-action-button"
                            data-invoice-action="open"
                            data-id="${escapeHTML(invoice.id)}">
                            Ver archivo
                        </button>
                    </td>
                </tr>
            `;

        }).join("");

    }

    // ========================================================
    // 10. VALIDAR Y SUBIR FACTURAS
    // ========================================================

    function validateInvoice(file) {

        if (!file) {
            throw new Error("Selecciona un archivo.");
        }

        if (file.size === 0) {
            throw new Error("El archivo está vacío.");
        }

        if (file.size > MAX_FILE_SIZE) {
            throw new Error("El archivo supera el límite de 10 MB.");
        }

        const allowed = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        const extension = file.name.split(".").pop().toLowerCase();

        const allowedExtensions = [
            "pdf",
            "jpg",
            "jpeg",
            "png",
            "webp"
        ];

        if (!allowedExtensions.includes(extension)) {
            throw new Error("Formato no permitido. Usa PDF, JPG, PNG o WEBP.");
        }

        if (file.type && !allowed.includes(file.type)) {
            throw new Error("El tipo de archivo no coincide con su extensión.");
        }

    }

    function renderOCRResult(data) {

        if (!elements.invoiceOcr || !elements.invoiceOcrContent) {
            return;
        }

        elements.invoiceOcr.classList.remove("hidden");

        // Se presenta el contenido como texto, no como HTML.
        // Así evitamos ejecutar contenido recibido del OCR.

        const pre = document.createElement("pre");

        pre.textContent = JSON.stringify(data, null, 2);

        pre.style.whiteSpace = "pre-wrap";
        pre.style.overflowWrap = "anywhere";
        pre.style.fontSize = "13px";

        elements.invoiceOcrContent.replaceChildren(pre);

        elements.invoiceOcr.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

    }

    async function uploadInvoice(file) {

        validateInvoice(file);

        const validator = app?.validateInvoiceFile;

        if (typeof validator === "function") {

            const result = validator(file);

            if (!result.valid) {
                throw new Error(result.message);
            }

        }

        const safeFileName = file.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");

        const uniquePrefix =
            `${Date.now()}-${crypto.randomUUID()}`;

        const filePath =
            `${currentUser.id}/${currentBusiness.id}/${uniquePrefix}-${safeFileName}`;

        let uploaded = false;
        let invoiceId = null;

        try {

            // 1. Subir archivo al bucket privado.

            setInvoiceMessage("Subiendo archivo a Supabase Storage...");

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type
                });

            if (uploadError) throw uploadError;

            uploaded = true;

            // 2. Registrar factura.

            setInvoiceMessage("Registrando factura...");

            const { data: invoice, error: insertError } =
                await supabase
                    .from("invoices")
                    .insert({
                        user_id: currentUser.id,
                        business_id: currentBusiness.id,
                        file_path: filePath,
                        ocr_status: "pending",
                        currency: "PEN"
                    })
                    .select("id")
                    .single();

            if (insertError) throw insertError;

            invoiceId = invoice.id;

            await loadInvoices();

            // 3. Invocar OCR.

            setInvoiceMessage("Analizando factura con Gemini...");

            const { data: sessionData, error: sessionError } =
                await supabase.auth.getSession();

            if (sessionError) throw sessionError;

            const accessToken = sessionData?.session?.access_token;
            if (!accessToken) {
                throw new Error("Tu sesión expiró. Inicia sesión nuevamente para analizar la factura.");
            }

            const { data: ocrResult, error: ocrError } =
                await supabase.functions.invoke(OCR_FUNCTION, {
                    body: { file_path: filePath },
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

            if (ocrError) throw ocrError;

            if (!ocrResult || ocrResult.success !== true) {

                throw new Error(
                    ocrResult?.error ||
                    "La función OCR no confirmó el procesamiento."
                );

            }

            // 4. Mostrar resultados sin asumir su estructura.

            const extracted =
                ocrResult.extracted ??
                ocrResult.data ??
                ocrResult;

            renderOCRResult(extracted);

            await loadInvoices();

            await loadDashboardMetrics();

            setInvoiceMessage(
                "Factura procesada. Revisa los datos extraídos.",
                "success"
            );

            return extracted;

        } catch (error) {

            // 5. Marcar error si la factura ya fue registrada.

            if (invoiceId) {

                const { error: updateError } = await supabase
                    .from("invoices")
                    .update({
                        ocr_status: "failed"
                    })
                    .eq("id", invoiceId)
                    .eq("user_id", currentUser.id)
                    .eq("business_id", currentBusiness.id);

                if (updateError) {
                    console.error(
                        "No se pudo actualizar el estado OCR:",
                        updateError
                    );
                }

            }

            // 6. Si no se registró la factura, eliminar archivo huérfano.

            if (uploaded && !invoiceId) {

                const { error: removeError } = await supabase.storage
                    .from(BUCKET)
                    .remove([filePath]);

                if (removeError) {
                    console.error(
                        "No se pudo retirar el archivo:",
                        removeError
                    );
                }

            }

            await loadInvoices();

            throw error;

        }

    }

    const uploadButtons = [
        $("uploadInvoiceButton"),
        $("emptyUploadButton")
    ];

    uploadButtons.forEach(button => {

        button?.addEventListener("click", () => {

            if (uploadingInvoice) return;

            elements.invoiceInput?.click();

        });

    });

    elements.invoiceInput?.addEventListener("change", async () => {

        const file = elements.invoiceInput.files?.[0];

        if (!file || uploadingInvoice) return;

        uploadingInvoice = true;

        uploadButtons.forEach(button => {
            if (button) button.disabled = true;
        });

        try {

            await uploadInvoice(file);

            notify(
                "Factura procesada correctamente.",
                "success"
            );

        } catch (error) {

            console.error("Error en procesamiento de factura:", error);

            let message = error?.message || "No se pudo procesar la factura.";
            const response = error?.context;

            // Supabase FunctionsHttpError guarda la respuesta HTTP en context.
            // Leer una copia permite mostrar el mensaje real del backend.
            if (response && typeof response.clone === "function") {
                try {
                    const body = await response.clone().json();
                    message = body?.error || body?.message || message;
                } catch {
                    try {
                        const bodyText = await response.clone().text();
                        if (bodyText) message = bodyText.slice(0, 500);
                    } catch { /* conservar el mensaje original */ }
                }

                if (response.status) {
                    message = `Error HTTP ${response.status}: ${message}`;
                }
            }

            setInvoiceMessage(message, "error");
            notify(message, "error");

        } finally {

            uploadingInvoice = false;

            uploadButtons.forEach(button => {
                if (button) button.disabled = false;
            });

            elements.invoiceInput.value = "";

        }

    });

    // Abrir factura mediante URL temporal firmada.

    elements.invoiceBody?.addEventListener("click", async event => {

        const button = event.target.closest(
            "[data-invoice-action='open']"
        );

        if (!button) return;

        const invoice = invoices.find(
            item => String(item.id) === button.dataset.id
        );

        if (!invoice?.file_path) return;

        setButtonLoading(button, true, "Abriendo...");

        try {

            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(invoice.file_path, 60);

            if (error) throw error;

            if (!data?.signedUrl) {
                throw new Error("No se pudo generar el enlace temporal.");
            }

            const newWindow = window.open(
                data.signedUrl,
                "_blank",
                "noopener,noreferrer"
            );

            if (!newWindow) {
                notify(
                    "El navegador bloqueó la ventana. Permite las ventanas emergentes.",
                    "warning"
                );
            }

        } catch (error) {

            console.error("Error al abrir factura:", error);

            notify("No se pudo abrir la factura.", "error");

        } finally {

            setButtonLoading(button, false);

        }

    });

    // ========================================================
    // 11. MÉTRICAS DEL DASHBOARD
    // ========================================================

    async function loadDashboardMetrics() {

        const [
            invoiceResult,
            productResult,
            supplierResult
        ] = await Promise.all([

            supabase
                .from("invoices")
                .select("id, total_amount, currency, created_at, ocr_status")
                .eq("user_id", currentUser.id)
                .eq("business_id", currentBusiness.id),

            supabase
                .from("products")
                .select("id", { count: "exact", head: true })
                .eq("user_id", currentUser.id)
                .eq("business_id", currentBusiness.id),

            supabase
                .from("suppliers")
                .select("id", { count: "exact", head: true })
                .eq("user_id", currentUser.id)
                .eq("business_id", currentBusiness.id)

        ]);

        if (invoiceResult.error) throw invoiceResult.error;
        if (productResult.error) throw productResult.error;
        if (supplierResult.error) throw supplierResult.error;

        const invoiceRows = invoiceResult.data || [];

        const totalPurchases = invoiceRows.reduce(
            (sum, invoice) => sum + (Number(invoice.total_amount) || 0),
            0
        );

        const invoiceCount = invoiceRows.length;
        const productCount = productResult.count || 0;
        const supplierCount = supplierResult.count || 0;

        if ($("overviewInvoiceCount")) {
            $("overviewInvoiceCount").textContent = invoiceCount;
        }

        if ($("overviewPurchaseTotal")) {
            $("overviewPurchaseTotal").textContent =
                formatCurrency(totalPurchases);
        }

        if ($("overviewProductCount")) {
            $("overviewProductCount").textContent = productCount;
        }

        if ($("overviewSupplierCount")) {
            $("overviewSupplierCount").textContent = supplierCount;
        }

        if ($("overviewInvoiceDescription")) {
            $("overviewInvoiceDescription").textContent =
                `${invoiceCount} factura${invoiceCount === 1 ? "" : "s"} registrada${invoiceCount === 1 ? "" : "s"}`;
        }

        if ($("overviewProductDescription")) {
            $("overviewProductDescription").textContent =
                `${productCount} producto${productCount === 1 ? "" : "s"} en tu catálogo`;
        }

        if ($("overviewSupplierDescription")) {
            $("overviewSupplierDescription").textContent =
                `${supplierCount} proveedor${supplierCount === 1 ? "" : "es"} registrado${supplierCount === 1 ? "" : "s"}`;
        }

        renderRecentActivity(invoiceRows);
        renderDashboardCharts(invoiceRows);

    }

    // Gráfico temporal de gasto y gráfico circular del catálogo.
    // El segundo representa cantidad de productos por categoría, no gasto.
    function renderDashboardCharts(invoiceRows) {
        const purchaseCanvas = $("purchaseEvolutionChart");
        const categoryCanvas = $("categoryDistributionChart");
        const purchaseEmpty = $("purchaseChartEmpty");
        const categoryEmpty = $("categoryChartEmpty");

        if (!window.Chart) {
            if (purchaseEmpty) purchaseEmpty.textContent = "No se pudo cargar la librería de gráficos. Verifica tu conexión e inténtalo nuevamente.";
            if (categoryEmpty) categoryEmpty.textContent = "No se pudo cargar la librería de gráficos. Verifica tu conexión e inténtalo nuevamente.";
            return;
        }

        const monthKeys = [];
        const monthLabels = [];
        const now = new Date();
        for (let offset = 5; offset >= 0; offset--) {
            const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
            monthLabels.push(new Intl.DateTimeFormat("es-PE", { month: "short" }).format(date));
        }
        const monthlyTotals = new Map(monthKeys.map(key => [key, 0]));
        (invoiceRows || []).forEach(invoice => {
            const date = new Date(invoice.created_at || invoice.issue_date);
            if (Number.isNaN(date.getTime())) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            if (monthlyTotals.has(key)) monthlyTotals.set(key, monthlyTotals.get(key) + (Number(invoice.total_amount) || 0));
        });
        const monthlyValues = monthKeys.map(key => Number(monthlyTotals.get(key).toFixed(2)));
        const hasPurchases = monthlyValues.some(value => value > 0);

        if (purchaseCanvas && hasPurchases) {
            purchaseCanvas.style.display = "block";
            purchaseEmpty?.classList.add("hidden");
            purchaseEvolutionChart?.destroy();
            purchaseEvolutionChart = new window.Chart(purchaseCanvas, {
                type: "line",
                data: {
                    labels: monthLabels,
                    datasets: [{
                        label: "Compras registradas",
                        data: monthlyValues,
                        borderColor: "#07845e",
                        backgroundColor: "rgba(8,127,91,.10)",
                        fill: true,
                        tension: .36,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: "#07845e"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false, mode: "index" },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: context => ` ${formatCurrency(context.parsed.y)}` } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: "#829188", font: { size: 10 } } },
                        y: { beginAtZero: true, grid: { color: "rgba(120,145,130,.12)" }, ticks: { color: "#829188", font: { size: 9 }, callback: value => `S/ ${Number(value).toLocaleString("es-PE")}` } }
                    }
                }
            });
        } else if (purchaseCanvas) {
            purchaseEvolutionChart?.destroy();
            purchaseEvolutionChart = null;
            purchaseCanvas.style.display = "none";
            purchaseEmpty?.classList.remove("hidden");
            if (purchaseEmpty) purchaseEmpty.textContent = "Registra facturas para visualizar la evolución mensual de tus compras.";
        }

        const categoryTotals = new Map();
        (products || []).forEach(product => {
            const category = String(product.category || "Sin categoría").trim() || "Sin categoría";
            categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
        });
        const categoryEntries = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
        if (categoryCanvas && categoryEntries.length) {
            categoryCanvas.style.display = "block";
            categoryEmpty?.classList.add("hidden");
            categoryDistributionChart?.destroy();
            categoryDistributionChart = new window.Chart(categoryCanvas, {
                type: "doughnut",
                data: {
                    labels: categoryEntries.map(entry => entry[0]),
                    datasets: [{
                        data: categoryEntries.map(entry => entry[1]),
                        backgroundColor: ["#087f5b", "#55a982", "#a7d7bd", "#e7b65c", "#6c9fbd", "#9b8ac7", "#d98d83", "#9eaaa3"],
                        borderColor: "#ffffff",
                        borderWidth: 3,
                        hoverOffset: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "66%",
                    plugins: {
                        legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 14, color: "#61746a", font: { size: 10 } } },
                        tooltip: { callbacks: { label: context => ` ${context.label}: ${context.parsed} producto(s)` } }
                    }
                }
            });
        } else if (categoryCanvas) {
            categoryDistributionChart?.destroy();
            categoryDistributionChart = null;
            categoryCanvas.style.display = "none";
            categoryEmpty?.classList.remove("hidden");
            if (categoryEmpty) categoryEmpty.textContent = "Registra productos con su categoría para visualizar esta distribución.";
        }
    }

    function renderRecentActivity(rows) {

        const container = $("overviewActivityEmpty");

        if (!container) return;

        const recent = [...rows]
            .sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            )
            .slice(0, 5);

        if (!recent.length) {

            container.classList.remove("hidden");

            return;

        }

        container.classList.add("hidden");

        // La actividad detallada se puede incorporar cuando
        // el HTML tenga un contenedor específico para sus filas.

    }

    // ========================================================
    // 12. HISTORIAL DE COMPRAS
    // ========================================================

    async function loadHistory() {

        if (!elements.historyBody) return;

        showEmptyMessage(
            elements.historyBody,
            "Cargando historial...",
            5
        );

        const { data, error } = await supabase
            .from("invoices")
            .select(
                "id, invoice_number, issue_date, total_amount, currency, created_at, ocr_status, supplier_id"
            )
            .eq("user_id", currentUser.id)
            .eq("business_id", currentBusiness.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = data || [];

        const total = rows.reduce(
            (sum, item) => sum + (Number(item.total_amount) || 0),
            0
        );

        if ($("historyPurchaseCount")) {
            $("historyPurchaseCount").textContent = rows.length;
        }

        if ($("historyPurchaseAmount")) {
            $("historyPurchaseAmount").textContent =
                formatCurrency(total);
        }

        if (!rows.length) {

            showEmptyMessage(
                elements.historyBody,
                "Todavía no hay compras registradas.",
                5
            );

            return;

        }

        elements.historyBody.innerHTML = rows.map(item => {

            const supplier = suppliers.find(
                s => s.id === item.supplier_id
            );

            return `
                <tr>
                    <td>${escapeHTML(item.invoice_number || "Sin número")}</td>
                    <td>${escapeHTML(supplier?.name || "Sin proveedor asociado")}</td>
                    <td>${formatDate(item.issue_date || item.created_at)}</td>
                    <td>${formatCurrency(item.total_amount, item.currency || "PEN")}</td>
                    <td>${escapeHTML(
                        invoiceStatusLabels[item.ocr_status] ||
                        item.ocr_status ||
                        "Pendiente"
                    )}</td>
                </tr>
            `;

        }).join("");

    }

    // ========================================================
    // 13. COMPARACIÓN DE PRECIOS
    // ========================================================

    async function loadPriceHistory() {

        const { data, error } = await supabase
            .from("price_history")
            .select("id, product_id, supplier_id, invoice_id, unit_price, recorded_at")
            .eq("user_id", currentUser.id)
            .order("recorded_at", { ascending: false });

        if (error) throw error;

        priceHistory = data || [];

        renderPriceComparison();

    }

    function renderPriceComparison() {

        if (!elements.comparisonResults) return;

        const search = normalizeText(
            elements.comparisonSearch?.value
        );

        const filtered = priceHistory.filter(record => {

            const product = products.find(
                item => item.id === record.product_id
            );

            const supplier = suppliers.find(
                item => item.id === record.supplier_id
            );

            const content = [
                product?.name,
                product?.brand,
                supplier?.name
            ].join(" ");

            return normalizeText(content).includes(search);

        });

        if (!filtered.length) {
            const emptyTitle = priceHistory.length
                ? "No se encontraron coincidencias"
                : "Aún no hay precios comparables";
            const emptyDescription = priceHistory.length
                ? "Prueba con otro nombre de producto o proveedor."
                : "Registra facturas y productos para construir un historial de precios por proveedor.";
            elements.comparisonResults.innerHTML = `
                <div class="empty-state-card" id="comparisonEmptyState">
                    <div class="empty-state-icon">⇄</div>
                    <h3>${emptyTitle}</h3>
                    <p>${emptyDescription}</p>
                    <a href="#view-invoices" class="secondary-button">Ir a facturas</a>
                </div>
            `;
            elements.comparisonEmpty = $("comparisonEmptyState");
            return;
        }

        elements.comparisonEmpty = null;

        const grouped = new Map();

        filtered.forEach(record => {

            const key = String(record.product_id);

            if (!grouped.has(key)) {
                grouped.set(key, []);
            }

            grouped.get(key).push(record);

        });

        const html = [];

        grouped.forEach((records, productId) => {

            const product = products.find(
                item => String(item.id) === productId
            );

            const ordered = [...records].sort(
                (a, b) => Number(a.unit_price) - Number(b.unit_price)
            );

            const cheapest = ordered[0];

            html.push(`
                <article class="comparison-card">
                    <div class="comparison-card-header">
                        <h3>${escapeHTML(product?.name || "Producto")}</h3>
                        <span>${escapeHTML(product?.unit || "")}</span>
                    </div>

                    <p class="comparison-best-price">
                        Mejor precio registrado:
                        <strong>${formatCurrency(cheapest.unit_price)}</strong>
                    </p>

                    <div class="comparison-price-list">
                        ${ordered.map(record => {

                            const supplier = suppliers.find(
                                item => item.id === record.supplier_id
                            );

                            return `
                                <div class="comparison-price-row">
                                    <span>${escapeHTML(supplier?.name || "Proveedor no disponible")}</span>
                                    <strong>${formatCurrency(record.unit_price)}</strong>
                                    <small>${formatDate(record.recorded_at)}</small>
                                </div>
                            `;

                        }).join("")}
                    </div>
                </article>
            `);

        });

        elements.comparisonResults.innerHTML = html.join("");

    }

    elements.comparisonSearch?.addEventListener(
        "input",
        renderPriceComparison
    );

    // La búsqueda pública se realiza en buscadores externos: no se simulan
    // cotizaciones ni se presentan precios que el sistema no haya consultado.
    const webSupplierSearch = $("webSupplierSearch");
    const webSupplierSearchButton = $("webSupplierSearchButton");
    const webSearchLinks = $("webSearchLinks");

    function buildWebSupplierSearch() {
        const term = webSupplierSearch?.value.trim();
        if (!term) {
            webSupplierSearch?.focus();
            notify("Escribe el producto que deseas cotizar.", "warning");
            return;
        }
        const query = `${term} precio proveedor mayorista Perú`;
        const encoded = encodeURIComponent(query);
        const shoppingURL = `https://www.google.com/search?tbm=shop&q=${encoded}`;
        const webURL = `https://www.google.com/search?q=${encoded}`;
        const mapsURL = `https://www.google.com/maps/search/${encodeURIComponent(`${term} proveedores`)}`;
        if (webSearchLinks) {
            webSearchLinks.innerHTML = `
                <a href="${shoppingURL}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-tags" aria-hidden="true"></i> Google Shopping</a>
                <a href="${webURL}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google" aria-hidden="true"></i> Buscar proveedores</a>
                <a href="${mapsURL}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Proveedores en Maps</a>
                <span>Resultados externos: verifica precio, presentación, disponibilidad, envío e impuestos antes de comparar.</span>
            `;
        }
    }
    webSupplierSearchButton?.addEventListener("click", buildWebSupplierSearch);
    webSupplierSearch?.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); buildWebSupplierSearch(); }
    });

    // ========================================================
    // 14. CONFIGURACIÓN DEL NEGOCIO
    // ========================================================

    // Los IDs deben coincidir exactamente con dashboard.html.
    const settingsForm = $("businessSettingsForm");
    const settingsSaveButton = $("saveBusinessSettingsButton");
    const settingsMessage = $("businessSettingsMessage");

    settingsForm?.addEventListener("submit", async event => {

        event.preventDefault();

        const businessName =
            elements.settingsBusinessName?.value.trim() || "";

        const ownerName =
            elements.settingsOwnerName?.value.trim() || "";

        if (!businessName || !ownerName) {

            setFormMessage(
                settingsMessage,
                "Completa el nombre del negocio y del propietario.",
                "error"
            );

            return;

        }

        setButtonLoading(
            settingsSaveButton,
            true,
            "Guardando..."
        );

        try {

            const { data, error } = await supabase
                .from("businesses")
                .update({
                    business_name: businessName,
                    owner_name: ownerName
                })
                .eq("id", currentBusiness.id)
                .eq("user_id", currentUser.id)
                .select("id, business_name, owner_name")
                .single();

            if (error) throw error;

            currentBusiness = data;

            updateBusinessProfile();

            setFormMessage(
                settingsMessage,
                "Los datos del negocio se actualizaron correctamente.",
                "success"
            );

            notify("Configuración actualizada.", "success");

        } catch (error) {

            console.error("Error al actualizar negocio:", error);

            setFormMessage(
                settingsMessage,
                error.message || "No se pudo actualizar el negocio.",
                "error"
            );

        } finally {

            setButtonLoading(settingsSaveButton, false);

        }

    });

    // ========================================================
    // 15. CERRAR SESIÓN
    // ========================================================

    elements.logout?.addEventListener("click", async () => {

        setButtonLoading(elements.logout, true, "Cerrando...");

        try {

            const { error } = await supabase.auth.signOut();

            if (error) throw error;

            window.location.replace("login.html");

        } catch (error) {

            console.error("Error al cerrar sesión:", error);

            notify("No se pudo cerrar la sesión.", "error");

            setButtonLoading(elements.logout, false);

        }

    });

    // ========================================================
    // 16. INICIALIZACIÓN DEL DASHBOARD
    // ========================================================

    try {

        state.loading = true;

        console.info("CompraSmart AI: iniciando dashboard...");

        const authenticated = await initializeUser();

        if (!authenticated) return;

        await Promise.all([
            loadSuppliers(),
            loadProducts(),
            loadInvoices()
        ]);

        await Promise.all([
            loadDashboardMetrics(),
            loadHistory(),
            loadPriceHistory()
        ]);

        state.initialized = true;

        console.info(
            "CompraSmart AI: dashboard cargado correctamente.",
            {
                proveedores: suppliers.length,
                productos: products.length,
                facturas: invoices.length,
                registrosPrecio: priceHistory.length
            }
        );

    } catch (error) {

        console.error(
            "CompraSmart AI: error al iniciar dashboard:",
            error
        );

        notify(
            error.message ||
            "No se pudo cargar el panel de control.",
            "error"
        );

    } finally {

        state.loading = false;

    }
});
