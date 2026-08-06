// NetOwl-Django/frontend/support/static/support/js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    let outcomeChart = null;
    let mttrTrendChart = null;

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

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
        document.getElementById('kpi-resueltos-sub').textContent = `${(glob.tickets_resueltos_promedio_mensual || 0).toLocaleString()} resueltos / mes`;

        document.getElementById('kpi-mttr').textContent = `${glob.tiempo_medio_cierre_horas || 0} h`;
        document.getElementById('kpi-mttr-sub').textContent = `Promedio: ${glob.tiempo_medio_cierre_horas || 0} h | Mediana: ${glob.tiempo_mediana_cierre_horas || 0} h`;

        document.getElementById('kpi-cancelados').textContent = `${glob.pct_cancelados || 0}%`;
        document.getElementById('kpi-cancelados-sub').textContent = `${(glob.tickets_cancelados_promedio_mensual || 0).toLocaleString()} cancelados / mes`;

        document.getElementById('kpi-rezagados').textContent = `${glob.pct_rezagados || 0}%`;
        document.getElementById('kpi-rezagados-sub').textContent = `${(glob.tickets_rezagados_promedio_mensual || 0).toLocaleString()} pendientes / mes`;
    }

    function renderOutcomePie(glob) {
        const ctx = document.getElementById('chartOutcomePie');
        if (!ctx) return;

        if (outcomeChart) outcomeChart.destroy();

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
                        font: { weight: 'bold', size: 12 },
                        formatter: v => v > 2 ? `${v}%` : ''
                    }
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

        container.innerHTML = grupos.map((gName, idx) => `
            <div class="col-lg-4 col-md-6">
                <div class="card h-100 bg-light-subtle">
                    <div class="card-header"><h6 class="mb-0 text-primary">${gName}</h6></div>
                    <div class="card-body d-flex align-items-center justify-content-center">
                        <div class="chart-container" style="position:relative;height:240px;width:100%;">
                            <canvas id="chartGroupPie-${idx}"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        grupos.forEach((gName, idx) => {
            const gData = porGrupo[gName] || {};
            const canvas = document.getElementById(`chartGroupPie-${idx}`);
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
                                font: { weight: 'bold', size: 10 },
                                formatter: v => v > 3 ? `${v}%` : ''
                            }
                        }
                    }
                });
            }
        });
    }

    initDashboard();
});