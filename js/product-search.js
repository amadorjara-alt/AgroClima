(function (root) {
    "use strict";

    const messages = {
        SEARCH_RATE_LIMIT: "La búsqueda web alcanzó su límite temporal. Prueba más tarde; puedes seguir consultando tus compras guardadas.",
        SEARCH_TIMEOUT: "La búsqueda tardó demasiado. Vuelve a intentarlo.",
        SEARCH_AUTH: "Tu sesión ha caducado. Vuelve a iniciar sesión para buscar en Internet."
    };

    function safeURL(value) {
        try {
            const url = new URL(value);
            return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
        } catch { return null; }
    }

    function mount({client, form, input, button, status, results, list, caption, isReady = () => true}) {
        if (!form || !input || !button || !status || !results || !list) return;
        const doc = form.ownerDocument;
        const initialLabel = button.innerHTML;
        let requestNumber = 0;
        let pending = false;
        const say = (text, error = false) => {
            status.textContent = text;
            status.classList.toggle("error", error);
        };
        const finish = () => {
            pending = false;
            button.disabled = false;
            button.innerHTML = initialLabel;
            results.removeAttribute("aria-busy");
        };

        input.addEventListener("input", () => {
            requestNumber++;
            finish();
            results.hidden = true;
            list.replaceChildren();
            say("");
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (pending) return;
            const term = input.value.trim().replace(/\s+/g, " ");
            if (term.length < 2 || term.length > 120) {
                say("Escribe un producto de entre 2 y 120 caracteres.", true);
                input.focus();
                return;
            }
            if (!isReady()) {
                say("Espera a que termine de cargar tu negocio y vuelve a buscar.");
                return;
            }
            const currentRequest = ++requestNumber;
            pending = true;
            button.disabled = true;
            button.textContent = "Buscando…";
            results.hidden = true;
            list.replaceChildren();
            results.setAttribute("aria-busy", "true");
            say(`Buscando «${term}» en Internet…`);
            try {
                const {data: session, error: sessionError} = await client.auth.getSession();
                const token = session?.session?.access_token;
                if (sessionError || !token) throw {code: "SEARCH_AUTH"};
                if (currentRequest !== requestNumber) return;
                const {data, error} = await client.functions.invoke("search-products", {
                    body: {query: term}, headers: {Authorization: `Bearer ${token}`}
                });
                if (currentRequest !== requestNumber) return;
                if (error || !data?.success) {
                    let failure = data;
                    try { if (error?.context?.json) failure = await error.context.json(); } catch { /* Mensaje local seguro. */ }
                    throw {code: failure?.code || (error?.context?.status === 401 ? "SEARCH_AUTH" : "SEARCH_UNAVAILABLE")};
                }
                const rows = (Array.isArray(data.results) ? data.results : []).slice(0, 5);
                let count = 0;
                for (const row of rows) {
                    const url = safeURL(row.url);
                    if (!url) continue;
                    const card = doc.createElement("article");
                    card.className = "web-search-result";
                    const source = doc.createElement("small");
                    source.textContent = url.hostname.replace(/^www\./, "");
                    const title = doc.createElement("h4");
                    title.textContent = String(row.title || url.hostname).slice(0, 180);
                    const snippet = doc.createElement("p");
                    snippet.textContent = String(row.content || "Abre la fuente para consultar el producto y sus condiciones.").slice(0, 420);
                    const link = doc.createElement("a");
                    link.href = url.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = "Abrir fuente ↗";
                    link.setAttribute("aria-label", `Abrir fuente: ${title.textContent}`);
                    card.append(source, title, snippet, link);
                    list.append(card);
                    count++;
                }
                if (caption) {
                    const date = new Date(data.fetched_at);
                    const stamp = Number.isNaN(date.getTime()) ? "" : ` · Consultado ${date.toLocaleString("es-PE")}`;
                    caption.textContent = `Fuentes para «${term}»${stamp} · Revisa las condiciones vigentes con cada proveedor.`;
                }
                if (!count) {
                    const empty = doc.createElement("p");
                    empty.textContent = "No encontramos fuentes para este producto. Prueba con la marca o presentación.";
                    list.append(empty);
                }
                say(count ? `${count} fuente${count === 1 ? "" : "s"} encontrada${count === 1 ? "" : "s"}. Resultados debajo.` : "Búsqueda completada sin resultados.");
                results.hidden = false;
                results.focus({preventScroll: true});
                results.scrollIntoView?.({behavior: "smooth", block: "start"});
            } catch (error) {
                if (currentRequest !== requestNumber) return;
                say(messages[error?.code] || "No se pudo consultar Internet. Vuelve a intentarlo; tus compras guardadas siguen disponibles.", true);
            } finally {
                if (currentRequest === requestNumber) finish();
            }
        });
    }
    root.CompraSmartProductSearch = {mount};
})(window);
