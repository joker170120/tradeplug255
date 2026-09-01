(function () {
  const body = document.body;
  if (!body.classList.contains("page-product")) return;

  const shareUrl = body.dataset.shareUrl || window.location.href;
  const shareInput = document.getElementById("ppShareUrl");
  const copyBtn = document.getElementById("ppShareCopy");
  const mainImage = document.getElementById("ppMainImage");
  const addCartBtn = document.getElementById("ppAddCart");
  const toast = document.getElementById("statusToast");

  function showToast(message, ok) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = "status-toast" + (ok ? " is-ok" : " is-error");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.className = "status-toast";
    }, 3500);
  }

  async function copyLink() {
    const url = shareInput?.value || shareUrl;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (shareInput) {
        shareInput.select();
        document.execCommand("copy");
      } else {
        window.prompt("Copy this link:", url);
        return;
      }
      if (copyBtn) {
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied ✓";
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 2000);
      }
      showToast("Link copied — paste it on social media.", true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  copyBtn?.addEventListener("click", copyLink);

  document.querySelectorAll(".pp-thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.getAttribute("data-src");
      if (!src || !mainImage) return;
      mainImage.src = src;
      document.querySelectorAll(".pp-thumb").forEach((el) => el.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  let productData = null;
  try {
    const raw = document.getElementById("ppProductJson")?.textContent;
    if (raw) productData = JSON.parse(raw);
  } catch {
    productData = null;
  }

  addCartBtn?.addEventListener("click", () => {
    if (!productData?.product) return;
    window.dispatchEvent(
      new CustomEvent("tradeplug:add-cart", {
        detail: { product: productData.product, segment: productData.segment }
      })
    );
  });
})();
