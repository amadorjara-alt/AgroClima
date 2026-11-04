/* Cálculos puros: no consultan servicios ni mezclan monedas. */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.CompraSmartAnalytics = api;
})(globalThis, function () {
    "use strict";
    const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
    function amount(value) {
        if (value === null || value === undefined || String(value).trim() === "") return null;
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : null;
    }
    function currencyOf(row) {
        const code = String(row.currency || "").trim().toUpperCase();
        return /^[A-Z]{3}$/.test(code) ? code : "UNKNOWN";
    }
    function dayKey(value, timeZone = "America/Lima") {
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const date = new Date(value + "T00:00:00Z");
            return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(p => [p.type, p.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    }
    function summary(rows) {
        const totals = {}, statuses = { pending: 0, processing: 0, review: 0, completed: 0, failed: 0, other: 0 };
        for (const row of rows || []) {
            const status = Object.hasOwn(statuses, row.ocr_status) ? row.ocr_status : "other";
            statuses[status]++;
            const value = amount(row.total_amount);
            if (status !== "completed" || value === null) continue;
            const currency = currencyOf(row);
            totals[currency] = round((totals[currency] || 0) + value);
        }
        return { totals, statuses, count: (rows || []).length };
    }
    function monthlySeries(rows, { now = new Date(), months = 6, timeZone = "America/Lima" } = {}) {
        const today = dayKey(now, timeZone);
        const [year, month] = today.split("-").map(Number);
        const keys = [], labels = [];
        for (let offset = months - 1; offset >= 0; offset--) {
            const date = new Date(Date.UTC(year, month - 1 - offset, 1));
            keys.push(date.toISOString().slice(0, 7));
            labels.push(new Intl.DateTimeFormat("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date));
        }
        const groups = new Map();
        for (const row of rows || []) {
            if (row.ocr_status !== "completed") continue;
            const value = amount(row.total_amount);
            const day = dayKey(row.issue_date || row.created_at, timeZone);
            const index = keys.indexOf(day.slice(0, 7));
            if (value === null || !day || day > today || index < 0) continue;
            const code = currencyOf(row);
            if (!groups.has(code)) groups.set(code, keys.map(() => 0));
            groups.get(code)[index] = round(groups.get(code)[index] + value);
        }
        return { keys, labels, datasets: [...groups].map(([currency, values]) => ({ currency, values })) };
    }
    function recentOffers(records, invoices, { now = new Date(), days = 30 } = {}) {
        const invoiceMap = new Map((invoices || []).map(row => [String(row.id), row]));
        const cutoff = now.getTime() - days * 86400000;
        const latest = new Map();
        for (const record of records || []) {
            const invoice = invoiceMap.get(String(record.invoice_id));
            const date = new Date(record.recorded_at).getTime(), price = amount(record.unit_price);
            if (!invoice || invoice.ocr_status !== "completed" || !record.product_id || !record.supplier_id || price === null || price <= 0 || !Number.isFinite(date) || date < cutoff || date > now.getTime()) continue;
            const currency = currencyOf(invoice);
            if (currency === "UNKNOWN") continue;
            const key = `${record.product_id}|${record.supplier_id}|${currency}`;
            if (!latest.has(key) || date > new Date(latest.get(key).recorded_at).getTime()) latest.set(key, { ...record, currency });
        }
        return [...latest.values()];
    }
    return Object.freeze({ amount, currencyOf, dayKey, summary, monthlySeries, recentOffers });
});
