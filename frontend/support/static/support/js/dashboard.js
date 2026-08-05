document.addEventListener('DOMContentLoaded', async () => {
    let chartOutcomePie = null;
    let chartMttrTrend = null;
    let grupoCharts = [];

    async function loadDashboard() {
        try {
            const res = await fetch('/support/api/global-metrics/');
            const data = await res.json();
            
            const g = data.resumen_global || {};
            const porGrupo = data.por_grupo_trabajo || {};
            const tendencias = data.historico_tendencias || [];

            // 1. Renderizar KPIs Promedio
            document.getElementById('kpi-resueltos').textContent = `${g.pct_resueltos || 0}%`;
            document.getElementById('kpi-resueltos-sub').textContent = `${(g.tickets_resueltos_promedio_mensual || 0)} resueltos / mes`;

            document.getElementById('kpi-mttr').textContent = `${g.tiempo_medio_cierre_horas || 0} h`;
            document.getElementById('kpi-mttr-sub').textContent = `Promedio: ${g.tiempo_medio_cierre_horas || 0} h | Mediana: ${g.tiempo_mediana_cierre_horas || 0} h`;

            document.getElementById('kpi-cancelados').textContent = `${g.pct_cancelados || 0}%`;
            document.getElementById('kpi-cancelados-sub').textContent = `${(g.tickets_cancelados_promedio_mensual || 0)} cancelados / mes`;

            document.getElementById('kpi-rezagados').textContent = `${g.pct_rezagados || 0}%`;
            document.getElementById('kpi-rezagados-sub').textContent = `${(g.tickets_rezagados_promedio_mensual || 0)} pendientes / mes`;

            // 2. Gráfico Dona Global
            renderPieChart(g);

            // 3. Gráfico de Tendencias Temporales
            renderTrendChart(tendencias);

            // 4. Gráficos de Torta por Grupo de Trabajo
            renderGrupoPieCharts(porGrupo);

        } catch (e) {
            console.error('Error cargando Dashboard:', e);
        }
    }

    function renderPieChart(g) {
        const canvas = document.getElementById('chartOutcomePie');
        if (!canvas) return;

        if (chartOutcomePie) chartOutcomePie.destroy();
        const ctx = canvas.getContext('2d');
        chartOutcomePie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['% Resueltos', '% Cancelados', '% Rezagados'],
                datasets: [{
                    data: [g.pct_resueltos || 0, g.pct_cancelados || 0, g.pct_rezagados || 0],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                    borderWidth: 2,
                    borderColor: '#0f1a36'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#E6EEF6' } } }
            }
        });
    }

    function renderTrendChart(tendencias) {
        const canvas = document.getElementById('chartMttrTrend');
        if (!canvas || tendencias.length === 0) return;

        const labels = tendencias.map(t => t.periodo_reporte);
        const promData = tendencias.map(t => t.tiempo_medio_cierre_horas || 0);
        const medData = tendencias.map(t => t.tiempo_mediana_cierre_horas || 0);

        if (chartMttrTrend) chartMttrTrend.destroy();
        const ctx = canvas.getContext('2d');
        chartMttrTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Promedio MTTR (h)', data: promData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, fill: true },
                    { label: 'Mediana MTTR (h)', data: medData, borderColor: '#3b82f6', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    function renderGrupoPieCharts(porGrupo) {
        const container = document.getElementById('grupo-charts-container');
        if (!container) return;

        // Destruir instancias previas de gráficos
        grupoCharts.forEach(c => c.destroy());
        grupoCharts = [];

        const gruposKeys = Object.keys(porGrupo);
        if (gruposKeys.length === 0) {
            container.innerHTML = '<div class="col-12 text-center py-4 text-muted">No hay grupos de trabajo disponibles.</div>';
            return;
        }

        // Determinar ancho de columnas según cantidad de grupos
        const colClass = gruposKeys.length <= 2 ? 'col-md-6' : 'col-md-6 col-lg-4';

        container.innerHTML = gruposKeys.map((key, index) => `
            <div class="${colClass}">
                <div class="card h-100 border-0 p-3" style="background-color: var(--surface-tertiary);">
                    <h6 class="fw-bold text-center text-primary mb-3"><i class="bi bi-people me-2"></i>${key}</h6>
                    <div class="chart-container mb-3" style="position:relative; height:220px;">
                        <canvas id="chart-grupo-pie-${index}"></canvas>
                    </div>
                    <div class="d-flex justify-content-around text-center pt-2 border-top border-secondary">
                        <div>
                            <small class="text-muted d-block" style="font-size:0.75rem;">Promedio Cierre</small>
                            <span class="fw-bold text-success">${porGrupo[key].tiempo_medio_cierre_horas || 0} h</span>
                        </div>
                        <div>
                            <small class="text-muted d-block" style="font-size:0.75rem;">Mediana Cierre</small>
                            <span class="fw-bold text-info">${porGrupo[key].tiempo_mediana_cierre_horas || 0} h</span>
                        </div>
                        <div>
                            <small class="text-muted d-block" style="font-size:0.75rem;">1ª Respuesta</small>
                            <span class="fw-bold text-warning">${porGrupo[key].tiempo_promedio_primera_respuesta_horas || 0} h</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Renderizar los gráficos de dona uno por uno
        gruposKeys.forEach((key, index) => {
            const canvas = document.getElementById(`chart-grupo-pie-${index}`);
            if (!canvas) return;

            const item = porGrupo[key];
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['% Resueltos', '% Cancelados', '% Rezagados'],
                    datasets: [{
                        data: [item.pct_resueltos || 0, item.pct_cancelados || 0, item.pct_rezagados || 0],
                        backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                        borderWidth: 2,
                        borderColor: '#0f1a36'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#E6EEF6', font: { size: 11 } } }
                    }
                }
            });
            grupoCharts.push(chart);
        });
    }

    loadDashboard();
});