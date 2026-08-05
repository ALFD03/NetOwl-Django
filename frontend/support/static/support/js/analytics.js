document.addEventListener('DOMContentLoaded', async () => {
    let allData = [];
    const container = document.getElementById('dimensionChartsContainer');
    const selectGrupo = document.getElementById('filterGrupoTrabajo');

    async function loadAnalytics() {
        try {
            const res = await fetch('/support/api/dimension-metrics/');
            allData = await res.json();

            if (!container) return;

            if (allData.length === 0) {
                container.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-info-circle me-2"></i>No hay métricas dimensionales calculadas aún. Ve a <strong>Imports -> Technical Support</strong> y ejecuta el análisis.</div>';
                return;
            }

            // Llenar selector de Grupos de Trabajo
            if (selectGrupo) {
                const grupos = [...new Set(allData.map(d => d.grupo_trabajo))].filter(Boolean);
                selectGrupo.innerHTML = '<option value="ALL">Todos los Grupos de Trabajo</option>' +
                    grupos.map(g => `<option value="${g}">${g}</option>`).join('');

                selectGrupo.addEventListener('change', renderDimensionCharts);
            }

            renderDimensionCharts();

        } catch (e) {
            console.error('Error cargando Analytics:', e);
            if (container) {
                container.innerHTML = '<div class="col-12 text-center py-4 text-danger">Error al cargar dimensiones de Soporte Técnico.</div>';
            }
        }
    }

    function renderDimensionCharts() {
        if (!container) return;

        const selectedGrupo = selectGrupo ? selectGrupo.value : 'ALL';
        const dims = ["sucursal", "zona", "municipio"];

        container.innerHTML = dims.map(dim => `
            <div class="col-lg-4">
                <div class="card h-100">
                    <div class="card-header"><h5 class="text-capitalize"><i class="bi bi-geo-alt me-2"></i>Métricas por ${dim}</h5></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0 table-theme">
                                <thead>
                                    <tr>
                                        <th>${dim}</th>
                                        <th class="text-end">Resueltos</th>
                                        <th class="text-end">MTTR (h)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${getRowsForDim(dim, selectedGrupo)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function getRowsForDim(dim, selectedGrupo) {
        let filtered = allData.filter(d => d.dimension === dim);
        if (selectedGrupo !== 'ALL') {
            filtered = filtered.filter(d => d.grupo_trabajo === selectedGrupo);
        }

        if (filtered.length === 0) {
            return '<tr><td colspan="3" class="text-center py-3 text-muted">Sin datos para este filtro</td></tr>';
        }

        return filtered.map(item => `
            <tr>
                <td class="fw-semibold">${item.valor}</td>
                <td class="text-end"><span class="badge bg-primary-subtle text-primary">${item.metricas.pct_resueltos || 0}%</span></td>
                <td class="text-end fw-bold text-success">${item.metricas.tiempo_medio_cierre_horas || 0} h</td>
            </tr>
        `).join('');
    }

    loadAnalytics();
});