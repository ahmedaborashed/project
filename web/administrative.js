let currentAdminChat = null;
let adminUser = null;
let patientsCache = []; 
let currentLang = localStorage.getItem("lang") || "ar";

const TRANSLATIONS = {
    ar: {
        administrative: "الإدارية",
        messages: "الرسائل",
        logout: "تسجيل خروج",
        search_patient: "ابحث باسم المريض...",
        select_patient: "اختر مريضاً",
        delete_conv: "حذف المحادثة",
        send: "إرسال",
        type_msg: "اكتب رسالة...",
        no_complaints: "لا توجد شكاوى",
        no_results: "لا توجد نتائج",
        confirm_delete: "هل تريد حذف هذه المحادثة؟",
        just_now: "الآن",
        minutes_ago: "دقيقة",
        hours_ago: "ساعة",
        days_ago: "يوم"
    },
    en: {
        administrative: "Administrative",
        messages: "Messages",
        logout: "Logout",
        search_patient: "Search patient...",
        select_patient: "Select a patient",
        delete_conv: "Delete Conversation",
        send: "Send",
        type_msg: "Type a message...",
        no_complaints: "No complaints",
        no_results: "No results found",
        confirm_delete: "Do you want to delete this conversation?",
        just_now: "Just now",
        minutes_ago: "min ago",
        hours_ago: "hr ago",
        days_ago: "days ago"
    }
};

async function initAdministrative(){
    adminUser = JSON.parse(sessionStorage.getItem('user'));
    if(!adminUser) return location.href = "index.html";

    applyLang();
    checkTheme();
    await loadPatientsList();

    const searchInput = document.getElementById("searchPatient");
    if(searchInput) {
        searchInput.addEventListener("input", filterPatients);
    }
}

function applyLang(){
    const t = TRANSLATIONS[currentLang];
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = currentLang;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const k = el.dataset.i18n;
        if(t[k]) el.innerText = t[k];
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const k = el.dataset.i18nPlaceholder;
        if(t[k]) el.placeholder = t[k];
    });

    document.getElementById("langText").innerText = currentLang === "ar" ? "عربي" : "EN";
}

function toggleLang(){
    currentLang = currentLang === "ar" ? "en" : "ar";
    localStorage.setItem("lang", currentLang);
    applyLang();
    loadPatientsList();
}

function toggleTheme(){
    document.body.classList.toggle("light");
    const isLight = document.body.classList.contains("light");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    document.getElementById("themeText").innerText = isLight ? "Light" : "Dark";
}

function checkTheme(){
    if(localStorage.getItem("theme") === "light"){
        document.body.classList.add("light");
        document.getElementById("themeText").innerText = "Light";
    }
}

function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    const t = TRANSLATIONS[currentLang];

    if (diff < 60) return t.just_now;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        if (currentLang === "ar") {
            if (m === 1) return "منذ دقيقة";
            if (m === 2) return "منذ دقيقتين";
            if (m >= 3 && m <= 10) return `منذ ${m} دقائق`;
            return `منذ ${m} دقيقة`;
        }
        return `${m} ${t.minutes_ago}`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        if (currentLang === "ar") {
            if (h === 1) return "منذ ساعة";
            if (h === 2) return "منذ ساعتين";
            if (h >= 3 && h <= 10) return `منذ ${h} ساعات`;
            return `منذ ${h} ساعة`;
        }
        return `${h} ${t.hours_ago}`;
    }
    const d = Math.floor(diff / 86400);
    if (currentLang === "ar") {
        if (d === 1) return "منذ يوم";
        if (d === 2) return "منذ يومين";
        if (d >= 3 && d <= 10) return `منذ ${d} أيام`;
        return `منذ ${d} يوم`;
    }
    return `${d} ${t.days_ago}`;
}

async function loadPatientsList(){
    const list = document.getElementById("msgList");
    list.innerHTML = "";
    const rows = await eel.get_patients_with_complaints()() || [];
    
    patientsCache = [];
    for (let r of rows) {
        const msgs = await eel.get_complaint_messages(r.patient_id)() || [];
        let lastText = "";
        let lastTime = "";
        if(msgs.length){
            const last = msgs[msgs.length -1];
            lastText = last.message ? stripMarker(last.message) : (last.image_filename ? "[صورة]" : "");
            lastTime = timeAgo(last.created_at);
        }
        patientsCache.push({ ...r, lastText, lastTime });
    }

    renderList(patientsCache);
}

function renderList(data) {
    const list = document.getElementById("msgList");
    list.innerHTML = "";

    if(data.length === 0){
        const msg = document.getElementById("searchPatient").value.trim() ? 
                    TRANSLATIONS[currentLang].no_results : 
                    TRANSLATIONS[currentLang].no_complaints;
        list.innerHTML = `<li style='padding:15px;color:var(--muted);text-align:center'>${msg}</li>`;
        return;
    }

    data.forEach(r => {
        const unread = r.unread_count || 0;
        const li = document.createElement("li");
        li.innerHTML = `
            <button class="btn ghost patient-btn" style="width:100%;text-align:${currentLang === 'ar' ? 'right' : 'left'};padding:15px;position:relative" onclick="loadMessageChat(${r.patient_id})">
                <div style="font-weight:700; display:flex; justify-content:space-between; align-items:center;">
                    <span>${r.fullname || ''}</span>
                    ${unread ? `<span class="badge">${unread}</span>` : ''}
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:6px; display:flex; justify-content:space-between;">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">${escapeHtml(r.lastText || '')}</span>
                    <span style="font-size:10px;">${r.lastTime || ''}</span>
                </div>
            </button>
        `;
        list.appendChild(li);
    });
}

function filterPatients(){
    const q = document.getElementById("searchPatient").value.trim().toLowerCase();
    const filtered = patientsCache.filter(p => 
        (p.fullname || "").toLowerCase().includes(q)
    );
    renderList(filtered);
}

async function loadMessageChat(pid){
    currentAdminChat = pid;
    document.getElementById("btnDeleteConv").style.display = "inline-block";
    const patient = (patientsCache.find(p=>p.patient_id==pid) || {});
    document.getElementById("chatHeader").innerText = patient.fullname || ("Patient " + pid);

    const msgs = await eel.get_complaint_messages(pid)() || [];
    const win = document.getElementById("msgWindow");
    win.innerHTML = "";

    msgs.forEach(row => {
        const raw = row.message || "";
        let isAdmin = raw.startsWith("[ADMIN]");
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.alignItems = isAdmin ? "flex-end" : "flex-start";

        const bubble = document.createElement("div");
        bubble.className = isAdmin ? "bubble bubble-right" : "bubble bubble-left";

        if(row.image){
            const img = document.createElement("img");
            img.src = "data:image/png;base64," + row.image;
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            bubble.appendChild(img);
        } else {
            bubble.innerText = stripMarker(raw);
        }

        const timeTag = document.createElement("div");
        timeTag.style.fontSize = "10px";
        timeTag.style.color = "var(--muted)";
        timeTag.style.marginTop = "4px";
        timeTag.innerText = timeAgo(row.created_at);

        wrapper.appendChild(bubble);
        wrapper.appendChild(timeTag);
        win.appendChild(wrapper);
    });
    win.scrollTop = win.scrollHeight;
}

async function sendMessageAdmin(){
    if(!currentAdminChat) return;
    const txt = document.getElementById("msgInputAdmin").value.trim();
    if(!txt) return;
    await eel.send_admin_message(currentAdminChat, txt, 0)();
    document.getElementById("msgInputAdmin").value = "";
    await loadMessageChat(currentAdminChat);
}

function triggerImage(){ document.getElementById("imgInput").click(); }

document.getElementById("imgInput").onchange = async function(){
    if(!currentAdminChat) return;
    const file = this.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const b64 = e.target.result.split(",")[1];
        await eel.send_admin_message(currentAdminChat, "", 1, b64)();
        await loadMessageChat(currentAdminChat);
    };
    reader.readAsDataURL(file);
};

async function deleteConversation(){
    if(!currentAdminChat) return;
    if(!confirm(TRANSLATIONS[currentLang].confirm_delete)) return;
    await eel.delete_conversation(adminUser.id, currentAdminChat)();
    currentAdminChat = null;
    document.getElementById("msgWindow").innerHTML = "";
    document.getElementById("chatHeader").innerText = TRANSLATIONS[currentLang].select_patient;
    document.getElementById("btnDeleteConv").style.display = "none";
    await loadPatientsList();
}

function stripMarker(s){ return s.replace("[ADMIN]", "").replace("[PATIENT]", ""); }
function escapeHtml(text){ 
    const p = document.createElement('p'); 
    p.textContent = text; 
    return p.innerHTML; 
}
function logout(){ sessionStorage.clear(); location.href = "index.html"; }

window.addEventListener("DOMContentLoaded", initAdministrative);