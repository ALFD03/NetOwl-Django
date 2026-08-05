// frontend/static/imports/js/imports.js

document.addEventListener('DOMContentLoaded', () => {
    initDropZone();
    initImportForm();
    initAnalysisForm();
    initCrmAnalysisForm();
    initSupportAnalysisForm(); // <-- AGREGADO
    initTypeRadioListeners();  // <-- AGREGADO CON VERIFICACIÓN SEGURA
});

function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
}

function initTypeRadioListeners() {
    const subRadio = document.getElementById("type-subscriptions");
    const logRadio = document.getElementById("type-logs");

    if (subRadio) {
        subRadio.addEventListener("change", function () { setImportType("subscriptions"); });
    }
    if (logRadio) {
        logRadio.addEventListener("change", function () { setImportType("logs"); });
    }
}

function setImportType(type) {
    const radioElem = document.getElementById("type-" + type);
    if (radioElem) radioElem.checked = true;
    
    const subDetails = document.getElementById("format-sub-details");
    const logDetails = document.getElementById("format-log-details");
    
    if (subDetails) subDetails.classList.toggle("d-none", type !== "subscriptions");
    if (logDetails) logDetails.classList.toggle("d-none", type !== "logs");
}

// ==========================================
// 1. DROPDOWN Y SELECCIÓN DE ARCHIVOS (DRAG & DROP)
// ==========================================
function initDropZone() {
    const dropZone = document.getElementById('drop-zone-area');
    const fileInput = document.getElementById('csv-file-input');
    const browseBtn = document.getElementById('browse-files-btn');
    const displayBox = document.getElementById('selected-file-display');
    const fileNameSpan = document.getElementById('selected-file-name');
    const removeBtn = document.getElementById('remove-file-btn');
    const submitBtn = document.getElementById('submit-import-btn');

    if (!dropZone || !fileInput) return;

    if (browseBtn) browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            if (fileNameSpan) fileNameSpan.textContent = fileInput.files[0].name;
            if (displayBox) displayBox.classList.remove('d-none');
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            if (displayBox) displayBox.classList.add('d-none');
            if (submitBtn) submitBtn.disabled = true;
        });
    }

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            if (fileNameSpan) fileNameSpan.textContent = e.dataTransfer.files[0].name;
            if (displayBox) displayBox.classList.remove('d-none');
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// ==========================================
// 2. ENVÍO DE ARCHIVO CSV (IMPORTACIÓN DINÁMICA POR RUTA)
// ==========================================
function initImportForm() {
    const importForm = document.getElementById('import-csv-form');
    if (!importForm) return;

    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('csv-file-input');
        if (!fileInput || !fileInput.files.length) {
            NetOwl.showToast("Seleccione un archivo CSV primero", "warning");
            return;
        }

        const formData = new FormData();
        formData.append('csv_file', fileInput.files[0]);

        // RESOLUCIÓN DINÁMICA DEL ENDPOINT SEGÚN LA RUTA ACTUAL
        const path = window.location.pathname;
        let endpoint = '/imports/api/import-subscriptions/';

        if (path.includes('/imports/crm/')) {
            endpoint = '/imports/api/import-crm/';
        } else if (path.includes('/imports/support/')) {
            endpoint = '/imports/api/import-support/';
        } else {
            const radioType = document.querySelector('input[name="import_type"]:checked');
            if (radioType) {
                endpoint = radioType.value === 'logs' ? '/imports/api/import-logs/' : '/imports/api/import-subscriptions/';
            }
        }

        NetOwl.showLoading("Procesando e importando archivo CSV...");

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
                body: formData
            });
            const data = await res.json();
            NetOwl.hideLoading();

            if (data.status === 'success') {
                NetOwl.showToast(data.message, 'success');
                fileInput.value = '';
                document.getElementById('selected-file-display')?.classList.add('d-none');
                const btn = document.getElementById('submit-import-btn');
                if (btn) btn.disabled = true;
            } else {
                NetOwl.showToast('Error: ' + data.message, 'danger');
            }
        } catch (err) {
            NetOwl.hideLoading();
            NetOwl.showToast('Fallo en la comunicación con el servidor', 'danger');
        }
    });
}

// ==========================================
// 3. EJECUTAR ANÁLISIS DE SUBSCRIPTIONS (CHURN)
// ==========================================
function initAnalysisForm() {
    const form = document.getElementById('run-analysis-form');
    const monthSel = document.getElementById('month-select');
    const yearSel = document.getElementById('year-select');
    const consoleContainer = document.getElementById('console-container');
    const terminalLog = document.getElementById('terminal-log');
    const clearConsoleBtn = document.getElementById('clear-console');

    if (!form) return;

    // Poblar selectores
    const now = new Date();
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    if (monthSel && monthSel.options.length <= 1) {
        months.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = String(i + 1).padStart(2, '0');
            opt.textContent = m;
            monthSel.appendChild(opt);
        });
    }

    if (yearSel && yearSel.options.length <= 1) {
        for (let y = now.getFullYear(); y >= 2020; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSel.appendChild(opt);
        }
    }

    if (clearConsoleBtn && terminalLog) {
        clearConsoleBtn.addEventListener('click', () => {
            terminalLog.textContent = "Consola limpia.";
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedMonth = monthSel ? monthSel.value : '';
        const selectedYear = yearSel ? yearSel.value : '';

        if (!selectedMonth || !selectedYear) {
            NetOwl.showToast("Seleccione mes y año válidos para ejecutar el análisis", "warning");
            return;
        }

        const monthValue = `${selectedYear}-${selectedMonth}`;

        NetOwl.showLoading("Ejecutando motor de cálculo...");
        if (consoleContainer) consoleContainer.classList.remove('d-none');
        if (terminalLog) terminalLog.textContent = `[${new Date().toLocaleTimeString()}] Iniciando análisis para ${monthValue}...\n`;

        try {
            const res = await fetch('/imports/api/run-analysis/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({ month: monthValue })
            });
            const data = await res.json();
            NetOwl.hideLoading();

            if (terminalLog) {
                terminalLog.textContent += data.log_output || data.message || "Proceso finalizado.\n";
            }

            if (data.status === 'success') {
                NetOwl.showToast(data.message || "Análisis completado exitosamente", 'success');
            } else {
                NetOwl.showToast('Error: ' + data.message, 'danger');
            }
        } catch (err) {
            NetOwl.hideLoading();
            NetOwl.showToast('Fallo en la respuesta del servidor al ejecutar el análisis', 'danger');
        }
    });
}

// ==========================================
// 4. EJECUTAR ANÁLISIS DE CRM ANALYTICS
// ==========================================
function initCrmAnalysisForm() {
    const form = document.getElementById('run-crm-analysis-form');
    const consoleContainer = document.getElementById('console-container-crm');
    const terminalLog = document.getElementById('terminal-log-crm');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        NetOwl.showLoading("Calculando analíticas globales de CRM...");
        if (consoleContainer) consoleContainer.classList.remove('d-none');
        if (terminalLog) terminalLog.textContent = `[${new Date().toLocaleTimeString()}] Procesando oportunidades de CRM...\n`;

        try {
            const res = await fetch('/imports/api/run-crm-analysis/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                }
            });
            const data = await res.json();
            NetOwl.hideLoading();

            if (terminalLog) {
                terminalLog.textContent += data.log_output || data.message || "Análisis CRM completado.";
            }

            if (data.status === 'success') {
                NetOwl.showToast(data.message || "Análisis CRM ejecutado y guardado correctamente", 'success');
            } else {
                NetOwl.showToast('Error: ' + data.message, 'danger');
            }
        } catch (err) {
            NetOwl.hideLoading();
            NetOwl.showToast('Error al conectar con el servidor', 'danger');
        }
    });
}

// ==========================================
// 5. EJECUTAR ANÁLISIS DE TECHNICAL SUPPORT
// ==========================================
// frontend/static/imports/js/imports.js (Función initSupportAnalysisForm actualizada)

function initSupportAnalysisForm() {
    const form = document.getElementById('run-support-analysis-form');
    const monthSel = document.getElementById('support-month-select');
    const yearSel = document.getElementById('support-year-select');
    const consoleContainer = document.getElementById('console-container-support');
    const terminalLog = document.getElementById('terminal-log-support');

    if (!form) return;

    // Poblado de selectores de fecha
    const now = new Date();
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    if (monthSel && monthSel.options.length <= 1) {
        months.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = String(i + 1).padStart(2, '0');
            opt.textContent = m;
            monthSel.appendChild(opt);
        });
    }

    if (yearSel && yearSel.options.length <= 1) {
        for (let y = now.getFullYear(); y >= 2020; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSel.appendChild(opt);
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedMonth = monthSel ? monthSel.value : '';
        const selectedYear = yearSel ? yearSel.value : '';
        let monthValue = null;

        if (selectedMonth && selectedYear) {
            monthValue = `${selectedYear}-${selectedMonth}`;
        }

        NetOwl.showLoading("Calculando métricas de Technical Support...");
        if (consoleContainer) consoleContainer.classList.remove('d-none');
        if (terminalLog) terminalLog.textContent = `[${new Date().toLocaleTimeString()}] Procesando tickets (${monthValue || 'Histórico Completo'})...\n`;

        try {
            const res = await fetch('/imports/api/run-support-analysis/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({ month: monthValue })
            });
            const data = await res.json();
            NetOwl.hideLoading();

            if (terminalLog) {
                terminalLog.textContent += data.log_output || data.message || "Análisis de Soporte completado.";
            }

            if (data.status === 'success') {
                NetOwl.showToast(data.message || "Análisis Technical Support completado correctamente", 'success');
            } else {
                NetOwl.showToast('Error: ' + data.message, 'danger');
            }
        } catch (err) {
            NetOwl.hideLoading();
            NetOwl.showToast('Error al conectar con el servidor', 'danger');
        }
    });
}