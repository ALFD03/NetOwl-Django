document.addEventListener('DOMContentLoaded', async () => {
    let allData = [];
    const container = document.getElementById('dimensionChartsContainer');
    const selectPeriodo = document.getElementById('filterPeriodoAnalytics');
    const selectGrupo = document.getElementById('filterGrupoTrabajo');
    const selectTipo = document.getElementById('filterTipoSolicitud');

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
            const url = p ? `/support/api/dimension-metrics/?periods=${p}` : '/support/api/dimension-metrics/';
            const res = await fetch(url);
            allData = await res.json();

            if (!container) return;

            if (allData.length === 0) {
                container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-info-circle me-2"></i>No hay datos calculados para este periodo.</div>';
                return;
            }

            populateDropdowns();
            renderHierarchyView();

        } catch (e) {
            console.error('Error en Analytics:', e);
        }
    }

    function populateDropdowns() {
        const grupos = [...new Set(allData.map(d => d.grupo_trabajo))].filter(g => g && g !== 'Todos');
        if (selectGrupo) {
            selectGrupo.innerHTML = '<option value="ALL">Todos los Grupos</option>' +
                grupos.map(g => `<option value="${g}">${g}</option>`).join('');
            
            selectGrupo.removeEventListener('change', onGrupoChange);
            selectGrupo.addEventListener('change', onGrupoChange);
        }
        updateTipoDropdown();
    }

    function onGrupoChange() {
        updateTipoDropdown();
        renderHierarchyView();
    }

    function updateTipoDropdown() {
        if (!selectTipo) return;
        const selGrupo = selectGrupo ? selectGrupo.value : 'ALL';
        
        let filtered = allData;
        if (selGrupo !== 'ALL') {
            filtered = filtered.filter(d => d.grupo_trabajo === selGrupo);
        }

        const tipos = [...new Set(filtered.map(d => d.tipo_solicitud))].filter(t => t && t !== 'Todas');
        selectTipo.innerHTML = '<option value="ALL">Todas las Solicitudes</option>' +
            tipos.map(t => `<option value="${t}">${t}</option>`).join('');

        selectTipo.removeEventListener('change', renderHierarchyView);
        selectTipo.addEventListener('change', renderHierarchyView);
    }

    function renderHierarchyView() {
        if (!container) return;

        const selGrupo = selectGrupo ? selectGrupo.value : 'ALL';
        const selTipo = selectTipo ? selectTipo.value : 'ALL';

        let dataPool = allData;
        if (selGrupo !== 'ALL') dataPool = dataPool.filter(d => d.grupo_trabajo === selGrupo);
        if (selTipo !== 'ALL') dataPool = dataPool.filter(d => d.tipo_solicitud === selTipo);

        const dimsToShow = ["razon_falla", "sucursal", "zona", "municipio"];

        container.innerHTML = dimsToShow.map(dim => `
            <div class="col-lg-6">
                <div class="card h-100">
                    <div class="card-header"><h5 class="text-capitalize"><i class="bi bi-diagram-2 me-2"></i>Desglose: ${dim.replace('_', ' ')}</h5></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0 table-theme">
                                <thead>
                                    <tr>
                                        <th>${dim.replace('_', ' ')}</th>
                                        <th class="text-end">Tickets</th>
                                        <th class="text-end">Resueltos</th>
                                        <th class="text-end">MTTR (h)</th>
                                        <th class="text-end">Mediana (h)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${getRowsForDimension(dataPool, dim)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function getRowsForDimension(dataPool, dim) {
        const rows = dataPool.filter(d => d.dimension === dim);
        if (rows.length === 0) {
            return '<tr><td colspan="5" class="text-center py-3 text-muted">Sin registros para este nivel</td></tr>';
        }

        return rows.map(item => `
            <tr>
                <td class="fw-semibold text-primary">${item.valor}</td>
                <td class="text-end fw-semibold">${(item.metricas.total_tickets || 0).toLocaleString()}</td>
                <td class="text-end"><span class="badge bg-primary-subtle text-primary">${item.metricas.pct_resueltos || 0}%</span></td>
                <td class="text-end fw-bold text-success">${item.metricas.tiempo_medio_cierre_horas || 0} h</td>
                <td class="text-end fw-bold text-info">${item.metricas.tiempo_mediana_cierre_horas || 0} h</td>
            </tr>
        `).join('');
    }

    init();
});