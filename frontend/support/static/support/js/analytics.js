// NetOwl-Django/frontend/support/static/support/js/analytics.js

document.addEventListener('DOMContentLoaded', async () => {
    let gruposData = {};
    let chartInstances = {};

    const container = document.getElementById('analyticsGroupsContainer');
    const selectPeriodo = document.getElementById('filterPeriodoAnalytics');

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    // Plugin para Texto Central MATEMÁTICAMENTE CENTRADO
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
            <div class="card mb-5 border p-3" style="background-color: var(--surface-secondary);">
                <!-- Encabezado del Grupo -->
                <div class="card-header rounded mb-3 style="background-color: var(--surface-tertiary);">
                    <h4 class="mb-0 text-primary"><i class="bi bi-people-fill me-2"></i>Grupo de Trabajo: ${gName}</h4>
                </div>

                <!-- CARDS DE TIEMPO Y MTTR DEL GRUPO -->
                <div class="row g-3 mb-4">
                    <div class="col-md-3">
                        <div class="metric-card border-success">
                            <div class="metric-value text-success">${mG.tiempo_medio_cierre_horas || 0} h</div>
                            <div class="metric-label">MTTR Promedio</div>
                            <small class="text-muted mt-1">Mediana: <strong>${mG.tiempo_mediana_cierre_horas || 0} h</strong></small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="metric-card border-info">
                            <div class="metric-value text-info">${mG.tiempo_p25_cierre_horas || 0} - ${mG.tiempo_p75_cierre_horas || 0} h</div>
                            <div class="metric-label">Rango P25 - P75</div>
                            <small class="text-muted mt-1">Desviación σ: <strong>${mG.tiempo_std_cierre_horas || 0} h</strong></small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="metric-card border-primary">
                            <div class="metric-value text-primary">${mG.tiempo_promedio_primera_respuesta_horas || 0} h</div>
                            <div class="metric-label">1ª Respuesta Promedio</div>
                            <small class="text-muted mt-1">Tiempo primer contacto</small>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="metric-card border-warning">
                            <div class="metric-value text-warning">${mG.pct_excede_promedio_cierre || 0}%</div>
                            <div class="metric-label">Prob. > Promedio</div>
                            <small class="text-muted mt-1">Prob. > Mediana: <strong>${mG.pct_excede_mediana_cierre || 0}%</strong></small>
                        </div>
                    </div>
                </div>

                <!-- GRÁFICOS DEL GRUPO -->
                <div class="row g-4 mb-4">
                    <!-- 1. Dona Tipos de Solicitud -->
                    <div class="col-lg-4">
                        <div class="card h-100">
                            <div class="card-header"><h5><i class="bi bi-pie-chart me-2"></i>Tipos de Solicitud</h5></div>
                            <div class="card-body d-flex align-items-center justify-content-center">
                                <div class="chart-container" style="position:relative; height:340px; width:100%;">
                                    <canvas id="chart-tipo-pie-${idx}"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Barras Horizontales Razones de Falla -->
                    <div class="col-lg-4">
                        <div class="card h-100">
                            <div class="card-header"><h5><i class="bi bi-bar-chart-steps me-2"></i>Causa Raíz (% sobre Grupo)</h5></div>
                            <div class="card-body">
                                <div class="chart-container" style="position:relative; height:340px;">
                                    <canvas id="chart-razon-bar-${idx}"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. Dona Sencilla por Sucursal -->
                    <div class="col-lg-4">
                        <div class="card h-100">
                            <div class="card-header"><h5><i class="bi bi-building me-2"></i>Distribución por Sucursal</h5></div>
                            <div class="card-body d-flex align-items-center justify-content-center">
                                <div class="chart-container" style="position:relative; height:340px; width:100%;">
                                    <canvas id="chart-sucursal-pie-${idx}"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. Zonas Estilo Sales Report -->
                <div class="row g-4">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header"><h5><i class="bi bi-geo-alt-fill me-2 text-primary"></i>Distribución Regional (Zona - Sucursal por Site)</h5></div>
                            <div class="card-body p-3">
                                ${renderZonasRegionalTree(groupData.zonas_regional || [])}
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

        // 1. Chart Tipos de Solicitud
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
                        borderColor: '#0f1a36'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '60%',
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

        // 2. Chart Razones de Falla
        const razones = (groupData.razones_falla || []).sort((a,b) => (b.metricas.total_tickets||0) - (a.metricas.total_tickets||0)).slice(0, 8);
        const canvasRazon = document.getElementById(`chart-razon-bar-${idx}`);
        if (canvasRazon && razones.length > 0) {
            chartInstances[`razon-${idx}`] = new Chart(canvasRazon.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: razones.map(r => r.nombre),
                    datasets: [{
                        label: '% del Grupo',
                        data: razones.map(r => r.metricas.pct_del_grupo || 0),
                        backgroundColor: '#f59e0b',
                        borderWidth: 0,
                        borderColor: 'transparent'
                    }]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
                    plugins: {
                        datalabels: {
                            anchor: 'end', align: 'end', color: '#E6EEF6', font: { weight: 'bold', size: 10 },
                            formatter: v => `${v}%`
                        }
                    }
                }
            });
        }

        // 3. Chart Sucursal
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
                        borderColor: '#0f1a36'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '60%',
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
    }

    function renderZonasRegionalTree(sites) {
        if (sites.length === 0) return '<div class="text-center py-3 text-muted">Sin zonas registradas.</div>';

        return sites.map(site => `
            <div class="card site-card bg-light-subtle p-3 mb-3">
                <h6 class="fw-bold text-primary mb-2"><i class="bi bi-geo-alt me-2"></i>Site: ${site.site}</h6>
                ${site.technologies.map(tech => `
                    <div class="mb-2 ms-2">
                        <span class="badge bg-secondary-subtle text-info mb-2">${tech.technology}</span>
                        <table class="table table-sm table-sales align-middle table-theme">
                            <thead>
                                <tr>
                                    <th>Zona - Sucursal</th>
                                    <th class="text-end">Tickets Creados</th>
                                    <th class="text-end">Resueltos</th>
                                    <th class="text-end">% Resueltos</th>
                                    <th class="text-end">MTTR Promedio</th>
                                    <th class="text-end">Mediana (h)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tech.zonas.map(z => `
                                    <tr>
                                        <td class="fw-semibold text-primary">${z.zona_sucursal}</td>
                                        <td class="text-end">${(z.metricas.total_tickets || 0).toLocaleString()}</td>
                                        <td class="text-end text-success">${(z.metricas.tickets_resueltos || 0).toLocaleString()}</td>
                                        <td class="text-end"><span class="badge bg-primary-subtle text-primary">${z.metricas.pct_resueltos || 0}%</span></td>
                                        <td class="text-end fw-bold text-success">${z.metricas.tiempo_medio_cierre_horas || 0} h</td>
                                        <td class="text-end fw-bold text-info">${z.metricas.tiempo_mediana_cierre_horas || 0} h</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    init();
});