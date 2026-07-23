// --- START OF FILE NetOwl-Django/frontend/static/config/js/management.js ---
document.addEventListener("DOMContentLoaded", () => {

    // --- 1. GUARDADO AUTOMÁTICO AL CAMBIAR SWITCHES INDIVIDUALES ---
    const permSwitches = document.querySelectorAll(".perm-switch");

    permSwitches.forEach(sw => {
        sw.addEventListener("change", () => {
            const userId = sw.getAttribute("data-user-id");
            saveUserPermissions(userId);
        });
    });

    function saveUserPermissions(userId) {
        const payload = {
            user_id: userId,
            can_view_subscriptions: document.getElementById(`vsub-${userId}`).checked,
            can_view_crm: document.getElementById(`vcrm-${userId}`).checked,
            can_view_subs_analytics: document.getElementById(`sanalytics-${userId}`).checked,
            can_view_subs_results: document.getElementById(`sresults-${userId}`).checked,
            can_view_subs_lifetime: document.getElementById(`slifetime-${userId}`).checked,
            can_view_subs_sales: document.getElementById(`ssales-${userId}`).checked,
            can_view_eta: document.getElementById(`veta-${userId}`).checked,
            can_view_crm_analytics: document.getElementById(`canalytics-${userId}`).checked,
            can_view_crm_results: document.getElementById(`cresults-${userId}`).checked,
            can_import_data: document.getElementById(`imp-${userId}`).checked,
            can_run_calculations: document.getElementById(`calc-${userId}`).checked,
            can_run_lifetime: document.getElementById(`rlifetime-${userId}`).checked,
            can_manage_eta: document.getElementById(`meta-${userId}`).checked,
            can_manage_users: document.getElementById(`musr-${userId}`).checked
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
                // Resetear el selector a 'Personalizado' al modificar manualmente un switch
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

    // --- 2. ASIGNACIÓN RÁPIDA DE GRUPO A UN USUARIO ---
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

    // --- 3. CREACIÓN Y EDICIÓN DE GRUPOS DE PERMISOS ---
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
                can_view_subscriptions: document.getElementById("g-view-subs").checked,
                can_view_crm: document.getElementById("g-view-crm").checked,
                can_view_subs_analytics: document.getElementById("g-subs-analytics").checked,
                can_view_subs_results: document.getElementById("g-subs-results").checked,
                can_view_subs_lifetime: document.getElementById("g-subs-lifetime").checked,
                can_view_subs_sales: document.getElementById("g-subs-sales").checked,
                can_view_eta: document.getElementById("g-view-eta").checked,
                can_view_crm_analytics: document.getElementById("g-crm-analytics").checked,
                can_view_crm_results: document.getElementById("g-crm-results").checked,
                can_import_data: document.getElementById("g-import").checked,
                can_run_calculations: document.getElementById("g-calc").checked,
                can_run_lifetime: document.getElementById("g-run-lifetime").checked,
                can_manage_eta: document.getElementById("g-manage-eta").checked,
                can_manage_users: document.getElementById("g-admin").checked
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

    // Cargar datos de un grupo en el formulario para editarlo
    document.querySelectorAll(".edit-group-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById("group-id").value = btn.getAttribute("data-id");
            document.getElementById("group-name").value = btn.getAttribute("data-name");
            document.getElementById("group-desc").value = btn.getAttribute("data-desc");

            document.getElementById("g-view-subs").checked = btn.getAttribute("data-vsub") === "true";
            document.getElementById("g-view-crm").checked = btn.getAttribute("data-vcrm") === "true";
            document.getElementById("g-subs-analytics").checked = btn.getAttribute("data-sanalytics") === "true";
            document.getElementById("g-subs-results").checked = btn.getAttribute("data-sresults") === "true";
            document.getElementById("g-subs-lifetime").checked = btn.getAttribute("data-slifetime") === "true";
            document.getElementById("g-subs-sales").checked = btn.getAttribute("data-ssales") === "true";
            document.getElementById("g-view-eta").checked = btn.getAttribute("data-veta") === "true";
            document.getElementById("g-crm-analytics").checked = btn.getAttribute("data-canalytics") === "true";
            document.getElementById("g-crm-results").checked = btn.getAttribute("data-cresults") === "true";
            document.getElementById("g-import").checked = btn.getAttribute("data-imp") === "true";
            document.getElementById("g-calc").checked = btn.getAttribute("data-calc") === "true";
            document.getElementById("g-run-lifetime").checked = btn.getAttribute("data-rlifetime") === "true";
            document.getElementById("g-manage-eta").checked = btn.getAttribute("data-meta") === "true";
            document.getElementById("g-admin").checked = btn.getAttribute("data-musr") === "true";

            if (cancelGroupEditBtn) cancelGroupEditBtn.classList.remove("d-none");
        });
    });

    if (cancelGroupEditBtn) {
        cancelGroupEditBtn.addEventListener("click", () => {
            document.getElementById("group-id").value = "";
            groupForm.reset();
            cancelGroupEditBtn.classList.add("d-none");
        });
    }

    // Eliminar Grupo
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

    // --- 4. CREACIÓN DE USUARIO NUEVO ---
    const createUserForm = document.getElementById("create-user-form");
    if (createUserForm) {
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
                can_view_subscriptions: document.getElementById("p-view-subs").checked,
                can_view_crm: document.getElementById("p-view-crm").checked,
                can_view_subs_analytics: document.getElementById("p-subs-analytics").checked,
                can_view_subs_results: document.getElementById("p-subs-results").checked,
                can_view_subs_lifetime: document.getElementById("p-subs-lifetime").checked,
                can_view_subs_sales: document.getElementById("p-subs-sales").checked,
                can_view_eta: document.getElementById("p-view-eta").checked,
                can_view_crm_analytics: document.getElementById("p-crm-analytics").checked,
                can_view_crm_results: document.getElementById("p-crm-results").checked,
                can_import_data: document.getElementById("p-import").checked,
                can_run_calculations: document.getElementById("p-calc").checked,
                can_run_lifetime: document.getElementById("p-run-lifetime").checked,
                can_manage_eta: document.getElementById("p-manage-eta").checked,
                can_manage_users: document.getElementById("p-admin").checked
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

    // --- 5. MODALES CAMBIAR PASSWORD Y ELIMINAR USUARIO ---
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
            changePassModal.show();
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
                    changePassModal.hide();
                    NetOwl.showToast(data.message, "success");
                } else {
                    alert("Error: " + data.message);
                }
            });
        });
    }

    const deleteUserModalEl = document.getElementById("deleteUserModal");
    const deleteUserModal = deleteUserModalEl ? new bootstrap.Modal(deleteUserModalEl) : null;
    const confirmDeleteBtn = document.getElementById("confirm-delete-btn");

    document.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.getAttribute("data-user-id");
            const uname = btn.getAttribute("data-username");
            document.getElementById("delete-user-id").value = uid;
            document.getElementById("delete-username-span").textContent = uname;
            deleteUserModal.show();
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
                    deleteUserModal.hide();
                    document.getElementById(`user-row-${uid}`).remove();
                    NetOwl.showToast(data.message, "success");
                } else {
                    alert("Error: " + data.message);
                }
            });
        });
    }

    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute("content") : "";
    }
});
// --- END OF FILE NetOwl-Django/frontend/static/config/js/management.js ---