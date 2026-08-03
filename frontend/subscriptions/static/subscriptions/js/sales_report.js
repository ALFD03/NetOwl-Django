// frontend/subscriptions/static/subscriptions/js/sales_report.js

document.addEventListener("DOMContentLoaded", () => {
    const periodSelect = document.getElementById("salesPeriodSelect");
    const container = document.getElementById("salesReportContainer");

    // Cargar la lista de períodos disponibles
    fetch("/subscriptions/api/periods/")
        .then(res => res.json())
        .then(data => {
            if (data.periods && data.periods.length > 0) {
                periodSelect.innerHTML = data.periods.map(p => `<option value="${p}">${p}</option>`).join("");
                // Cargar reporte del periodo más reciente
                loadSalesReport(data.periods[0]);
            } else {
                container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-info-circle me-2"></i>No hay datos históricos disponibles.</div>`;
            }
        });

    periodSelect.addEventListener("change", (e) => {
        loadSalesReport(e.target.value);
    });

    function loadSalesReport(period) {
        container.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Cargando reporte de ventas...</div>`;
        
        fetch(`/subscriptions/api/sales-report/?period=${period}`)
            .then(res => res.json())
            .then(res => {
                if (res.status === "success") {
                    renderReportTable(res.data);
                } else {
                    container.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-2"></i>Error: ${res.message || 'No se pudieron recuperar los datos.'}</div>`;
                }
            })
            .catch(err => {
                container.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-2"></i>Error de red: ${err.message}</div>`;
            });
    }

    function renderReportTable(sitesList) {
        let html = "";
        let objetivo = 0;
        let Faltante = 0;
        let porcentajeFaltante = 0;
        let objetivosite = 0;
        let cierreesperadosite = 0;
        let Faltantesite = 0;
        let porcentajeFaltantesite = 0;
        let objetivotech = 0;
        let Faltantetech = 0;
        let porcentajeFaltantetech = 0;
        let cierreesperadotech = 0;

        sitesList.forEach(siteData => {
          const s = siteData.totals;
          objetivosite = parseInt((s.activos_inicio *1.06) - s.activos_inicio)
          Faltantesite = objetivosite - s.adiciones_brutas
          porcentajeFaltantesite = objetivosite > 0 ? 100 - ((Faltantesite / objetivosite) * 100) : 0
          cierreesperadosite = parseInt(s.activos_inicio) * 1.06

            html += `
            <div class="card site-card shadow-sm mb-4">
              <div class="card-header d-flex justify-content-between align-items-center" style="height: 6rem !important;">
                <h4 class="mb-0 fw-bold text-primary"><i class="bi bi-geo-alt-fill me-2 text-primary"></i>SITE REGIONAL: ${siteData.site}</h4>
                <div>
                  <span class="badge bg-primary fs-6">Meta: ${Faltantesite.toFixed(0)}</span>
                  <span class="badge bg-primary fs-6">Objetivo: ${objetivosite.toFixed(0)}</span>
                  <span class="badge bg-primary fs-6">Cierre Esperado: ${cierreesperadosite.toFixed(0)}</span>
                  <span class="badge bg-primary fs-6">Tasa de Cumplimiento: ${porcentajeFaltantesite.toFixed(2)}%</span>
                </div>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-sm table-hover align-middle mb-0 table-sales">
                    <thead style="height: 5rem">
                      <tr>
                        <th class="fw-bold">Nodos (Zona - Sucursal)</th>
                        <th class="text-end fw-bold">Activos Inicio</th>
                        <th class="text-end fw-bold">Nuevos (Altas)</th>
                        <th class="text-end fw-bold">Bajas Brutas</th>
                        <th class="text-end fw-bold">Reactivaciones</th>
                        <th class="text-end fw-bold">Activos Final</th>
                        <th class="text-end fw-bold">Crecimiento %</th>
                        <th class="text-end fw-bold">Churn Neto %</th>
                        <th class="text-end fw-bold">Churn Bruto %</th>
                        <th class="text-end fw-bold">Faltante</th>
                        <th class="text-end fw-bold">Cumplimiento %</th>
                      </tr>
                    </thead>
                    <tbody>
            `;

            siteData.technologies.forEach(techGroup => {
                // Sub-encabezado de Tecnología dentro del Site
                const t = techGroup.totals;
                objetivotech = parseInt((t.activos_inicio *1.06) - t.activos_inicio)
                Faltantetech = objetivotech - t.adiciones_brutas
                porcentajeFaltantetech = objetivotech > 0 ? 100 - ((Faltantetech / objetivotech) * 100) : 0
                cierreesperadotech = parseInt(t.activos_inicio) * 1.06
                
                html += `
                  <tr class="table" style="background-color: var(--surface-tertiary) !important; height: 4rem !important;">
                    <td colspan="11" class="text-primary text-uppercase fw-bold p-0" style="font-size: 0.85rem; letter-spacing: 0.05em;">
                      <div class="d-flex justify-content-between align-items-center p-2">
                        <div class="text-primary p-0" style="background-color: var(--surface-tertiary) !important"><i class="bi bi-cpu-fill me-1"></i> Tecnología: ${techGroup.technology}</div>
                        <div class="p-0" style="background-color: var(--surface-tertiary) !important">
                          <span class="badge bg-primary fs-8">Meta: ${Faltantetech.toFixed(0)}</span>
                          <span class="badge bg-primary fs-8">Objetivo: ${objetivotech.toFixed(0)}</span>
                          <span class="badge bg-primary fs-8">Cierre Esperado: ${cierreesperadotech.toFixed(0)}</span>
                          <span class="badge bg-primary fs-8">Tasa de Cumplimiento: ${porcentajeFaltantetech.toFixed(2)}%</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                `;

                // Filas de los Nodos pertenecientes a esa tecnología
                techGroup.nodes.forEach(node => {
                    objetivo = parseInt((node.activos_inicio *1.06) - node.activos_inicio)
                    Faltante = objetivo - node.adiciones_brutas
                    porcentajeFaltante = objetivo > 0 ? 100 - ((Faltante / objetivo) * 100) : 0;

                    html += `
                      <tr>
                        <td class="text-primary" style="padding-left: 2rem;">${node.zona_sucursal}</td>
                        <td class="text-end text-primary">${node.activos_inicio.toLocaleString()}</td>
                        <td class="text-end text-success">+${node.nuevos.toLocaleString()}</td>
                        <td class="text-end text-danger">-${node.bajas.toLocaleString()}</td>
                        <td class="text-end text-info">+${node.reactivaciones.toLocaleString()}</td>
                        <td class="text-end text-primary">${node.activos_final.toLocaleString()}</td>
                        <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${node.crecimiento.toFixed(2)}%</td>
                        <td class="text-end ${node.churn_neto_pct <= 3 ? 'text-success' : node.churn_neto_pct <= 4 ? 'text-warning': 'text-danger'}">${node.churn_neto_pct.toFixed(2)}%</td>
                        <td class="text-end ${node.churn_bruto_pct <= 3 ? 'text-success' : node.churn_bruto_pct <= 4 ? 'text-warning': 'text-danger'}">${node.churn_bruto_pct.toFixed(2)}%</td>
                        <td class="text-end ${porcentajeFaltante  >= 100 ? 'text-success' : porcentajeFaltante  >= 80 ? 'text-warning': 'text-danger'}">${Faltante.toLocaleString()}</td>
                        <td class="text-end ${porcentajeFaltante  >= 100 ? 'text-success' : porcentajeFaltante  >= 80 ? 'text-warning': 'text-danger'}">${porcentajeFaltante.toFixed(2)}%</td>
                      </tr>
                    `;
                });

                // Fila de Subtotal por Tecnología
                objetivotech = parseInt((t.activos_inicio *1.06) - t.activos_inicio)
                Faltantetech = objetivotech - t.adiciones_brutas
                porcentajeFaltantetech = objetivotech > 0 ? 100 - ((Faltantetech / objetivotech) * 100) : 0

                html += `
                  <tr class="subtotal-row" style="font-weight: 600; height: 3rem !important;">
                    <td style="padding-left: 1.5rem;" class="text-primary-emphasis fw-bold"><i class="bi bi-calculator me-1"></i> Subtotal ${techGroup.technology}</td>
                    <td class="text-end text-primary fw-bold">${t.activos_inicio.toLocaleString()}</td>
                    <td class="text-end text-success fw-bold">+${t.nuevos.toLocaleString()}</td>
                    <td class="text-end text-danger fw-bold">-${t.bajas.toLocaleString()}</td>
                    <td class="text-end text-info fw-bold">+${t.reactivaciones.toLocaleString()}</td>
                    <td class="text-end text-primary fw-bold">${t.activos_final.toLocaleString()}</td>
                    <td class="text-end ${t.crecimiento >= 2 ? 'text-success' : t.crecimiento >= 0 ? 'text-warning' : 'text-danger'} fw-bold">${t.crecimiento.toFixed(2)}%</td>
                    <td class="text-end ${t.churn_neto_pct <= 3 ? 'text-success' : t.churn_neto_pct <= 4 ? 'text-warning': 'text-danger'}">${t.churn_neto_pct.toFixed(2)}%</td>
                    <td class="text-end ${t.churn_bruto_pct <= 3 ? 'text-success' : t.churn_bruto_pct <= 4 ? 'text-warning': 'text-danger'}">${t.churn_bruto_pct.toFixed(2)}%</td>
                    <td class="text-end ${porcentajeFaltantetech >= 100 ? 'text-success' : porcentajeFaltantetech >= 80 ? 'text-warning': 'text-danger'}">${Faltantetech.toLocaleString()}</td>
                    <td class="text-end ${porcentajeFaltantetech >= 100 ? 'text-success' : porcentajeFaltantetech >= 80 ? 'text-warning': 'text-danger'}">${porcentajeFaltantetech.toFixed(2)}%</td>                      
                  </tr>
                `;
            });

            // Fila de Total General por Site Regional (Suma de todas sus tecnologías)
            objetivosite = parseInt((s.activos_inicio *1.06) - s.activos_inicio)
            Faltantesite = objetivosite - s.adiciones_brutas
            porcentajeFaltantesite = objetivosite > 0 ? 100 - ((Faltantesite / objetivosite) * 100) : 0
            html += `
                  <tr class="table" style="background-color: var(--surface-hover) !important; font-weight: 700; border-top: 2px solid var(--primary); height: 5rem !important;">
                    <td class="text-primary fw-bold"><i class="bi bi-globe me-1 text-primary"></i> TOTAL REGIONAL ${siteData.site}</td>
                    <td class="text-end text-primary fw-bold">${s.activos_inicio.toLocaleString()}</td>
                    <td class="text-end text-success fw-bold">+${s.nuevos.toLocaleString()}</td>
                    <td class="text-end text-danger fw-bold">-${s.bajas.toLocaleString()}</td>
                    <td class="text-end text-info fw-bold">+${s.reactivaciones.toLocaleString()}</td>
                    <td class="text-end text-primary fw-bold">${s.activos_final.toLocaleString()}</td>
                    <td class="text-end ${s.crecimiento >= 2 ? 'text-success' : s.crecimiento >= 0 ? 'text-warning' : 'text-danger'} fw-bold">${s.crecimiento.toFixed(2)}%</td>
                    <td class="text-end ${s.churn_neto_pct <= 3 ? 'text-success' : s.churn_neto_pct <= 4 ? 'text-warning': 'text-danger'}">${s.churn_neto_pct.toFixed(2)}%</td>
                    <td class="text-end ${s.churn_bruto_pct <= 3 ? 'text-success' : s.churn_bruto_pct <= 4 ? 'text-warning': 'text-danger'}">${s.churn_bruto_pct.toFixed(2)}%</td>
                    <td class="text-end ${porcentajeFaltantesite >= 100 ? 'text-success' : porcentajeFaltantesite >= 80 ? 'text-warning': 'text-danger'}">${Faltantesite.toLocaleString()}</td>
                    <td class="text-end ${porcentajeFaltantesite >= 100 ? 'text-success' : porcentajeFaltantesite >= 80 ? 'text-warning': 'text-danger'}">${porcentajeFaltantesite.toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
            `;
        });

        container.innerHTML = html;
    }
});