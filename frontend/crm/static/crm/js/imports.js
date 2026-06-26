(function () {
  "use strict";

  var N = window.NetOwl;
  var selectedFile = null;

  function initDropZone() {
    var dropZone = document.getElementById("drop-zone-area");
    var fileInput = document.getElementById("csv-file-input");
    var browseBtn = document.getElementById("browse-files-btn");
    var display = document.getElementById("selected-file-display");
    var fileNameEl = document.getElementById("selected-file-name");
    var removeBtn = document.getElementById("remove-file-btn");
    var submitBtn = document.getElementById("submit-import-btn");
    var progressContainer = document.getElementById("upload-progress-container");
    var progressBar = document.getElementById("upload-progress-bar");

    function updateUI(file) {
      selectedFile = file;
      if (file) {
        display.classList.remove("d-none");
        fileNameEl.textContent = file.name + " (" + (file.size / 1024 / 1024).toFixed(2) + " MB)";
        submitBtn.disabled = false;
        dropZone.classList.add("has-file");
      } else {
        display.classList.add("d-none");
        submitBtn.disabled = true;
        dropZone.classList.remove("has-file");
      }
    }

    dropZone.addEventListener("click", function (e) {
      if (e.target !== browseBtn && e.target !== fileInput) fileInput.click();
    });

    dropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", function () {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (e.dataTransfer.files.length) {
        var file = e.dataTransfer.files[0];
        updateUI(file);
        // Also set the file on the hidden input for form submission compatibility
        fileInput.files = e.dataTransfer.files;
      }
    });

    fileInput.addEventListener("change", function () {
      if (this.files.length) updateUI(this.files[0]);
    });

    browseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      fileInput.click();
    });

    removeBtn.addEventListener("click", function () {
      fileInput.value = "";
      updateUI(null);
    });

    document.getElementById("import-csv-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!selectedFile) return;
      uploadFile(selectedFile);
    });

    function uploadFile(file) {
      N.showLoading("Cargando archivo " + file.name + "...");
      var formData = new FormData();
      formData.append("csv_file", file);
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Subiendo...';
      progressContainer.classList.remove("d-none");
      progressBar.style.width = "0%";

      var xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", function (evt) {
        if (evt.lengthComputable) {
          var percent = Math.round((evt.loaded / evt.total) * 100);
          progressBar.style.width = percent + "%";
        }
      });
      xhr.addEventListener("load", function () {
        N.hideLoading();
        progressBar.style.width = "100%";
        if (xhr.status === 200) {
          var resp = JSON.parse(xhr.responseText);
          if (resp.status === "success") {
            N.showToast(resp.message, "success");
            updateUI(null);
            fileInput.value = "";
          } else {
            N.showToast(resp.message, "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-upload me-2"></i>Iniciar Carga';
          }
        } else {
          N.showToast("Error en la subida", "error");
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-upload me-2"></i>Iniciar Carga';
        }
        progressContainer.classList.add("d-none");
      });
      xhr.addEventListener("error", function () {
        N.hideLoading();
        N.showToast("Error de red", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-upload me-2"></i>Iniciar Carga';
        progressContainer.classList.add("d-none");
      });
      xhr.open("POST", "/crm/api/import-crm/");
      xhr.setRequestHeader("X-CSRFToken", N.getCsrfToken());
      xhr.send(formData);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("drop-zone-area")) {
      initDropZone();
    }
  });
})();
