// NetOwl-Django/frontend/static/config/js/management.js

document.addEventListener('DOMContentLoaded', () => {
    function showToast(msg, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
            return;
        }
        const toastEl = document.getElementById('status-toast');
        const msgEl = document.getElementById('toast-message');
        if (toastEl && msgEl) {
            msgEl.textContent = msg;
            toastEl.className = `toast align-items-center border-0 text-white bg-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning text-dark' : 'success'}`;
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        } else {
            alert(msg);
        }
    }

    const editUserModalEl = document.getElementById('editUserModal');
    const editGroupModalEl = document.getElementById('editGroupModal');
    const changePasswordModalEl = document.getElementById('changePasswordModal');
    const deleteUserModalEl = document.getElementById('deleteUserModal');

    const editUserModal = editUserModalEl ? new bootstrap.Modal(editUserModalEl) : null;
    const editGroupModal = editGroupModalEl ? new bootstrap.Modal(editGroupModalEl) : null;
    const changePasswordModal = changePasswordModalEl ? new bootstrap.Modal(changePasswordModalEl) : null;
    const deleteUserModal = deleteUserModalEl ? new bootstrap.Modal(deleteUserModalEl) : null;

    const btnOpenCreateUser = document.getElementById('btnOpenCreateUserModal');
    const btnOpenCreateGroup = document.getElementById('btnOpenCreateGroupModal');
    const btnSaveUserModal = document.getElementById('btnSaveUserModal');
    const btnSaveGroupModal = document.getElementById('btnSaveGroupModal');

    const usersTabBtn = document.getElementById('users-tab');
    const groupsTabBtn = document.getElementById('groups-tab');

    if (usersTabBtn && groupsTabBtn) {
        usersTabBtn.addEventListener('click', () => {
            if (btnOpenCreateUser) btnOpenCreateUser.classList.remove('d-none');
            if (btnOpenCreateGroup) btnOpenCreateGroup.classList.add('d-none');
        });
        groupsTabBtn.addEventListener('click', () => {
            if (btnOpenCreateUser) btnOpenCreateUser.classList.add('d-none');
            if (btnOpenCreateGroup) btnOpenCreateGroup.classList.remove('d-none');
        });
    }

    // 1. Abrir Modal para Crear Usuario
    if (btnOpenCreateUser) {
        btnOpenCreateUser.addEventListener('click', () => {
            document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-person-plus text-primary me-2"></i>Nuevo Usuario';
            document.getElementById('modal-user-id').value = '';
            document.getElementById('modal-username').value = '';
            document.getElementById('modal-username').readOnly = false;
            document.getElementById('modal-password').value = '';
            document.getElementById('modal-password-container').classList.remove('d-none');
            document.getElementById('modal-role').value = 'viewer';
            document.getElementById('modal-group').value = '';

            setModalUserSwitches({
                vsub: true, sanalytics: true, sresults: true, slifetime: true, ssales: true, veta: true,
                vcrm: true, canalytics: true, cresults: true,
                vsup: true, sartanalytics: true, sartresults: true,
                vimp: true, imp: false, calc: false, rlifetime: false, meta: false, musr: false
            });

            if (editUserModal) editUserModal.show();
        });
    }

    // 2. Abrir Modal para Editar Permisos de Usuario
    document.querySelectorAll('.edit-user-perms-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            document.getElementById('userModalTitle').innerHTML = `<i class="bi bi-gear-fill text-primary me-2"></i>Permisos: ${el.getAttribute('data-username')}`;
            document.getElementById('modal-user-id').value = el.getAttribute('data-user-id');
            document.getElementById('modal-username').value = el.getAttribute('data-username');
            document.getElementById('modal-username').readOnly = true;
            document.getElementById('modal-password-container').classList.add('d-none');
            document.getElementById('modal-role').value = el.getAttribute('data-role') || 'viewer';
            document.getElementById('modal-group').value = el.getAttribute('data-group-id') || '';

            setModalUserSwitches({
                vsub: el.getAttribute('data-vsub') === 'true',
                sanalytics: el.getAttribute('data-sanalytics') === 'true',
                sresults: el.getAttribute('data-sresults') === 'true',
                slifetime: el.getAttribute('data-slifetime') === 'true',
                ssales: el.getAttribute('data-ssales') === 'true',
                veta: el.getAttribute('data-veta') === 'true',
                vcrm: el.getAttribute('data-vcrm') === 'true',
                canalytics: el.getAttribute('data-canalytics') === 'true',
                cresults: el.getAttribute('data-cresults') === 'true',
                vsup: el.getAttribute('data-vsup') === 'true',
                sartanalytics: el.getAttribute('data-sartanalytics') === 'true',
                sartresults: el.getAttribute('data-sartresults') === 'true',
                vimp: el.getAttribute('data-vimp') === 'true',
                imp: el.getAttribute('data-imp') === 'true',
                calc: el.getAttribute('data-calc') === 'true',
                rlifetime: el.getAttribute('data-rlifetime') === 'true',
                meta: el.getAttribute('data-meta') === 'true',
                musr: el.getAttribute('data-musr') === 'true',
            });

            if (editUserModal) editUserModal.show();
        });
    });

    // Cambiar switches automáticamente si selecciona un Grupo en el modal
    const modalGroupSelect = document.getElementById('modal-group');
    if (modalGroupSelect) {
        modalGroupSelect.addEventListener('change', (e) => {
            const opt = e.target.options[e.target.selectedIndex];
            if (opt.value) {
                setModalUserSwitches({
                    vsub: opt.getAttribute('data-vsub') === 'true',
                    sanalytics: opt.getAttribute('data-sanalytics') === 'true',
                    sresults: opt.getAttribute('data-sresults') === 'true',
                    slifetime: opt.getAttribute('data-slifetime') === 'true',
                    ssales: opt.getAttribute('data-ssales') === 'true',
                    veta: opt.getAttribute('data-veta') === 'true',
                    vcrm: opt.getAttribute('data-vcrm') === 'true',
                    canalytics: opt.getAttribute('data-canalytics') === 'true',
                    cresults: opt.getAttribute('data-cresults') === 'true',
                    vsup: opt.getAttribute('data-vsup') === 'true',
                    sartanalytics: opt.getAttribute('data-sartanalytics') === 'true',
                    sartresults: opt.getAttribute('data-sartresults') === 'true',
                    vimp: opt.getAttribute('data-vimp') === 'true',
                    imp: opt.getAttribute('data-imp') === 'true',
                    calc: opt.getAttribute('data-calc') === 'true',
                    rlifetime: opt.getAttribute('data-rlifetime') === 'true',
                    meta: opt.getAttribute('data-meta') === 'true',
                    musr: opt.getAttribute('data-musr') === 'true',
                });
            }
        });
    }

    // 3. Guardar Cambios de Usuario
    if (btnSaveUserModal) {
        btnSaveUserModal.addEventListener('click', async (e) => {
            e.preventDefault();
            const uid = document.getElementById('modal-user-id').value;
            const isNew = !uid;

            const usernameVal = document.getElementById('modal-username').value.trim();
            const passwordVal = document.getElementById('modal-password').value.trim();

            if (!usernameVal) {
                showToast('El nombre de usuario es obligatorio.', 'warning');
                return;
            }
            if (isNew && (!passwordVal || passwordVal.length < 8)) {
                showToast('La contraseña debe tener al menos 8 caracteres.', 'warning');
                return;
            }

            const endpoint = isNew ? '/auth/api/users/create/' : '/auth/api/users/update-permissions/';
            const data = {
                user_id: uid || null,
                username: usernameVal,
                password: isNew ? passwordVal : null,
                role: document.getElementById('modal-role').value,
                group_id: document.getElementById('modal-group').value || null,

                can_view_subscriptions: getSwitchVal('mu-vsub'),
                can_view_subs_analytics: getSwitchVal('mu-sanalytics'),
                can_view_subs_results: getSwitchVal('mu-sresults'),
                can_view_subs_lifetime: getSwitchVal('mu-slifetime'),
                can_view_subs_sales: getSwitchVal('mu-ssales'),
                can_view_eta: getSwitchVal('mu-veta'),

                can_view_crm: getSwitchVal('mu-vcrm'),
                can_view_crm_analytics: getSwitchVal('mu-canalytics'),
                can_view_crm_results: getSwitchVal('mu-cresults'),

                can_view_support: getSwitchVal('mu-vsup'),
                can_view_support_analytics: getSwitchVal('mu-sartanalytics'),
                can_view_support_results: getSwitchVal('mu-sartresults'),

                can_view_imports: getSwitchVal('mu-vimp'),
                can_import_data: getSwitchVal('mu-imp'),
                can_run_calculations: getSwitchVal('mu-calc'),
                can_run_lifetime: getSwitchVal('mu-rlifetime'),
                can_manage_eta: getSwitchVal('mu-meta'),
                can_manage_users: getSwitchVal('mu-musr'),
            };

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data)
                });
                const resData = await res.json();
                if (resData.status === 'success') {
                    showToast(resData.message, 'success');
                    if (editUserModal) editUserModal.hide();
                    setTimeout(() => location.reload(), 600);
                } else {
                    showToast(resData.message, 'danger');
                }
            } catch (err) {
                console.error(err);
                showToast('Error procesando usuario', 'danger');
            }
        });
    }

    // 4. Abrir Modal para Crear/Editar Grupo
    if (btnOpenCreateGroup) {
        btnOpenCreateGroup.addEventListener('click', () => {
            document.getElementById('groupModalTitle').innerHTML = '<i class="bi bi-collection text-success me-2"></i>Nuevo Grupo de Permisos';
            document.getElementById('mg-group-id').value = '';
            document.getElementById('mg-name').value = '';
            document.getElementById('mg-desc').value = '';

            setModalGroupSwitches({
                vsub: true, sanalytics: true, sresults: true, slifetime: true, ssales: true, veta: true,
                vcrm: true, canalytics: true, cresults: true,
                vsup: true, sartanalytics: true, sartresults: true,
                vimp: true, imp: false, calc: false, rlifetime: false, meta: false, musr: false
            });

            if (editGroupModal) editGroupModal.show();
        });
    }

    document.querySelectorAll('.edit-group-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            document.getElementById('groupModalTitle').innerHTML = `<i class="bi bi-pencil-square text-success me-2"></i>Editar Grupo: ${el.getAttribute('data-name')}`;
            document.getElementById('mg-group-id').value = el.getAttribute('data-id');
            document.getElementById('mg-name').value = el.getAttribute('data-name');
            document.getElementById('mg-desc').value = el.getAttribute('data-desc') || '';

            setModalGroupSwitches({
                vsub: el.getAttribute('data-vsub') === 'true',
                sanalytics: el.getAttribute('data-sanalytics') === 'true',
                sresults: el.getAttribute('data-sresults') === 'true',
                slifetime: el.getAttribute('data-slifetime') === 'true',
                ssales: el.getAttribute('data-ssales') === 'true',
                veta: el.getAttribute('data-veta') === 'true',
                vcrm: el.getAttribute('data-vcrm') === 'true',
                canalytics: el.getAttribute('data-canalytics') === 'true',
                cresults: el.getAttribute('data-cresults') === 'true',
                vsup: el.getAttribute('data-vsup') === 'true',
                sartanalytics: el.getAttribute('data-sartanalytics') === 'true',
                sartresults: el.getAttribute('data-sartresults') === 'true',
                vimp: el.getAttribute('data-vimp') === 'true',
                imp: el.getAttribute('data-imp') === 'true',
                calc: el.getAttribute('data-calc') === 'true',
                rlifetime: el.getAttribute('data-rlifetime') === 'true',
                meta: el.getAttribute('data-meta') === 'true',
                musr: el.getAttribute('data-musr') === 'true',
            });

            if (editGroupModal) editGroupModal.show();
        });
    });

    // 5. Guardar Grupo de Permisos
    if (btnSaveGroupModal) {
        btnSaveGroupModal.addEventListener('click', async (e) => {
            e.preventDefault();
            const groupNameVal = document.getElementById('mg-name').value.trim();
            if (!groupNameVal) {
                showToast('El nombre del grupo es obligatorio.', 'warning');
                return;
            }

            const data = {
                group_id: document.getElementById('mg-group-id').value || null,
                name: groupNameVal,
                description: document.getElementById('mg-desc').value.trim(),

                can_view_subscriptions: getSwitchVal('mg-vsub'),
                can_view_subs_analytics: getSwitchVal('mg-sanalytics'),
                can_view_subs_results: getSwitchVal('mg-sresults'),
                can_view_subs_lifetime: getSwitchVal('mg-slifetime'),
                can_view_subs_sales: getSwitchVal('mg-ssales'),
                can_view_eta: getSwitchVal('mg-veta'),

                can_view_crm: getSwitchVal('mg-vcrm'),
                can_view_crm_analytics: getSwitchVal('mg-canalytics'),
                can_view_crm_results: getSwitchVal('mg-cresults'),

                can_view_support: getSwitchVal('mg-vsup'),
                can_view_support_analytics: getSwitchVal('mg-sartanalytics'),
                can_view_support_results: getSwitchVal('mg-sartresults'),

                can_view_imports: getSwitchVal('mg-vimp'),
                can_import_data: getSwitchVal('mg-imp'),
                can_run_calculations: getSwitchVal('mg-calc'),
                can_run_lifetime: getSwitchVal('mg-rlifetime'),
                can_manage_eta: getSwitchVal('mg-meta'),
                can_manage_users: getSwitchVal('mg-musr'),
            };

            try {
                const res = await fetch('/auth/api/groups/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data)
                });
                const resData = await res.json();
                if (resData.status === 'success') {
                    showToast(resData.message, 'success');
                    if (editGroupModal) editGroupModal.hide();
                    setTimeout(() => location.reload(), 600);
                } else {
                    showToast(resData.message, 'danger');
                }
            } catch (err) {
                console.error(err);
                showToast('Error guardando grupo', 'danger');
            }
        });
    }

    // 6. Cambiar Contraseña y Eliminar
    document.querySelectorAll('.change-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            document.getElementById('change-pass-user-id').value = el.getAttribute('data-user-id');
            document.getElementById('change-pass-username').value = el.getAttribute('data-username');
            document.getElementById('change-pass-new-password').value = '';
            if (changePasswordModal) changePasswordModal.show();
        });
    });

    const changePassForm = document.getElementById('change-password-form');
    if (changePassForm) {
        changePassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                user_id: document.getElementById('change-pass-user-id').value,
                password: document.getElementById('change-pass-new-password').value.trim()
            };
            try {
                const res = await fetch('/auth/api/users/change-password/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data)
                });
                const resData = await res.json();
                if (resData.status === 'success') {
                    showToast(resData.message, 'success');
                    if (changePasswordModal) changePasswordModal.hide();
                } else {
                    showToast(resData.message, 'danger');
                }
            } catch (err) {
                showToast('Error cambiando contraseña', 'danger');
            }
        });
    }

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            document.getElementById('delete-user-id').value = el.getAttribute('data-user-id');
            document.getElementById('delete-username-span').textContent = el.getAttribute('data-username');
            if (deleteUserModal) deleteUserModal.show();
        });
    });

    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            const uid = document.getElementById('delete-user-id').value;
            try {
                const res = await fetch('/auth/api/users/delete/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ user_id: uid })
                });
                const resData = await res.json();
                if (resData.status === 'success') {
                    showToast(resData.message, 'success');
                    if (deleteUserModal) deleteUserModal.hide();
                    setTimeout(() => location.reload(), 600);
                } else {
                    showToast(resData.message, 'danger');
                }
            } catch (err) {
                showToast('Error eliminando usuario', 'danger');
            }
        });
    }

    // Funciones Auxiliares
    function getSwitchVal(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }

    function setModalUserSwitches(s) {
        setCheck('mu-vsub', s.vsub);
        setCheck('mu-sanalytics', s.sanalytics);
        setCheck('mu-sresults', s.sresults);
        setCheck('mu-slifetime', s.slifetime);
        setCheck('mu-ssales', s.ssales);
        setCheck('mu-veta', s.veta);
        setCheck('mu-vcrm', s.vcrm);
        setCheck('mu-canalytics', s.canalytics);
        setCheck('mu-cresults', s.cresults);
        setCheck('mu-vsup', s.vsup);
        setCheck('mu-sartanalytics', s.sartanalytics);
        setCheck('mu-sartresults', s.sartresults);
        setCheck('mu-vimp', s.vimp);
        setCheck('mu-imp', s.imp);
        setCheck('mu-calc', s.calc);
        setCheck('mu-rlifetime', s.rlifetime);
        setCheck('mu-meta', s.meta);
        setCheck('mu-musr', s.musr);
    }

    function setModalGroupSwitches(s) {
        setCheck('mg-vsub', s.vsub);
        setCheck('mg-sanalytics', s.sanalytics);
        setCheck('mg-sresults', s.sresults);
        setCheck('mg-slifetime', s.slifetime);
        setCheck('mg-ssales', s.ssales);
        setCheck('mg-veta', s.veta);
        setCheck('mg-vcrm', s.vcrm);
        setCheck('mg-canalytics', s.canalytics);
        setCheck('mg-cresults', s.cresults);
        setCheck('mg-vsup', s.vsup);
        setCheck('mg-sartanalytics', s.sartanalytics);
        setCheck('mg-sartresults', s.sartresults);
        setCheck('mg-vimp', s.vimp);
        setCheck('mg-imp', s.imp);
        setCheck('mg-calc', s.calc);
        setCheck('mg-rlifetime', s.rlifetime);
        setCheck('mg-meta', s.meta);
        setCheck('mg-musr', s.musr);
    }

    function setCheck(id, val) {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    }

    function getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    }
});