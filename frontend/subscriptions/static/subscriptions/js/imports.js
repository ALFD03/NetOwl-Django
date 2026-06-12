(function () {
  "use strict";

  var N = window.NetOwl;

  function initMonthPicker() {
    var monthS = document.getElementById("month-select");
    var yearS = document.getElementById("year-select");
    var input = document.getElementById("month-input");
    if (!monthS || !yearS || !input) return;
    monthS.innerHTML = '<option value="">Mes</option>';
    for (var m = 1; m <= 12; m++) {
      var o = document.createElement("option");
      o.value = String(m).padStart(2, "0");
      o.textContent = new Date(0, m - 1).toLocaleString("es", { month: "long" });
      monthS.appendChild(o);
    }
    var now = new Date(), curY = now.getFullYear();
    yearS.innerHTML = '<option value="">Ano</option>';
    for (var y = curY - 5; y <= curY + 5; y++) {
      var o = document.createElement("option");
      o.value = y; o.textContent = y; yearS.appendChild(o);
    }
    if (!input.value) {
      monthS.value = String(now.getMonth() + 1).padStart(2, "0");
      yearS.value = curY;
      input.value = curY + "-" + monthS.value;
    }
    function upd() { if (monthS.value && yearS.value) input.value = yearS.value + "-" + monthS.value; else input.value = ""; }
    monthS.addEventListener("change", upd);
    yearS.addEventListener("change", upd);
  }

  function initAnalysisExecutor() {
    var form = document.getElementById("run-analysis-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var month = document.getElementById("month-input").value;
      if (!month) { N.showToast("Seleccione un mes valido", "warning"); return; }
      N.showLoading("Ejecutando analisis...");
      var cc = document.getElementById("console-container");
      var tl = document.getElementById("terminal-log");
      if (cc) cc.classList.remove("d-none");
      if (tl) tl.textContent = "[SISTEMA] Iniciando analisis para " + month + "...\n";
      fetch("/subscriptions/api/run-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": N.getCsrfToken() },
        body: JSON.stringify({ month: month })
      }).then(function (r) { N.hideLoading(); return r.json(); }).then(function (d) {
        if (d.status === "success") {
          N.showToast("Analisis completado!", "success");
          if (tl) { tl.textContent += d.log_output; tl.scrollTop = tl.scrollHeight; }
        } else {
          N.showToast(d.message || "Error", "error");
          if (tl) tl.textContent += "\n[ERROR] " + d.message + "\n";
        }
      }).catch(function () { N.hideLoading(); N.showToast("Error de conexion", "error"); if (tl) tl.textContent += "\n[ERROR] Fallo de red.\n"; });
    });
    var clearBtn = document.getElementById("clear-console");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var tl = document.getElementById("terminal-log");
        if (tl) tl.textContent = "Consola limpia.";
      });
    }
  }

  function setImportType(type) {
    document.getElementById("type-" + type).checked = true;
    document.getElementById("format-sub-details").classList.toggle("d-none", type !== "subscriptions");
    document.getElementById("format-log-details").classList.toggle("d-none", type !== "logs");
  }

  function initCSVImporter() {
    document.getElementById("type-subscriptions").addEventListener("change", function () { setImportType("subscriptions"); });
    document.getElementById("type-logs").addEventListener("change", function () { setImportType("logs"); });
    var dropZone = document.getElementById("drop-zone-area");
    var fileInput = document.getElementById("csv-file-input");
    var browseBtn = document.getElementById("browse-files-btn");
    var displayFile = document.getElementById("selected-file-display");
    var displayName = document.getElementById("selected-file-name");
    var removeBtn = document.getElementById("remove-file-btn");
    var submitBtn = document.getElementById("submit-import-btn");

    if (browseBtn && fileInput) browseBtn.addEventListener("click", function () { fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function () { if (this.files.length) handleFile(this.files[0]); });
    if (removeBtn) removeBtn.addEventListener("click", clearFile);

    if (dropZone) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
      ["dragenter", "dragover"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.add("dragover"); }); });
      ["dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.remove("dragover"); }); });
      dropZone.addEventListener("drop", function (e) {
        var f = e.dataTransfer.files[0];
        if (f && f.name.endsWith(".csv")) { fileInput.files = e.dataTransfer.files; handleFile(f); }
        else N.showToast("Solo archivos CSV", "warning");
      });
    }

    function handleFile(f) {
      if (displayName && displayFile && submitBtn) {
        displayName.textContent = f.name + " (" + (f.size / 1024).toFixed(1) + " KB)";
        displayFile.classList.remove("d-none");
        submitBtn.removeAttribute("disabled");
      }
    }

    function clearFile() {
      if (fileInput) fileInput.value = "";
      if (displayFile && submitBtn) { displayFile.classList.add("d-none"); submitBtn.setAttribute("disabled", "true"); }
    }

    document.getElementById("import-csv-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var file = fileInput.files[0];
      if (!file) return;
      N.showLoading("Cargando archivo...");
      var type = document.querySelector('input[name="import_type"]:checked').value;
      var endpoint = type === "subscriptions" ? "/subscriptions/api/import-subscriptions/" : "/subscriptions/api/import-logs/";
      var fd = new FormData();
      fd.append("csv_file", file);
      var pb = document.getElementById("upload-progress-bar");
      var pc = document.getElementById("upload-progress-container");
      if (pc) pc.classList.remove("d-none");
      if (pb) pb.style.width = "0%";
      submitBtn.setAttribute("disabled", "true");
      var iv = setInterval(function () { if (pb) pb.style.width = Math.min(pct += 10, 90) + "%"; var pct = 0; }, 150);
      fetch(endpoint, { method: "POST", headers: { "X-CSRFToken": N.getCsrfToken() }, body: fd })
        .then(function (r) { clearInterval(iv); if (pb) pb.style.width = "100%"; setTimeout(function () { if (pc) pc.classList.add("d-none"); }, 600); if (!r.ok) throw Error("Error"); return r.json(); })
        .then(function (d) {
          N.hideLoading();
          if (d.status === "success") { N.showToast(d.message, "success"); clearFile(); }
          else { N.showToast(d.message || "Error", "error"); submitBtn.removeAttribute("disabled"); }
        })
        .catch(function () { clearInterval(iv); if (pc) pc.classList.add("d-none"); submitBtn.removeAttribute("disabled"); N.hideLoading(); N.showToast("Error de conexion", "error"); });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("drop-zone-area")) {
      initMonthPicker();
      initAnalysisExecutor();
      initCSVImporter();
    }
  });
})();
