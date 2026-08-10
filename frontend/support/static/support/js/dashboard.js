// NetOwl-Django/frontend/support/static/support/js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    let outcomeChart = null;
    let mttrTrendChart = null;

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

    async function initDashboard() {
        try {
            const res = await fetch('/support/api/global-metrics/');
            const data = await res.json();
            
            renderGlobalKPIs(data.resumen_global || {});
            renderOutcomePie(data.resumen_global || {});
            renderMttrTrend(data.historico_tendencias || []);
            renderGroupPieCharts(data.por_grupo_trabajo || {});
        } catch (e) {
            console.error("Error al cargar Dashboard de Soporte:", e);
        }
    }

    function renderGlobalKPIs(glob) {
        document.getElementById('kpi-resueltos').textContent = `${glob.pct_resueltos || 0}%`;
        document.getElementById('kpi-resueltos-sub').textContent = `${(glob.tickets_resueltos_promedio_mensual || 0).toLocaleString()} / mes`;

        document.getElementById('kpi-mttr').textContent = `${glob.tiempo_medio_cierre_horas || 0} h`;
        document.getElementById('kpi-mttr-sub').textContent = `Mediana: ${glob.tiempo_mediana_cierre_horas || 0} h`;

        document.getElementById('kpi-cancelados').textContent = `${glob.pct_cancelados || 0}%`;
        document.getElementById('kpi-cancelados-sub').textContent = `${(glob.tickets_cancelados_promedio_mensual || 0).toLocaleString()} / mes`;

        document.getElementById('kpi-rezagados').textContent = `${glob.pct_rezagados || 0}%`;
        document.getElementById('kpi-rezagados-sub').textContent = `${(glob.tickets_rezagados_promedio_mensual || 0).toLocaleString()} / mes`;

        // Poblar Probabilidades
        document.getElementById('kpi-exc-promedio').textContent = `${glob.pct_excede_promedio_cierre || 0}%`;
        document.getElementById('kpi-exc-mediana').textContent = `${glob.pct_excede_mediana_cierre || 0}%`;
    }

    function renderOutcomePie(glob) {
        const ctx = document.getElementById('chartOutcomePie');
        if (!ctx) return;

        if (outcomeChart) outcomeChart.destroy();

        const totProm = (glob.total_tickets_promedio_mensual || 0);

        outcomeChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Resueltos', 'Cancelados', 'Rezagados'],
                datasets: [{
                    data: [
                        glob.pct_resueltos || 0,
                        glob.pct_cancelados || 0,
                        glob.pct_rezagados || 0
                    ],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
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
                        formatter: v => v > 2.5 ? `${v}%` : ''
                    },
                    centerText: { defaultText: `${totProm.toLocaleString()}`, defaultSubtext: 'Promedio Mensual' }
                }
            }
        });
    }

    function renderMttrTrend(historico) {
        const ctx = document.getElementById('chartMttrTrend');
        if (!ctx) return;

        if (mttrTrendChart) mttrTrendChart.destroy();

        const labels = historico.map(h => h.periodo_reporte).reverse();
        const promData = historico.map(h => h.tiempo_medio_cierre_horas || 0).reverse();
        const medData = historico.map(h => h.tiempo_mediana_cierre_horas || 0).reverse();

        mttrTrendChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'MTTR Promedio (h)', data: promData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 },
                    { label: 'MTTR Mediana (h)', data: medData, borderColor: '#06b6d4', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Horas' } } },
                plugins: { datalabels: { display: false } }
            }
        });
    }

    function renderGroupPieCharts(porGrupo) {
        const container = document.getElementById('grupo-charts-container');
        if (!container) return;

        const grupos = Object.keys(porGrupo);
        if (grupos.length === 0) {
            container.innerHTML = '<div class="col-12 text-center py-4 text-muted">Sin grupos registrados.</div>';
            return;
        }

        let colClass = 'col-lg-4 col-md-6';
        if (grupos.length === 1) colClass = 'col-lg-8 mx-auto';
        else if (grupos.length === 2) colClass = 'col-lg-6 col-md-6';
        else if (grupos.length === 3) colClass = 'col-lg-4 col-md-6';
        else if (grupos.length === 4) colClass = 'col-lg-3 col-md-6';

        container.innerHTML = grupos.map((gName, idx) => {
            const gData = porGrupo[gName] || {};
            return `
                <div class="${colClass}">
                    <div class="card h-100 bg-light-subtle">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0 text-primary fw-bold"><i class="bi bi-people-fill me-2"></i>${gName}</h6>
                        </div>
                        <div class="card-body d-flex flex-column align-items-center justify-content-center">
                            <div class="chart-container mb-3" style="position:relative; height:250px; width:100%;">
                                <canvas id="chartGroupPie-${idx}"></canvas>
                            </div>
                            <div class="d-flex justify-content-around w-100 pt-2 border-top border-secondary">
                                <div class="text-center">
                                    <small class="text-muted d-block" style="font-size:0.75rem;">Prob. > Promedio</small>
                                    <span class="badge bg-info-subtle text-info fw-bold">${gData.pct_excede_promedio_cierre || 0}%</span>
                                </div>
                                <div class="text-center">
                                    <small class="text-muted d-block" style="font-size:0.75rem;">Prob. > Mediana</small>
                                    <span class="badge bg-warning-subtle text-warning fw-bold">${gData.pct_excede_mediana_cierre || 0}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grupos.forEach((gName, idx) => {
            const gData = porGrupo[gName] || {};
            const canvas = document.getElementById(`chartGroupPie-${idx}`);
            const totGroupTickets = (gData.total_tickets || 0);

            if (canvas) {
                new Chart(canvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: ['Resueltos', 'Cancelados', 'Rezagados'],
                        datasets: [{
                            data: [gData.pct_resueltos || 0, gData.pct_cancelados || 0, gData.pct_rezagados || 0],
                            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                            borderWidth: 2,
                            borderColor: '#0f1a36'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        cutout: '60%',
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#E6EEF6', font: { size: 10 } } },
                            datalabels: {
                                color: '#FFFFFF',
                                font: { weight: 'bold', size: 11 },
                                formatter: v => v > 2.5 ? `${v}%` : ''
                            },
                            centerText: { defaultText: `${totGroupTickets.toLocaleString()}`, defaultSubtext: 'Tickets / mes' }
                        }
                    }
                });
            }
        });
    }

    initDashboard();
});