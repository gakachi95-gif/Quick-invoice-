/* =============================================================
   QUICKINVOICE — APP.JS
   Handles: state management, live preview, calculations,
   localStorage persistence, logo upload, PDF export, printing.
   ============================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONSTANTS
     --------------------------------------------------------- */

  const STORAGE_KEY = "quickinvoice_current_invoice_v1";
  const COUNTER_PREFIX = "quickinvoice_counter_";

  const CURRENCY_SYMBOLS = {
    NGN: "₦",
    USD: "$",
    GBP: "£",
    EUR: "€",
    CAD: "CA$",
    AUD: "A$",
    GHS: "GH₵",
    KES: "KSh",
    ZAR: "R"
  };

  const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

  /* ---------------------------------------------------------
     DOM REFERENCES
     --------------------------------------------------------- */

  const el = {
    // business
    bizName: document.getElementById("bizName"),
    bizEmail: document.getElementById("bizEmail"),
    bizEmailError: document.getElementById("bizEmailError"),
    bizPhone: document.getElementById("bizPhone"),
    bizAddress: document.getElementById("bizAddress"),
    bizWebsite: document.getElementById("bizWebsite"),
    logoInput: document.getElementById("logoInput"),
    logoPreview: document.getElementById("logoPreview"),
    logoPlaceholder: document.getElementById("logoPlaceholder"),
    removeLogoBtn: document.getElementById("removeLogoBtn"),

    // customer
    custName: document.getElementById("custName"),
    custEmail: document.getElementById("custEmail"),
    custEmailError: document.getElementById("custEmailError"),
    custPhone: document.getElementById("custPhone"),
    custAddress: document.getElementById("custAddress"),

    // invoice info
    invNumber: document.getElementById("invNumber"),
    invDate: document.getElementById("invDate"),
    invDueDate: document.getElementById("invDueDate"),
    invCurrency: document.getElementById("invCurrency"),

    // items
    itemsList: document.getElementById("itemsList"),
    addItemBtn: document.getElementById("addItemBtn"),

    // discount / tax
    discountType: document.getElementById("discountType"),
    discountValue: document.getElementById("discountValue"),
    discountError: document.getElementById("discountError"),
    taxValue: document.getElementById("taxValue"),
    taxError: document.getElementById("taxError"),

    // notes
    invNotes: document.getElementById("invNotes"),
    invTerms: document.getElementById("invTerms"),

    // actions
    newInvoiceBtn: document.getElementById("newInvoiceBtn"),
    clearInvoiceBtn: document.getElementById("clearInvoiceBtn"),
    printBtn: document.getElementById("printBtn"),
    downloadPdfBtn: document.getElementById("downloadPdfBtn"),

    // preview
    invoiceSheet: document.getElementById("invoiceSheet"),
    previewLogo: document.getElementById("previewLogo"),
    previewBizName: document.getElementById("previewBizName"),
    previewBizEmail: document.getElementById("previewBizEmail"),
    previewBizPhone: document.getElementById("previewBizPhone"),
    previewBizAddress: document.getElementById("previewBizAddress"),
    previewBizWebsite: document.getElementById("previewBizWebsite"),
    previewInvNumber: document.getElementById("previewInvNumber"),
    previewInvDate: document.getElementById("previewInvDate"),
    previewInvDueDate: document.getElementById("previewInvDueDate"),
    previewCustName: document.getElementById("previewCustName"),
    previewCustEmail: document.getElementById("previewCustEmail"),
    previewCustPhone: document.getElementById("previewCustPhone"),
    previewCustAddress: document.getElementById("previewCustAddress"),
    previewItemsBody: document.getElementById("previewItemsBody"),
    previewSubtotal: document.getElementById("previewSubtotal"),
    previewDiscountRow: document.getElementById("previewDiscountRow"),
    previewDiscountLabel: document.getElementById("previewDiscountLabel"),
    previewDiscount: document.getElementById("previewDiscount"),
    previewTaxRow: document.getElementById("previewTaxRow"),
    previewTaxLabel: document.getElementById("previewTaxLabel"),
    previewTax: document.getElementById("previewTax"),
    previewGrandTotal: document.getElementById("previewGrandTotal"),
    previewNotesBlock: document.getElementById("previewNotesBlock"),
    previewNotes: document.getElementById("previewNotes"),
    previewTermsBlock: document.getElementById("previewTermsBlock"),
    previewTerms: document.getElementById("previewTerms")
  };

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */

  let state = null;

  function defaultState() {
    const today = new Date();
    const due = new Date();
    due.setDate(due.getDate() + 14);

    return {
      business: {
        name: "",
        email: "",
        phone: "",
        address: "",
        website: "",
        logo: "" // base64 data URL
      },
      customer: {
        name: "",
        email: "",
        phone: "",
        address: ""
      },
      invoice: {
        number: generateInvoiceNumber(),
        date: toDateInputValue(today),
        dueDate: toDateInputValue(due),
        currency: "NGN"
      },
      items: [createEmptyItem()],
      discount: {
        type: "percentage",
        value: 0
      },
      tax: {
        value: 0
      },
      notes: "Thank you for your business.",
      terms: "Payment due within 14 days."
    };
  }

  function createEmptyItem() {
    return {
      id: generateId(),
      description: "",
      qty: 1,
      price: 0
    };
  }

  function generateId() {
    return "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /* ---------------------------------------------------------
     INVOICE NUMBER GENERATION
     --------------------------------------------------------- */

  function generateInvoiceNumber() {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const key = COUNTER_PREFIX + ym;
    let counter = parseInt(localStorage.getItem(key) || "0", 10);
    counter += 1;
    try {
      localStorage.setItem(key, String(counter));
    } catch (e) {
      /* localStorage unavailable — invoice number will still work for this session */
    }
    return `INV-${ym}-${String(counter).padStart(3, "0")}`;
  }

  /* ---------------------------------------------------------
     PERSISTENCE
     --------------------------------------------------------- */

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("QuickInvoice: could not save to localStorage.", e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.invoice || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch (e) {
      console.warn("QuickInvoice: could not read saved invoice.", e);
      return null;
    }
  }

  /* ---------------------------------------------------------
     FORM <-> STATE SYNC (populate inputs from state)
     --------------------------------------------------------- */

  function populateFormFromState() {
    el.bizName.value = state.business.name;
    el.bizEmail.value = state.business.email;
    el.bizPhone.value = state.business.phone;
    el.bizAddress.value = state.business.address;
    el.bizWebsite.value = state.business.website;
    setLogoPreview(state.business.logo);

    el.custName.value = state.customer.name;
    el.custEmail.value = state.customer.email;
    el.custPhone.value = state.customer.phone;
    el.custAddress.value = state.customer.address;

    el.invNumber.value = state.invoice.number;
    el.invDate.value = state.invoice.date;
    el.invDueDate.value = state.invoice.dueDate;
    el.invCurrency.value = state.invoice.currency;

    el.discountType.value = state.discount.type;
    el.discountValue.value = state.discount.value || "";
    el.taxValue.value = state.tax.value || "";

    el.invNotes.value = state.notes;
    el.invTerms.value = state.terms;

    renderItemsForm();
  }

  function setLogoPreview(dataUrl) {
    if (dataUrl) {
      el.logoPreview.src = dataUrl;
      el.logoPreview.classList.remove("hidden");
      el.logoPlaceholder.classList.add("hidden");
    } else {
      el.logoPreview.src = "";
      el.logoPreview.classList.add("hidden");
      el.logoPlaceholder.classList.remove("hidden");
    }
  }

  /* ---------------------------------------------------------
     ITEMS: FORM RENDERING
     --------------------------------------------------------- */

  function renderItemsForm() {
    el.itemsList.innerHTML = "";

    state.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.id = item.id;

      row.innerHTML = `
        <div class="field item-row__desc">
          <label>Description</label>
          <input type="text" class="item-desc" placeholder="e.g. Website design services" maxlength="200" value="${escapeAttr(item.description)}">
        </div>
        <div class="item-row__grid">
          <div class="field">
            <label>Quantity</label>
            <input type="number" class="item-qty" min="0" step="1" inputmode="numeric" value="${item.qty}">
          </div>
          <div class="field">
            <label>Unit Price</label>
            <input type="number" class="item-price" min="0" step="0.01" inputmode="decimal" value="${item.price}">
          </div>
          <div class="item-row__total">
            <span>Line total: <strong class="item-line-total">${formatCurrency(item.qty * item.price, state.invoice.currency)}</strong></span>
            ${state.items.length > 1 ? '<button type="button" class="item-row__remove">Remove</button>' : ""}
          </div>
        </div>
      `;

      el.itemsList.appendChild(row);
    });
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(str) {
    return escapeAttr(str);
  }

  /* Event delegation for item rows (desc/qty/price/remove) */
  el.itemsList.addEventListener("input", (e) => {
    const row = e.target.closest(".item-row");
    if (!row) return;
    const item = state.items.find((i) => i.id === row.dataset.id);
    if (!item) return;

    if (e.target.classList.contains("item-desc")) {
      item.description = e.target.value;
    } else if (e.target.classList.contains("item-qty")) {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 0) val = 0;
      item.qty = val;
    } else if (e.target.classList.contains("item-price")) {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 0) val = 0;
      item.price = val;
    } else {
      return;
    }

    // update line total live without full re-render (keeps focus)
    const lineTotalEl = row.querySelector(".item-line-total");
    if (lineTotalEl) {
      lineTotalEl.textContent = formatCurrency(item.qty * item.price, state.invoice.currency);
    }

    saveState();
    renderPreview();
  });

  el.itemsList.addEventListener("click", (e) => {
    if (!e.target.classList.contains("item-row__remove")) return;
    const row = e.target.closest(".item-row");
    if (!row) return;
    state.items = state.items.filter((i) => i.id !== row.dataset.id);
    saveState();
    renderItemsForm();
    renderPreview();
  });

  el.addItemBtn.addEventListener("click", () => {
    state.items.push(createEmptyItem());
    saveState();
    renderItemsForm();
    renderPreview();
  });

  /* ---------------------------------------------------------
     CALCULATIONS
     --------------------------------------------------------- */

  function calculateTotals() {
    const subtotal = state.items.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      return sum + qty * price;
    }, 0);

    let discountAmount = 0;
    const discountVal = Number(state.discount.value) || 0;
    if (state.discount.type === "percentage") {
      discountAmount = subtotal * (discountVal / 100);
    } else {
      discountAmount = discountVal;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;
    if (discountAmount < 0) discountAmount = 0;

    const afterDiscount = subtotal - discountAmount;

    const taxVal = Number(state.tax.value) || 0;
    const taxAmount = afterDiscount * (taxVal / 100);

    const grandTotal = afterDiscount + taxAmount;

    return { subtotal, discountAmount, afterDiscount, taxAmount, grandTotal };
  }

  /* ---------------------------------------------------------
     CURRENCY FORMATTING
     --------------------------------------------------------- */

  function formatCurrency(amount, currencyCode) {
    const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode + " ";
    const num = Number(amount) || 0;
    const formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${symbol}${formatted}`;
  }

  function formatDateDisplay(isoDate) {
    if (!isoDate) return "—";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  /* ---------------------------------------------------------
     PREVIEW RENDERING
     --------------------------------------------------------- */

  function renderPreview() {
    // Business
    el.previewBizName.textContent = state.business.name || "Your Business Name";
    el.previewBizEmail.textContent = state.business.email || "";
    el.previewBizEmail.style.display = state.business.email ? "" : "none";
    el.previewBizPhone.textContent = state.business.phone || "";
    el.previewBizPhone.style.display = state.business.phone ? "" : "none";
    el.previewBizAddress.textContent = state.business.address || "";
    el.previewBizAddress.style.display = state.business.address ? "" : "none";
    el.previewBizWebsite.textContent = state.business.website || "";
    el.previewBizWebsite.style.display = state.business.website ? "" : "none";

    if (state.business.logo) {
      el.previewLogo.src = state.business.logo;
      el.previewLogo.classList.remove("hidden");
    } else {
      el.previewLogo.classList.add("hidden");
    }

    // Invoice meta
    el.previewInvNumber.textContent = state.invoice.number || "—";
    el.previewInvDate.textContent = formatDateDisplay(state.invoice.date);
    el.previewInvDueDate.textContent = formatDateDisplay(state.invoice.dueDate);

    // Customer
    el.previewCustName.textContent = state.customer.name || "Customer Name";
    el.previewCustEmail.textContent = state.customer.email || "";
    el.previewCustEmail.style.display = state.customer.email ? "" : "none";
    el.previewCustPhone.textContent = state.customer.phone || "";
    el.previewCustPhone.style.display = state.customer.phone ? "" : "none";
    el.previewCustAddress.textContent = state.customer.address || "";
    el.previewCustAddress.style.display = state.customer.address ? "" : "none";

    // Items table
    el.previewItemsBody.innerHTML = "";
    const currency = state.invoice.currency;

    state.items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.description) || "<span style=\"color:#9ca3af\">—</span>"}</td>
        <td class="col-qty">${qty}</td>
        <td class="col-price">${formatCurrency(price, currency)}</td>
        <td class="col-total">${formatCurrency(qty * price, currency)}</td>
      `;
      el.previewItemsBody.appendChild(tr);
    });

    // Totals
    const totals = calculateTotals();
    el.previewSubtotal.textContent = formatCurrency(totals.subtotal, currency);

    if (totals.discountAmount > 0) {
      el.previewDiscountRow.style.display = "";
      const label = state.discount.type === "percentage"
        ? `Discount (${Number(state.discount.value) || 0}%)`
        : "Discount";
      el.previewDiscountLabel.textContent = label;
      el.previewDiscount.textContent = "-" + formatCurrency(totals.discountAmount, currency);
    } else {
      el.previewDiscountRow.style.display = "none";
    }

    if (totals.taxAmount > 0) {
      el.previewTaxRow.style.display = "";
      el.previewTaxLabel.textContent = `Tax (${Number(state.tax.value) || 0}%)`;
      el.previewTax.textContent = formatCurrency(totals.taxAmount, currency);
    } else {
      el.previewTaxRow.style.display = "none";
    }

    el.previewGrandTotal.textContent = formatCurrency(totals.grandTotal, currency);

    // Notes / Terms
    if (state.notes && state.notes.trim()) {
      el.previewNotesBlock.style.display = "";
      el.previewNotes.textContent = state.notes;
    } else {
      el.previewNotesBlock.style.display = "none";
    }

    if (state.terms && state.terms.trim()) {
      el.previewTermsBlock.style.display = "";
      el.previewTerms.textContent = state.terms;
    } else {
      el.previewTermsBlock.style.display = "none";
    }
  }

  /* ---------------------------------------------------------
     VALIDATION
     --------------------------------------------------------- */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(inputEl, errorEl) {
    const val = inputEl.value.trim();
    if (!val) {
      inputEl.classList.remove("input-error");
      errorEl.textContent = "";
      return true;
    }
    if (!EMAIL_RE.test(val)) {
      inputEl.classList.add("input-error");
      errorEl.textContent = "Please enter a valid email address.";
      return false;
    }
    inputEl.classList.remove("input-error");
    errorEl.textContent = "";
    return true;
  }

  function validateNonNegativeNumber(inputEl, errorEl, label) {
    const val = inputEl.value.trim();
    if (val === "") {
      inputEl.classList.remove("input-error");
      errorEl.textContent = "";
      return true;
    }
    const num = Number(val);
    if (isNaN(num) || num < 0) {
      inputEl.classList.add("input-error");
      errorEl.textContent = `${label} cannot be negative.`;
      return false;
    }
    inputEl.classList.remove("input-error");
    errorEl.textContent = "";
    return true;
  }

  /* ---------------------------------------------------------
     EVENT BINDINGS — simple text/select fields
     --------------------------------------------------------- */

  function bindTextField(inputEl, getTarget, key) {
    inputEl.addEventListener("input", () => {
      const target = getTarget();
      target[key] = inputEl.value;
      saveState();
      renderPreview();
    });
  }

  bindTextField(el.bizName, () => state.business, "name");
  bindTextField(el.bizPhone, () => state.business, "phone");
  bindTextField(el.bizAddress, () => state.business, "address");
  bindTextField(el.bizWebsite, () => state.business, "website");

  el.bizEmail.addEventListener("input", () => {
    state.business.email = el.bizEmail.value;
    validateEmail(el.bizEmail, el.bizEmailError);
    saveState();
    renderPreview();
  });

  bindTextField(el.custName, () => state.customer, "name");
  bindTextField(el.custPhone, () => state.customer, "phone");
  bindTextField(el.custAddress, () => state.customer, "address");

  el.custEmail.addEventListener("input", () => {
    state.customer.email = el.custEmail.value;
    validateEmail(el.custEmail, el.custEmailError);
    saveState();
    renderPreview();
  });

  el.invNumber.addEventListener("input", () => {
    state.invoice.number = el.invNumber.value;
    saveState();
    renderPreview();
  });

  el.invDate.addEventListener("input", () => {
    state.invoice.date = el.invDate.value;
    saveState();
    renderPreview();
  });

  el.invDueDate.addEventListener("input", () => {
    state.invoice.dueDate = el.invDueDate.value;
    saveState();
    renderPreview();
  });

  el.invCurrency.addEventListener("change", () => {
    state.invoice.currency = el.invCurrency.value;
    saveState();
    renderItemsForm();
    renderPreview();
  });

  el.discountType.addEventListener("change", () => {
    state.discount.type = el.discountType.value;
    saveState();
    renderPreview();
  });

  el.discountValue.addEventListener("input", () => {
    const valid = validateNonNegativeNumber(el.discountValue, el.discountError, "Discount");
    const num = Number(el.discountValue.value);
    state.discount.value = valid && el.discountValue.value !== "" ? num : (el.discountValue.value === "" ? 0 : state.discount.value);
    saveState();
    renderPreview();
  });

  el.taxValue.addEventListener("input", () => {
    const valid = validateNonNegativeNumber(el.taxValue, el.taxError, "Tax");
    const num = Number(el.taxValue.value);
    state.tax.value = valid && el.taxValue.value !== "" ? num : (el.taxValue.value === "" ? 0 : state.tax.value);
    saveState();
    renderPreview();
  });

  bindTextField(el.invNotes, () => state, "notes");
  bindTextField(el.invTerms, () => state, "terms");

  /* ---------------------------------------------------------
     LOGO UPLOAD
     --------------------------------------------------------- */

  el.logoInput.addEventListener("change", () => {
    const file = el.logoInput.files && el.logoInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (PNG, JPG or WEBP).");
      el.logoInput.value = "";
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      alert("Logo image is too large. Please choose a file under 2MB.");
      el.logoInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      state.business.logo = e.target.result; // base64 data URL, stays local
      setLogoPreview(state.business.logo);
      saveState();
      renderPreview();
    };
    reader.onerror = () => {
      alert("Could not read that image. Please try a different file.");
    };
    reader.readAsDataURL(file);
  });

  el.removeLogoBtn.addEventListener("click", () => {
    state.business.logo = "";
    el.logoInput.value = "";
    setLogoPreview("");
    saveState();
    renderPreview();
  });

  /* ---------------------------------------------------------
     NEW / CLEAR INVOICE
     --------------------------------------------------------- */

  el.newInvoiceBtn.addEventListener("click", () => {
    const hasContent = state.business.name || state.customer.name || state.items.some((i) => i.description);
    if (hasContent) {
      const ok = confirm("Start a new invoice? Your current invoice will be replaced (business details are kept).");
      if (!ok) return;
    }
    const previousBusiness = { ...state.business };
    state = defaultState();
    state.business = previousBusiness; // keep business info for convenience
    saveState();
    populateFormFromState();
    renderPreview();
  });

  el.clearInvoiceBtn.addEventListener("click", () => {
    const ok = confirm("Clear all invoice data? This cannot be undone.");
    if (!ok) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    state = defaultState();
    populateFormFromState();
    renderPreview();
  });

  /* ---------------------------------------------------------
     PRINT
     --------------------------------------------------------- */

  el.printBtn.addEventListener("click", () => {
    window.print();
  });

  /* ---------------------------------------------------------
     PDF DOWNLOAD
     --------------------------------------------------------- */

  el.downloadPdfBtn.addEventListener("click", async () => {
    if (typeof html2canvas === "undefined" || typeof window.jspdf === "undefined") {
      alert("PDF tools are still loading. Please try again in a moment.");
      return;
    }

    const originalLabel = el.downloadPdfBtn.textContent;
    el.downloadPdfBtn.textContent = "Generating PDF…";
    el.downloadPdfBtn.disabled = true;

    try {
      const target = el.invoiceSheet;

      const canvas = await html2canvas(target, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        // Fits on a single page
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-page: slice the canvas
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      const fileName = `${(state.invoice.number || "invoice").replace(/[^a-z0-9\-]+/gi, "_")}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error("QuickInvoice: PDF generation failed.", err);
      alert("Sorry, something went wrong generating the PDF. Please try again.");
    } finally {
      el.downloadPdfBtn.textContent = originalLabel;
      el.downloadPdfBtn.disabled = false;
    }
  });

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */

  function init() {
    const saved = loadState();
    state = saved || defaultState();

    // Backfill in case saved state is missing newer fields
    state.business = state.business || {};
    state.customer = state.customer || {};
    state.invoice = state.invoice || {};
    state.discount = state.discount || { type: "percentage", value: 0 };
    state.tax = state.tax || { value: 0 };
    if (!state.items || !state.items.length) state.items = [createEmptyItem()];

    populateFormFromState();
    renderPreview();
  }

  init();
})();
