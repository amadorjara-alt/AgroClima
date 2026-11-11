"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const client = window.supabaseClient;
  if (!client) { location.replace("login.html"); return; }
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) { location.replace("login.html"); return; }
  if (user.email && !user.email_confirmed_at) {
    await client.auth.signOut();
    location.replace("login.html?confirm=1");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const state = { farms: [], weather: new Map(), activeFarmId: "", locationPick: null, map: null, overviewMap: null, pins: [], overviewPins: [], rainChart: null, temperatureChart: null, toastTimer: 0, lastGeoAt: 0, geoQueue: Promise.resolve() };
  const titles = { overview: "Resumen agroclimático", farms: "Terrenos agrícolas", weather: "Clima y alertas", history: "Historial meteorológico", settings: "Umbrales de alerta" };
  $("userEmail").textContent = user.email || "Cuenta AgroClima";

  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]); }
  function toast(message, error = false) { const node = $("toast"); node.textContent = message; node.classList.toggle("error", error); node.hidden = false; clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.hidden = true, 3800); }
  function setBusy(button, busy, text) { button.disabled = busy; if (text) button.textContent = busy ? "Consultando…" : text; }
  function formatDate(date, options = { weekday: "short", day: "numeric", month: "short" }) { return new Intl.DateTimeFormat("es-PE", options).format(new Date(`${date}T12:00:00`)); }
  function setView(view) { document.querySelectorAll(".page-view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`)); document.querySelectorAll(".side-nav button").forEach(el => el.classList.toggle("active", el.dataset.view === view)); $("pageTitle").textContent = titles[view] || "AgroClima"; if (view === "farms") setTimeout(() => state.map?.invalidateSize(), 80); if (view === "weather") { const farm = state.farms.find(f => f.id === $("weatherFarmSelect").value); if (farm && state.weather.has(farm.id)) renderForecast(farm, state.weather.get(farm.id)); } }
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-view-link]").forEach(button => button.addEventListener("click", () => setView(button.dataset.viewLink)));

  async function loadFarms() {
    const { data, error } = await client.from("farms").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message.includes("farms") ? "Faltan las tablas de AgroClima en Supabase. Aplica la migración supabase/migrations/20261110090000_agroclima.sql." : error.message);
    state.farms = data || [];
    renderFarms(); renderMapMarkers(); updateMetrics(); syncFarmSelectors();
  }

  function farmCard(farm, compact = false) {
    const selected = farm.id === state.activeFarmId ? " selected" : "";
    return `<article class="farm-card${selected}" data-select-farm="${escapeHTML(farm.id)}"><div class="farm-inline"><h4>${escapeHTML(farm.name)}</h4><span class="tag">${escapeHTML(farm.crop)}</span></div><p>${escapeHTML(farm.locality || `${farm.latitude}, ${farm.longitude}`)} · ${Number(farm.area_hectares).toLocaleString("es-PE")} ha</p>${compact ? "" : `<div class="form-actions"><button class="button-small button-outline" data-edit-farm="${escapeHTML(farm.id)}">Editar</button><button class="button-small button-outline" data-delete-farm="${escapeHTML(farm.id)}">Eliminar</button></div>`}</article>`;
  }

  function renderFarms() {
    const empty = '<div class="empty">Todavía no tienes terrenos. Registra uno para empezar.</div>';
    $("farmsList").innerHTML = state.farms.length ? state.farms.map(f => farmCard(f)).join("") : empty;
    $("overviewFarms").innerHTML = state.farms.length ? state.farms.slice(0, 4).map(f => farmCard(f, true)).join("") : '<div class="empty">Registra tu primer terreno para empezar.</div>';
    document.querySelectorAll("[data-select-farm]").forEach(el => el.addEventListener("click", event => { if (event.target.closest("button")) return; chooseFarm(el.dataset.selectFarm); }));
    document.querySelectorAll("[data-edit-farm]").forEach(el => el.addEventListener("click", event => { event.stopPropagation(); openFarm(el.dataset.editFarm); }));
    document.querySelectorAll("[data-delete-farm]").forEach(el => el.addEventListener("click", event => { event.stopPropagation(); deleteFarm(el.dataset.deleteFarm); }));
  }

  function syncFarmSelectors() {
    const selects = [$("weatherFarmSelect"), $("thresholdFarmSelect")];
    for (const select of selects) {
      const value = select.value;
      select.innerHTML = '<option value="">Selecciona un terreno</option>' + state.farms.map(f => `<option value="${escapeHTML(f.id)}">${escapeHTML(f.name)} · ${escapeHTML(f.locality || f.crop)}</option>`).join("");
      if (state.farms.some(f => f.id === value)) select.value = value;
    }
    if (!state.activeFarmId && state.farms.length) state.activeFarmId = state.farms[0].id;
  }

  function ensureMaps() {
    if (!window.L) return;
    if (!state.map) {
      state.map = L.map("farmsMap", { scrollWheelZoom: false }).setView([-9.19, -75.015], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(state.map);
      state.map.on("click", async e => {
        const picked = { latitude: Number(e.latlng.lat.toFixed(6)), longitude: Number(e.latlng.lng.toFixed(6)), locality: "" };
        state.locationPick = picked;
        if ($("farmDialog").open) { $("farmLatitude").value = picked.latitude; $("farmLongitude").value = picked.longitude; }
        const place = await reverseGeocode(picked.latitude, picked.longitude);
        if (place) { picked.locality = place; if ($("farmDialog").open) $("farmLocality").value = place; }
        if (!$("farmDialog").open) toast(place ? `Ubicación seleccionada: ${place}. Ahora registra el terreno.` : "Coordenadas seleccionadas. Ahora registra el terreno.");
      });
    }
    if (!window.overviewLeafletMap) {
      state.overviewMap = L.map("overviewMap", { scrollWheelZoom: false }).setView([-9.19, -75.015], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(state.overviewMap);
    }
  }

  function renderMapMarkers() {
    ensureMaps(); if (!state.map) return;
    state.pins.forEach(pin => pin.remove()); state.pins = [];
    state.overviewPins.forEach(pin => pin.remove()); state.overviewPins = [];
    const points = state.farms.map(f => [Number(f.latitude), Number(f.longitude)]);
    state.farms.forEach(f => {
      const marker = L.marker([f.latitude, f.longitude]).addTo(state.map).bindPopup(`<div class="farm-popup"><strong>${escapeHTML(f.name)}</strong><br><span>${escapeHTML(f.crop)} · ${escapeHTML(f.locality)}</span></div>`);
      marker.on("click", () => chooseFarm(f.id)); state.pins.push(marker);
      const overviewPin = L.marker([f.latitude, f.longitude]).addTo(state.overviewMap).bindPopup(`<div class="farm-popup"><strong>${escapeHTML(f.name)}</strong><br><span>${escapeHTML(f.crop)} · ${escapeHTML(f.locality)}</span></div>`);
      state.overviewPins.push(overviewPin);
    });
    if (points.length) { state.map.fitBounds(points, { padding: [30, 30], maxZoom: 11 }); state.overviewMap.fitBounds(points, { padding: [24, 24], maxZoom: 10 }); }
    else { state.map.setView([-9.19, -75.015], 5); state.overviewMap.setView([-9.19, -75.015], 5); }
  }

  function chooseFarm(id) { state.activeFarmId = id; $("weatherFarmSelect").value = id; $("thresholdFarmSelect").value = id; renderFarms(); loadThresholds(); setView("weather"); }
  function openFarm(id = "") {
    const form = $("farmForm"); form.reset(); $("farmId")?.remove();
    const farm = state.farms.find(f => f.id === id);
    if (farm) {
      const hidden = document.createElement("input"); hidden.type = "hidden"; hidden.id = "farmId"; hidden.value = farm.id; form.prepend(hidden);
      $("farmName").value = farm.name; $("farmCrop").value = farm.crop; $("farmArea").value = farm.area_hectares; $("farmLocality").value = farm.locality;
      $("farmLatitude").value = farm.latitude; $("farmLongitude").value = farm.longitude;
      document.querySelector("#farmDialog h3").textContent = "Editar terreno";
    } else {
      document.querySelector("#farmDialog h3").textContent = "Registrar terreno";
      if (state.locationPick) { $("farmLatitude").value = state.locationPick.latitude; $("farmLongitude").value = state.locationPick.longitude; $("farmLocality").value = state.locationPick.locality; }
    }
    $("farmDialog").showModal(); setTimeout(() => state.map?.invalidateSize(), 80);
  }
  document.querySelectorAll("[data-open-farm]").forEach(el => el.addEventListener("click", () => openFarm()));
  $("closeFarmDialog").addEventListener("click", () => $("farmDialog").close()); $("cancelFarm").addEventListener("click", () => $("farmDialog").close());

  async function reverseGeocode(lat, lon) {
    const request = state.geoQueue.then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - state.lastGeoAt)); if (wait) await new Promise(r => setTimeout(r, wait)); state.lastGeoAt = Date.now();
      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse"); url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon), zoom: "10", addressdetails: "1" });
        const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }); if (!response.ok) return "";
        const data = await response.json(), a = data.address || {}; return [a.city || a.town || a.village || a.municipality || a.county, a.state, a.country].filter(Boolean).join(", ") || data.display_name || "";
      } catch { return ""; }
    });
    state.geoQueue = request.catch(() => "");
    return request;
  }

  $("farmForm").addEventListener("submit", async event => {
    event.preventDefault(); const button = $("saveFarmButton"); setBusy(button, true, "Guardar terreno");
    try {
      const lat = Number($("farmLatitude").value), lon = Number($("farmLongitude").value);
      let locality = $("farmLocality").value.trim(); if (!locality) locality = await reverseGeocode(lat, lon);
      const payload = { name: $("farmName").value.trim(), crop: $("farmCrop").value.trim(), area_hectares: Number($("farmArea").value), latitude: lat, longitude: lon, locality };
      const id = $("farmId")?.value; const result = id ? await client.from("farms").update(payload).eq("id", id) : await client.from("farms").insert(payload);
      if (result.error) throw result.error;
      $("farmDialog").close(); if (!id) state.locationPick = null; await loadFarms(); toast(id ? "Terreno actualizado." : "Terreno registrado.");
    } catch (error) { toast(error.message || "No se pudo guardar el terreno.", true); }
    finally { setBusy(button, false, "Guardar terreno"); }
  });

  async function deleteFarm(id) {
    const farm = state.farms.find(f => f.id === id); if (!farm || !window.confirm(`¿Eliminar “${farm.name}” y su historial meteorológico?`)) return;
    const { error } = await client.from("farms").delete().eq("id", id); if (error) return toast("No se pudo eliminar el terreno.", true);
    state.weather.delete(id); if (state.activeFarmId === id) state.activeFarmId = ""; await loadFarms(); await loadHistory(); toast("Terreno eliminado.");
  }

  function weatherLabel(code) { if (code === 0) return "Despejado"; if ([1,2].includes(code)) return "Parcialmente nublado"; if (code === 3) return "Nublado"; if ([45,48].includes(code)) return "Niebla"; if ([51,53,55,56,57].includes(code)) return "Llovizna"; if ([61,63,65,66,67,80,81,82].includes(code)) return "Lluvia"; if ([71,73,75,77,85,86].includes(code)) return "Nieve"; if ([95,96,99].includes(code)) return "Tormenta"; return "Condición variable"; }
  async function fetchForecast(farm) {
    const params = new URLSearchParams({ latitude: farm.latitude, longitude: farm.longitude, daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code", hourly: "relative_humidity_2m", forecast_days: "7", timezone: "auto" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}.`);
    const data = await response.json(); if (!data.daily?.time?.length) throw new Error("La API no devolvió un pronóstico para estas coordenadas.");
    const humidity = new Map();
    for (let i = 0; i < (data.hourly?.time?.length || 0); i++) { const day = data.hourly.time[i].slice(0,10), val = data.hourly.relative_humidity_2m[i]; if (Number.isFinite(val)) { const cur = humidity.get(day) || { total: 0, n: 0 }; cur.total += val; cur.n++; humidity.set(day, cur); } }
    const fetchedAt = new Date().toISOString();
    return data.daily.time.map((date, i) => ({ farm_id: farm.id, forecast_date: date, fetched_at: fetchedAt, temperature_max_c: data.daily.temperature_2m_max[i], temperature_min_c: data.daily.temperature_2m_min[i], precipitation_mm: data.daily.precipitation_sum[i] ?? 0, humidity_mean_pct: humidity.has(date) ? Number((humidity.get(date).total / humidity.get(date).n).toFixed(2)) : null, wind_max_kmh: data.daily.wind_speed_10m_max[i] ?? 0, weather_code: data.daily.weather_code[i], source: "Open-Meteo" }));
  }

  function alertsFor(farm, days) {
    const alerts = [];
    const today = new Intl.DateTimeFormat("sv-SE").format(new Date());
    for (const day of days.filter(d => d.forecast_date >= today)) {
      const date = formatDate(day.forecast_date);
      if (Number(day.precipitation_mm) > Number(farm.precipitation_threshold_mm)) alerts.push({ date, message: `Lluvia de ${Number(day.precipitation_mm).toFixed(1)} mm supera ${Number(farm.precipitation_threshold_mm).toFixed(1)} mm en ${date}.` });
      if (Number(day.wind_max_kmh) > Number(farm.wind_threshold_kmh)) alerts.push({ date, message: `Viento de ${Number(day.wind_max_kmh).toFixed(0)} km/h supera ${Number(farm.wind_threshold_kmh).toFixed(0)} km/h en ${date}.` });
      if (Number(day.temperature_min_c) < Number(farm.min_temperature_c)) alerts.push({ date, message: `Temperatura mínima de ${Number(day.temperature_min_c).toFixed(1)} °C menor al umbral de ${Number(farm.min_temperature_c).toFixed(1)} °C en ${date}.` });
      if (Number(day.temperature_max_c) > Number(farm.max_temperature_c)) alerts.push({ date, message: `Temperatura máxima de ${Number(day.temperature_max_c).toFixed(1)} °C supera ${Number(farm.max_temperature_c).toFixed(1)} °C en ${date}.` });
    }
    return alerts;
  }

  function renderForecast(farm, days) {
    if (!days.length) return;
    const first = days[0], maxRain = Math.max(...days.map(x => Number(x.precipitation_mm)));
    $("weatherCurrent").innerHTML = `<div class="weather-tile lead"><span>${escapeHTML(farm.crop)} · ${escapeHTML(farm.name)}</span><strong>${Number(first.temperature_max_c).toFixed(0)}° / ${Number(first.temperature_min_c).toFixed(0)}°</strong><small>${escapeHTML(weatherLabel(Number(first.weather_code)))}</small></div><div class="weather-tile"><span>Precipitación hoy</span><strong>${Number(first.precipitation_mm).toFixed(1)} mm</strong></div><div class="weather-tile"><span>Humedad media</span><strong>${first.humidity_mean_pct == null ? "—" : `${Number(first.humidity_mean_pct).toFixed(0)}%`}</strong></div><div class="weather-tile"><span>Viento máximo</span><strong>${Number(first.wind_max_kmh).toFixed(0)} km/h</strong></div><div class="weather-tile"><span>Máxima 7 días</span><strong>${maxRain.toFixed(1)} mm</strong></div>`;
    $("forecastGrid").innerHTML = days.map(d => `<article class="forecast-day${alertsFor(farm,[d]).length ? " alert" : ""}"><span>${escapeHTML(formatDate(d.forecast_date))}</span><b>${escapeHTML(weatherLabel(Number(d.weather_code)).split(" ")[0])}</b><strong>${Number(d.temperature_max_c).toFixed(0)}° / ${Number(d.temperature_min_c).toFixed(0)}°</strong><small style="margin-top:7px">☂ ${Number(d.precipitation_mm).toFixed(1)} mm</small><small>💨 ${Number(d.wind_max_kmh).toFixed(0)} km/h</small></article>`).join("");
    $("weatherLocation").textContent = `${farm.locality || `${farm.latitude}, ${farm.longitude}`} · actualizado ${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    renderRainChart(farm, days);
    renderTemperatureChart(days);
    const alerts = alertsFor(farm, days); $("weatherAlerts").innerHTML = alerts.length ? alerts.slice(0, 8).map(a => `<div class="alert-item">⚠ ${escapeHTML(a.message)}</div>`).join("") : '<div class="alert-item ok">✓ El pronóstico de 7 días está dentro de los umbrales configurados.</div>';
    $("metricTemp").textContent = `${Number(first.temperature_max_c).toFixed(0)}°`;
    $("metricTempFarm").textContent = `${farm.name} · máx. de hoy`;
    $("metricRain").textContent = `${maxRain.toFixed(1)} mm`;
  }

  function renderRainChart(farm, days) {
    const canvas = $("rainChart");
    if (!canvas || !window.Chart) return;
    const threshold = Number(farm.precipitation_threshold_mm);
    const rainfall = days.map(row => Number(row.precipitation_mm) || 0);
    $("rainChartSummary").textContent = `Umbral: ${threshold.toFixed(1)} mm`;
    state.rainChart?.destroy();
    state.rainChart = new Chart(canvas, {
      data: {
        labels: days.map(row => formatDate(row.forecast_date, { weekday: "short", day: "numeric" })),
        datasets: [
          { type: "bar", label: "Precipitación (mm)", data: rainfall, backgroundColor: "#78a96b", hoverBackgroundColor: "#4f8756", borderRadius: 7, maxBarThickness: 34 },
          { type: "line", label: "Umbral de alerta", data: days.map(() => threshold), borderColor: "#c96732", borderDash: [6, 5], borderWidth: 2, pointRadius: 0, pointHitRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 18, font: { family: "DM Sans", size: 11 } } },
          tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)} mm` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#748075", font: { family: "DM Sans", size: 10 } } },
          y: { beginAtZero: true, title: { display: true, text: "mm", color: "#748075", font: { family: "DM Sans", size: 10 } }, grid: { color: "#edf0eb" }, ticks: { color: "#748075", font: { family: "DM Sans", size: 10 } } }
        }
      }
    });
  }

  function renderTemperatureChart(days) {
    const canvas = $("temperatureChart");
    if (!canvas || !window.Chart) return;
    state.temperatureChart?.destroy();
    state.temperatureChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: days.map(row => formatDate(row.forecast_date, { weekday: "short", day: "numeric" })),
        datasets: [
          { label: "Máxima (°C)", data: days.map(row => Number(row.temperature_max_c)), borderColor: "#c96732", backgroundColor: "#c9673220", pointBackgroundColor: "#c96732", pointRadius: 3, tension: 0.35, fill: false },
          { label: "Mínima (°C)", data: days.map(row => Number(row.temperature_min_c)), borderColor: "#5788a5", backgroundColor: "#5788a520", pointBackgroundColor: "#5788a5", pointRadius: 3, tension: 0.35, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 18, font: { family: "DM Sans", size: 11 } } },
          tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)} °C` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#748075", font: { family: "DM Sans", size: 10 } } },
          y: { title: { display: true, text: "°C", color: "#748075", font: { family: "DM Sans", size: 10 } }, grid: { color: "#edf0eb" }, ticks: { color: "#748075", font: { family: "DM Sans", size: 10 } } }
        }
      }
    });
  }

  async function consultWeather() {
    const farm = state.farms.find(f => f.id === $("weatherFarmSelect").value); if (!farm) return toast("Selecciona primero un terreno.", true);
    const button = $("refreshWeather"); setBusy(button, true, "Consultar pronóstico"); $("weatherStatus").textContent = "Consultando Open-Meteo…";
    try {
      const rows = await fetchForecast(farm);
      const payload = rows.map(row => ({ ...row, user_id: user.id }));
      const { error } = await client.from("weather_history").insert(payload); if (error) throw new Error(`Pronóstico recibido, pero no se pudo guardar en el historial: ${error.message}`);
      state.weather.set(farm.id, rows); renderForecast(farm, rows); updateMetrics(); $("weatherStatus").textContent = `Consultado y guardado · ${new Intl.DateTimeFormat("es-PE", { hour:"2-digit", minute:"2-digit" }).format(new Date())}`;
      await loadHistory(); toast("Pronóstico consultado y guardado en el historial.");
    } catch (error) { $("weatherStatus").textContent = "No se pudo completar la consulta."; toast(error.message || "Error al consultar el pronóstico.", true); }
    finally { setBusy(button, false, "Consultar pronóstico"); }
  }
  $("refreshWeather").addEventListener("click", consultWeather);
  $("weatherFarmSelect").addEventListener("change", () => { const farm = state.farms.find(f => f.id === $("weatherFarmSelect").value); const saved = farm && state.weather.get(farm.id); if (saved) renderForecast(farm, saved); else { $("weatherCurrent").innerHTML = ""; $("forecastGrid").innerHTML = '<div class="empty">Consulta el pronóstico para mostrar las condiciones.</div>'; $("weatherAlerts").innerHTML = ""; } });

  async function loadHistory() {
    const { data, error } = await client.from("weather_history").select("*, farms(name, crop)").order("fetched_at", { ascending: false }).order("forecast_date", { ascending: true }).limit(250);
    if (error) { $("historyRows").innerHTML = `<tr><td colspan="7" class="empty">${escapeHTML(error.message)}</td></tr>`; return; }
    const records = data || [];
    const newestByFarm = new Map();
    for (const row of records) {
      const existing = newestByFarm.get(row.farm_id);
      if (!existing || row.fetched_at > existing.fetched_at) newestByFarm.set(row.farm_id, { fetched_at: row.fetched_at, rows: [row] });
      else if (row.fetched_at === existing.fetched_at) existing.rows.push(row);
    }
    for (const [farmId, group] of newestByFarm) {
      if (Date.now() - new Date(group.fetched_at).getTime() < 7 * 86400000) state.weather.set(farmId, group.rows);
    }
    $("historyRows").innerHTML = records.length ? records.map(r => `<tr><td>${escapeHTML(new Intl.DateTimeFormat("es-PE", { dateStyle:"short", timeStyle:"short" }).format(new Date(r.fetched_at)))}</td><td>${escapeHTML(r.farms?.name || "Terreno")}</td><td>${escapeHTML(formatDate(r.forecast_date))} · ${escapeHTML(weatherLabel(Number(r.weather_code)))}</td><td>${Number(r.temperature_max_c).toFixed(1)}° / ${Number(r.temperature_min_c).toFixed(1)}°</td><td>${Number(r.precipitation_mm).toFixed(1)} mm</td><td>${r.humidity_mean_pct == null ? "—" : `${Number(r.humidity_mean_pct).toFixed(0)}%`}</td><td>${Number(r.wind_max_kmh).toFixed(0)} km/h</td></tr>`).join("") : '<tr><td colspan="7" class="empty">Todavía no hay consultas guardadas. Ve a Clima y consulta el pronóstico de un terreno.</td></tr>';
    const newestFarm = state.farms.find(f => state.weather.has(f.id));
    if (newestFarm) {
      const latest = state.weather.get(newestFarm.id)[0];
      $("metricTemp").textContent = `${Number(latest.temperature_max_c).toFixed(0)}°`;
      $("metricTempFarm").textContent = `${newestFarm.name} · última consulta`;
      $("metricRain").textContent = `${Math.max(...state.weather.get(newestFarm.id).map(row => Number(row.precipitation_mm))).toFixed(1)} mm`;
    }
    updateMetrics(); renderOverviewAlerts();
  }
  $("reloadHistory").addEventListener("click", loadHistory);

  async function loadThresholds() {
    const farm = state.farms.find(f => f.id === $("thresholdFarmSelect").value); const form = $("thresholdForm");
    form.querySelectorAll("input,button").forEach(el => el.disabled = !farm);
    if (!farm) return;
    $("thresholdRain").value = farm.precipitation_threshold_mm; $("thresholdWind").value = farm.wind_threshold_kmh; $("thresholdMin").value = farm.min_temperature_c; $("thresholdMax").value = farm.max_temperature_c;
  }
  $("thresholdFarmSelect").addEventListener("change", loadThresholds);
  $("thresholdForm").addEventListener("submit", async event => {
    event.preventDefault(); const farm = state.farms.find(f => f.id === $("thresholdFarmSelect").value); if (!farm) return;
    const min = Number($("thresholdMin").value), max = Number($("thresholdMax").value); if (min >= max) return toast("La temperatura mínima debe ser menor que la máxima.", true);
    const payload = { precipitation_threshold_mm: Number($("thresholdRain").value), wind_threshold_kmh: Number($("thresholdWind").value), min_temperature_c: min, max_temperature_c: max };
    const { error } = await client.from("farms").update(payload).eq("id", farm.id); if (error) return toast("No se pudieron guardar los umbrales.", true);
    Object.assign(farm, payload); renderFarms(); updateMetrics(); if (state.weather.has(farm.id)) renderForecast(farm,state.weather.get(farm.id)); toast("Umbrales guardados.");
  });

  function updateMetrics() {
    $("metricFarms").textContent = String(state.farms.length);
    const activeAlerts = state.farms.reduce((n,f) => n + alertsFor(f,state.weather.get(f.id) || []).length, 0); $("metricAlerts").textContent = String(activeAlerts);
  }

  function renderOverviewAlerts() {
    const items = state.farms.flatMap(f => alertsFor(f, state.weather.get(f.id) || []).map(alert => ({ farm: f, alert })));
    $("overviewAlerts").innerHTML = items.length
      ? items.slice(0, 6).map(({ farm, alert }) => `<div class="alert-item">⚠ <span><strong>${escapeHTML(farm.name)}</strong><br>${escapeHTML(alert.message)}</span></div>`).join("")
      : `<div class="alert-item ok">✓ ${state.farms.length ? "Sin alertas activas en las últimas consultas." : "Registra un terreno para empezar."}</div>`;
  }

  $("signOutButton").addEventListener("click", async () => { const { error } = await client.auth.signOut(); if (error) toast("No se pudo cerrar sesión.", true); else location.replace("login.html"); });

  try { await loadFarms(); await loadHistory(); if (state.farms.length) { const latestFarm = state.farms[0]; $("weatherFarmSelect").value = latestFarm.id; $("thresholdFarmSelect").value = latestFarm.id; await loadThresholds(); } }
  catch (error) { toast(error.message || "No se pudieron cargar tus terrenos.", true); }
});

