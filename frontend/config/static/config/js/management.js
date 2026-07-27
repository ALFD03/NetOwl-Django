// --- START OF FILE NetOwl-Django/frontend/static/config/js/management.js ---

/**
 * NetOwl - Módulo de Gestión de Usuarios y Grupos de Permisos
 * Manejo de eventos, sincronización dinámica y peticiones API.
 */

document.addEventListener("DOMContentLoaded", () => {
    initUserPermissionSwitches();
    initGroupAssignSelects();
    initGroupForm();
    initEditGroupButtons();
    initDeleteGroupButtons();
    initCreateUserForm();
    initChangePasswordModal();
    initDeleteUserModal();
    initNewUserGroupSelector();
});

// ==========================================
// UTILIDADES
// ==========================================

function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
}

function safeGetChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function safeSetChecked(id, condition) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(condition);
}

// ==========================================
// 1. GUARDADO AUTOMÁTICO DE PERMISOS POR USUARIO
// ==========================================

function initUserPermissionSwitches() {
    const permSwitches = document.querySelectorAll(".perm-switch");
    permSwitches.forEach(sw => {
        sw.addEventListener("change", () => {
            const userId = sw.getAttribute("data-user-id");
            saveUserPermissions(userId);
        });
    });
}

function saveUserPermissions(userId) {
    const payload = {
        user_id: userId,
        can_view_subscriptions: safeGetChecked(`vsub-${userId}`),
        can_view_crm: safeGetChecked(`vcrm-${userId}`),
        can_view_imports: safeGetChecked(`vimp-${userId}`), // <-- NUEVO
        can_view_subs_analytics: safeGetChecked(`sanalytics-${userId}`),
        can_view_subs_results: safeGetChecked(`sresults-${userId}`),
        can_view_subs_lifetime: safeGetChecked(`slifetime-${userId}`),
        can_view_subs_sales: safeGetChecked(`ssales-${userId}`),
        can_view_eta: safeGetChecked(`veta-${userId}`),
        can_view_crm_analytics: safeGetChecked(`canalytics-${userId}`),
        can_view_crm_results: safeGetChecked(`cresults-${userId}`),
        can_import_data: safeGetChecked(`imp-${userId}`),
        can_run_calculations: safeGetChecked(`calc-${userId}`),
        can_run_lifetime: safeGetChecked(`rlifetime-${userId}`),
        can_manage_eta: safeGetChecked(`meta-${userId}`),
        can_manage_users: safeGetChecked(`musr-${userId}`)
    };

    fetch(`/auth/api/users/update-permissions/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken()
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            NetOwl.showToast(data.message, "success");
            // Al personalizar manualmente, resetea el selector de grupo a 'Personalizado'
            const groupSelect = document.querySelector(`.group-assign-select[data-user-id="${userId}"]`);
            if (groupSelect) groupSelect.value = "";
        } else {
            alert("Error: " + data.message);
            window.location.reload();
        }
    })
    .catch(err => {
        console.error(err);
        window.location.reload();
    });
}

// ==========================================
// 2. ASIGNACIÓN RÁPIDA DE GRUPO A UN USUARIO
// ==========================================

function initGroupAssignSelects() {
    const groupAssignSelects = document.querySelectorAll(".group-assign-select");
    groupAssignSelects.forEach(sel => {
        sel.addEventListener("change", () => {
            const userId = sel.getAttribute("data-user-id");
            const groupId = sel.value;

            NetOwl.showLoading("Sincronizando grupo de permisos...");
            fetch(`/auth/api/users/assign-group/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken()
                },
                body: JSON.stringify({ user_id: userId, group_id: groupId || null })
            })
            .then(res => res.json())
            .then(data => {
                NetOwl.hideLoading();
                if (data.status === "success") {
                    NetOwl.showToast(data.message, "success");
                    setTimeout(() => window.location.reload(), 600);
                } else {
                    alert("Error: " + data.message);
                    window.location.reload();
                }
            })
            .catch(err => {
                NetOwl.hideLoading();
                console.error(err);
                window.location.reload();
            });
        });
    });
}

// ==========================================
// 3. GESTIÓN DE GRUPOS DE PERMISOS (CREAR/EDITAR/ELIMINAR)
// ==========================================

function initGroupForm() {
    const groupForm = document.getElementById("group-form");
    const cancelGroupEditBtn = document.getElementById("cancel-group-edit-btn");

    if (groupForm) {
        groupForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const groupId = document.getElementById("group-id").value;
            const name = document.getElementById("group-name").value.trim();
            const desc = document.getElementById("group-desc").value.trim();

            const payload = {
                group_id: groupId || null,
                name: name,
                description: desc,
                can_view_subscriptions: safeGetChecked("g-view-subs"),
                can_view_crm: safeGetChecked("g-view-crm"),
                can_view_imports: safeGetChecked("g-view-imports"), // <-- NUEVO
                can_view_subs_analytics: safeGetChecked("g-subs-analytics"),
                can_view_subs_results: safeGetChecked("g-subs-results"),
                can_view_subs_lifetime: safeGetChecked("g-subs-lifetime"),
                can_view_subs_sales: safeGetChecked("g-subs-sales"),
                can_view_eta: safeGetChecked("g-view-eta"),
                can_view_crm_analytics: safeGetChecked("g-crm-analytics"),
                can_view_crm_results: safeGetChecked("g-crm-results"),
                can_import_data: safeGetChecked("g-import"),
                can_run_calculations: safeGetChecked("g-calc"),
                can_run_lifetime: safeGetChecked("g-run-lifetime"),
                can_manage_eta: safeGetChecked("g-manage-eta"),
                can_manage_users: safeGetChecked("g-admin")
            };

            NetOwl.showLoading("Guardando grupo de permisos...");
            fetch(`/auth/api/groups/save/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken()
                },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                NetOwl.hideLoading();
                if (data.status === "success") {
                    NetOwl.showToast(data.message, "success");
                    setTimeout(() => window.location.reload(), 600);
                } else {
                    alert("Error: " + data.message);
                }
            })
            .catch(err => {
                NetOwl.hideLoading();
                console.error(err);
            });
        });
    }

    if (cancelGroupEditBtn) {
        cancelGroupEditBtn.addEventListener("click", () => {
            document.getElementById("group-id").value = "";
            if (groupForm) groupForm.reset();
            cancelGroupEditBtn.classList.add("d-none");
        });
    }
}

function initEditGroupButtons() {
    const cancelGroupEditBtn = document.getElementById("cancel-group-edit-btn");

    document.querySelectorAll(".edit-group-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById("group-id").value = btn.getAttribute("data-id") || "";
            document.getElementById("group-name").value = btn.getAttribute("data-name") || "";
            document.getElementById("group-desc").value = btn.getAttribute("data-desc") || "";

            safeSetChecked("g-view-subs", btn.getAttribute("data-vsub") === "true");
            safeSetChecked("g-view-crm", btn.getAttribute("data-vcrm") === "true");
            safeSetChecked("g-view-imports", btn.getAttribute("data-vimp") === "true"); // <-- NUEVO
            safeSetChecked("g-subs-analytics", btn.getAttribute("data-sanalytics") === "true");
            safeSetChecked("g-subs-results", btn.getAttribute("data-sresults") === "true");
            safeSetChecked("g-subs-lifetime", btn.getAttribute("data-slifetime") === "true");
            safeSetChecked("g-subs-sales", btn.getAttribute("data-ssales") === "true");
            safeSetChecked("g-view-eta", btn.getAttribute("data-veta") === "true");
            safeSetChecked("g-crm-analytics", btn.getAttribute("data-canalytics") === "true");
            safeSetChecked("g-crm-results", btn.getAttribute("data-cresults") === "true");
            safeSetChecked("g-import", btn.getAttribute("data-imp") === "true");
            safeSetChecked("g-calc", btn.getAttribute("data-calc") === "true");
            safeSetChecked("g-run-lifetime", btn.getAttribute("data-rlifetime") === "true");
            safeSetChecked("g-manage-eta", btn.getAttribute("data-meta") === "true");
            safeSetChecked("g-admin", btn.getAttribute("data-musr") === "true");

            if (cancelGroupEditBtn) cancelGroupEditBtn.classList.remove("d-none");
        });
    });
}

function initDeleteGroupButtons() {
    document.querySelectorAll(".delete-group-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const gid = btn.getAttribute("data-id");
            const gname = btn.getAttribute("data-name");
            if (confirm(`¿Desea eliminar el grupo '${gname}'? Los usuarios vinculados conservarán sus permisos actuales de forma individual.`)) {
                fetch(`/auth/api/groups/delete/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken()
                    },
                    body: JSON.stringify({ group_id: gid })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === "success") {
                        NetOwl.showToast(data.message, "success");
                        setTimeout(() => window.location.reload(), 600);
                    } else {
                        alert("Error: " + data.message);
                    }
                });
            }
        });
    });
}

// ==========================================
// 4. CREACIÓN DE USUARIO NUEVO
// ==========================================

function initCreateUserForm() {
    const createUserForm = document.getElementById("create-user-form");
    if (!createUserForm) return;

    createUserForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("new-username").value.trim();
        const password = document.getElementById("new-password").value.trim();
        const role = document.getElementById("new-role").value;
        const groupId = document.getElementById("new-group").value;

        const payload = {
            username: username,
            password: password,
            role: role,
            group_id: groupId || null,
            can_view_subscriptions: safeGetChecked("p-view-subs"),
            can_view_crm: safeGetChecked("p-view-crm"),
            can_view_imports: safeGetChecked("p-view-imports"), // <-- NUEVO
            can_view_subs_analytics: safeGetChecked("p-subs-analytics"),
            can_view_subs_results: safeGetChecked("p-subs-results"),
            can_view_subs_lifetime: safeGetChecked("p-subs-lifetime"),
            can_view_subs_sales: safeGetChecked("p-subs-sales"),
            can_view_eta: safeGetChecked("p-view-eta"),
            can_view_crm_analytics: safeGetChecked("p-crm-analytics"),
            can_view_crm_results: safeGetChecked("p-crm-results"),
            can_import_data: safeGetChecked("p-import"),
            can_run_calculations: safeGetChecked("p-calc"),
            can_run_lifetime: safeGetChecked("p-run-lifetime"),
            can_manage_eta: safeGetChecked("p-manage-eta"),
            can_manage_users: safeGetChecked("p-admin")
        };

        NetOwl.showLoading("Registrando nuevo usuario...");
        fetch(`/auth/api/users/create/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken()
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            NetOwl.hideLoading();
            if (data.status === "success") {
                NetOwl.showToast(data.message, "success");
                setTimeout(() => window.location.reload(), 600);
            } else {
                alert("Error al crear usuario: " + data.message);
            }
        })
        .catch(err => {
            NetOwl.hideLoading();
            console.error(err);
        });
    });
}

// ==========================================
// 5. MODALES (CAMBIAR PASSWORD / ELIMINAR USUARIO)
// ==========================================

function initChangePasswordModal() {
    const changePassModalEl = document.getElementById("changePasswordModal");
    const changePassModal = changePassModalEl ? new bootstrap.Modal(changePassModalEl) : null;
    const changePassForm = document.getElementById("change-password-form");

    document.querySelectorAll(".change-password-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.getAttribute("data-user-id");
            const uname = btn.getAttribute("data-username");
            document.getElementById("change-pass-user-id").value = uid;
            document.getElementById("change-pass-username").value = uname;
            document.getElementById("change-pass-new-password").value = "";
            if (changePassModal) changePassModal.show();
        });
    });

    if (changePassForm) {
        changePassForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const uid = document.getElementById("change-pass-user-id").value;
            const newPassword = document.getElementById("change-pass-new-password").value.trim();

            fetch(`/auth/api/users/change-password/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken()
                },
                body: JSON.stringify({ user_id: uid, password: newPassword })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === "success") {
                    if (changePassModal) changePassModal.hide();
                    NetOwl.showToast(data.message, "success");
                } else {
                    alert("Error: " + data.message);
                }
            });
        });
    }
}

function initDeleteUserModal() {
    const deleteUserModalEl = document.getElementById("deleteUserModal");
    const deleteUserModal = deleteUserModalEl ? new bootstrap.Modal(deleteUserModalEl) : null;
    const confirmDeleteBtn = document.getElementById("confirm-delete-btn");

    document.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.getAttribute("data-user-id");
            const uname = btn.getAttribute("data-username");
            document.getElementById("delete-user-id").value = uid;
            document.getElementById("delete-username-span").textContent = uname;
            if (deleteUserModal) deleteUserModal.show();
        });
    });

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", () => {
            const uid = document.getElementById("delete-user-id").value;
            fetch(`/auth/api/users/delete/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken()
                },
                body: JSON.stringify({ user_id: uid })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === "success") {
                    if (deleteUserModal) deleteUserModal.hide();
                    const row = document.getElementById(`user-row-${uid}`);
                    if (row) row.remove();
                    NetOwl.showToast(data.message, "success");
                } else {
                    alert("Error: " + data.message);
                }
            });
        });
    }
}

// ==========================================
// 6. CAMBIO DINÁMICO DE SWITCHES SEGÚN EL GRUPO SELECCIONADO
// ==========================================

function initNewUserGroupSelector() {
    const groupSelect = document.getElementById('new-group');
    if (!groupSelect) return;

    groupSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (!selectedOption) return;

        const updateSwitch = (elementId, dataAttr) => {
            const el = document.getElementById(elementId);
            if (el) {
                el.checked = selectedOption.getAttribute(dataAttr) === 'true';
            }
        };

        // Módulo Subscriptions
        updateSwitch('p-view-subs', 'data-vsub');
        updateSwitch('p-subs-analytics', 'data-sanalytics');
        updateSwitch('p-subs-results', 'data-sresults');
        updateSwitch('p-subs-lifetime', 'data-slifetime');
        updateSwitch('p-subs-sales', 'data-ssales');
        updateSwitch('p-view-eta', 'data-veta');

        // Módulo CRM
        updateSwitch('p-view-crm', 'data-vcrm');
        updateSwitch('p-crm-analytics', 'data-canalytics');
        updateSwitch('p-crm-results', 'data-cresults');

        // Módulo Imports
        updateSwitch('p-view-imports', 'data-vimp'); // <-- NUEVO

        // Permisos Operativos / Gestión
        updateSwitch('p-import', 'data-imp');
        updateSwitch('p-calc', 'data-calc');
        updateSwitch('p-run-lifetime', 'data-rlifetime');
        updateSwitch('p-manage-eta', 'data-meta');
        updateSwitch('p-admin', 'data-musr');
    });
}

// --- END OF FILE NetOwl-Django/frontend/static/config/js/management.js ---