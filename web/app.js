document.getElementById("loginBtn")?.addEventListener("click", doLogin);

async function doLogin() {
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value.trim();
    const msg = document.getElementById("msg");
    const overlay = document.getElementById("loadingOverlay");

    msg.style.display = "none";
    msg.className = "message";

    if (!u || !p) {
        msg.innerText = "❌ املأ كل الحقول";
        msg.classList.add("error");
        msg.style.display = "block";
        return;
    }

    const user = await eel.login(u, p)();

    if (!user) {
        msg.innerText = "❌ البيانات غير صحيحة";
        msg.classList.add("error");
        msg.style.display = "block";
        return;
    }

    msg.innerHTML = `مرحباً ${user.fullname} 👋`;
    msg.classList.add("success");
    msg.style.display = "block";

    sessionStorage.setItem("user", JSON.stringify(user));

    setTimeout(() => {
        overlay.style.display = "flex"; 
    }, 800);

    setTimeout(() => {
        if (user.role === "owner") {
            location.href = "owner.html";
        } else if (user.role === "administrative") {
            location.href = "administrative.html";
        } else if (user.role === "doctor") {
            location.href = "doctor.html";
        } else if (user.role === "patient") {
            location.href = "patient.html";
        } else {
            msg.innerText = "❌ Role غير معروف";
            msg.classList.add("error");
        }
    }, 3000);
}
