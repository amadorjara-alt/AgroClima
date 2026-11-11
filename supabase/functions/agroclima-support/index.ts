import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MODEL = "gemini-3.8-flash";
const allowedOrigins = new Set([
  "https://amadorjara-alt.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function headersFor(request: Request) {
  const requestOrigin = request.headers.get("Origin") || "";
  const origin = allowedOrigins.has(requestOrigin) ? requestOrigin : "https://amadorjara-alt.github.io";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(request) });
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function decryptCredential(record: { encrypted_key: string; iv: string }, encodedKey: string | undefined) {
  if (!encodedKey) throw new Error("No está configurado el cifrado seguro de integraciones en Supabase.");
  const rawKey = decodeBase64(encodedKey);
  if (rawKey.length !== 32) throw new Error("La configuración de cifrado de integraciones no es válida.");
  const iv = decodeBase64(record.iv);
  if (iv.length !== 12) throw new Error("La clave guardada tiene un formato no válido.");
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, decodeBase64(record.encrypted_key));
  return new TextDecoder().decode(plain);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headersFor(request) });
  if (request.method !== "POST") return json(request, { error: "Método no permitido." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json(request, { error: "Origen no permitido." }, 403);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 12000) return json(request, { error: "La conversación es demasiado larga." }, 413);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(request, { error: "El servidor de soporte no está listo. Avisa al administrador del proyecto." }, 503);
    }

    const bearer = request.headers.get("Authorization") || "";
    const accessToken = bearer.replace(/^Bearer\s+/i, "");
    if (!accessToken) return json(request, { error: "Inicia sesión para usar el asistente." }, 401);
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !userData.user) return json(request, { error: "La sesión venció. Vuelve a iniciar sesión." }, 401);
    if (userData.user.email && !userData.user.email_confirmed_at) return json(request, { error: "Confirma tu correo antes de usar el asistente." }, 403);

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 8) {
      return json(request, { error: "No pude leer la conversación. Vuelve a enviar tu mensaje." }, 400);
    }
    const messages = body.messages.map((message: { role?: unknown; text?: unknown }) => ({
      role: message?.role === "model" ? "model" : message?.role === "user" ? "user" : "",
      text: typeof message?.text === "string" ? message.text.trim() : "",
    }));
    if (messages.some(message => !message.role || message.text.length < 1 || message.text.length > 1500) || messages.at(-1)?.role !== "user") {
      return json(request, { error: "Cada mensaje debe tener texto y no superar 1500 caracteres." }, 400);
    }
    if (messages.reduce((total, message) => total + message.text.length, 0) > 6000) {
      return json(request, { error: "La conversación supera el tamaño permitido. Empieza una nueva pregunta." }, 413);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: credential, error: credentialError } = await admin.from("integration_credentials")
      .select("encrypted_key, iv").eq("user_id", userData.user.id).eq("provider", "gemini").maybeSingle();
    if (credentialError) return json(request, { error: "No pude revisar la configuración de Gemini. Inténtalo más tarde." }, 500);
    if (!credential) return json(request, { error: "Gemini aún no está configurado. Abre Integraciones y guarda tu clave API para activar el chat." }, 409);

    let apiKey = "";
    try { apiKey = await decryptCredential(credential, Deno.env.get("CREDENTIALS_ENCRYPTION_KEY")); }
    catch (error) {
      console.error("agroclima-support: credential decryption failed");
      return json(request, { error: "No pude abrir la clave guardada. Actualízala en Integraciones." }, 503);
    }

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres el asistente de soporte de AgroClima, una aplicación web en español para monitorear terrenos agrícolas en Perú. Ayuda a usar la plataforma: registrar cultivos y coordenadas, leer el pronóstico de siete días, ajustar umbrales de lluvia/viento/temperatura y revisar el historial. Sé amable, directo y breve. No afirmes que conoces datos del usuario o del terreno: la conversación no recibe sus datos, ubicación ni historial. No inventes el clima actual; invita a consultar Open-Meteo en el panel. Las alertas son referencias configuradas por cada usuario, no avisos oficiales ni asesoría agronómica. Nunca pidas contraseñas, códigos ni claves API." }] },
        contents: messages.map(message => ({ role: message.role, parts: [{ text: message.text }] })),
        generationConfig: { maxOutputTokens: 700, temperature: 0.45 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (geminiResponse.status === 429) return json(request, { error: "Gemini alcanzó su límite temporal. Espera un momento y vuelve a intentar." }, 429);
    if (geminiResponse.status === 401 || geminiResponse.status === 403) return json(request, { error: "Gemini rechazó la clave guardada. Actualízala en Integraciones." }, 502);
    if (!geminiResponse.ok) {
      console.error("agroclima-support: Gemini request failed", geminiResponse.status);
      return json(request, { error: "Gemini no pudo responder ahora. Inténtalo nuevamente en unos minutos." }, 502);
    }
    const result = await geminiResponse.json();
    const reply = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!reply) return json(request, { error: "Gemini no generó una respuesta. Prueba con otra pregunta." }, 502);
    return json(request, { reply: reply.slice(0, 5000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") return json(request, { error: "La consulta tardó demasiado. Inténtalo de nuevo." }, 504);
    console.error("agroclima-support: request failed");
    return json(request, { error: "Ocurrió un error temporal al atender tu consulta." }, 500);
  }
});

