import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const allowedProviders = new Set(["gemini", "openai", "serpapi", "firecrawl"]);
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Falta configurar CREDENTIALS_ENCRYPTION_KEY en los secretos de Supabase.");
  const raw = decodeBase64(encoded);
  if (raw.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY debe contener exactamente 32 bytes codificados en Base64.");
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Faltan secretos internos de Supabase para inicializar el servidor.");
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ success: false, error: "Inicia sesión para administrar tus integraciones." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData.user) {
      return json({ success: false, error: "La sesión no es válida o ha caducado. Vuelve a iniciar sesión." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await request.json();
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await admin
        .from("integration_credentials")
        .select("provider, model, updated_at")
        .eq("user_id", userData.user.id);
      if (error) throw new Error("No se pudo consultar el estado de las integraciones.");
      return json({ success: true, integrations: data || [] });
    }

    if (action === "delete") {
      const provider = String(body?.provider || "");
      if (!allowedProviders.has(provider)) return json({ success: false, error: "Proveedor no válido." }, 400);
      const { error } = await admin.from("integration_credentials")
        .delete().eq("user_id", userData.user.id).eq("provider", provider);
      if (error) throw new Error("No se pudo eliminar la credencial.");
      return json({ success: true });
    }

    if (action !== "save") return json({ success: false, error: "Acción no válida." }, 400);

    const provider = String(body?.provider || "");
    const apiKey = String(body?.apiKey || "").trim();
    const model = String(body?.model || "").trim().slice(0, 100);
    if (!allowedProviders.has(provider)) return json({ success: false, error: "Proveedor no válido." }, 400);
    if (apiKey.length < 8 || apiKey.length > 4096) return json({ success: false, error: "La clave API no tiene una longitud válida." }, 400);

    const key = await encryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(apiKey),
    );

    const { error: saveError } = await admin.from("integration_credentials").upsert({
      user_id: userData.user.id,
      provider,
      encrypted_key: encodeBase64(new Uint8Array(encrypted)),
      iv: encodeBase64(iv),
      model: model || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    if (saveError) {
      console.error("Credential vault database error:", saveError.code);
      throw new Error("El servidor no pudo guardar la credencial. Comprueba la migración de base de datos.");
    }

    // Nunca devolver, registrar ni persistir la clave en texto plano.
    return json({ success: true, provider, saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor.";
    console.error("manage-integration:", message);
    return json({ success: false, error: message }, 500);
  }
});
