// --- START OF FILE NetOwl-Django/frontend/static/subscriptions/js/eta_report.js ---
document.addEventListener("DOMContentLoaded", () => {
    const periodSelect = document.getElementById("etaPeriodSelect");
    const lockBtn = document.getElementById("etaLockBtn");
    const lockIcon = document.getElementById("etaLockIcon");
    const lockText = document.getElementById("etaLockText");
    const lockSection = document.getElementById("etaLockSection");
    const reportContent = document.getElementById("etaReportContent");
    const unmappedModalEl = document.getElementById("unmappedElementsModal");
    
    // Elementos de la modal de carga
    const unmappedPlanesSection = document.getElementById("unmappedPlanesSection");
    const unmappedPlanesTbody = document.getElementById("unmappedPlanesTbody");
    const unmappedSubsSection = document.getElementById("unmappedSubsSection");
    const unmappedSubsTbody = document.getElementById("unmappedSubsTbody");
    const recheckBtn = document.getElementById("recheckCalculationsBtn");

    // Elementos de la pestaña de gestión de dedicados
    const configuredSubsTbody = document.getElementById("configuredSubsTbody");
    
    let unmappedModal = new bootstrap.Modal(unmappedModalEl);
    let selectedPeriod = "";
    let isPeriodLocked = false;

    loadReportData();

    periodSelect.addEventListener("change", (e) => {
        selectedPeriod = e.target.value;
        loadReportData(selectedPeriod);
    });

    lockBtn.addEventListener("click", () => {
        if (!selectedPeriod) return;
        const confirmMsg = isPeriodLocked 
            ? `¿Desea DESBLOQUEAR el reporte del mes ${selectedPeriod}?`
            : `¿Desea BLOQUEAR el reporte del mes ${selectedPeriod}? No sufrirá cambios ante nuevas importaciones.`;
            
        if (confirm(confirmMsg)) {
            togglePeriodLock(selectedPeriod, !isPeriodLocked);
        }
    });

    recheckBtn.addEventListener("click", () => {
        unmappedModal.hide();
        loadReportData(selectedPeriod, true);
    });

    function loadReportData(period = "", force = false) {
        reportContent.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Estructurando cálculos bajo formato reguladora...
            </div>`;
        
        let url = `/subscriptions/api/eta-report/data/`;
        if (period) url += `?period=${period}`;
        if (force) url += `${period ? '&' : '?'}force=true`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.status === "unmapped_elements") {
                    renderUnmappedPanels(data.unmapped_planes, data.unmapped_subs);
                    unmappedModal.show();
                    return;
                }

                if (data.status === "empty") {
                    reportContent.innerHTML = `<div class="alert alert-warning m-3"><i class="bi bi-info-circle me-2"></i>${data.message}</div>`;
                    lockSection.classList.add("d-none");
                    return;
                }

                if (data.status === "success") {
                    selectedPeriod = data.periodo;
                    isPeriodLocked = data.esta_bloqueado;
                    
                    if (periodSelect.children.length === 0 && data.periods) {
                        data.periods.forEach(p => {
                            const opt = document.createElement("option");
                            opt.value = p;
                            opt.textContent = formatPeriodLabel(p);
                            if (p === selectedPeriod) opt.selected = true;
                            periodSelect.appendChild(opt);
                        });
                    }

                    updateLockUI(isPeriodLocked);
                    renderCardsReport(data);
                    renderConfiguredCorporateSubs(data.individual_configs);
                }
            })
            .catch(err => {
                console.error(err);
                reportContent.innerHTML = `<div class="alert alert-danger m-3">Error al compilar cálculos del reporte ETA.</div>`;
            });
    }

    function togglePeriodLock(period, lockStatus) {
        NetOwl.showLoading("Aplicando cierre de mes...");
        fetch(`/subscriptions/api/eta-report/lock/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify({ period: period, lock: lockStatus })
        })
        .then(res => res.json())
        .then(data => {
            NetOwl.hideLoading();
            if (data.status === "success") {
                isPeriodLocked = data.esta_bloqueado;
                updateLockUI(isPeriodLocked);
                loadReportData(selectedPeriod, true);
                NetOwl.showToast(data.message, "success");
            }
        }).catch(() => NetOwl.hideLoading());
    }

    function updateLockUI(locked) {
        lockSection.classList.remove("d-none");
        if (locked) {
            lockBtn.className = "btn btn-sm btn-danger d-flex align-items-center gap-2";
            lockIcon.className = "bi bi-lock-fill";
            lockText.textContent = "Mes Bloqueado";
        } else {
            lockBtn.className = "btn btn-sm btn-outline-danger d-flex align-items-center gap-2";
            lockIcon.className = "bi bi-unlock";
            lockText.textContent = "Bloquear Mes";
        }
    }

    function formatPeriodLabel(p) {
        const parts = p.split("-");
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return `${meses[parseInt(parts[1]) - 1]} ${parts[0]}`;
    }

    // --- RENDERIZADO DE MODAL DE MAPEO DE ELEMENTOS ---
    function renderUnmappedPanels(planes, subs) {
        // Planes Globales
        if (planes && planes.length > 0) {
            unmappedPlanesSection.classList.remove("d-none");
            unmappedPlanesTbody.innerHTML = "";
            planes.forEach(pName => {
                const tr = document.createElement("tr");
                const safeId = btoa(unescape(encodeURIComponent(pName))).replace(/=/g, "");
                tr.innerHTML = `
                    <td class="fw-semibold text-info">${pName}</td>
                    <td>
                        <select class="form-select form-select-sm" id="rep-${safeId}">
                            <option value="true" selected>Sí</option>
                            <option value="false">Ignorar</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" id="tech-${safeId}">
                            <option value="FTTH">Alámbrico (FTTH)</option>
                            <option value="RF">Inalámbrico (RF)</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" id="pers-${safeId}">
                            <option value="nat">Persona Natural</option>
                            <option value="pyme">Persona Jurídica</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" id="tv-${safeId}">
                            <option value="false" selected>No</option>
                            <option value="true">Sí</option>
                        </select>
                    </td>
                    <td><input type="number" class="form-control form-control-sm" id="speed-${safeId}" value="50" min="0"></td>
                    <td>
                        <button class="btn btn-sm btn-success save-global-plan-btn" data-plan="${pName}">
                            <i class="bi bi-save"></i>
                        </button>
                    </td>
                `;
                unmappedPlanesTbody.appendChild(tr);
            });

            unmappedPlanesTbody.querySelectorAll(".save-global-plan-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const pName = btn.getAttribute("data-plan");
                    const safeId = btoa(unescape(encodeURIComponent(pName))).replace(/=/g, "");
                    const params = {
                        plan_name: pName,
                        reportar: document.getElementById(`rep-${safeId}`).value === "true",
                        tecnologia: document.getElementById(`tech-${safeId}`).value,
                        tipo_persona: document.getElementById(`pers-${safeId}`).value,
                        tiene_tv: document.getElementById(`tv-${safeId}`).value === "true",
                        datas_mbps: parseFloat(document.getElementById(`speed-${safeId}`).value) || 0
                    };
                    saveGlobalPlan(pName, params, btn);
                });
            });
        } else {
            unmappedPlanesSection.classList.add("d-none");
        }

        // Suscripciones Individuales (Dedicados / Transporte)
        if (subs && subs.length > 0) {
            unmappedSubsSection.classList.remove("d-none");
            unmappedSubsTbody.innerHTML = "";
            subs.forEach(s => {
                const tr = document.createElement("tr");
                const safeId = s.orden;
                tr.innerHTML = `
                    <td class="text-white small">${s.orden}</td>
                    <td class="fw-semibold text-warning" style="max-width:180px; overflow:hidden; text-overflow:ellipsis;">${s.cliente}</td>
                    <td class="text-muted small">${s.producto}</td>
                    <td>
                        <select class="form-select form-select-sm" id="subtech-${safeId}">
                            <option value="FTTH">Alámbrico</option>
                            <option value="RF">Inalámbrico</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" id="subpers-${safeId}">
                            <option value="pyme" selected>Persona Jurídica</option>
                            <option value="nat">Persona Natural</option>
                        </select>
                    </td>
                    <td><input type="number" class="form-control form-control-sm" id="subspeed-${safeId}" value="20" min="0"></td>
                    <td>
                        <select class="form-select form-select-sm" id="subtv-${safeId}">
                            <option value="false" selected>No</option>
                            <option value="true">Sí</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" id="subspec-${safeId}">
                            <option value="dedicado" ${s.producto === "Internet Dedicado" ? "selected" : ""}>Internet Dedicado</option>
                            <option value="transporte" ${s.producto === "Transporte de Datos" ? "selected" : ""}>Transporte de Datos</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-warning save-individual-sub-btn" data-orden="${s.orden}" data-cliente="${s.cliente}" data-producto="${s.producto}">
                            <i class="bi bi-save"></i>
                        </button>
                    </td>
                `;
                unmappedSubsTbody.appendChild(tr);
            });

            unmappedSubsTbody.querySelectorAll(".save-individual-sub-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const orden = btn.getAttribute("data-orden");
                    const cliente = btn.getAttribute("data-cliente");
                    const producto = btn.getAttribute("data-producto");
                    const isTransporte = document.getElementById(`subspec-${orden}`).value === "transporte";
                    const isDedicado = document.getElementById(`subspec-${orden}`).value === "dedicado";

                    const params = {
                        orden: orden,
                        cliente: cliente,
                        producto: producto,
                        reportar: true,
                        tecnologia: document.getElementById(`subtech-${orden}`).value,
                        tipo_persona: document.getElementById(`subpers-${orden}`).value,
                        tiene_tv: document.getElementById(`subtv-${orden}`).value === "true",
                        datas_mbps: parseFloat(document.getElementById(`subspeed-${orden}`).value) || 0,
                        es_transporte: isTransporte,
                        es_dedicado: isDedicado
                    };
                    saveIndividualSub(orden, params, btn);
                });
            });
        } else {
            unmappedSubsSection.classList.add("d-none");
        }
    }

    function saveGlobalPlan(planName, params, btn) {
        btn.disabled = true;
        fetch(`/subscriptions/api/eta-report/save-plan-config/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(params)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                btn.closest("tr").style.opacity = "0.3";
                btn.innerHTML = `<i class="bi bi-check-circle"></i>`;
            } else {
                btn.disabled = false;
            }
        });
    }

    function saveIndividualSub(orden, params, btn) {
        btn.disabled = true;
        fetch(`/subscriptions/api/eta-report/save-sub-config/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(params)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                btn.closest("tr").style.opacity = "0.3";
                btn.innerHTML = `<i class="bi bi-check-circle"></i>`;
            } else {
                btn.disabled = false;
            }
        });
    }

    // --- RENDERIZADO DEL REPORTE FINAL EN FORMATO CARDS ---
    function renderCardsReport(data) {
        const tv = data.tv_metrics;
        const net = data.net_metrics;
        const speed = data.speed_metrics;
        const trans = data.transporte_metrics;

        let html = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card kpi-eta-card shadow-sm mb-0">
                        <div class="card-body">
                            <h6 class="text-muted mb-1"><i class="bi bi-tv me-1"></i>Total Clientes con TV</h6>
                            <div class="h2 fw-bold text-white">${tv.total}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card kpi-eta-card shadow-sm mb-0" style="border-left-color: #22c55e;">
                        <div class="card-body">
                            <h6 class="text-muted mb-1"><i class="bi bi-globe me-1"></i>Total Clientes Internet</h6>
                            <div class="h2 fw-bold text-white">${net.total}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card kpi-eta-card shadow-sm mb-0" style="border-left-color: #3b82f6;">
                        <div class="card-body">
                            <h6 class="text-muted mb-1"><i class="bi bi-truck me-1"></i>Transporte de Datos (Aislado)</h6>
                            <div class="h2 fw-bold text-white">${trans.total || 0}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Navegación por Pestañas del Reporte -->
            <ul class="nav nav-pills mb-3" id="etaTab" role="tablist">
                <li class="nav-item">
                    <button class="nav-link active" id="tv-tab" data-bs-toggle="pill" data-bs-target="#tab-tv" type="button">TV</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="net-tab" data-bs-toggle="pill" data-bs-target="#tab-net" type="button">Internet</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="speed-tab" data-bs-toggle="pill" data-bs-target="#tab-speed" type="button">Velocidades (Rangos)</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="transporte-tab" data-bs-toggle="pill" data-bs-target="#tab-transporte" type="button">Transporte de Datos</button>
                </li>
            </ul>

            <div class="tab-content bg-light-subtle p-3 rounded" id="etaTabContent" style="border: 1px solid var(--border-color);">
                
                <!-- PESTAÑA: TV (CARDS STYLE) -->
                <div class="tab-pane fade show active" id="tab-tv">
                    <div class="row g-4">
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-geo-alt me-1 text-primary"></i>Distribución por Estado</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(tv.por_estado)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-person me-1 text-primary"></i>Por Tipo de Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(tv.por_persona)}</div></div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-diagram-3 me-1 text-primary"></i>Por Estado y Tipo de Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(tv.por_estado_persona)}</div></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PESTAÑA: INTERNET (CARDS STYLE) -->
                <div class="tab-pane fade" id="tab-net">
                    <div class="row g-4">
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-hdd-network me-1 text-success"></i>Por Tecnología</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_tecnologia)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-people me-1 text-success"></i>Por Tipo de Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_persona)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-link me-1 text-success"></i>Tecnología - Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_tecnologia_persona)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-map me-1 text-success"></i>Por Estado</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_estado)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-hdd-network-fill me-1 text-success"></i>Estado - Tecnología</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_estado_tecnologia)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-person-lines-fill me-1 text-success"></i>Estado - Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_estado_persona)}</div></div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-grid-3x3-gap me-1 text-success"></i>Estado - Tecnología - Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(net.por_estado_tecnologia_persona)}</div></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PESTAÑA: RANGOS (CARDS STYLE) -->
                <div class="tab-pane fade" id="tab-speed">
                    <div class="row g-3">
                        ${Object.keys(speed).map(r_name => `
                            <div class="col-12">
                                <div class="card mb-0 bg-secondary-subtle">
                                    <div class="card-body py-3">
                                        <div class="row align-items-center">
                                            <div class="col-md-5"><span class="fw-bold text-white fs-5">${r_name}</span></div>
                                            <div class="col-md-7">
                                                <div class="d-flex gap-4 justify-content-end flex-wrap">
                                                    <div><span class="text-muted small d-block">Inalámbrico</span><span class="fw-bold text-info fs-5">${speed[r_name]["Inalámbrico"] || 0}</span></div>
                                                    <div><span class="text-muted small d-block">Alámbrico</span><span class="fw-bold text-success fs-5">${speed[r_name]["Alámbrico"] || 0}</span></div>
                                                    <div class="border-start ps-3"><span class="text-muted small d-block text-white-50">Suma Total</span><span class="fw-bold text-white fs-5">${speed[r_name]["total"] || 0}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>

                <!-- PESTAÑA: TRANSPORTE DE DATOS (DATO APARTE, CARDS STYLE) -->
                <div class="tab-pane fade" id="tab-transporte">
                    <div class="row g-4">
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-geo-alt me-1 text-warning"></i>Por Estado</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(trans.por_estado)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-person me-1 text-warning"></i>Por Tipo de Persona</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(trans.por_persona)}</div></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-header"><h6><i class="bi bi-cpu me-1 text-warning"></i>Por Tecnología</h6></div>
                                <div class="card-body"><div class="row g-2">${renderObjAsBadgeCards(trans.por_tecnologia)}</div></div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;
        reportContent.innerHTML = html;
    }

    function renderObjAsBadgeCards(obj) {
        if (!obj || Object.keys(obj).length === 0) {
            return `<div class="text-muted small p-3">No hay registros clasificados para esta métrica.</div>`;
        }
        return Object.keys(obj).sort().map(k => `
            <div class="col-sm col-lg">
                <div class="eta-badge-card">
                    <span class="fw-semibold text-truncate me-2 text-primary" style="max-width: 70%;" title="${k}">${k}</span>
                    <span class="badge bg-primary-subtle text-primary fw-bold fs-6">${obj[k]}</span>
                </div>
            </div>
        `).join("");
    }

    // --- PESTAÑA GESTIÓN: RENDER DE SUSCRIPCIONES YA CONFIGURADAS ---
    function renderConfiguredCorporateSubs(subs) {
        if (!subs || subs.length === 0) {
            configuredSubsTbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No se registran cuentas especiales aún.</td></tr>`;
            return;
        }

        configuredSubsTbody.innerHTML = "";
        subs.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="small text-white">${s.orden}</td>
                <td class="fw-semibold text-primary">${s.cliente}</td>
                <td class="text-muted small">${s.producto}</td>
                <td>
                    <select class="form-select form-select-sm" id="edit-tech-${s.orden}">
                        <option value="FTTH" ${s.tecnologia === "FTTH" ? "selected" : ""}>Alámbrico</option>
                        <option value="RF" ${s.tecnologia === "RF" ? "selected" : ""}>Inalámbrico</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm" id="edit-pers-${s.orden}">
                        <option value="pyme" ${s.tipo_persona === "pyme" ? "selected" : ""}>Persona Jurídica</option>
                        <option value="nat" ${s.tipo_persona === "nat" ? "selected" : ""}>Persona Natural</option>
                    </select>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" id="edit-speed-${s.orden}" value="${s.datas_mbps}">
                </td>
                <td>
                    <select class="form-select form-select-sm" id="edit-tv-${s.orden}">
                        <option value="false" ${!s.tiene_tv ? "selected" : ""}>No</option>
                        <option value="true" ${s.tiene_tv ? "selected" : ""}>Sí</option>
                    </select>
                </td>
                <td>
                    <span class="badge ${s.es_transporte ? "bg-warning-subtle text-warning" : "bg-info-subtle text-info"}">
                        ${s.es_transporte ? "Transporte de Datos" : "Internet Dedicado"}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-success update-config-btn" data-orden="${s.orden}" data-cliente="${s.cliente}" data-producto="${s.producto}" data-transporte="${s.es_transporte}" data-dedicado="${s.es_dedicado}">
                        <i class="bi bi-arrow-repeat"></i> Actualizar
                    </button>
                </td>
            `;
            configuredSubsTbody.appendChild(tr);
        });

        // Event listener para actualizar cambios posteriores
        configuredSubsTbody.querySelectorAll(".update-config-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const orden = btn.getAttribute("data-orden");
                const cliente = btn.getAttribute("data-cliente");
                const producto = btn.getAttribute("data-producto");
                const es_transporte = btn.getAttribute("data-transporte") === "true";
                const es_dedicado = btn.getAttribute("data-dedicado") === "true";

                const params = {
                    orden: orden,
                    cliente: cliente,
                    producto: producto,
                    reportar: true,
                    tecnologia: document.getElementById(`edit-tech-${orden}`).value,
                    tipo_persona: document.getElementById(`edit-pers-${orden}`).value,
                    tiene_tv: document.getElementById(`edit-tv-${orden}`).value === "true",
                    datas_mbps: parseFloat(document.getElementById(`edit-speed-${orden}`).value) || 0,
                    es_transporte: es_transporte,
                    es_dedicado: es_dedicado
                };

                btn.disabled = true;
                fetch(`/subscriptions/api/eta-report/save-sub-config/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
                    body: JSON.stringify(params)
                })
                .then(res => res.json())
                .then(data => {
                    btn.disabled = false;
                    if (data.status === "success") {
                        NetOwl.showToast("Parámetros actualizados con éxito.", "success");
                        loadReportData(selectedPeriod, true); // Forzar recalculo
                    }
                }).catch(() => btn.disabled = false);
            });
        });
    }

    function getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    }
});
// --- END OF FILE NetOwl-Django/frontend/static/subscriptions/js/eta_report.js ---