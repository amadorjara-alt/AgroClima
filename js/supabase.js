/* ============================================================
   COMPRASMART AI
   Archivo: js/supabase.js
   Configuración centralizada de Supabase
   ============================================================ */

"use strict";

(() => {

    // ========================================================
    // 1. EVITAR CLIENTES DUPLICADOS
    // ========================================================

    if (window.supabaseClient) {
        console.info(
            "CompraSmart AI: Supabase ya está inicializado."
        );
        return;
    }


    // ========================================================
    // 2. CONFIGURACIÓN DEL PROYECTO
    // ========================================================

    const SUPABASE_URL =
        "https://fledooqwmwrjufeihoqn.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_4V5bc5maOIaPuewvSXYLdQ_adHnSKmn";


    // ========================================================
    // 3. ESTADO CENTRALIZADO
    // ========================================================

    let supabaseClient = null;
    let initializationError = null;
    let authCapabilitiesRequest = null;

    async function readAuthCapabilities() {
        try {
            const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
                headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) return { known: false, google: false };
            const settings = await response.json();
            if (!settings.external || typeof settings.external !== "object") return { known: false, google: false };
            return { known: true, google: settings.external.google === true };
        } catch {
            // La disponibilidad pública no sustituye la verificación del login.
            return { known: false, google: false };
        }
    }


    // ========================================================
    // 4. VALIDAR CONFIGURACIÓN
    // ========================================================

    function validateConfiguration() {

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            throw new Error(
                "Falta configurar las credenciales públicas de Supabase."
            );
        }

        let parsedURL;

        try {
            parsedURL = new URL(SUPABASE_URL);
        } catch {
            throw new Error(
                "La URL de Supabase no tiene un formato válido."
            );
        }

        if (
            parsedURL.protocol !== "https:" ||
            !parsedURL.hostname.endsWith(".supabase.co")
        ) {
            throw new Error(
                "La URL del proyecto Supabase no es válida."
            );
        }

        if (
            !SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
        ) {
            throw new Error(
                "Debes utilizar una clave pública publishable."
            );
        }

    }


    // ========================================================
    // 5. COMPROBAR LA BIBLIOTECA
    // ========================================================

    function getSupabaseLibrary() {

        const library = window.supabase;

        if (
            !library ||
            typeof library.createClient !== "function"
        ) {
            throw new Error(
                "No se ha cargado Supabase JS. Comprueba la biblioteca CDN."
            );
        }

        return library;

    }


    // ========================================================
    // 6. CREAR CLIENTE SUPABASE
    // ========================================================

    function createSupabaseClient() {

        validateConfiguration();

        const library = getSupabaseLibrary();

        return library.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    flowType: "pkce"
                },

                db: {
                    schema: "public"
                },

                global: {
                    headers: {
                        "X-Client-Info": "comprasmart-ai-web"
                    }
                }
            }
        );

    }


    // ========================================================
    // 7. INICIALIZAR CONEXIÓN
    // ========================================================

    try {

        supabaseClient = createSupabaseClient();

        if (
            !supabaseClient ||
            !supabaseClient.auth ||
            typeof supabaseClient.from !== "function"
        ) {
            throw new Error(
                "No se pudo crear un cliente Supabase válido."
            );
        }

        window.supabaseClient = supabaseClient;

        console.info(
            "CompraSmart AI: cliente Supabase inicializado."
        );

    } catch (error) {

        initializationError = error;

        supabaseClient = null;

        window.supabaseClient = null;

        console.error(
            "CompraSmart AI: error de inicialización:",
            error.message
        );

    }


    // ========================================================
    // 8. INTERFAZ CENTRAL DE SUPABASE
    // ========================================================

    window.CompraSmartSupabase = Object.freeze({

        getClient() {
            return supabaseClient;
        },

        isInitialized() {
            return Boolean(supabaseClient);
        },

        getProjectURL() {
            return SUPABASE_URL;
        },

        getAuthCapabilities({ refresh = false } = {}) {
            if (!authCapabilitiesRequest || refresh) authCapabilitiesRequest = readAuthCapabilities();
            return authCapabilitiesRequest;
        },

        getInitializationError() {
            return initializationError
                ? initializationError.message
                : null;
        },

        async getSession() {

            if (!supabaseClient) {
                return {
                    session: null,
                    error: initializationError
                };
            }

            const { data, error } =
                await supabaseClient.auth.getSession();

            return {
                session: data?.session || null,
                error
            };

        },

        async getCurrentUser() {

            if (!supabaseClient) {
                return {
                    user: null,
                    error: initializationError
                };
            }

            const { data, error } =
                await supabaseClient.auth.getUser();

            return {
                user: data?.user || null,
                error
            };

        },

        async signOut() {

            if (!supabaseClient) {
                return {
                    error: initializationError
                };
            }

            const { error } =
                await supabaseClient.auth.signOut();

            return { error };

        }

    });


    // ========================================================
    // 9. ESTADO DE AUTENTICACIÓN
    // ========================================================

    if (supabaseClient) {

        supabaseClient.auth.onAuthStateChange(
            (event, session) => {

                console.info(
                    "CompraSmart AI: estado de autenticación:",
                    event
                );

                window.dispatchEvent(
                    new CustomEvent("comprasmart:auth-change", {
                        detail: {
                            event,
                            session
                        }
                    })
                );

            }
        );

    }

})();


