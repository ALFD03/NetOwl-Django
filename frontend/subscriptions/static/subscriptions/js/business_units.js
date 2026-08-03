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

            renderBusinessUnits(resData);
        } catch (e) {
            console.error("Error cargando Business Units:", e);
            container.innerHTML = `<div class="alert alert-danger text-center py-4"><i class="bi bi-exclamation-triangle me-2"></i>Ocurrió un error al cargar los datos.</div>`;
        }
    }

    function renderBusinessUnits(resData) {
        let html = "";
        let ftth_objetivo = 0
        let ftth_objetivocierre = 0
        let ftth_faltante = 0
        let ftth_cumplimiento = 0

        let cord_objetivo = 0
        let cord_objetivocierre = 0
        let cord_faltante = 0
        let cord_cumplimiento = 0

        let total_objetivo = 0
        let total_objetivocierre = 0
        let total_faltante = 0
        let total_cumplimiento = 0

        // 1. TARJETA RESUMEN FTTH ARRIBA DEL TODO
        if (resData.ftth_summary && resData.ftth_summary.activos_final !== undefined) {
            const ftth = resData.ftth_summary;
            ftth_objetivo = ftth.activos_inicio * 0.06;
            ftth_objetivocierre = ftth.activos_inicio * 1.06;
            ftth_faltante = ftth_objetivocierre - ftth.activos_final;
            ftth_cumplimiento = ftth_objetivo > 0 ? 100 - ((ftth_faltante / ftth_objetivo) * 100) : 0;

            html += `
            <div class="card border-0 shadow-sm mb-4" style="background: var(--surface-secondary); border-left: 4px solid #10b981 !important;">
                <div class="card-header bg-transparent border-bottom d-flex justify-content-between align-items-center flex-wrap py-3">
                    <h5 class="mb-0 fw-bold text-success d-flex align-items-center">
                        <i class="bi bi-hdd-network-fill me-2 fs-4 text-success"></i>
                        <span>Resumen General - Nodos FTTH (Fibra Óptica)</span>
                    </h5>
                    <span class="badge bg-success-subtle text-success fs-6 px-3 py-2 border border-success border-opacity-25">
                        ${ftth.total_nodos} Nodos FTTH Analizados
                    </span>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value text-primary">${ftth.activos_inicio.toLocaleString()}</div>
                                <div class="metric-label">Activos Inicio</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value text-primary">${ftth.activos_final.toLocaleString()}</div>
                                <div class="metric-label">Activos Finales</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value text-success">+${ftth.nuevos.toLocaleString()}</div>
                                <div class="metric-label">Nuevos Ingresos</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value text-danger">-${ftth.bajas.toLocaleString()}</div>
                                <div class="metric-label">Bajas Totales</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth.crecimiento >= 2 ? 'text-success' : ftth.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${ftth.adiciones_netas.toLocaleString()}</div>
                                <div class="metric-label">Adiciones Netas</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth.crecimiento >= 2 ? 'text-success' : ftth.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${ftth.adiciones_brutas.toLocaleString()}</div>
                                <div class="metric-label">Adiciones Brutas</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value text-info">${ftth.reactivaciones.toLocaleString()}</div>
                                <div class="metric-label">Reactivaciones</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth.churn_neto_pct < 3 ? 'text-success' : ftth.churn_neto_pct <= 4 ? 'text-warning' : 'text-danger'}">${ftth.churn_neto_pct.toFixed(2)}%</div>
                                <div class="metric-label">Churn Neto</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth.churn_bruto_pct < 3 ? 'text-success' : ftth.churn_bruto_pct <= 4 ? 'text-warning' : 'text-danger'}">${ftth.churn_bruto_pct.toFixed(2)}%</div>
                                <div class="metric-label">Churn Bruto</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth.crecimiento >= 2 ? 'text-success' : ftth.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${ftth.crecimiento.toFixed(2)}%</div>
                                <div class="metric-label">Crecimiento</div>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth_cumplimiento >= 100 ? 'text-success' : ftth_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${ftth_faltante.toFixed(0)}</div>
                                <div class="metric-label">Faltante</div>
                                <small class="text-muted d-block mt-1">Cumplimiento: ${ftth_cumplimiento.toFixed(2)}%</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-4 col-xl-2">
                            <div class="metric-card h-100">
                                <div class="metric-value ${ftth_cumplimiento >= 100 ? 'text-success' : ftth_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${ftth_objetivo.toFixed(0)}</div>
                                <div class="metric-label">Objetivo</div>
                                <small class="text-muted d-block mt-1">Cierre: ${ftth_objetivocierre.toFixed(0)}</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // 2. TABLAS DE COORDINADORES Y RF
        resData.data.forEach(item => {
            const coordName = item.coordinador;
            const sub = item.totals;
            const isRf = item.is_rf;

            const cardBorder = isRf ? 'border-warning border-3' : '';
            const headerIcon = isRf ? 'bi-broadcast-pin text-warning' : 'bi-person-circle text-primary';
            const badgeClass = isRf ? 'bg-warning text-dark' : 'bg-primary';
            const titleLabel = isRf ? 'Grupo Consolidado:' : 'Coordinador:';

            total_objetivo = sub.activos_inicio * 0.06;
            total_objetivocierre = sub.activos_inicio * 1.06;
            total_faltante = total_objetivocierre - sub.activos_final;
            total_cumplimiento = total_objetivo > 0 ? 100 - ((total_faltante / total_objetivo) * 100) : 0;


            html += `
            <div class="card coord-card shadow-sm mb-4 ${cardBorder}">
                <div class="card-header d-flex justify-content-between align-items-center" style="height: 6rem !important;">
                    <h5 class="mb-0 fw-bold d-flex align-items-center">
                        <i class="bi ${headerIcon} me-2 fs-4"></i>
                        <span>${titleLabel} <strong class="${isRf ? 'text-warning' : 'text-primary'}">${coordName}</strong></span>
                    </h5>
                    <div>
                        <span class="badge bg-primary fs-6">Meta: ${total_faltante.toFixed(0)}</span>
                        <span class="badge bg-primary fs-6">Objetivo: ${total_objetivo.toFixed(0)}</span>
                        <span class="badge bg-primary fs-6">Cierre Esperado: ${total_objetivocierre.toFixed(0)}</span>
                        <span class="badge bg-primary fs-6">Tasa de Cumplimiento: ${total_cumplimiento.toFixed(2)}%</span>
                    </div>
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
                                    <th class="text-end">Churn Neto %</th>
                                    <th class="text-end">Churn Bruto %</th>
                                    <th class="text-end">Crecimiento %</th>
                                    <th class="text-end fw-bold">Faltante</th>
                                    <th class="text-end fw-bold">Cumplimiento %</th>
                                </tr>
                            </thead>
                            <tbody>`;

            item.nodes.forEach(node => {
                cord_objetivo = node.activos_inicio * 0.06;
                cord_objetivocierre = node.activos_inicio * 1.06;
                cord_faltante = cord_objetivocierre - node.activos_final;
                cord_cumplimiento = cord_objetivo > 0 ? 100 - ((cord_faltante / cord_objetivo) * 100) : 0;

                html += `
                                <tr>
                                    <td><span class="text-end text-primary fw-bold">${node.zona_sucursal}</span></td>
                                    <td class="text-end text-primary">${node.activos_inicio.toLocaleString()}</td>
                                    <td class="text-end text-primary fw-bold">${node.activos_final.toLocaleString()}</td>
                                    <td class="text-end text-success">${node.nuevos.toLocaleString()}</td>
                                    <td class="text-end text-danger">${node.bajas.toLocaleString()}</td>
                                    <td class="text-end text-info">${node.reactivaciones.toLocaleString()}</td>
                                    <td class="text-end ${node.churn_neto_pct < 3 ? 'text-success' : node.churn_neto_pct <= 4 ? 'text-warning' : 'text-danger'}">${node.churn_neto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${node.churn_bruto_pct < 3 ? 'text-success' : node.churn_bruto_pct <= 4 ? 'text-warning' : 'text-danger'}">${node.churn_bruto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${node.crecimiento >= 2 ? 'text-success' : node.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${node.crecimiento.toFixed(2)}%</td>
                                    <td class="text-end fw-bold ${cord_cumplimiento >= 100 ? 'text-success' : cord_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${cord_faltante.toFixed(0)}</td>
                                    <td class="text-end fw-bold ${cord_cumplimiento >= 100 ? 'text-success' : cord_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${cord_cumplimiento.toFixed(2)}%</td>
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
                                    <td class="text-end ${sub.churn_neto_pct < 3 ? 'text-success' : sub.churn_neto_pct <= 4 ? 'text-warning' : 'text-danger'}">${sub.churn_neto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${sub.churn_bruto_pct < 3 ? 'text-success' : sub.churn_bruto_pct <= 4 ? 'text-warning' : 'text-danger'}">${sub.churn_bruto_pct.toFixed(2)}%</td>
                                    <td class="text-end ${sub.crecimiento >= 2 ? 'text-success' : sub.crecimiento >= 0 ? 'text-warning' : 'text-danger'}">${sub.crecimiento.toFixed(2)}%</td>
                                    <td class="text-end fw-bold ${total_cumplimiento >= 100 ? 'text-success' : total_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${total_faltante.toFixed(0)}</td>
                                    <td class="text-end fw-bold ${total_cumplimiento >= 100 ? 'text-success' : total_cumplimiento >= 80 ? 'text-warning' : 'text-danger'}">${total_cumplimiento.toFixed(2)}%</td>
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