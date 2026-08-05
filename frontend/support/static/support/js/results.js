document.addEventListener('DOMContentLoaded', async () => {
    const tblHistorico = document.getElementById('tbl-historico-body');
    const tblTickets = document.getElementById('tbl-tickets-body');
    const searchInput = document.getElementById('searchTicketsInput');
    const selectGrupo = document.getElementById('filterGrupoResults');
    let allTickets = [];

    async function loadHistorico() {
        try {
            const res = await fetch('/support/api/cierre-historico/');
            const data = await res.json();
            const list = data.historico || [];

            if (!tblHistorico) return;

            if (list.length === 0) {
                tblHistorico.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No se han registrado cierres mensuales.</td></tr>';
                return;
            }

            tblHistorico.innerHTML = list.map(item => `
                <tr>
                    <td><span class="badge bg-primary-subtle text-primary fw-bold" style="font-size:0.9rem;">${item.periodo_reporte}</span></td>
                    <td class="text-end fw-semibold">${(item.total_tickets || 0).toLocaleString()}</td>
                    <td class="text-end text-success fw-semibold">${(item.tickets_resueltos || 0).toLocaleString()}</td>
                    <td class="text-end text-warning">${(item.tickets_rezagados || 0).toLocaleString()}</td>
                    <td class="text-end fw-bold">${item.pct_resueltos || 0}%</td>
                    <td class="text-end fw-bold text-success">${item.tiempo_medio_cierre_horas || 0} h</td>
                    <td class="text-end fw-bold text-info">${item.tiempo_mediana_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${item.tiempo_p25_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${item.tiempo_p75_cierre_horas || 0} h</td>
                    <td class="text-end text-muted">${item.tiempo_std_cierre_horas || 0} h</td>
                    <td class="text-end text-warning">${item.pct_excede_promedio_cierre || 0}%</td>
                    <td class="text-end text-muted">${item.tiempo_promedio_primera_respuesta_horas || 0} h</td>
                </tr>
            `).join('');

        } catch (e) {
            console.error(e);
            if (tblHistorico) tblHistorico.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar historial.</td></tr>';
        }
    }

    async function loadTickets() {
        try {
            const res = await fetch('/support/api/tickets/');
            const data = await res.json();
            allTickets = data.tickets || [];

            if (selectGrupo) {
                const grupos = [...new Set(allTickets.map(t => t.grupo_trabajo))].filter(Boolean);
                selectGrupo.innerHTML = '<option value="">Todos los Grupos</option>' +
                    grupos.map(g => `<option value="${g}">${g}</option>`).join('');
            }

            renderTicketsTable();

        } catch (e) {
            console.error(e);
            if (tblTickets) tblTickets.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar tickets.</td></tr>';
        }
    }

    function renderTicketsTable() {
        if (!tblTickets) return;

        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedGrupo = selectGrupo ? selectGrupo.value : '';

        const filtered = allTickets.filter(t => {
            const matchSearch = t.ticket_sequence.toLowerCase().includes(query) || t.cliente.toLowerCase().includes(query);
            const matchGrupo = !selectedGrupo || t.grupo_trabajo === selectedGrupo;
            return matchSearch && matchGrupo;
        });

        if (filtered.length === 0) {
            tblTickets.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron tickets con los filtros aplicados.</td></tr>';
            return;
        }

        tblTickets.innerHTML = filtered.map(t => `
            <tr>
                <td class="fw-bold text-primary">${t.ticket_sequence}</td>
                <td>${t.cliente}</td>
                <td><span class="badge bg-secondary-subtle text-primary">${t.grupo_trabajo}</span></td>
                <td><span class="badge bg-info-subtle text-info">${t.etapa}</span></td>
                <td>${t.sucursal}</td>
                <td>${t.zona}</td>
                <td>${t.municipio}</td>
                <td class="text-end fw-bold">${t.duracion_total_horas} h</td>
                <td class="small text-muted">${t.creado_el}</td>
            </tr>
        `).join('');
    }

    if (searchInput) searchInput.addEventListener('input', renderTicketsTable);
    if (selectGrupo) selectGrupo.addEventListener('change', renderTicketsTable);

    loadHistorico();
    loadTickets();
});