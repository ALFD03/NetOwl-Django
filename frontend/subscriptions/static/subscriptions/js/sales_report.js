document.addEventListener("DOMContentLoaded", function() {
    const periodSelect = document.getElementById("salesPeriodSelect");
    const container = document.getElementById("salesReportContainer");

    // 1. Cargar períodos disponibles
    fetch("/subscriptions/api/periods/")
        .then(res => res.json())
        .then(data => {
            if (data.periods && data.periods.length > 0) {
                periodSelect.innerHTML = data.periods.map(p => `<option value="${p}">${p}</option>`).join("");
                loadSalesReport(data.periods[0]);
            } else {
                container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-info-circle me-2"></i>No hay periodos calculados aún. Realice el análisis de Churn primero.</div>`;
            }
        });

    periodSelect.addEventListener("change", function() {
        loadSalesReport(this.value);
    });

    function loadSalesReport(period) {
        NetOwl.showLoading("Cargando reporte de ventas...");
        fetch(`/subscriptions/api/sales-report/?period=${period}`)
            .then(res => res.json())
            .then(res => {
                NetOwl.hideLoading();
                if (res.status === "empty") {
                    container.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>No se encontraron datos dimensionales de 'zona_sucursal' para el periodo ${period}.</div>`;
                    return;
                }
                if (res.status === "error") {
                    container.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>Error: ${res.message}</div>`;
                    return;
                }

                renderReport(res.data);
            })
            .catch(err => {
                NetOwl.hideLoading();
                container.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i>Error de conexión al cargar el reporte.</div>`;
            });
    }

    function renderReport(data) {
        let html = "";

        // Recorremos cada Site regional (Valencia, Aragua, etc.)
        for (const [site, rows] of Object.entries(data)) {
            // Calculamos subtotales de la región para gerencia
            let totIni = 0, totFin = 0, totNue = 0, totBaj = 0, totReac = 0, totBill = 0;

            rows.forEach(r => {
              const activos_inicio = parseInt(r.activos_inicio) || 0;
              const activos_final = parseInt(r.activos_final) || 0;
              const nuevos = parseInt(r.nuevos) || 0;
              const bajas = parseInt(r.bajas) || 0;
              const reactivaciones = parseInt(r.reactivaciones) || 0;
              const total_billing = parseFloat(r.total_billing) || 0;

              totIni += activos_inicio;
              totFin += activos_final;
              totNue += nuevos;
              totBaj += bajas;
              totReac += reactivaciones;
              totBill += total_billing;
            });

            const siteChurn = totIni > 0 ? (((totBaj) / totIni) * 100).toFixed(2) : "0.00";
            const siteARPU = totFin > 0 ? (totBill / totFin).toFixed(2) : "0.00";
            const totalCreac = totIni > 0 ? (((totFin - totIni) / totIni) * 100).toFixed(2) : "0.00";

            html += `
            <div class="card site-card shadow-sm">
              <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0 text-uppercase small tracking-wider text-primary fw-bold"><i class="bi bi-geo-alt-fill me-2"></i>Región: ${site}</h5>
                <span class="badge bg-primary-subtle text-primary rounded-pill px-3">${rows.length} Nodos Socios</span>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table align-middle mb-0 table-sales table-theme">
                    <thead>
                      <tr>
                        <th>Zona / Nodo</th>
                        <th>Sucursal</th>
                        <th class="text-end">Activos Inicio</th>
                        <th class="text-end">Nuevos</th>
                        <th class="text-end">Bajas</th>
                        <th class="text-end">Crecimiento</th>
                        <th class="text-end">Reactivaciones</th>
                        <th class="text-end">Activos Final</th>
                        <th class="text-end">Churn %</th>
                        <th class="text-end">ARPU</th>
                        <th class="text-end">Facturación Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map(r => {
                          const activos_inicio = parseInt(r.activos_inicio) || 0;
                          const nuevos = parseInt(r.nuevos) || 0;
                          const bajas = parseInt(r.bajas) || 0;
                          const crecimiento = parseFloat(r.crecimiento) || 0;
                          const reactivaciones = parseInt(r.reactivaciones) || 0;
                          const activos_final = parseInt(r.activos_final) || 0;
                          const churn_bruto_pct = parseFloat(r.churn_bruto_pct) || 0;
                          const arpu = parseFloat(r.arpu) || 0;
                          const total_billing = parseFloat(r.total_billing) || 0;

                          return `
                        <tr>
                          <td class="fw-semibold">${r.zona}</td>
                          <td><span class="badge bg-secondary-subtle text-secondary-emphasis">${r.sucursal}</span></td>
                          <td class="text-end text-muted">${activos_inicio}</td>
                          <td class="text-end text-success">+${nuevos}</td>
                          <td class="text-end text-danger">-${bajas}</td>
                          <td class="text-end text-success">${crecimiento.toFixed(2)}%</td>
                          <td class="text-end text-info">+${reactivaciones}</td>
                          <td class="text-end fw-bold">${activos_final}</td>
                          <td class="text-end ${churn_bruto_pct > 2.5 ? 'text-warning' : ''}">${churn_bruto_pct.toFixed(2)}%</td>
                          <td class="text-end">$${arpu.toFixed(2)}</td>
                          <td class="text-end fw-semibold text-primary">$${total_billing.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      `;
                      }).join("")}
                      
                      <!-- Fila de Subtotales de la Región -->
                      <tr class="subtotal-row">
                        <td colspan="2">SUBTOTAL REGIONAL (${site})</td>
                        <td class="text-end">${totIni}</td>
                        <td class="text-end text-success">+${totNue}</td>
                        <td class="text-end text-danger">-${totBaj}</td>
                        <td class="text-end text-success">${totalCreac}%</td>
                        <td class="text-end text-info">+${totReac}</td>
                        <td class="text-end text-primary">${totFin}</td>
                        <td class="text-end">${siteChurn}%</td>
                        <td class="text-end">$${siteARPU}</td>
                        <td class="text-end text-primary">$${totBill.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            `;
        }

        container.innerHTML = html;
    }
});