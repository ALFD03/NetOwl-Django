// NetOwl-Django/frontend/support/static/support/js/analytics.js

document.addEventListener('DOMContentLoaded', async () => {
    let gruposData = {};
    let chartInstances = {};

    const container = document.getElementById('analyticsGroupsContainer');
    const selectPeriodo = document.getElementById('filterPeriodoAnalytics');

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    const centerTextPlugin = {
        id: 'centerTextPlugin',
        beforeDraw(chart) {
            const { chartArea, ctx } = chart;
            if (!chartArea) return;

            const centerConfig = chart.config.options.plugins.centerText;
            if (!centerConfig) return;

            const centerX = chartArea.left + (chartArea.right - chartArea.left) / 2;
            const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 2;

            ctx.save();
            let mainText = centerConfig.defaultText || '';
            let subText = centerConfig.defaultSubtext || '';

            if (chart.tooltip && chart.tooltip._active && chart.tooltip._active.length > 0) {
                const activePoint = chart.tooltip._active[0];
                const datasetIndex = activePoint.datasetIndex;
                const index = activePoint.index;
                const dataset = chart.data.datasets[datasetIndex];
                const label = chart.data.labels[index] || '';
                const val = dataset.data[index] || 0;

                const total = dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;

                mainText = `${pct}%`;
                subText = label;
            }

            ctx.font = 'bold 1.5rem Inter, sans-serif';
            ctx.fillStyle = '#E6EEF6';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mainText, centerX, centerY - 10);

            ctx.font = '500 0.8rem Inter, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(subText, centerX, centerY + 14);
            ctx.restore();
        }
    };

    Chart.register(centerTextPlugin);

    async function init() {
        await loadPeriods();
        await loadAnalytics();
    }

    async function loadPeriods() {
        try {
            const res = await fetch('/support/api/periods/');
            const data = await res.json();
            const periods = data.periods || [];
            if (!selectPeriodo) return;

            selectPeriodo.innerHTML = periods.map(p => `<option value="${p}">${p}</option>`).join('');
            selectPeriodo.addEventListener('change', loadAnalytics);
        } catch (e) {
            console.error('Error cargando periodos:', e);
        }
    }

    async function loadAnalytics() {
        try {
            const p = selectPeriodo ? selectPeriodo.value : '';
            const url = p ? `/support/api/dimension-metrics/?period=${p}` : '/support/api/dimension-metrics/';
            const res = await fetch(url);
            const data = await res.json();
            gruposData = data.grupos || {};

            if (!container) return;

            const grupoNames = Object.keys(gruposData);
            if (grupoNames.length === 0) {
                container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-info-circle me-2"></i>No hay métricas disponibles para este periodo.</div>';
                return;
            }

            Object.values(chartInstances).forEach(c => c.destroy());
            chartInstances = {};

            container.innerHTML = grupoNames.map((gName, idx) => renderGroupSection(gName, gruposData[gName], idx)).join('');
            grupoNames.forEach((gName, idx) => initGroupCharts(gName, gruposData[gName], idx));

        } catch (e) {
            console.error('Error en Analytics:', e);
        }
    }

    function renderGroupSection(gName, groupData, idx) {
        const mG = groupData.metricas_grupo || {};
        return `
            <div class="group-section-container">
                <!-- Encabezado del Grupo -->
                <div class="group-header-title d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h4 class="mb-0 text-primary fw-bold"><i class="bi bi-people-fill me-2"></i>${gName}</h4>
                    <span class="text-muted small fw-semibold">Volumen Total: <strong class="text-white">${(groupData.total_tickets_grupo || 0).toLocaleString()} tickets</strong></span>
                </div>

                <!-- FRANJA INTEGRADA DE TIEMPOS -->
                <div class="row g-3 mb-4">
                    <div class="col-md-3">
                        <div class="timing-strip-item">
                            <span class="d-block text-muted small uppercase fw-bold mb-1">MTTR PROMEDIO</span>
                            <span class="fs-3 fw-bold text-success">${mG.tiempo_medio_cierre_horas || 0} h</span>
                            <small class="d-block text-muted mt-1">Mediana: <strong class="text-white">${mG.tiempo_mediana_cierre_horas || 0} h</strong></small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="timing-strip-item">
                            <span class="d-block text-muted small uppercase fw-bold mb-1">RANGO (P25 - P75)</span>
                            <span class="fs-3 fw-bold text-info">${mG.tiempo_p25_cierre_horas || 0} - ${mG.tiempo_p75_cierre_horas || 0} h</span>
                            <small class="d-block text-muted mt-1">Desviación σ: <strong class="text-white">${mG.tiempo_std_cierre_horas || 0} h</strong></small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="timing-strip-item">
                            <span class="d-block text-muted small uppercase fw-bold mb-1">1ª RESPUESTA</span>
                            <span class="fs-3 fw-bold text-primary">${mG.tiempo_promedio_primera_respuesta_horas || 0} h</span>
                            <small class="d-block text-muted mt-1">Asignación inicial</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="timing-strip-item">
                            <span class="d-block text-muted small uppercase fw-bold mb-1">RIESGO DEMORA</span>
                            <span class="fs-3 fw-bold text-warning">${mG.pct_excede_promedio_cierre || 0}%</span>
                            <small class="d-block text-muted mt-1">> Mediana: <strong class="text-white">${mG.pct_excede_mediana_cierre || 0}%</strong></small>
                        </div>
                    </div>
                </div>

                <!-- FILA 2: COMPOSICIÓN, CAUSA RAÍZ EN VELA ACUMULATIVA AL 100% Y SUCURSAL -->
                <div class="row g-4 mb-4">
                    <div class="col-lg-4">
                        <div class="chart-box-card">
                            <h6 class="fw-bold mb-3"><i class="bi bi-pie-chart me-2 text-primary"></i>Tipos de Solicitud</h6>
                            <div class="chart-container" style="position:relative; height:300px; width:100%;">
                                <canvas id="chart-tipo-pie-${idx}"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- CAUSA RAÍZ EN GRÁFICO DE VELA / CASCADA ACUMULATIVA AL 100% -->
                    <div class="col-lg-4">
                        <div class="chart-box-card">
                            <h6 class="fw-bold mb-3"><i class="bi bi-bar-chart-steps me-2 text-warning"></i>Causa Raíz (Cascada al 100%)</h6>
                            <div class="chart-container" style="position:relative; height:300px;">
                                <canvas id="chart-razon-bar-${idx}"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-4">
                        <div class="chart-box-card">
                            <h6 class="fw-bold mb-3"><i class="bi bi-building me-2 text-info"></i>Distribución por Sucursal</h6>
                            <div class="chart-container" style="position:relative; height:300px; width:100%;">
                                <canvas id="chart-sucursal-pie-${idx}"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FILA 3: CARGA POR SITE Y TOP SOLUCIONES EN VELA ACUMULATIVA AL 100% -->
                <div class="row g-4">
                    <div class="col-lg-6">
                        <div class="chart-box-card">
                            <h6 class="fw-bold mb-3"><i class="bi bi-geo-alt-fill me-2 text-primary"></i>Tasa de Incidencia por Site Regional (%)</h6>
                            <div class="chart-container" style="position:relative; height:300px;">
                                <canvas id="chart-site-bar-${idx}"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- TOP SOLUCIONES EN GRÁFICO DE VELA / CASCADA ACUMULATIVA AL 100% -->
                    <div class="col-lg-6">
                        <div class="chart-box-card">
                            <h6 class="fw-bold mb-3"><i class="bi bi-wrench-adjustable-circle me-2 text-success"></i>Top Soluciones (Cascada al 100%)</h6>
                            <div class="chart-container" style="position:relative; height:300px;">
                                <canvas id="chart-solucion-bar-${idx}"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function initGroupCharts(gName, groupData, idx) {
        const totGrupo = groupData.total_tickets_grupo || 0;
        const colorPalette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#3b82f6', '#14b8a6', '#a855f7', '#f43f5e'];

        // 1. Chart Tipos de Solicitud (Dona)
        const tipos = groupData.tipos_solicitud || [];
        const canvasTipo = document.getElementById(`chart-tipo-pie-${idx}`);
        if (canvasTipo && tipos.length > 0) {
            chartInstances[`tipo-${idx}`] = new Chart(canvasTipo.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: tipos.map(t => t.nombre),
                    datasets: [{
                        data: tipos.map(t => t.metricas.total_tickets || 0),
                        backgroundColor: colorPalette,
                        borderWidth: 2,
                        borderColor: '#12214a'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#E6EEF6', font: { size: 11 } } },
                        datalabels: {
                            color: '#FFFFFF',
                            font: { weight: 'bold', size: 11 },
                            formatter: (value, ctx) => {
                                const dataset = ctx.chart.data.datasets[0];
                                const total = dataset.data.reduce((a, b) => a + b, 0);
                                if (total === 0) return '';
                                const pct = (value / total) * 100;
                                return pct >= 2.5 ? `${pct.toFixed(1)}%` : '';
                            }
                        },
                        centerText: { defaultText: `${totGrupo.toLocaleString()}`, defaultSubtext: 'Total Tickets' }
                    }
                }
            });
        }

        // 2. Chart Causa Raíz -> CASCADA / VELA ACUMULATIVA AL 100%
        const razones = (groupData.razones_falla || []).sort((a,b) => (b.metricas.total_tickets||0) - (a.metricas.total_tickets||0));
        const canvasRazon = document.getElementById(`chart-razon-bar-${idx}`);
        if (canvasRazon && razones.length > 0) {
            const labels = [];
            const waterfallRanges = [];
            let currentSum = 0;

            const topRazones = razones.slice(0, 6);
            topRazones.forEach(r => {
                const pct = r.metricas.pct_del_grupo || 0;
                const start = currentSum;
                const end = Math.min(100, currentSum + pct);
                currentSum = end;

                labels.push(r.nombre);
                waterfallRanges.push([start, end]);
            });

            if (currentSum < 99.9) {
                labels.push('Otras Fallas');
                waterfallRanges.push([currentSum, 100]);
            }

            chartInstances[`razon-${idx}`] = new Chart(canvasRazon.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Aporte Acumulado (%)',
                        data: waterfallRanges,
                        backgroundColor: colorPalette,
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    scales: {
                        x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { grid: { display: false } }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const range = context.raw;
                                    const val = (range[1] - range[0]).toFixed(1);
                                    return ` Aporte: ${val}% (Rango acumulado: ${range[0].toFixed(1)}% → ${range[1].toFixed(1)}%)`;
                                }
                            }
                        },
                        datalabels: {
                            anchor: 'center', align: 'center', color: '#FFFFFF', font: { weight: 'bold', size: 10 },
                            formatter: (val) => {
                                const diff = val[1] - val[0];
                                return diff >= 3.5 ? `${diff.toFixed(1)}%` : '';
                            }
                        }
                    }
                }
            });
        }

        // 3. Chart Sucursal (Dona)
        const sucursalesMap = new Map();
        (groupData.sucursales || []).forEach(s => {
            if (s.nombre && !sucursalesMap.has(s.nombre)) {
                sucursalesMap.set(s.nombre, s);
            }
        });
        const sucursales = Array.from(sucursalesMap.values());

        const canvasSuc = document.getElementById(`chart-sucursal-pie-${idx}`);
        if (canvasSuc && sucursales.length > 0) {
            chartInstances[`suc-${idx}`] = new Chart(canvasSuc.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: sucursales.map(s => s.nombre),
                    datasets: [{
                        data: sucursales.map(s => s.metricas.total_tickets || 0),
                        backgroundColor: colorPalette,
                        borderWidth: 2,
                        borderColor: '#12214a'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#E6EEF6', font: { size: 11 } } },
                        datalabels: {
                            color: '#FFFFFF',
                            font: { weight: 'bold', size: 11 },
                            formatter: (value, ctx) => {
                                const dataset = ctx.chart.data.datasets[0];
                                const total = dataset.data.reduce((a, b) => a + b, 0);
                                if (total === 0) return '';
                                const pct = (value / total) * 100;
                                return pct >= 2.5 ? `${pct.toFixed(1)}%` : '';
                            }
                        },
                        centerText: { defaultText: `${totGrupo.toLocaleString()}`, defaultSubtext: 'Total Tickets' }
                    }
                }
            });
        }

        // 4. Chart Tasa de Incidencia de Fallas por Cliente (%) por Site
        const sites = groupData.sites_summary || [];
        const canvasSite = document.getElementById(`chart-site-bar-${idx}`);
        if (canvasSite && sites.length > 0) {
            chartInstances[`site-${idx}`] = new Chart(canvasSite.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: sites.map(s => s.site),
                    datasets: [{
                        label: '% Fallas / Cliente',
                        data: sites.map(s => s.tasa_incidencia_pct),
                        backgroundColor: '#ef4444',
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const siteObj = sites[context.dataIndex];
                                    return [
                                        ` Tasa Incidencia: ${siteObj.tasa_incidencia_pct}%`,
                                        ` Total Tickets: ${siteObj.total_tickets.toLocaleString()}`,
                                        ` Base Suscriptores: ${siteObj.total_suscriptores.toLocaleString()} clientes`
                                    ];
                                }
                            }
                        },
                        datalabels: {
                            anchor: 'end', align: 'end', color: '#E6EEF6', font: { weight: 'bold', size: 10 },
                            formatter: v => `${v}%`
                        }
                    }
                }
            });
        }

        // 5. Chart Top Soluciones -> CASCADA / VELA ACUMULATIVA AL 100%
        const soluciones = groupData.soluciones_falla || [];
        const canvasSol = document.getElementById(`chart-solucion-bar-${idx}`);
        if (canvasSol && soluciones.length > 0) {
            const solLabels = [];
            const solWaterfallRanges = [];
            let currentSolSum = 0;

            const topSol = soluciones.slice(0, 6);
            topSol.forEach(s => {
                const pct = s.pct || 0;
                const start = currentSolSum;
                const end = Math.min(100, currentSolSum + pct);
                currentSolSum = end;

                solLabels.push(s.nombre);
                solWaterfallRanges.push([start, end]);
            });

            if (currentSolSum < 99.9) {
                solLabels.push('Otras Soluciones');
                solWaterfallRanges.push([currentSolSum, 100]);
            }

            chartInstances[`sol-${idx}`] = new Chart(canvasSol.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: solLabels,
                    datasets: [{
                        label: 'Aporte Acumulado (%)',
                        data: solWaterfallRanges,
                        backgroundColor: colorPalette,
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    scales: {
                        x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { grid: { display: false } }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const range = context.raw;
                                    const val = (range[1] - range[0]).toFixed(1);
                                    return ` Aporte: ${val}% (Rango acumulado: ${range[0].toFixed(1)}% → ${range[1].toFixed(1)}%)`;
                                }
                            }
                        },
                        datalabels: {
                            anchor: 'center', align: 'center', color: '#FFFFFF', font: { weight: 'bold', size: 10 },
                            formatter: (val) => {
                                const diff = val[1] - val[0];
                                return diff >= 3.5 ? `${diff.toFixed(1)}%` : '';
                            }
                        }
                    }
                }
            });
        }
    }

    init();
});