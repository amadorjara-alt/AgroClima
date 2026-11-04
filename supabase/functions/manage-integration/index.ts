import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { encryptSecret, validateCredentialChange } from "../_shared/credentials.mjs";
import { ocrConfiguration } from "../_shared/integration-status.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const allowedProviders = new Set(["gemini", "openai", "serpapi", "firecrawl", "ocrspace"]);
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

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
      return json({ success: true, integrations: data || [], services: {
        ocrspace: ocrConfiguration(data || [], Boolean(Deno.env.get("OCR_SPACE_API_KEY")?.trim())),
      } });
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
    // Una edición de modelo sin clave mantiene el cifrado y el IV originales.
    if (!apiKey) {
      const { data: existing, error: readError } = await admin.from("integration_credentials")
        .select("model").eq("user_id", userData.user.id).eq("provider", provider).maybeSingle();
      if (readError) throw new Error("No se pudo consultar la credencial guardada.");
      try { validateCredentialChange(apiKey, Boolean(existing)); }
      catch (error) { return json({ success: false, error: error instanceof Error ? error.message : "Cambio de credencial no válido." }, 400); }
      const { error: updateError } = await admin.from("integration_credentials")
        .update({ model: model || existing?.model || null, updated_at: new Date().toISOString() })
        .eq("user_id", userData.user.id).eq("provider", provider);
      if (updateError) throw new Error("No se pudo actualizar el modelo de la integración.");
      return json({ success: true, provider, saved: true, credential_changed: false });
    }
    try { validateCredentialChange(apiKey, false); }
    catch (error) { return json({ success: false, error: error instanceof Error ? error.message : "Cambio de credencial no válido." }, 400); }
    const encrypted = await encryptSecret(apiKey, Deno.env.get("CREDENTIALS_ENCRYPTION_KEY"));

    const { error: saveError } = await admin.from("integration_credentials").upsert({
      user_id: userData.user.id,
      provider,
      encrypted_key: encrypted.encrypted_key,
      iv: encrypted.iv,
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
