"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const client = window.supabaseClient;
  const $ = id => document.getElementById(id);
  const form = $("geminiIntegrationForm");
  const keyInput = $("geminiKey");
  const saveButton = $("saveGeminiKey");
  const deleteButton = $("deleteGeminiKey");
  const verifyButton = $("verifyGeminiKey");
  const message = $("geminiMessage");
  let geminiConfigured = false;
  if (!client) { if (message) { message.textContent = "No se pudo conectar con Supabase. Recarga la página."; message.classList.add("error"); } return; }

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) { location.replace("login.html"); return; }
  const eye = $("toggleGeminiKey");
  $("statusLeaflet").textContent = window.L ? "Cargada · sin clave" : "No cargó";
  $("leafletStatus").textContent = window.L ? "Biblioteca Leaflet cargada en esta página." : "No se pudo cargar Leaflet; revisa la conexión a Internet.";
  $("statusChartJs").textContent = window.Chart ? "Cargada · sin clave" : "No cargó";
  $("chartJsStatus").textContent = window.Chart ? "Biblioteca Chart.js cargada en esta página." : "No se pudo cargar Chart.js; revisa la conexión a Internet.";
  eye?.addEventListener("click", () => {
    const visible = keyInput.type === "text";
    keyInput.type = visible ? "password" : "text";
    eye.setAttribute("aria-pressed", String(!visible));
    eye.setAttribute("aria-label", visible ? "Mostrar clave" : "Ocultar clave");
  });

  function report(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }
  async function invokeVault(payload) {
    const { data, error } = await client.functions.invoke("manage-integration", { body: payload });
    if (error) {
      let detail = error.message || "No se pudo conectar con el servicio seguro.";
      try { const body = await error.context?.clone?.().json(); detail = body?.error || body?.message || detail; } catch { /* Conserva el error del SDK. */ }
      throw new Error(detail);
    }
    if (!data?.success) throw new Error(data?.error || "Supabase no confirmó la operación.");
    return data;
  }
  async function refreshStatus() {
    try {
      const result = await invokeVault({ action: "list" });
      geminiConfigured = (result.integrations || []).some(item => item.provider === "gemini");
      deleteButton.hidden = !geminiConfigured;
      verifyButton.hidden = !geminiConfigured;
      keyInput.placeholder = geminiConfigured ? "••••••••••••••••  · clave guardada" : "Pega aquí tu clave de Gemini";
      report(geminiConfigured ? "Clave API configurada · Gemini listo para responder en el chat." : "Sin clave API · guarda una clave de Gemini para activar el chat.");
    } catch (error) {
      deleteButton.hidden = true;
      verifyButton.hidden = true;
      report(`${error.message} Si el problema continúa, avisa al administrador del proyecto.`, true);
    }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const apiKey = keyInput.value.trim();
    if (apiKey.length < 8 || apiKey.length > 4096) { report("Pega una clave Gemini válida (entre 8 y 4096 caracteres).", true); keyInput.focus(); return; }
    saveButton.disabled = true;
    report("Enviando al servidor seguro para cifrar la clave…");
    try {
      await invokeVault({ action: "save", provider: "gemini", apiKey, model: "gemini-3.8-flash" });
      keyInput.value = "";
      geminiConfigured = true;
      keyInput.placeholder = "••••••••••••••••  · clave guardada";
      report("Clave guardada cifrada. Ya puedes abrir el chat de ayuda con IA.");
      deleteButton.hidden = false;
      verifyButton.hidden = false;
    } catch (error) { report(error.message, true); }
    finally { saveButton.disabled = false; }
  });
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("¿Quitar tu clave de Gemini? El chat de IA dejará de responder hasta que configures otra.")) return;
    deleteButton.disabled = true;
    try { await invokeVault({ action: "delete", provider: "gemini" }); geminiConfigured = false; keyInput.placeholder = "Pega aquí tu clave de Gemini"; report("Sin clave API · la clave se quitó de tu cuenta."); deleteButton.hidden = true; verifyButton.hidden = true; }
    catch (error) { report(error.message, true); }
    finally { deleteButton.disabled = false; }
  });

  async function firstFarmCoordinates() {
    const { data, error } = await client.from("farms").select("name,latitude,longitude").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("No se pudo consultar un terreno de tu cuenta.");
    if (!data) throw new Error("Registra un terreno antes de probar este servicio.");
    return data;
  }
  $("testOpenMeteo").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    $("statusOpenMeteo").textContent = "Probando…";
    $("openMeteoStatus").textContent = "Consultando el pronóstico con la ubicación guardada…";
    try {
      const farm = await firstFarmCoordinates();
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({ latitude: String(farm.latitude), longitude: String(farm.longitude), current: "temperature_2m", forecast_days: "1", timezone: "auto" });
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}.`);
      const result = await response.json();
      $("statusOpenMeteo").textContent = "Conectada · sin clave";
      $("openMeteoStatus").textContent = `Conexión correcta para “${farm.name}” · ${Number(result.current.temperature_2m).toFixed(1)} °C.`;
    } catch (error) { $("statusOpenMeteo").textContent = "No responde"; $("openMeteoStatus").textContent = error.message || "No se pudo comprobar Open-Meteo."; }
    finally { button.disabled = false; }
  });
  let lastNominatimCheck = 0;
  $("testNominatim").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    $("statusNominatim").textContent = "Probando…";
    $("nominatimStatus").textContent = "Consultando la localidad aproximada de un terreno…";
    try {
      const delay = Math.max(0, 1100 - (Date.now() - lastNominatimCheck));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const farm = await firstFarmCoordinates();
      lastNominatimCheck = Date.now();
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.search = new URLSearchParams({ format: "jsonv2", lat: String(farm.latitude), lon: String(farm.longitude), zoom: "10", addressdetails: "1" });
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Nominatim respondió ${response.status}.`);
      const result = await response.json();
      const address = result.address || {};
      const locality = [address.city || address.town || address.village || address.municipality || address.county, address.state, address.country].filter(Boolean).join(", ") || result.display_name || "localidad encontrada";
      $("statusNominatim").textContent = "Conectada · sin clave";
      $("nominatimStatus").textContent = `Conexión correcta para “${farm.name}” · ${locality}.`;
    } catch (error) { $("statusNominatim").textContent = "No responde"; $("nominatimStatus").textContent = error.message || "No se pudo comprobar Nominatim."; }
    finally { button.disabled = false; }
  });
  verifyButton.addEventListener("click", async () => {
    if (!geminiConfigured) return;
    if (!window.confirm("Se enviará una consulta mínima a Gemini con tu clave y se usará tu cuota de API. ¿Continuar?")) return;
    verifyButton.disabled = true;
    report("Enviando una consulta de prueba…");
    try {
      const { data, error } = await client.functions.invoke("agroclima-support", { body: { messages: [{ role: "user", text: "Responde exactamente: Conexión correcta." }] } });
      if (error) throw error;
      if (!data?.reply) throw new Error(data?.error || "Gemini no devolvió una respuesta.");
      report("Gemini responde correctamente. La clave está activa.");
    } catch (error) {
      let detail = error.message || "No se pudo probar Gemini.";
      try { const body = await error.context?.clone?.().json(); detail = body?.error || body?.message || detail; } catch { /* Mantiene el texto del SDK. */ }
      report(detail, true);
    } finally { verifyButton.disabled = false; }
  });
  await refreshStatus();
});

