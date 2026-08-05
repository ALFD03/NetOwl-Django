document.addEventListener('DOMContentLoaded', async () => {
    let chartResueltos = null;
    let chartMttr = null;

    async function init() {
        await loadPeriodsSelect();
        await loadDashboard();
    }

    async function loadPeriodsSelect() {
        try {
            const res = await fetch('/support/api/periods/');
            const data = await res.json();
            const periods = data.periods || [];
            const select = document.getElementById('supportPeriodSelect');
            if (!select) return;

            select.innerHTML = '<option value="ALL">Último Periodo Calculado</option>' +
                periods.map(p => `<option value="${p}">${p}</option>`).join('');

            select.addEventListener('change', () => loadDashboard(select.value));
        } catch (e) {
            console.error('Error cargando periodos:', e);
        }
    }

    async function loadDashboard(selectedPeriod = "ALL") {
        try {
            const url = selectedPeriod !== "ALL" 
                ? `/support/api/global-metrics/?period=${selectedPeriod}`
                : '/support/api/global-metrics/';

            const res = await fetch(url);
            const data = await res.json();
            
            const g = data.resumen_global || {};
            const porGrupo = data.por_grupo_trabajo || {};

            // Renderizar KPIs Globales
            const elemResueltos = document.getElementById('kpi-resueltos');
            const elemResueltosSub = document.getElementById('kpi-resueltos-sub');
            const elemMttr = document.getElementById('kpi-mttr');
            const elemRezagados = document.getElementById('kpi-rezagados');
            const elemRezagadosSub = document.getElementById('kpi-rezagados-sub');
            const elemRespuesta = document.getElementById('kpi-respuesta');

            if (elemResueltos) elemResueltos.textContent = `${g.pct_resueltos || 0}%`;
            if (elemResueltosSub) elemResueltosSub.textContent = `${(g.tickets_resueltos || 0).toLocaleString()} / ${(g.total_tickets || 0).toLocaleString()} tickets`;
            
            if (elemMttr) elemMttr.textContent = `${g.tiempo_medio_cierre_horas || 0} h`;
            
            if (elemRezagados) elemRezagados.textContent = `${g.pct_rezagados || 0}%`;
            if (elemRezagadosSub) elemRezagadosSub.textContent = `${(g.tickets_rezagados || 0).toLocaleString()} pendientes`;
            
            if (elemRespuesta) elemRespuesta.textContent = `${g.tiempo_promedio_primera_respuesta_horas || 0} h`;

            // Renderizar Tabla por Grupos
            const tbody = document.getElementById('tbl-grupos-body');
            const gruposKeys = Object.keys(porGrupo);

            if (!tbody) return;

            if (gruposKeys.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="bi bi-info-circle me-2"></i>No hay métricas calculadas para este periodo.</td></tr>';
                return;
            }

            tbody.innerHTML = gruposKeys.map(key => {
                const item = porGrupo[key];
                return `
                    <tr>
                        <td><span class="fw-bold text-primary">${key}</span></td>
                        <td class="text-end fw-semibold">${(item.total_tickets || 0).toLocaleString()}</td>
                        <td class="text-end text-success fw-semibold">${(item.tickets_resueltos || 0).toLocaleString()}</td>
                        <td class="text-end"><span class="badge bg-primary-subtle text-primary">${item.pct_resueltos || 0}%</span></td>
                        <td class="text-end fw-bold text-info">${item.tiempo_medio_cierre_horas || 0} h</td>
                        <td class="text-end text-warning fw-semibold">${item.pct_rezagados || 0}%</td>
                        <td class="text-end text-muted">${item.tiempo_promedio_primera_respuesta_horas || 0} h</td>
                    </tr>
                `;
            }).join('');

            renderCharts(gruposKeys, porGrupo);

        } catch (e) {
            console.error('Error cargando Dashboard:', e);
        }
    }

    function renderCharts(labels, porGrupo) {
        const canvas1 = document.getElementById('chartResueltosGrupo');
        const canvas2 = document.getElementById('chartMttrGrupo');

        if (!canvas1 || !canvas2) return;

        const pctResueltosData = labels.map(k => porGrupo[k].pct_resueltos || 0);
        const pctRezagadosData = labels.map(k => porGrupo[k].pct_rezagados || 0);
        const mttrData = labels.map(k => porGrupo[k].tiempo_medio_cierre_horas || 0);

        if (chartResueltos) chartResueltos.destroy();
        const ctx1 = canvas1.getContext('2d');
        chartResueltos = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: '% Resueltos', data: pctResueltosData, backgroundColor: '#2563eb' },
                    { label: '% Rezagados', data: pctRezagadosData, backgroundColor: '#f59e0b' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });

        if (chartMttr) chartMttr.destroy();
        const ctx2 = canvas2.getContext('2d');
        chartMttr = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'MTTR (Horas)', data: mttrData, backgroundColor: '#10b981' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    init();
});