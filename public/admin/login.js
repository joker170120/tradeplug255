const form = document.getElementById("loginForm");
const input = document.getElementById("passwordInput");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");

function setStatus(msg, ok) {
  statusEl.textContent = msg || "";
  statusEl.className = "admin-status" + (msg ? (ok ? " is-ok" : " is-err") : "");
}

async function checkSession() {
  try {
    const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data.authed) window.location.replace("/admin/index.html");
  } catch {
    // ignore
  }
}

if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    togglePasswordBtn.textContent = showing ? "Show password" : "Hide password";
    togglePasswordBtn.setAttribute("aria-pressed", showing ? "false" : "true");
    input.focus();
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  submitBtn.disabled = true;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password: input.value })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data.error === "Invalid password"
          ? "Incorrect password. Please try again."
          : data.error || "Login failed.";
      setStatus(msg, false);
      return;
    }
    window.location.replace("/admin/index.html");
  } catch (err) {
    setStatus(err?.message || "Network error.", false);
  } finally {
    submitBtn.disabled = false;
  }
});

checkSession();
