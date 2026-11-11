"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const steps = [...document.querySelectorAll("[data-guide-step]")];
  const captures = [...document.querySelectorAll("[data-guide-capture]")];
  const title = document.getElementById("guideVisualTitle");
  const titles = { 1: "Vista ilustrativa · Registrar terreno", 2: "Vista ilustrativa · Consultar pronóstico", 3: "Vista ilustrativa · Umbrales e historial" };

  steps.forEach(button => button.addEventListener("click", () => {
    const selected = button.dataset.guideStep;
    steps.forEach(step => step.setAttribute("aria-current", String(step === button ? "step" : "false")));
    captures.forEach(capture => {
      const active = capture.dataset.guideCapture === selected;
      capture.classList.toggle("active", active);
      capture.hidden = !active;
    });
    if (title) title.textContent = titles[selected] || "Vista ilustrativa de AgroClima";
  }));

  const checks = [...document.querySelectorAll("[data-guide-check]")];
  const progress = document.getElementById("guideProgress");
  const bar = document.getElementById("guideProgressBar");
  const storageKey = "agroclima.guide.progress.v1";
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    checks.forEach(check => { check.checked = Array.isArray(saved) && saved.includes(check.dataset.guideCheck); });
  } catch { /* La guía sigue usable si el almacenamiento local está desactivado. */ }

  function updateProgress() {
    const completed = checks.filter(check => check.checked).length;
    if (progress) progress.textContent = `Tu avance: ${completed} de ${checks.length} pasos`;
    if (bar) bar.style.width = `${checks.length ? completed / checks.length * 100 : 0}%`;
    try { localStorage.setItem(storageKey, JSON.stringify(checks.filter(check => check.checked).map(check => check.dataset.guideCheck))); } catch { /* No se guarda contenido personal. */ }
  }
  checks.forEach(check => check.addEventListener("change", updateProgress));
  updateProgress();
});
