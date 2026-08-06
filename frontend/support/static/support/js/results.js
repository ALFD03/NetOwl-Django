// NetOwl-Django/frontend/support/static/support/js/results.js

document.addEventListener('DOMContentLoaded', async () => {
    let historicoCierres = [];

    const tblHistorico = document.getElementById('tbl-historico-body');
    const tblModalGrupo = document.getElementById('tbl-modal-grupo-body');
    const refreshBtn = document.getElementById('refreshCierresBtn');

    async function init() {
        await loadCierresHistoricos();
        if (refreshBtn) refreshBtn.addEventListener('click', loadCierresHistoricos);
    }

    async function loadCierresHistoricos() {
        try {
            const res = await fetch('/support/api/cierre-historico/');
            const data = await res.json();
            historicoCierres = data.historico || [];

            if (!tblHistorico) return;

            if (historicoCierres.length === 0) {
                tblHistorico.innerHTML = '<tr><td colspan="15" class="text-center py-4 text-muted">No hay cierres históricos calculados.</td></tr>';
                return;
            }

            tblHistorico.innerHTML = historicoCierres.map(h => `
                <tr>
                    <td class="fw-bold text-primary">${h.periodo_reporte}</td>
                    <td class="text-end fw-semibold">${(h.total_tickets || 0).toLocaleString()}</td>
                    <td class="text-end"><span class="badge bg-primary-subtle text-primary">${h.pct_resueltos || 0}%</span></td>
                    <td class="text-end"><span class="badge bg-danger-subtle text-danger">${h.pct_cancelados || 0}%</span></td>
                    <td class="text-end"><span class="badge bg-warning-subtle text-warning">${h.pct_rezagados || 0}%</span></td>
                    <td class="text-end fw-bold text-success">${h.tiempo_medio_cierre_horas || 0} h</td>
                    <td class="text-end fw-bold text-info">${h.tiempo_mediana_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${h.tiempo_p25_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${h.tiempo_p75_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${h.tiempo_std_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${h.tiempo_promedio_primera_respuesta_horas || 0} h</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary btn-detail-period" data-periodo="${h.periodo_reporte}">
                            <i class="bi bi-eye me-1"></i>Ver Detalle
                        </button>
                    </td>
                </tr>
            `).join('');

            document.querySelectorAll('.btn-detail-period').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const p = e.currentTarget.getAttribute('data-periodo');
                    openPeriodDetailModal(p);
                });
            });

        } catch (e) {
            console.error('Error cargando cierres históricos:', e);
            tblHistorico.innerHTML = '<tr><td colspan="15" class="text-center text-danger py-4">Error al cargar cierres históricos.</td></tr>';
        }
    }

    async function openPeriodDetailModal(periodo) {
        document.getElementById('modalPeriodTitle').textContent = periodo;
        tblModalGrupo.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando desglose...</td></tr>';

        const modal = new bootstrap.Modal(document.getElementById('periodDetailModal'));
        modal.show();

        try {
            const res = await fetch(`/support/api/global-metrics/?period=${periodo}`);
            const data = await res.json();
            const porGrupo = data.por_grupo_trabajo || {};

            const gNames = Object.keys(porGrupo);
            if (gNames.length === 0) {
                tblModalGrupo.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Sin datos desglosados para este periodo.</td></tr>';
                return;
            }

            tblModalGrupo.innerHTML = gNames.map(g => {
                const item = porGrupo[g] || {};
                return `
                    <tr>
                        <td class="fw-bold text-primary">${g}</td>
                        <td class="text-end fw-semibold">${(item.total_tickets || 0).toLocaleString()}</td>
                        <td class="text-end text-success">${(item.tickets_resueltos || 0).toLocaleString()}</td>
                        <td class="text-end text-danger">${(item.tickets_cancelados || 0).toLocaleString()}</td>
                        <td class="text-end text-warning">${(item.tickets_rezagados || 0).toLocaleString()}</td>
                        <td class="text-end"><span class="badge bg-primary-subtle text-primary">${item.pct_resueltos || 0}%</span></td>
                        <td class="text-end"><span class="badge bg-danger-subtle text-danger">${item.pct_cancelados || 0}%</span></td>
                        <td class="text-end"><span class="badge bg-warning-subtle text-warning">${item.pct_rezagados || 0}%</span></td>
                        <td class="text-end fw-bold text-success">${item.tiempo_medio_cierre_horas || 0} h</td>
                        <td class="text-end fw-bold text-info">${item.tiempo_mediana_cierre_horas || 0} h</td>
                    </tr>
                `;
            }).join('');

        } catch (e) {
            console.error('Error cargando detalle por periodo:', e);
            tblModalGrupo.innerHTML = '<tr><td colspan="10" class="text-center text-danger py-4">Error al obtener el desglose por grupo.</td></tr>';
        }
    }

    init();
});