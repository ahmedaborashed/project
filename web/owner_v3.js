let dashboardData = null;
let transfersData = [];
let patientNames = [];

let currentEditId = null;
let currentEditRole = null;

let chartTransfersPerDay = null;
let chartTransferStatus = null;
let chartPatientStatus = null;


async function initOwner() {

    const createBtn = document.getElementById("createUserBtn");
    if (createBtn) {
        createBtn.onclick = () => createUser();
    }

    transferSearch.oninput = () => {
        renderTransfers();
        showAutoComplete();
    };

    transferSearch.onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            renderTransfers();
            hideAutoList();
        }
    };

    const user = JSON.parse(sessionStorage.getItem("user"));
    if (!user || user.role !== "owner") return location.href = "index.html";
    ownerName.innerText = user.fullname;

    await refreshData();
    loadAnalyticsCharts();
}



function showAutoComplete() {
    const input = transferSearch;

    let list = document.getElementById("autoList");

    if (!list) {
        list = document.createElement("div");
        list.id = "autoList";
        list.style.position = "absolute";
        list.style.background = "white";
        list.style.border = "1px solid #ccc";
        list.style.width = input.offsetWidth + "px";
        list.style.zIndex = "9999";
        list.style.maxHeight = "150px";
        list.style.overflowY = "auto";
        list.style.borderRadius = "6px";
        list.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
        list.style.display = "none";
        input.parentNode.appendChild(list);
    }

    const q = input.value.trim().toLowerCase();
    list.innerHTML = "";

    if (!q) {
        list.style.display = "none";
        return;
    }

    const matches = patientNames.filter(name => name.toLowerCase().includes(q));

    if (matches.length === 0) {
        list.style.display = "none";
        return;
    }

    matches.forEach(name => {
        let item = document.createElement("div");
        item.style.padding = "8px";
        item.style.cursor = "pointer";
        item.innerText = name;

        item.onclick = () => {
            transferSearch.value = name;
            renderTransfers();
            hideAutoList();
        };

        item.onmouseover = () => item.style.background = "#eee";
        item.onmouseout = () => item.style.background = "white";

        list.appendChild(item);
    });

    list.style.display = "block";
}

function hideAutoList() {
    const list = document.getElementById("autoList");
    if (list) list.style.display = "none";
}

document.addEventListener("click", (e) => {
    if (e.target.id !== "transferSearch") hideAutoList();
});



async function refreshData() {
    dashboardData = await eel.get_dashboard_data()();

    patientNames = dashboardData.patients.map(p => p.fullname);

    renderUsers();
    renderDepts(dashboardData.depts);
    populateDeptSelects(dashboardData.depts);

    await loadTransfers();
    renderTransfers();
}



function switchTab(tab) {
    ["users", "transfers", "analytics"].forEach(t => {
        document.getElementById("pane_" + t).style.display = (t === tab ? "block" : "none");
        document.getElementById("tab_" + t).classList.toggle("active", t === tab);
    });
    if (tab === "analytics") {
        loadAnalyticsCharts();
    }
}



function renderDepts(list) {
    const t = TRANSLATIONS[currentLang];
    deptList.innerHTML = "";
    list.forEach(d => {
        deptList.innerHTML += `
            <li style="margin-bottom:8px">
                ${d.name}
                <button class="btn small danger" onclick="deleteDept(${d.id})">${t.delete}</button>
            </li>`;
    });
}

async function addDept() {
    const name = deptName.value.trim();
    if (!name) return alert("أدخل اسم القسم");

    const r = await eel.add_department(name)();
    if (r.ok) {
        deptName.value = "";
        refreshData();
    }
}

async function deleteDept(id) {

    if (!confirm("هل أنت متأكد من حذف هذا القسم نهائيًا؟")) return; 

    const r = await eel.delete_department(id)();
    if (r.ok) {
        alert("تم حذف القسم"); 
        refreshData();
    }
}



function populateDeptSelects(list) {
    const t = TRANSLATIONS[currentLang];

    dept.innerHTML = `<option value="">${t.selectDept}</option>`;
    list.forEach(d => {
        dept.innerHTML += `<option value="${d.id}">${d.name}</option>`;
    });

    assignDoctor.innerHTML = `<option value="">${t.selectDoctor}</option>`;
    dashboardData.doctors.forEach(doc => {
        assignDoctor.innerHTML += `<option value="${doc.id}" data-dept="${doc.dept_id}">${doc.fullname}</option>`;
    });
}

function handleRoleChange() {
    assignDoctor.style.display = (role.value === "patient") ? "block" : "none";
}

function filterDoctors() {
    const deptId = dept.value;
    Array.from(assignDoctor.options).forEach(opt => {
        if (opt.value === "") return;
        opt.style.display = (opt.dataset.dept == deptId ? "block" : "none");
    });
}

async function createUser() {
    const role = document.getElementById("role").value;
    const name = document.getElementById("name").value.trim();
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const nationalId = document.getElementById("nationalId").value.trim();
    const address = document.getElementById("address").value.trim();
    const password = document.getElementById("password").value.trim() || "123456";
    const dept = document.getElementById("dept").value;
    const doc = document.getElementById("assignDoctor").value;

    if (!role || !name || !username)
        return alert("املأ كل البيانات المطلوبة");

    const result = await eel.create_user(role, name, username, email, phone, nationalId, address, password, dept || null, doc || null)();
    if (!result.ok) return alert("اسم المستخدم موجود بالفعل"); 

    alert("تم إنشاء الحساب"); 
    refreshData();
}


function renderUsers() {
    const t = TRANSLATIONS[currentLang];

    const dt = document.querySelector("#doctorsTable tbody");
    dt.innerHTML = "";
    dashboardData.doctors.forEach(doc => {
        dt.innerHTML += `
            <tr>
                <td>${doc.fullname}</td>
                <td>${doc.username}</td>
                <td>${doc.phone || "-"}</td>
                <td>${doc.national_id || "-"}</td>
                <td>${doc.address || "-"}</td>
                <td>${doc.dept_name || "-"}</td>
                <td>
                    <button class="btn small edit" onclick="openEditModal(${doc.id}, 'doctor')">${t.edit}</button>
                    <button class="btn small reset" onclick="openResetPasswordModal(${doc.id})">${t.resetPassword}</button>
                    <button class="btn small danger" onclick="deleteUser(${doc.id})">${t.delete}</button>
                </td>
            </tr>`;
    });

    const pt = document.querySelector("#patientsTable tbody");
    pt.innerHTML = "";
    dashboardData.patients.forEach(p => {
        pt.innerHTML += `
            <tr>
                <td>${p.fullname}</td>
                <td>${p.username}</td>
                <td>${p.phone || "-"}</td>
                <td>${p.national_id || "-"}</td>
                <td>${p.address || "-"}</td>
                <td>${p.dept_name || "-"}</td>
                <td>${p.assigned_doctor_name || "-"}</td>
                <td>
                    <button class="btn small edit" onclick="openEditModal(${p.id}, 'patient')">${t.edit}</button>
                    <button class="btn small reset" onclick="openResetPasswordModal(${p.id})">${t.resetPassword}</button>
                    <button class="btn small danger" onclick="deleteUser(${p.id})">${t.delete}</button>
                </td>
            </tr>`;
    });

    const at = document.querySelector("#administrativesTable tbody");
    at.innerHTML = "";
    (dashboardData.administratives || []).forEach(a => {
        at.innerHTML += `
            <tr>
                <td>${a.fullname}</td>
                <td>${a.username}</td>
                <td>${a.phone || "-"}</td>
                <td>${a.national_id || "-"}</td>
                <td>${a.address || "-"}</td>
                <td>
                    <button class="btn small edit" onclick="openEditModal(${a.id}, 'administrative')">${t.edit}</button>
                    <button class="btn small reset" onclick="openResetPasswordModal(${a.id})">${t.resetPassword}</button>
                    <button class="btn small danger" onclick="deleteUser(${a.id})">${t.delete}</button>
                </td>
            </tr>`;
    });
}

async function deleteUser(id) {

    if (!confirm("هل أنت متأكد من حذف هذا المستخدم نهائيًا؟")) return; 

    const r = await eel.delete_user(id)();
    if (r.ok) {
        alert("تم حذف المستخدم");
        refreshData();
    }
}


async function loadTransfers() {
    transfersData = await eel.get_transfer_requests()() || [];
}

function statusLabel(status) {
    const t = TRANSLATIONS[currentLang];
    if (status === "pending") return t.pending;
    if (status === "approved") return t.approved;
    if (status === "rejected") return t.rejected;
    return status;
}

async function renderTransfers() {
    const tbody = document.querySelector("#transfersTable tbody");
    tbody.innerHTML = "";

    const filter = transferFilter.value;
    const q = transferSearch.value.toLowerCase().trim();
    const t = TRANSLATIONS[currentLang];

    transfersData
        .filter(t => {
            if (filter !== "all" && t.status !== filter) return false;
            if (q && !(t.patient_name || "").toLowerCase().includes(q)) return false;
            return true;
        })
        .forEach(t_data => {
            const status_text = statusLabel(t_data.status);
            let actions = "";

            if (t_data.status === "pending") {
                actions = `
                    <button class="btn small accept" onclick="approveTransfer(${t_data.id})">${t.accept}</button>
                    <button class="btn small danger" onclick="rejectTransfer(${t_data.id})">${t.reject}</button>
                `;
            }
            else if (t_data.status === "approved") {
                actions = `<span style="color:green;font-weight:bold">${status_text}</span>`;
            }
            else if (t_data.status === "rejected") {
                actions = `<span style="color:red;font-weight:bold">${status_text}</span>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td>${t_data.patient_name}</td>
                    <td>${t_data.old_dept_name || "-"}</td>
                    <td>${t_data.from_doctor_name || "-"}</td>
                    <td>${t_data.new_dept_name || "-"}</td>
                    <td>${t_data.new_doctor_name || "-"}</td>
                    <td>${new Date(t_data.created_at).toLocaleString()}</td>
                    <td>${actions}</td>
                </tr>`;
        });
}

async function approveTransfer(id) {
    const r = await eel.approve_transfer(id, null)(); 
    if (r.ok) {
        alert("تم قبول الطلب"); 
        await loadTransfers();
        renderTransfers();
    }
}

async function rejectTransfer(id) {
    if (!confirm("هل تريد رفض طلب التحويل؟")) return; 

    const r = await eel.reject_transfer(id)();
    if (r.ok) {
        alert("تم رفض الطلب"); 
        await loadTransfers();
        renderTransfers();
    }
}


async function loadAnalyticsCharts() {
    const data = await eel.get_analytics_data()();
    const t = TRANSLATIONS[currentLang];

    if (chartTransfersPerDay) chartTransfersPerDay.destroy();
    if (chartTransferStatus) chartTransferStatus.destroy();
    if (chartPatientStatus) chartPatientStatus.destroy();

    chartTransfersPerDay = new Chart(
        document.getElementById("chartTransfersPerDay"),
        {
            type: "line",
            data: {
                labels: data.per_day.map(r => r.day),
                datasets: [{
                    label: t.dailyTransfers,
                    data: data.per_day.map(r => r.total),
                    borderWidth: 2,
                    borderColor: "#6c63ff"
                }]
            }
        }
    );

    chartTransferStatus = new Chart(
        document.getElementById("chartTransferStatus"),
        {
            type: "bar",
            data: {
                labels: data.status.map(r => statusLabel(r.status)),
                datasets: [{
                    label: t.transferStatus,
                    data: data.status.map(r => r.total),
                    backgroundColor: ["#6c63ff", "#28a745", "#dc3545"]
                }]
            }
        }
    );

    chartPatientStatus = new Chart(
        document.getElementById("chartPatientStatus"),
        {
            type: "pie",
            data: {
                labels: data.patients.map(r => r.dept),
                datasets: [{
                    label: t.patientCount,
                    data: data.patients.map(r => r.total)
                }]
            }
        }
    );
}


function openEditModal(id, role) {
    currentEditId = id;
    currentEditRole = role;
    const t = TRANSLATIONS[currentLang];

    const allUsers = [
        ...(dashboardData.doctors || []),
        ...(dashboardData.patients || []),
        ...(dashboardData.administratives || [])
    ];

    const user = allUsers.find(u => u.id == id);
    if (!user) return alert("المستخدم غير موجود");

    const modalName = document.getElementById("modal_name");
    const modalUsername = document.getElementById("modal_username");
    const modalPhone = document.getElementById("modal_phone");
    const modalNationalId = document.getElementById("modal_national_id");
    const modalAddress = document.getElementById("modal_address");
    const modalDeptRow = document.getElementById("modal_dept_row");
    const modalAssignDocRow = document.getElementById("modal_assign_doc_row");
    const modalDept = document.getElementById("modal_dept");
    const modalAssignDoctor = document.getElementById("modal_assign_doctor");

    modalName.value = user.fullname || "";
    modalUsername.value = user.username || "";
    
    modalPhone.value = user.phone || "";
    modalNationalId.value = user.national_id || "";
    modalAddress.value = user.address || "";

    modalDept.innerHTML = `<option value="">${t.selectDept}</option>`;
    dashboardData.depts.forEach(d => {
        modalDept.innerHTML += `<option value="${d.id}">${d.name}</option>`;
    });

    modalAssignDoctor.innerHTML = `<option value="">${t.selectDoctor}</option>`;
    dashboardData.doctors.forEach(doc => {
        modalAssignDoctor.innerHTML += `<option value="${doc.id}" data-dept="${doc.dept_id}">${doc.fullname}</option>`;
    });


    if (role === "doctor") {
        modalDeptRow.style.display = "block";
        modalAssignDocRow.style.display = "none";
        modalDept.value = user.dept_id || "";
    }
    else if (role === "patient") {
        modalDeptRow.style.display = "block";
        modalAssignDocRow.style.display = "block";
        modalDept.value = user.dept_id || "";
        modalAssignDoctor.value = user.assigned_doctor_id || "";
    }
    else {
        modalDeptRow.style.display = "none";
        modalAssignDocRow.style.display = "none";
    }

    document.getElementById("sideModal").classList.add("open");
    document.getElementById("modalBackdrop").classList.add("open");
}

function closeSideModal() {
    document.getElementById("sideModal").classList.remove("open");
    document.getElementById("modalBackdrop").classList.remove("open");
}

async function saveUserEdits() {
    if (!currentEditId) return;

    const data = {
        fullname: document.getElementById("modal_name").value.trim(),
        username: document.getElementById("modal_username").value.trim()
    };

    data.phone = document.getElementById("modal_phone").value.trim();
    data.national_id = document.getElementById("modal_national_id").value.trim();
    data.address = document.getElementById("modal_address").value.trim();

    if (currentEditRole === "doctor") {
        data.dept_id = document.getElementById("modal_dept").value || null;
    }
    else if (currentEditRole === "patient") {
        data.dept_id = document.getElementById("modal_dept").value || null;
        data.assigned_doctor_id = document.getElementById("modal_assign_doctor").value || null;
    }

    const r = await eel.update_user(currentEditId, data)();
    if (r.ok) {
        alert("تم حفظ التعديلات"); 
        closeSideModal();
        refreshData();
    }
}


let resetUserId = null;

function openResetPasswordModal(id) {
    resetUserId = id;
    document.getElementById("resetModal").classList.add("open");
}

function closeResetPasswordModal() {
    document.getElementById("resetModal").classList.remove("open");
    document.getElementById("reset_new_password").value = "";
}

async function confirmResetPassword() {
    const newPass = document.getElementById("reset_new_password").value.trim();
    if (!newPass) return alert("أدخل كلمة مرور"); 

    const r = await eel.reset_password(resetUserId, newPass)();
    if (r.ok) {
        alert("تم تغيير كلمة المرور"); 
        closeResetPasswordModal();
    }
}

function fillDefaultPassword() {
    document.getElementById("reset_new_password").value = "123456";
}



function logout() {
    sessionStorage.clear();
    location.href = "index.html";
}

function toggleTheme() {
    const html = document.documentElement;
    const isLight = html.classList.contains("light");

    if (isLight) {
        html.classList.remove("light");
        localStorage.setItem("theme", "dark");
        document.getElementById("themeText").innerText = "Dark";
    } else {
        html.classList.add("light");
        localStorage.setItem("theme", "light");
        document.getElementById("themeText").innerText = "Light";
    }
}

function applyTheme() {
    const saved = localStorage.getItem("theme") || "dark";
    if (saved === "light") {
        document.documentElement.classList.add("light");
        document.getElementById("themeText").innerText = "Light";
    } else {
        document.documentElement.classList.remove("light");
        document.getElementById("themeText").innerText = "Dark";
    }
}

let currentLang = "ar";

function toggleLang() {
    currentLang = currentLang === "ar" ? "en" : "ar";
    applyLang();
}

function applyLang() {
    const t = TRANSLATIONS[currentLang];

    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = currentLang;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.innerText = t[key];
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (t[key]) el.placeholder = t[key];
    });

    document.querySelectorAll("option[data-i18n]").forEach(opt => {
        const key = opt.dataset.i18n;
        if (t[key]) opt.textContent = t[key];
    });

    document.getElementById("langText").innerText =
        currentLang === "ar" ? "عربي" : "EN";

    if (dashboardData) {
        renderUsers();
        renderTransfers();
    }

    if (document.getElementById("pane_analytics").style.display !== "none") {
        loadAnalyticsCharts();
    }

}

const TRANSLATIONS = {
  ar: {
    dashboard: "لوحة صاحب المستشفى",
    manageUsers: "إدارة المستخدمين",
    transferRequests: "طلبات التحويل",
    statistics: "الإحصائيات",
    logout: "تسجيل خروج",

    add: "إضافة",
    delete: "حذف",
    edit: "تعديل",
    create: "إنشاء",
    save: "حفظ",
    resetPassword: "إعادة كلمة المرور",
    defaultPassword: "123456",

    departments: "الأقسام",
    deptName: "اسم القسم",

    name: "الاسم",
    username: "اسم المستخدم",
    phone: "رقم الهاتف",
    nationalId: "الرقم القومي",
    address: "العنوان",
    actions: "إجراءات",
    department: "القسم",
    assignedDoctor: "الطبيب المعالج",

    doctor: "دكتور",
    patient: "مريض",
    administrative: "إداري",
    doctors: "الأطباء",
    patients: "المرضى",
    administratives: "الإداريين",
    usersTable: "جداول المستخدمين",

    selectDept: "اختر قسم",
    selectDoctor: "اختر طبيب",

    fullName: "الاسم الكامل",
    email: "البريد",
    password: "كلمة المرور",
    newPassword: "كلمة المرور الجديدة",

    all: "الكل",
    pending: "معلق",
    approved: "مقبول",
    rejected: "مرفوض",
    search: "بحث...",
    patient: "المريض",
    oldDept: "التخصص القديم",
    fromDoctor: "من طبيب",
    newDept: "التخصص الجديد",
    newDoctor: "الطبيب الجديد",
    date: "التاريخ",
    accept: "قبول",
    reject: "رفض",
    editUser: "تعديل المستخدم",

    dailyTransfers: "عدد التحويلات اليومية",
    transferStatus: "حالات التحويل",
    patientCount: "عدد المرضى",
  },

  en: {
    dashboard: "Hospital Owner Dashboard",
    manageUsers: "Manage Users",
    transferRequests: "Transfer Requests",
    statistics: "Statistics",
    logout: "Logout",

    add: "Add",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    save: "Save",
    resetPassword: "Reset Password",
    defaultPassword: "123456",

    departments: "Departments",
    deptName: "Department Name",

    name: "Name",
    username: "Username",
    phone: "Phone",
    nationalId: "National ID",
    address: "Address",
    actions: "Actions",
    department: "Department",
    assignedDoctor: "Assigned Doctor",

    doctor: "Doctor",
    patient: "Patient",
    administrative: "Administrative",
    doctors: "Doctors",
    patients: "Patients",
    administratives: "Administratives",
    usersTable: "Users Tables",

    selectDept: "Select Department",
    selectDoctor: "Select Doctor",

    fullName: "Full Name",
    email: "Email",
    password: "Password",
    newPassword: "New Password",

    all: "All",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    search: "Search...",
    patient: "Patient",
    oldDept: "Old Specialty",
    fromDoctor: "From Doctor",
    newDept: "New Specialty",
    newDoctor: "New Doctor",
    date: "Date",
    accept: "Accept",
    reject: "Reject",
    editUser: "Edit User",

    dailyTransfers: "Daily Transfers Count",
    transferStatus: "Transfer Status",
    patientCount: "Patient Count",
  }
};

window.onload = () => {
    initOwner();
    applyTheme();
    applyLang();
};