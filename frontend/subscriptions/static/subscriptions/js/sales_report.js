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

        sitesList.forEach(siteData => {
            html += `
            <div class="card site-card shadow-sm mb-4">
              <div class="card-header d-flex justify-content-between align-items-center" style="height: 6rem !important;">
                <h4 class="mb-0 fw-bold text-primary"><i class="bi bi-geo-alt-fill me-2 text-primary"></i>SITE REGIONAL: ${siteData.site}</h4>
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
                        <th class="text-end fw-bold">Adiciones Netas</th>
                        <th class="text-end fw-bold">Adiciones Brutas</th>
                      </tr>
                    </thead>
                    <tbody>
            `;

            siteData.technologies.forEach(techGroup => {
                // Sub-encabezado de Tecnología dentro del Site
                html += `
                  <tr class="table" style="background-color: var(--surface-tertiary) !important; height: 4rem !important;">
                    <td colspan="11" class="text-primary text-uppercase fw-bold" style="padding-left: 1.25rem; font-size: 0.85rem; letter-spacing: 0.05em;">
                      <i class="bi bi-cpu-fill me-1"></i> Tecnología: ${techGroup.technology}
                    </td>
                  </tr>
                `;

                // Filas de los Nodos pertenecientes a esa tecnología
                techGroup.nodes.forEach(node => {
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
                        <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${node.adiciones_netas.toLocaleString()}</td>
                        <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${node.adiciones_brutas.toLocaleString()}</td>
                      </tr>
                    `;
                });

                // Fila de Subtotal por Tecnología
                const t = techGroup.totals;
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
                    <td class="text-end ${t.crecimiento >= 2 ? 'text-success' : t.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${t.adiciones_netas.toLocaleString()}</td>
                    <td class="text-end ${t.crecimiento >= 2 ? 'text-success' : t.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${t.adiciones_brutas.toLocaleString()}</td>                      
                  </tr>
                `;
            });

            // Fila de Total General por Site Regional (Suma de todas sus tecnologías)
            const s = siteData.totals;
            html += `
                  <tr class="table style="background-color: var(--surface-hover) !important; font-weight: 700; border-top: 2px solid var(--primary); height: 5rem !important;">
                    <td class="text-primary fw-bold"><i class="bi bi-globe me-1 text-primary"></i> TOTAL REGIONAL ${siteData.site}</td>
                    <td class="text-end text-primary fw-bold">${s.activos_inicio.toLocaleString()}</td>
                    <td class="text-end text-success fw-bold">+${s.nuevos.toLocaleString()}</td>
                    <td class="text-end text-danger fw-bold">-${s.bajas.toLocaleString()}</td>
                    <td class="text-end text-info fw-bold">+${s.reactivaciones.toLocaleString()}</td>
                    <td class="text-end text-primary fw-bold">${s.activos_final.toLocaleString()}</td>
                    <td class="text-end ${s.crecimiento >= 2 ? 'text-success' : s.crecimiento >= 0 ? 'text-warning' : 'text-danger'} fw-bold">${s.crecimiento.toFixed(2)}%</td>
                    <td class="text-end ${s.churn_neto_pct <= 3 ? 'text-success' : s.churn_neto_pct <= 4 ? 'text-warning': 'text-danger'}">${s.churn_neto_pct.toFixed(2)}%</td>
                    <td class="text-end ${s.churn_bruto_pct <= 3 ? 'text-success' : s.churn_bruto_pct <= 4 ? 'text-warning': 'text-danger'}">${s.churn_bruto_pct.toFixed(2)}%</td>
                    <td class="text-end ${s.crecimiento >= 2 ? 'text-success' : s.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${s.adiciones_netas.toLocaleString()}</td>
                    <td class="text-end ${s.crecimiento >= 2 ? 'text-success' : s.crecimiento >= 0 ? 'text-warning': 'text-danger'}">${s.adiciones_brutas.toLocaleString()}</td>
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