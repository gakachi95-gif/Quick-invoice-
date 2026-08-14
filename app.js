/* =============================================================
   QUICKINVOICE — APP.JS
   Document-style editor: business/customer/invoice/items are
   edited directly inline on the invoice document. The sidebar
   controls template, color, tax, discount, currency, payment
   and options. Everything is persisted to localStorage and
   nothing is ever uploaded to a server.
   ============================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONSTANTS
     --------------------------------------------------------- */

  const STORAGE_KEY = "quickinvoice_current_invoice_v2";
  const COUNTER_PREFIX = "quickinvoice_counter_";
  const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
  const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB
  const MAX_PHOTOS = 6;

  const CURRENCY_SYMBOLS = {
    NGN: "₦", USD: "$", GBP: "£", EUR: "€", CAD: "CA$",
    AUD: "A$", GHS: "GH₵", KES: "KSh", ZAR: "R"
  };

  const TERM_DAYS = { receipt: 0, net7: 7, net14: 14, net30: 30, net60: 60 };

  /* ---------------------------------------------------------
     DOM REFERENCES
     --------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  const el = {
    modeEditBtn: $("modeEditBtn"),
    modePreviewBtn: $("modePreviewBtn"),

    printBtn: $("printBtn"),
    shareBtn: $("shareBtn"),
    downloadPdfBtn: $("downloadPdfBtn"),

    invoiceSheet: $("invoiceSheet"),

    invNumber: $("invNumber"),
    invDate: $("invDate"),
    invDueTerm: $("invDueTerm"),
    invDueDate: $("invDueDate"),

    logoBox: $("logoBox"),
    logoInput: $("logoInput"),
    docLogoImg: $("docLogoImg"),
    logoPlaceholder: $("logoPlaceholder"),
    removeLogoBtn: $("removeLogoBtn"),

    bizName: $("bizName"),
    bizEmail: $("bizEmail"),
    bizEmailError: $("bizEmailError"),
    bizPhone: $("bizPhone"),
    bizAddress: $("bizAddress"),
    bizWebsite: $("bizWebsite"),

    custName: $("custName"),
    custEmail: $("custEmail"),
    custEmailError: $("custEmailError"),
    custPhone: $("custPhone"),
    custAddress: $("custAddress"),

    itemsBody: $("itemsBody"),
    addItemBtn: $("addItemBtn"),

    previewSubtotal: $("previewSubtotal"),
    previewDiscountRow: $("previewDiscountRow"),
    previewDiscountLabel: $("previewDiscountLabel"),
    previewDiscount: $("previewDiscount"),
    previewTaxRow: $("previewTaxRow"),
    previewTaxLabel: $("previewTaxLabel"),
    previewTax: $("previewTax"),
    previewGrandTotal: $("previewGrandTotal"),
    previewPaidRow: $("previewPaidRow"),
    previewPaid: $("previewPaid"),
    previewBalanceRow: $("previewBalanceRow"),
    previewBalance: $("previewBalance"),

    invNotes: $("invNotes"),
    invTerms: $("invTerms"),

    docPaymentBlock: $("docPaymentBlock"),
    docPayBank: $("docPayBank"),
    docPayAcctName: $("docPayAcctName"),
    docPayAcctNumber: $("docPayAcctNumber"),
    docPayInstructions: $("docPayInstructions"),

    signatureDisplay: $("signatureDisplay"),
    signatureImg: $("signatureImg"),
    addSignatureBtn: $("addSignatureBtn"),
    removeSignatureBtn: $("removeSignatureBtn"),
    signaturePanel: $("signaturePanel"),
    signatureCanvas: $("signatureCanvas"),
    clearSignatureCanvasBtn: $("clearSignatureCanvasBtn"),
    saveSignatureDrawBtn: $("saveSignatureDrawBtn"),
    signatureUploadInput: $("signatureUploadInput"),
    cancelSignatureBtn: $("cancelSignatureBtn"),
    sigTabDraw: $("sigTabDraw"),
    sigTabUpload: $("sigTabUpload"),

    photosGrid: $("photosGrid"),
    photoInput: $("photoInput"),

    templateGrid: $("templateGrid"),
    colorGrid: $("colorGrid"),
    customColorInput: $("customColorInput"),

    taxValue: $("taxValue"),
    taxError: $("taxError"),
    discountType: $("discountType"),
    discountValue: $("discountValue"),
    discountError: $("discountError"),
    invCurrency: $("invCurrency"),

    paymentBankName: $("paymentBankName"),
    paymentAccountName: $("paymentAccountName"),
    paymentAccountNumber: $("paymentAccountNumber"),
    paymentInstructions: $("paymentInstructions"),
    amountPaidInput: $("amountPaidInput"),
    paymentShowToggle: $("paymentShowToggle"),

    newInvoiceBtn: $("newInvoiceBtn"),
    clearInvoiceBtn: $("clearInvoiceBtn")
  };

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */

  let state = null;
  let isDrawing = false;

  function defaultState() {
    const today = new Date();
    const due = addDays(today, TERM_DAYS.net14);

    return {
      template: "classic",
      accentColor: "#4f46e5",
      business: { name: "", email: "", phone: "", address: "", website: "", logo: "" },
      customer: { name: "", email: "", phone: "", address: "" },
      invoice: {
        number: generateInvoiceNumber(),
        date: toDateInputValue(today),
        dueTerm: "net14",
        dueDate: toDateInputValue(due),
        currency: "NGN"
      },
      items: [createEmptyItem()],
      discount: { type: "percentage", value: 0 },
      tax: { value: 0 },
      notes: "Thank you for your business.",
      terms: "Payment due within the stated terms.",
      payment: { bankName: "", accountName: "", accountNumber: "", instructions: "", showOnInvoice: false },
      amountPaid: 0,
      signature: { mode: "none", dataUrl: "" },
      photos: []
    };
  }

  function createEmptyItem() {
    return { id: generateId(), description: "", qty: 1, price: 0 };
  }

  function generateId() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function parseDateInput(value) {
    if (!value) return new Date();
    const parts = value.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /* ---------------------------------------------------------
     INVOICE NUMBER GENERATION
     --------------------------------------------------------- */

  function generateInvoiceNumber() {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const key = COUNTER_PREFIX + ym;
    let counter = parseInt(localStorage.getItem(key) || "0", 10) + 1;
    try { localStorage.setItem(key, String(counter)); } catch (e) { /* ignore */ }
    return `INV-${ym}-${String(counter).padStart(3, "0")}`;
  }

  /* ---------------------------------------------------------
     PERSISTENCE
     --------------------------------------------------------- */

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("QuickInvoice: could not save to localStorage (it may be full).", e);
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

  function mergeDefaults(saved) {
    const base = defaultState();
    const merged = Object.assign({}, base, saved);
    merged.business = Object.assign({}, base.business, saved.business);
    merged.customer = Object.assign({}, base.customer, saved.customer);
    merged.invoice = Object.assign({}, base.invoice, saved.invoice);
    merged.discount = Object.assign({}, base.discount, saved.discount);
    merged.tax = Object.assign({}, base.tax, saved.tax);
    merged.payment = Object.assign({}, base.payment, saved.payment);
    merged.signature = Object.assign({}, base.signature, saved.signature);
    merged.items = (saved.items && saved.items.length) ? saved.items : base.items;
    merged.photos = saved.photos || [];
    merged.amountPaid = typeof saved.amountPaid === "number" ? saved.amountPaid : 0;
    return merged;
  }

  /* ---------------------------------------------------------
     FORM <-> STATE SYNC
     --------------------------------------------------------- */

  function populateFormFromState() {
    el.bizName.value = state.business.name;
    el.bizEmail.value = state.business.email;
    el.bizPhone.value = state.business.phone;
    el.bizAddress.value = state.business.address;
    el.bizWebsite.value = state.business.website;
    setLogoDisplay(state.business.logo);

    el.custName.value = state.customer.name;
    el.custEmail.value = state.customer.email;
    el.custPhone.value = state.customer.phone;
    el.custAddress.value = state.customer.address;

    el.invNumber.value = state.invoice.number;
    el.invDate.value = state.invoice.date;
    el.invDueTerm.value = state.invoice.dueTerm || "custom";
    el.invDueDate.value = state.invoice.dueDate;
    el.invCurrency.value = state.invoice.currency;

    el.discountType.value = state.discount.type;
    el.discountValue.value = state.discount.value || "";
    el.taxValue.value = state.tax.value || "";

    el.invNotes.value = state.notes;
    el.invTerms.value = state.terms;

    el.paymentBankName.value = state.payment.bankName;
    el.paymentAccountName.value = state.payment.accountName;
    el.paymentAccountNumber.value = state.payment.accountNumber;
    el.paymentInstructions.value = state.payment.instructions;
    el.paymentShowToggle.checked = !!state.payment.showOnInvoice;
    el.amountPaidInput.value = state.amountPaid || "";

    el.invoiceSheet.setAttribute("data-template", state.template);
    setActiveButton(el.templateGrid, "template-swatch", "template", state.template);
    setActiveButton(el.colorGrid, "color-swatch", "color", state.accentColor);
    el.customColorInput.value = state.accentColor;
    el.invoiceSheet.style.setProperty("--accent", state.accentColor);

    renderItems();
    renderSignature();
    renderPhotos();
  }

  function setActiveButton(container, className, dataKey, value) {
    if (!container) return;
    container.querySelectorAll("." + className).forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset[dataKey] === value);
    });
  }

  function setLogoDisplay(dataUrl) {
    if (dataUrl) {
      el.docLogoImg.src = dataUrl;
      el.docLogoImg.classList.remove("hidden");
      el.logoPlaceholder.classList.add("hidden");
      el.removeLogoBtn.classList.remove("hidden");
    } else {
      el.docLogoImg.src = "";
      el.docLogoImg.classList.add("hidden");
      el.logoPlaceholder.classList.remove("hidden");
      el.removeLogoBtn.classList.add("hidden");
    }
  }

  /* ---------------------------------------------------------
     ITEMS: RENDER + EVENTS (single editable table)
     --------------------------------------------------------- */

  function renderItems() {
    el.itemsBody.innerHTML = "";
    const currency = state.invoice.currency;

    state.items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;

      const canRemove = state.items.length > 1;

      tr.innerHTML = `
        <td data-label="Description">
          <input type="text" class="doc-input item-desc" placeholder="Item or service description" maxlength="200" value="${escapeAttr(item.description)}">
        </td>
        <td data-label="Qty">
          <input type="number" class="doc-input item-qty" min="0" step="1" inputmode="numeric" value="${item.qty}">
        </td>
        <td data-label="Price">
          <input type="number" class="doc-input item-price" min="0" step="0.01" inputmode="decimal" value="${item.price}">
        </td>
        <td data-label="Total" class="item-total-cell">${formatCurrency(item.qty * item.price, currency)}</td>
        <td class="no-preview item-remove-cell">
          ${canRemove ? '<button type="button" class="item-remove-btn" aria-label="Remove item">✕</button>' : ""}
        </td>
      `;

      el.itemsBody.appendChild(tr);
    });
  }

  el.itemsBody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const item = state.items.find((i) => i.id === row.dataset.id);
    if (!item) return;

    if (e.target.classList.contains("item-desc")) {
      item.description = e.target.value;
    } else if (e.target.classList.contains("item-qty")) {
      let v = parseFloat(e.target.value);
      if (isNaN(v) || v < 0) v = 0;
      item.qty = v;
    } else if (e.target.classList.contains("item-price")) {
      let v = parseFloat(e.target.value);
      if (isNaN(v) || v < 0) v = 0;
      item.price = v;
    } else {
      return;
    }

    const totalCell = row.querySelector(".item-total-cell");
    if (totalCell) totalCell.textContent = formatCurrency(item.qty * item.price, state.invoice.currency);

    saveState();
    renderTotals();
  });

  el.itemsBody.addEventListener("click", (e) => {
    if (!e.target.classList.contains("item-remove-btn")) return;
    const row = e.target.closest("tr");
    if (!row) return;
    state.items = state.items.filter((i) => i.id !== row.dataset.id);
    saveState();
    renderItems();
    renderTotals();
  });

  el.addItemBtn.addEventListener("click", () => {
    state.items.push(createEmptyItem());
    saveState();
    renderItems();
    renderTotals();
  });

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------------------------------------------------
     CALCULATIONS
     --------------------------------------------------------- */

  function calculateTotals() {
    const subtotal = state.items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);

    let discountAmount = 0;
    const discountVal = Number(state.discount.value) || 0;
    discountAmount = state.discount.type === "percentage" ? subtotal * (discountVal / 100) : discountVal;
    if (discountAmount > subtotal) discountAmount = subtotal;
    if (discountAmount < 0) discountAmount = 0;

    const afterDiscount = subtotal - discountAmount;
    const taxVal = Number(state.tax.value) || 0;
    const taxAmount = afterDiscount * (taxVal / 100);
    const grandTotal = afterDiscount + taxAmount;

    const amountPaid = Math.max(0, Number(state.amountPaid) || 0);
    const balanceDue = Math.max(0, grandTotal - amountPaid);

    return { subtotal, discountAmount, afterDiscount, taxAmount, grandTotal, amountPaid, balanceDue };
  }

  /* ---------------------------------------------------------
     CURRENCY / DATE FORMATTING
     --------------------------------------------------------- */

  function formatCurrency(amount, currencyCode) {
    const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode + " ";
    const num = Number(amount) || 0;
    return symbol + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------------------------------------------------------
     TOTALS RENDERING
     --------------------------------------------------------- */

  function renderTotals() {
    const currency = state.invoice.currency;
    const t = calculateTotals();

    el.previewSubtotal.textContent = formatCurrency(t.subtotal, currency);

    if (t.discountAmount > 0) {
      el.previewDiscountRow.style.display = "";
      el.previewDiscountLabel.textContent = state.discount.type === "percentage"
        ? `Discount (${Number(state.discount.value) || 0}%)` : "Discount";
      el.previewDiscount.textContent = "-" + formatCurrency(t.discountAmount, currency);
    } else {
      el.previewDiscountRow.style.display = "none";
    }

    if (t.taxAmount > 0) {
      el.previewTaxRow.style.display = "";
      el.previewTaxLabel.textContent = `Tax (${Number(state.tax.value) || 0}%)`;
      el.previewTax.textContent = formatCurrency(t.taxAmount, currency);
    } else {
      el.previewTaxRow.style.display = "none";
    }

    el.previewGrandTotal.textContent = formatCurrency(t.grandTotal, currency);

    if (t.amountPaid > 0) {
      el.previewPaidRow.style.display = "";
      el.previewPaid.textContent = "-" + formatCurrency(t.amountPaid, currency);
      el.previewBalanceRow.style.display = "";
      el.previewBalance.textContent = formatCurrency(t.balanceDue, currency);
    } else {
      el.previewPaidRow.style.display = "none";
      el.previewBalanceRow.style.display = "none";
    }

    // also refresh item line totals for currency changes
    document.querySelectorAll("#itemsBody tr").forEach((row) => {
      const item = state.items.find((i) => i.id === row.dataset.id);
      const cell = row.querySelector(".item-total-cell");
      if (item && cell) cell.textContent = formatCurrency(item.qty * item.price, currency);
    });
  }

  function renderPaymentBlock() {
    const p = state.payment;
    const hasAny = p.bankName || p.accountName || p.accountNumber || p.instructions;
    if (p.showOnInvoice && hasAny) {
      el.docPaymentBlock.classList.remove("hidden");
      el.docPayBank.textContent = p.bankName || "—";
      el.docPayAcctName.textContent = p.accountName || "—";
      el.docPayAcctNumber.textContent = p.accountNumber || "—";
      el.docPayInstructions.textContent = p.instructions || "";
    } else {
      el.docPaymentBlock.classList.add("hidden");
    }
  }

  /* ---------------------------------------------------------
     VALIDATION
     --------------------------------------------------------- */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(inputEl, errorEl) {
    const val = inputEl.value.trim();
    if (!val) { inputEl.classList.remove("input-error"); errorEl.textContent = ""; return true; }
    if (!EMAIL_RE.test(val)) { inputEl.classList.add("input-error"); errorEl.textContent = "Please enter a valid email address."; return false; }
    inputEl.classList.remove("input-error"); errorEl.textContent = "";
    return true;
  }

  function validateNonNegativeNumber(inputEl, errorEl, label) {
    const val = inputEl.value.trim();
    if (val === "") { inputEl.classList.remove("input-error"); errorEl.textContent = ""; return true; }
    const num = Number(val);
    if (isNaN(num) || num < 0) { inputEl.classList.add("input-error"); errorEl.textContent = `${label} cannot be negative.`; return false; }
    inputEl.classList.remove("input-error"); errorEl.textContent = "";
    return true;
  }

  /* ---------------------------------------------------------
     EVENT BINDINGS — text fields
     --------------------------------------------------------- */

  function bindTextField(inputEl, getTarget, key, after) {
    inputEl.addEventListener("input", () => {
      getTarget()[key] = inputEl.value;
      saveState();
      if (after) after();
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
  });

  bindTextField(el.custName, () => state.customer, "name");
  bindTextField(el.custPhone, () => state.customer, "phone");
  bindTextField(el.custAddress, () => state.customer, "address");

  el.custEmail.addEventListener("input", () => {
    state.customer.email = el.custEmail.value;
    validateEmail(el.custEmail, el.custEmailError);
    saveState();
  });

  el.invNumber.addEventListener("input", () => { state.invoice.number = el.invNumber.value; saveState(); });

  el.invDate.addEventListener("input", () => {
    state.invoice.date = el.invDate.value;
    if (state.invoice.dueTerm !== "custom") {
      const days = TERM_DAYS[state.invoice.dueTerm] || 0;
      state.invoice.dueDate = toDateInputValue(addDays(parseDateInput(el.invDate.value), days));
      el.invDueDate.value = state.invoice.dueDate;
    }
    saveState();
  });

  el.invDueTerm.addEventListener("change", () => {
    state.invoice.dueTerm = el.invDueTerm.value;
    if (state.invoice.dueTerm !== "custom") {
      const days = TERM_DAYS[state.invoice.dueTerm] || 0;
      state.invoice.dueDate = toDateInputValue(addDays(parseDateInput(el.invDate.value), days));
      el.invDueDate.value = state.invoice.dueDate;
    }
    saveState();
  });

  el.invDueDate.addEventListener("input", () => {
    state.invoice.dueDate = el.invDueDate.value;
    state.invoice.dueTerm = "custom";
    el.invDueTerm.value = "custom";
    saveState();
  });

  el.invCurrency.addEventListener("change", () => {
    state.invoice.currency = el.invCurrency.value;
    saveState();
    renderTotals();
  });

  el.discountType.addEventListener("change", () => { state.discount.type = el.discountType.value; saveState(); renderTotals(); });

  el.discountValue.addEventListener("input", () => {
    const valid = validateNonNegativeNumber(el.discountValue, el.discountError, "Discount");
    if (el.discountValue.value === "") state.discount.value = 0;
    else if (valid) state.discount.value = Number(el.discountValue.value);
    saveState();
    renderTotals();
  });

  el.taxValue.addEventListener("input", () => {
    const valid = validateNonNegativeNumber(el.taxValue, el.taxError, "Tax");
    if (el.taxValue.value === "") state.tax.value = 0;
    else if (valid) state.tax.value = Number(el.taxValue.value);
    saveState();
    renderTotals();
  });

  bindTextField(el.invNotes, () => state, "notes");
  bindTextField(el.invTerms, () => state, "terms");

  /* Payment sidebar fields */
  bindTextField(el.paymentBankName, () => state.payment, "bankName", renderPaymentBlock);
  bindTextField(el.paymentAccountName, () => state.payment, "accountName", renderPaymentBlock);
  bindTextField(el.paymentAccountNumber, () => state.payment, "accountNumber", renderPaymentBlock);
  bindTextField(el.paymentInstructions, () => state.payment, "instructions", renderPaymentBlock);

  el.paymentShowToggle.addEventListener("change", () => {
    state.payment.showOnInvoice = el.paymentShowToggle.checked;
    saveState();
    renderPaymentBlock();
  });

  el.amountPaidInput.addEventListener("input", () => {
    let v = parseFloat(el.amountPaidInput.value);
    if (isNaN(v) || v < 0) v = 0;
    state.amountPaid = v;
    saveState();
    renderTotals();
  });

  /* ---------------------------------------------------------
     TEMPLATE + COLOR
     --------------------------------------------------------- */

  el.templateGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".template-swatch");
    if (!btn) return;
    state.template = btn.dataset.template;
    el.invoiceSheet.setAttribute("data-template", state.template);
    setActiveButton(el.templateGrid, "template-swatch", "template", state.template);
    saveState();
  });

  el.colorGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".color-swatch");
    if (!btn) return;
    state.accentColor = btn.dataset.color;
    applyAccentColor();
  });

  el.customColorInput.addEventListener("input", () => {
    state.accentColor = el.customColorInput.value;
    applyAccentColor();
  });

  function applyAccentColor() {
    el.invoiceSheet.style.setProperty("--accent", state.accentColor);
    setActiveButton(el.colorGrid, "color-swatch", "color", state.accentColor);
    saveState();
  }

  /* ---------------------------------------------------------
     LOGO UPLOAD
     --------------------------------------------------------- */

  el.logoInput.addEventListener("change", () => {
    const file = el.logoInput.files && el.logoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file (PNG, JPG or WEBP)."); el.logoInput.value = ""; return; }
    if (file.size > MAX_LOGO_BYTES) { alert("Logo image is too large. Please choose a file under 2MB."); el.logoInput.value = ""; return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      state.business.logo = e.target.result;
      setLogoDisplay(state.business.logo);
      saveState();
    };
    reader.onerror = () => alert("Could not read that image. Please try a different file.");
    reader.readAsDataURL(file);
  });

  el.removeLogoBtn.addEventListener("click", () => {
    state.business.logo = "";
    el.logoInput.value = "";
    setLogoDisplay("");
    saveState();
  });

  /* ---------------------------------------------------------
     SIGNATURE
     --------------------------------------------------------- */

  const sigCtx = el.signatureCanvas.getContext("2d");
  sigCtx.strokeStyle = "#1f2333";
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";

  function renderSignature() {
    if (state.signature.mode !== "none" && state.signature.dataUrl) {
      el.signatureImg.src = state.signature.dataUrl;
      el.signatureDisplay.classList.remove("hidden");
      el.addSignatureBtn.classList.add("hidden");
    } else {
      el.signatureDisplay.classList.add("hidden");
      el.addSignatureBtn.classList.remove("hidden");
    }
  }

  el.addSignatureBtn.addEventListener("click", () => {
    el.signaturePanel.classList.remove("hidden");
  });

  el.cancelSignatureBtn.addEventListener("click", () => {
    el.signaturePanel.classList.add("hidden");
  });

  el.removeSignatureBtn.addEventListener("click", () => {
    state.signature = { mode: "none", dataUrl: "" };
    saveState();
    renderSignature();
  });

  document.querySelectorAll(".signature-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".signature-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const which = tab.dataset.sigTab;
      el.sigTabDraw.classList.toggle("hidden", which !== "draw");
      el.sigTabUpload.classList.toggle("hidden", which !== "upload");
    });
  });

  function getCanvasPoint(evt) {
    const rect = el.signatureCanvas.getBoundingClientRect();
    const scaleX = el.signatureCanvas.width / rect.width;
    const scaleY = el.signatureCanvas.height / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDraw(evt) {
    isDrawing = true;
    const p = getCanvasPoint(evt);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
    evt.preventDefault();
  }

  function moveDraw(evt) {
    if (!isDrawing) return;
    const p = getCanvasPoint(evt);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    evt.preventDefault();
  }

  function endDraw() { isDrawing = false; }

  el.signatureCanvas.addEventListener("mousedown", startDraw);
  el.signatureCanvas.addEventListener("mousemove", moveDraw);
  window.addEventListener("mouseup", endDraw);
  el.signatureCanvas.addEventListener("touchstart", startDraw, { passive: false });
  el.signatureCanvas.addEventListener("touchmove", moveDraw, { passive: false });
  el.signatureCanvas.addEventListener("touchend", endDraw);

  el.clearSignatureCanvasBtn.addEventListener("click", () => {
    sigCtx.clearRect(0, 0, el.signatureCanvas.width, el.signatureCanvas.height);
  });

  el.saveSignatureDrawBtn.addEventListener("click", () => {
    state.signature = { mode: "draw", dataUrl: el.signatureCanvas.toDataURL("image/png") };
    saveState();
    renderSignature();
    el.signaturePanel.classList.add("hidden");
    sigCtx.clearRect(0, 0, el.signatureCanvas.width, el.signatureCanvas.height);
  });

  el.signatureUploadInput.addEventListener("change", () => {
    const file = el.signatureUploadInput.files && el.signatureUploadInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    if (file.size > MAX_LOGO_BYTES) { alert("Signature image is too large. Please choose a file under 2MB."); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      state.signature = { mode: "image", dataUrl: e.target.result };
      saveState();
      renderSignature();
      el.signaturePanel.classList.add("hidden");
      el.signatureUploadInput.value = "";
    };
    reader.onerror = () => alert("Could not read that image. Please try a different file.");
    reader.readAsDataURL(file);
  });

  /* ---------------------------------------------------------
     PHOTOS / ATTACHMENTS
     --------------------------------------------------------- */

  function renderPhotos() {
    el.photosGrid.innerHTML = "";
    state.photos.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.dataset.id = photo.id;
      card.innerHTML = `
        <img src="${photo.dataUrl}" class="photo-card__img" alt="${escapeAttr(photo.caption) || "Attached photo"}">
        <input type="text" class="photo-card__caption no-preview" placeholder="Caption (optional)" maxlength="60" value="${escapeAttr(photo.caption)}">
        <button type="button" class="photo-card__remove no-preview">Remove</button>
      `;
      el.photosGrid.appendChild(card);
    });
  }

  el.photoInput.addEventListener("change", () => {
    const files = Array.from(el.photoInput.files || []);
    if (!files.length) return;

    if (state.photos.length + files.length > MAX_PHOTOS) {
      alert(`You can attach up to ${MAX_PHOTOS} photos.`);
      el.photoInput.value = "";
      return;
    }

    let processed = 0;
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) { alert(`"${file.name}" is not an image and was skipped.`); processed++; return; }
      if (file.size > MAX_PHOTO_BYTES) { alert(`"${file.name}" is over 2MB and was skipped.`); processed++; return; }

      const reader = new FileReader();
      reader.onload = (e) => {
        state.photos.push({ id: generateId(), dataUrl: e.target.result, caption: "" });
        processed++;
        saveState();
        renderPhotos();
      };
      reader.onerror = () => { processed++; };
      reader.readAsDataURL(file);
    });

    el.photoInput.value = "";
  });

  el.photosGrid.addEventListener("input", (e) => {
    if (!e.target.classList.contains("photo-card__caption")) return;
    const card = e.target.closest(".photo-card");
    const photo = state.photos.find((p) => p.id === card.dataset.id);
    if (!photo) return;
    photo.caption = e.target.value;
    saveState();
  });

  el.photosGrid.addEventListener("click", (e) => {
    if (!e.target.classList.contains("photo-card__remove")) return;
    const card = e.target.closest(".photo-card");
    state.photos = state.photos.filter((p) => p.id !== card.dataset.id);
    saveState();
    renderPhotos();
  });

  /* ---------------------------------------------------------
     NEW / CLEAR INVOICE
     --------------------------------------------------------- */

  el.newInvoiceBtn.addEventListener("click", () => {
    const hasContent = state.customer.name || state.items.some((i) => i.description) || state.photos.length;
    if (hasContent) {
      const ok = confirm("Start a new invoice? Your current invoice will be replaced (business details, template and color are kept).");
      if (!ok) return;
    }
    const keepBusiness = { ...state.business };
    const keepTemplate = state.template;
    const keepColor = state.accentColor;
    const keepPayment = { ...state.payment };
    state = defaultState();
    state.business = keepBusiness;
    state.template = keepTemplate;
    state.accentColor = keepColor;
    state.payment = keepPayment;
    saveState();
    populateFormFromState();
    renderTotals();
    renderPaymentBlock();
  });

  el.clearInvoiceBtn.addEventListener("click", () => {
    const ok = confirm("Clear all invoice data? This cannot be undone.");
    if (!ok) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    state = defaultState();
    populateFormFromState();
    renderTotals();
    renderPaymentBlock();
  });

  /* ---------------------------------------------------------
     EDIT / PREVIEW MODE TOGGLE
     --------------------------------------------------------- */

  function setPreviewMode(isPreview) {
    el.invoiceSheet.classList.toggle("is-previewing", isPreview);
    el.modeEditBtn.classList.toggle("is-active", !isPreview);
    el.modePreviewBtn.classList.toggle("is-active", isPreview);
    el.modeEditBtn.setAttribute("aria-selected", String(!isPreview));
    el.modePreviewBtn.setAttribute("aria-selected", String(isPreview));
  }

  el.modeEditBtn.addEventListener("click", () => setPreviewMode(false));
  el.modePreviewBtn.addEventListener("click", () => setPreviewMode(true));

  /* ---------------------------------------------------------
     PRINT
     --------------------------------------------------------- */

  el.printBtn.addEventListener("click", () => {
    const wasPreview = el.invoiceSheet.classList.contains("is-previewing");
    if (!wasPreview) el.invoiceSheet.classList.add("is-capturing");
    window.print();
    if (!wasPreview) {
      // most browsers fire this synchronously-ish after the print dialog closes
      const restore = () => { el.invoiceSheet.classList.remove("is-capturing"); window.removeEventListener("afterprint", restore); };
      window.addEventListener("afterprint", restore);
      setTimeout(restore, 3000); // fallback in case afterprint doesn't fire
    }
  });

  /* ---------------------------------------------------------
     PDF GENERATION (shared by Download + Share)
     --------------------------------------------------------- */

  async function generatePdfBlob() {
    const target = el.invoiceSheet;
    const wasPreview = target.classList.contains("is-previewing");
    if (!wasPreview) target.classList.add("is-capturing");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const canvas = await html2canvas(target, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
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
      const blob = pdf.output("blob");
      return { blob, fileName };
    } finally {
      if (!wasPreview) target.classList.remove("is-capturing");
    }
  }

  el.downloadPdfBtn.addEventListener("click", async () => {
    if (typeof html2canvas === "undefined" || typeof window.jspdf === "undefined") {
      alert("PDF tools are still loading. Please try again in a moment.");
      return;
    }
    const original = el.downloadPdfBtn.innerHTML;
    el.downloadPdfBtn.disabled = true;
    el.downloadPdfBtn.textContent = "Generating…";
    try {
      const { blob, fileName } = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error("QuickInvoice: PDF generation failed.", err);
      alert("Sorry, something went wrong generating the PDF. Please try again.");
    } finally {
      el.downloadPdfBtn.disabled = false;
      el.downloadPdfBtn.innerHTML = original;
    }
  });

  /* ---------------------------------------------------------
     SHARE
     --------------------------------------------------------- */

  el.shareBtn.addEventListener("click", async () => {
    if (typeof html2canvas === "undefined" || typeof window.jspdf === "undefined") {
      alert("Sharing tools are still loading. Please try again in a moment.");
      return;
    }
    const original = el.shareBtn.innerHTML;
    el.shareBtn.disabled = true;
    el.shareBtn.textContent = "Preparing…";

    try {
      const { blob, fileName } = await generatePdfBlob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${state.invoice.number || ""}`,
          text: `Invoice ${state.invoice.number || ""} from ${state.business.name || "QuickInvoice"}`
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        alert("Sharing isn't supported in this browser, so the PDF was downloaded instead — you can share that file manually.");
      }
    } catch (err) {
      if (err && err.name !== "AbortError") {
        console.error("QuickInvoice: share failed.", err);
        alert("Sorry, sharing didn't work. Please try downloading the PDF instead.");
      }
    } finally {
      el.shareBtn.disabled = false;
      el.shareBtn.innerHTML = original;
    }
  });

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */

  function init() {
    const saved = loadState();
    state = saved ? mergeDefaults(saved) : defaultState();

    populateFormFromState();
    renderTotals();
    renderPaymentBlock();
  }

  init();
})();
