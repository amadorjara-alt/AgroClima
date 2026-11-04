/* Reinicio explícito del negocio actual; nunca se ejecuta al abrir el panel. */
"use strict";

window.CompraSmartHistoryReset = {
    mount({ client, button, dialog, cleanupButton, notice, userId, businessId,
        businessName, getInvoiceIds, onReset, isUploading = () => false,
        onBusyChange = () => {} }) {
        const doc = dialog.ownerDocument;
        const form = dialog.querySelector("form");
        const input = doc.getElementById("resetHistoryConfirmation");
        const submit = doc.getElementById("confirmResetHistoryButton");
        const cancel = doc.getElementById("cancelResetHistoryButton");
        const message = doc.getElementById("resetHistoryMessage");
        const summary = doc.getElementById("resetHistorySummary");
        const prefix = `${userId}/${businessId}/`;
        let busy = false;
        let pending = false;
        let expectedIds = [];

        function setNotice(text, type = "info") {
            notice.textContent = text;
            notice.className = `form-message ${type}`;
        }

        function refresh() {
            button.disabled = busy || getInvoiceIds().length === 0;
            cleanupButton.hidden = !pending;
            cleanupButton.disabled = busy;
            submit.disabled = busy || input.value !== "ELIMINAR";
            cancel.disabled = busy;
            input.disabled = busy;
            form.setAttribute("aria-busy", String(busy));
        }

        function setBusy(value) {
            busy = value;
            onBusyChange(value);
            refresh();
        }

        async function readPending() {
            const { data, error } = await client.from("invoice_file_deletions")
                .select("id, file_path").eq("user_id", userId)
                .eq("business_id", businessId).order("created_at").limit(100);
            if (error) throw error;
            return data || [];
        }

        async function checkPendingFiles() {
            try {
                pending = (await readPending()).length > 0;
                if (pending) setNotice("Hay archivos de un reinicio anterior pendientes de eliminar. Pulsa «Completar limpieza de archivos».", "warning");
            } catch {
                // Un fallo de red no debe ocultar el historial ni afirmar que está limpio.
                pending = true;
                setNotice("No se pudo consultar la limpieza de archivos. Puedes reintentar con «Completar limpieza de archivos».", "warning");
            }
            refresh();
        }

        async function cleanFiles() {
            // La cola persiste en Supabase para poder reintentar tras cerrar la página.
            for (let batch = 0; batch < 20; batch++) {
                const rows = await readPending();
                if (!rows.length) { pending = false; return; }
                pending = true;
                if (rows.some(row => typeof row.file_path !== "string" ||
                    !row.file_path.startsWith(prefix) || row.file_path.slice(prefix.length).includes("/"))) {
                    throw new Error("Se encontró una ruta de archivo no válida. No se eliminó ese archivo.");
                }
                const { error: storageError } = await client.storage.from("invoices")
                    .remove(rows.map(row => row.file_path));
                if (storageError) throw storageError;
                const { error: queueError } = await client.from("invoice_file_deletions")
                    .delete().eq("user_id", userId).eq("business_id", businessId)
                    .in("id", rows.map(row => row.id));
                if (queueError) throw queueError;
            }
            pending = (await readPending()).length > 0;
            if (pending) throw new Error("Quedan más archivos por eliminar. Pulsa de nuevo para continuar.");
        }

        button.addEventListener("click", () => {
            if (busy) return;
            if (isUploading()) {
                setNotice("Espera a que termine la subida o el procesamiento antes de reiniciar.", "warning");
                return;
            }
            expectedIds = [...getInvoiceIds()];
            if (!expectedIds.length) return;
            input.value = "";
            message.textContent = "";
            summary.textContent = `Se eliminarán ${expectedIds.length} comprobante(s) de «${businessName}», incluidos los borradores, sus archivos y sus precios históricos.`;
            refresh();
            dialog.showModal();
            cancel.focus();
        });

        input.addEventListener("input", refresh);
        cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
        dialog.addEventListener("close", () => { input.value = ""; button.focus(); });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (busy || !dialog.open || !expectedIds.length || input.value !== "ELIMINAR") return;
            if (isUploading()) {
                message.textContent = "Espera a que termine la subida antes de reiniciar.";
                return;
            }
            setBusy(true);
            message.textContent = "Reiniciando el historial…";
            let result;
            try {
                const { data, error } = await client.rpc("reset_purchase_history", {
                    p_business_id: businessId,
                    p_confirmation: input.value,
                    p_invoice_ids: expectedIds
                });
                if (error) throw error;
                if (data?.success !== true) throw new Error("No se pudo confirmar el reinicio. Recarga para comprobar el historial antes de reintentar.");
                result = data;
            } catch (error) {
                message.textContent = error.message || "No se pudo confirmar el resultado. Recarga para comprobar el historial antes de reintentar.";
                setBusy(false);
                return;
            }

            // El borrado de compras ya está confirmado. Los fallos posteriores
            // se distinguen para que el usuario no repita una operación destructiva.
            dialog.close();
            let refreshed = true;
            try { await onReset(); } catch { refreshed = false; }
            try {
                await cleanFiles();
                setNotice(refreshed
                    ? `Historial reiniciado: ${result.deleted_invoices} comprobante(s) eliminado(s). Puedes registrar nuevas compras.`
                    : "El historial se reinició. Recarga la página para actualizar todas las vistas.", refreshed ? "success" : "warning");
            } catch {
                pending = true;
                setNotice("El historial se reinició. Quedan archivos pendientes de eliminar; pulsa «Completar limpieza de archivos»." +
                    (refreshed ? "" : " Recarga también para actualizar las vistas."), "warning");
            } finally { setBusy(false); }
        });

        cleanupButton.addEventListener("click", async () => {
            if (busy) return;
            setBusy(true);
            try {
                await cleanFiles();
                setNotice("Limpieza de archivos completada.", "success");
            } catch (error) {
                pending = true;
                setNotice(error.message || "No se pudo completar la limpieza. Puedes reintentar.", "warning");
            } finally { setBusy(false); }
        });

        refresh();
        return { refresh, checkPendingFiles, isBusy: () => busy };
    }
};
