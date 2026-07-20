// frontend/static/config/js/management.js

document.addEventListener("DOMContentLoaded", () => {
    // Obtener el CSRF Token consultando la meta-etiqueta del Layout Base (estándar de producción)
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrftoken = csrfMeta ? csrfMeta.getAttribute('content') : (window.NetOwl ? NetOwl.getCsrfToken() : '');
    
    // Instanciar los modales de Bootstrap de forma segura
    const changePasswordModal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    const deleteUserModal = new bootstrap.Modal(document.getElementById('deleteUserModal'));

    // --- ACCIÓN 1: Crear nuevo usuario ---
    const createUserForm = document.getElementById("create-user-form");
    if (createUserForm) {
        createUserForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = document.getElementById("new-username").value.trim();
            const password = document.getElementById("new-password").value.trim();
            const role = document.getElementById("new-role").value;

            NetOwl.showLoading("Guardando usuario...");
            fetch("/auth/api/users/create/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrftoken,
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({ username, password, role })
            })
            .then(res => res.json())
            .then(res => {
                NetOwl.hideLoading();
                if (res.status === "success") {
                    NetOwl.showToast(res.message, "success");
                    setTimeout(() => location.reload(), 1000);
                } else {
                    NetOwl.showToast(res.message, "danger");
                }
            })
            .catch(() => {
                NetOwl.hideLoading();
                NetOwl.showToast("Error de red al crear usuario", "danger");
            });
        });
    }

    // --- ACCIÓN 2: Modificar rol desde el Selector de la tabla ---
    document.querySelectorAll(".toggle-edit-role-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const userId = btn.dataset.userId;
            const selectElement = document.getElementById(`role-select-${userId}`);
            const iconElement = btn.querySelector("i");
            
            // Verificar si el selector está bloqueado actualmente
            const isLocked = selectElement.hasAttribute("disabled");

            if (isLocked) {
                // ESTADO: Desbloquear para permitir edición
                selectElement.removeAttribute("disabled");
                
                // Cambiar el botón a modo confirmación (verde con ✔️)
                btn.classList.remove("btn-outline-primary");
                btn.classList.add("btn-success");
                btn.setAttribute("title", "Guardar Cambios");
                iconElement.className = "bi bi-check-lg";
                
                // Enfocar el selector para facilitar el UX
                selectElement.focus();
            } else {
                // ESTADO: Guardar cambios y volver a bloquear
                const newRole = selectElement.value;

                NetOwl.showLoading("Guardando nuevos permisos...");
                fetch("/auth/api/users/update-role/", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": csrftoken,
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({ user_id: userId, role: newRole })
                })
                .then(res => res.json())
                .then(res => {
                    NetOwl.hideLoading();
                    if (res.status === "success") {
                        NetOwl.showToast(res.message, "success");
                        
                        // Bloquear nuevamente el selector
                        selectElement.setAttribute("disabled", "true");
                        
                        // Restablecer el botón al modo edición original (azul con lápiz)
                        btn.classList.remove("btn-success");
                        btn.classList.add("btn-outline-primary");
                        btn.setAttribute("title", "Editar Rol");
                        iconElement.className = "bi bi-pencil-square";
                    } else {
                        NetOwl.showToast(res.message, "danger");
                    }
                })
                .catch(() => {
                    NetOwl.hideLoading();
                    NetOwl.showToast("Error al conectar con el servidor", "danger");
                });
            }
        });
    });

    // --- ACCIÓN 3: Configurar y abrir el modal de contraseña ---
    document.querySelectorAll(".change-password-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById("change-pass-user-id").value = btn.dataset.userId;
            document.getElementById("change-pass-username").value = btn.dataset.username;
            document.getElementById("change-pass-new-password").value = "";
            changePasswordModal.show();
        });
    });

    // Enviar cambio de contraseña por POST
    const changePasswordForm = document.getElementById("change-password-form");
    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const userId = document.getElementById("change-pass-user-id").value;
            const password = document.getElementById("change-pass-new-password").value.trim();

            NetOwl.showLoading("Actualizando contraseña...");
            fetch("/auth/api/users/change-password/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrftoken,
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({ user_id: userId, password: password })
            })
            .then(res => res.json())
            .then(res => {
                NetOwl.hideLoading();
                if (res.status === "success") {
                    NetOwl.showToast(res.message, "success");
                    changePasswordModal.hide();
                } else {
                    NetOwl.showToast(res.message, "danger");
                }
            })
            .catch(() => {
                NetOwl.hideLoading();
                NetOwl.showToast("Error de conexión", "danger");
            });
        });
    }

    // --- ACCIÓN 4: Configurar y abrir el modal de eliminación ---
    document.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById("delete-user-id").value = btn.dataset.userId;
            document.getElementById("delete-username-span").textContent = btn.dataset.username;
            deleteUserModal.show();
        });
    });

    // Confirmar eliminación desde el modal
    const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", () => {
            const userId = document.getElementById("delete-user-id").value;

            NetOwl.showLoading("Eliminando usuario...");
            fetch("/auth/api/users/delete/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrftoken,
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({ user_id: userId })
            })
            .then(res => res.json())
            .then(res => {
                NetOwl.hideLoading();
                deleteUserModal.hide();
                if (res.status === "success") {
                    NetOwl.showToast(res.message, "success");
                    const userRow = document.getElementById(`user-row-${userId}`);
                    if (userRow) userRow.remove();
                } else {
                    NetOwl.showToast(res.message, "danger");
                }
            })
            .catch(() => {
                NetOwl.hideLoading();
                deleteUserModal.hide();
                NetOwl.showToast("Error al conectar con el servidor", "danger");
            });
        });
    }
});