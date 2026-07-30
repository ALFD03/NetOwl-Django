document.addEventListener("DOMContentLoaded", function () {
    const periodSelect = document.getElementById("buPeriodSelect");
    const container = document.getElementById("businessUnitsContainer");

    async function loadReport(period = "") {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>Cargando reporte...
            </div>`;
        try {
            const url = period ? `/subscriptions/api/business-units/?period=${period}` : "/subscriptions/api/business-units/";
            const res = await fetch(url);
            const resData = await res.json();

            if (resData.status === "empty" || !resData.data || resData.data.length === 0) {
                container.innerHTML = `<div class="alert alert-info text-center py-4"><i class="bi bi-info-circle me-2"></i>No hay datos disponibles para el periodo seleccionado.</div>`;
                return;
            }

            if (resData.periods && periodSelect.children.length === 0) {
                periodSelect.innerHTML = resData.periods.map(p => `<option value="${p}" ${p === resData.period ? 'selected' : ''}>${p}</option>`).join('');
            }

            renderBusinessUnits(resData.data);
        } catch (e) {
            console.error("Error cargando Business Units:", e);
            container.innerHTML = `<div class="alert alert-danger text-center py-4"><i class="bi bi-exclamation-triangle me-2"></i>Ocurrió un error al cargar los datos.</div>`;
        }
    }

    function renderBusinessUnits(coordinadores) {
        let html = "";

        coordinadores.forEach(item => {
            const coordName = item.coordinador;
            const sub = item.totals;
            const isRf = item.is_rf;

            const cardBorder = isRf ? 'border-warning border-3' : '';
            const headerIcon = isRf ? 'bi-broadcast-pin text-warning' : 'bi-person-circle text-primary';
            const badgeClass = isRf ? 'bg-warning text-dark' : 'bg-primary';
            const titleLabel = isRf ? 'Grupo Consolidado:' : 'Coordinador:';

            html += `
            <div class="card coord-card shadow-sm mb-4 ${cardBorder}">
                <div class="card-header d-flex justify-content-between align-items-center" style="height: 6rem !important;">
                    <h5 class="mb-0 fw-bold d-flex align-items-center">
                        <i class="bi ${headerIcon} me-2 fs-4"></i>
                        <span>${titleLabel} <strong class="${isRf ? 'text-warning' : 'text-primary'}">${coordName}</strong></span>
                    </h5>
                    <span class="badge bg-primary fs-6">Crecimiento: ${sub.crecimiento.toFixed(2)}%</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0 table-sales">
                            <thead>
                                <tr>
                                    <th>Zona - Sucursal</th>
                                    <th class="text-end">Act. Inicio</th>
                                    <th class="text-end">Act. Final</th>
                                    <th class="text-end">Nuevos</th>
                                    <th class="text-end">Bajas</th>
                                    <th class="text-end">Reactivaciones</th>
                                    <th class="text-end">Ad. Netas</th>
                                    <th class="text-end">Ad. Brutas</th>
                                    <th class="text-end">Churn Neto %</th>
                                    <th class="text-end">Churn Bruto %</th>
                                    <th class="text-end">Crecimiento %</th>
                                </tr>
                            </thead>
                            <tbody>`;

            item.nodes.forEach(node => {
                html += `
                                <tr>
                                    <td><span class="text-end text-primary fw-bold">${node.zona_sucursal}</span></td>
                                    <td class="text-end text-primary">${node.activos_inicio.toLocaleString()}</td>
                                    <td class="text-end text-primary fw-bold">${node.activos_final.toLocaleString()}</td>
                                    <td class="text-end text-success">${node.nuevos.toLocaleString()}</td>
                                    <td class="text-end text-danger">${node.bajas.toLocaleString()}</td>
                                    <td class="text-end text-info">${node.reactivaciones.toLocaleString()}</td>
                                    <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${node.adiciones_netas.toLocaleString()}</td>
                                    <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${node.adiciones_brutas.toLocaleString()}</td>
                                    <td class="text-end ${node.churn_neto_pct < 3 ? 'text-success' : node.churn_neto_pct <= 4 ? 'text-warning' : 'text-danger'}">${node.churn_neto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${node.churn_bruto_pct < 3 ? 'text-success' : node.churn_bruto_pct <= 4 ? 'text-warning' : 'text-danger'}">${node.churn_bruto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${node.crecimiento.toFixed(2)}%</td>
                                </tr>`;
            });

            // Fila de Total acumulado por Coordinador
            html += `
                                <tr class="subtotal-row">
                                    <td class="text-end text-primary fw-bold">${isRf ? 'RF (RADIOFRECUENCIA)' : 'COORDINADOR ' + coordName.toUpperCase()}</td>

                                    <td class="text-end text-primary">${sub.activos_inicio.toLocaleString()}</td>
                                    <td class="text-end text-primary">${sub.activos_final.toLocaleString()}</td>
                                    <td class="text-end text-success">${sub.nuevos.toLocaleString()}</td>
                                    <td class="text-end text-danger">${sub.bajas.toLocaleString()}</td>
                                    <td class="text-end text-info">${sub.reactivaciones.toLocaleString()}</td>
                                    <td class="text-end ${sub.crecimiento >= 2 ? 'text-success' : sub.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${sub.adiciones_netas.toLocaleString()}</td>
                                    <td class="text-end ${sub.crecimiento >= 2 ? 'text-success' : sub.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${sub.adiciones_brutas.toLocaleString()}</td>
                                    <td class="text-end ${sub.churn_neto_pct < 3 ? 'text-success' : sub.churn_neto_pct <= 4 ? 'text-warning' : 'text-danger'}">${sub.churn_neto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${sub.churn_bruto_pct < 3 ? 'text-success' : sub.churn_bruto_pct <= 4 ? 'text-warning' : 'text-danger'}">${sub.churn_bruto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${sub.crecimiento >= 2 ? 'text-success' : sub.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${sub.crecimiento.toFixed(2)}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    }

    periodSelect.addEventListener("change", function () {
        loadReport(this.value);
    });

    loadReport();
});