// ── Storage keys ──────────────────────────────────────────
const CUSTOMERS_KEY = "hhcrm_customers";

// ── State ─────────────────────────────────────────────────
const state = {
  customers: loadCustomers(),
  currentCustomerId: null,
  editingCustomerId: null,
  editingContactId: null,
};

// ── Load / Save ────────────────────────────────────────────
function loadCustomers() {
  const raw = localStorage.getItem(CUSTOMERS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveCustomers() {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(state.customers));
}

// ── Helpers ────────────────────────────────────────────────
function generateId() {
  return crypto.randomUUID();
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getCustomer(id) {
  return state.customers.find(c => c.id === id);
}

// ── Elements ───────────────────────────────────────────────
const viewCustomers    = document.getElementById("view-customers");
const viewDetail       = document.getElementById("view-detail");
const customerList     = document.getElementById("customer-list");
const customerCount    = document.getElementById("customer-count");
const searchInput      = document.getElementById("search-input");
const btnAddCustomer   = document.getElementById("btn-add-customer");
const btnBack          = document.getElementById("btn-back");
const btnEditCustomer  = document.getElementById("btn-edit-customer");
const btnDeleteCustomer= document.getElementById("btn-delete-customer");
const btnAddContact    = document.getElementById("btn-add-contact");
const btnAddNote       = document.getElementById("btn-add-note");
const btnSaveService   = document.getElementById("btn-save-service");

// ── Init ───────────────────────────────────────────────────
renderCustomerList();

// ── Customer List ──────────────────────────────────────────
function renderCustomerList(filter = "") {
  const q = filter.toLowerCase();
  const filtered = state.customers.filter(c => {
    return (
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  });

  customerCount.textContent = `${state.customers.length} customer${state.customers.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    customerList.innerHTML = `<div class="empty-state"><p>No customers found.</p><p>Click "+ Add Customer" to get started.</p></div>`;
    return;
  }

  customerList.innerHTML = filtered.map(c => `
    <div class="customer-card" data-id="${c.id}">
      <div>
        <div class="customer-card__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</div>
        <div class="customer-card__meta">
          ${c.address ? `<span>📍 ${escapeHtml(c.address)}</span>` : ""}
          ${c.phone ? `<span>📞 ${escapeHtml(c.phone)}</span>` : ""}
          ${c.email ? `<span>✉️ ${escapeHtml(c.email)}</span>` : ""}
        </div>
      </div>
      <div>
        <span class="customer-card__badge badge--${c.status || "active"}">${c.status || "active"}</span>
      </div>
    </div>
  `).join("");

  customerList.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openCustomer(el.dataset.id));
  });
}

searchInput.addEventListener("input", () => renderCustomerList(searchInput.value));

// ── Open Customer Detail ───────────────────────────────────
function openCustomer(id) {
  state.currentCustomerId = id;
  const c = getCustomer(id);
  if (!c) return;

  document.getElementById("detail-name").textContent = `${c.firstName} ${c.lastName}`;
  document.getElementById("detail-address").textContent = c.address || "";
  document.getElementById("detail-plan").value = c.plan || "";
  document.getElementById("detail-start-date").value = c.startDate || "";
  document.getElementById("detail-minutes").value = c.minutesLimit || 75;
  document.getElementById("detail-status").value = c.status || "active";

  document.getElementById("btn-open-scheduler").onclick = () => {
    window.open(`https://scottstallbaum.github.io/HouseHeroSchedulerv1/?customer=${encodeURIComponent(c.firstName + " " + c.lastName)}`, "_blank");
  };

  renderContacts(c);
  renderNotes(c);

  viewCustomers.style.display = "none";
  viewDetail.style.display = "block";
}

btnBack.addEventListener("click", () => {
  viewDetail.style.display = "none";
  viewCustomers.style.display = "block";
  state.currentCustomerId = null;
  renderCustomerList(searchInput.value);
});

// ── Contacts ───────────────────────────────────────────────
function renderContacts(c) {
  const list = document.getElementById("contact-list");
  const contacts = c.contacts || [];

  if (contacts.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>No contacts yet.</p></div>`;
    return;
  }

  list.innerHTML = contacts.map(ct => `
    <div class="contact-item">
      <div>
        <div class="contact-item__name">${escapeHtml(ct.firstName)} ${escapeHtml(ct.lastName)}${ct.role ? ` <span style="font-weight:400;font-size:0.82rem;color:var(--muted);">— ${escapeHtml(ct.role)}</span>` : ""}</div>
        <div class="contact-item__meta">
          ${ct.phone ? `📞 ${escapeHtml(ct.phone)}<br>` : ""}
          ${ct.email ? `✉️ ${escapeHtml(ct.email)}<br>` : ""}
          ${ct.preferred ? `Prefers: ${escapeHtml(ct.preferred)}` : ""}
        </div>
      </div>
      <div class="contact-item__actions">
        <button class="ghost icon-btn" data-action="edit-contact" data-id="${ct.id}">Edit</button>
        <button class="ghost danger icon-btn" data-action="delete-contact" data-id="${ct.id}">✕</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-action='edit-contact']").forEach(btn => {
    btn.addEventListener("click", () => openEditContact(c, btn.dataset.id));
  });
  list.querySelectorAll("[data-action='delete-contact']").forEach(btn => {
    btn.addEventListener("click", () => deleteContact(c, btn.dataset.id));
  });
}

function openAddContact() {
  state.editingContactId = null;
  document.getElementById("modal-contact-title").textContent = "Add Contact";
  document.getElementById("contact-first").value = "";
  document.getElementById("contact-last").value = "";
  document.getElementById("contact-role").value = "";
  document.getElementById("contact-email").value = "";
  document.getElementById("contact-phone").value = "";
  document.getElementById("contact-preferred").value = "phone";
  openModal("modal-contact");
}

function openEditContact(c, contactId) {
  const ct = (c.contacts || []).find(x => x.id === contactId);
  if (!ct) return;
  state.editingContactId = contactId;
  document.getElementById("modal-contact-title").textContent = "Edit Contact";
  document.getElementById("contact-first").value = ct.firstName || "";
  document.getElementById("contact-last").value = ct.lastName || "";
  document.getElementById("contact-role").value = ct.role || "";
  document.getElementById("contact-email").value = ct.email || "";
  document.getElementById("contact-phone").value = ct.phone || "";
  document.getElementById("contact-preferred").value = ct.preferred || "phone";
  openModal("modal-contact");
}

function deleteContact(c, contactId) {
  if (!confirm("Delete this contact?")) return;
  c.contacts = (c.contacts || []).filter(x => x.id !== contactId);
  saveCustomers();
  renderContacts(c);
}

document.getElementById("form-contact").addEventListener("submit", e => {
  e.preventDefault();
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  if (!c.contacts) c.contacts = [];

  const data = {
    firstName: document.getElementById("contact-first").value.trim(),
    lastName: document.getElementById("contact-last").value.trim(),
    role: document.getElementById("contact-role").value.trim(),
    email: document.getElementById("contact-email").value.trim(),
    phone: document.getElementById("contact-phone").value.trim(),
    preferred: document.getElementById("contact-preferred").value,
  };

  if (state.editingContactId) {
    const idx = c.contacts.findIndex(x => x.id === state.editingContactId);
    if (idx !== -1) c.contacts[idx] = { ...c.contacts[idx], ...data };
  } else {
    c.contacts.push({ id: generateId(), ...data });
  }

  saveCustomers();
  renderContacts(c);
  closeModal("modal-contact");
});

btnAddContact.addEventListener("click", openAddContact);

// ── Notes ──────────────────────────────────────────────────
function renderNotes(c) {
  const list = document.getElementById("note-list");
  const notes = (c.notes || []).slice().reverse();

  if (notes.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>No notes yet.</p></div>`;
    return;
  }

  list.innerHTML = notes.map(n => `
    <div class="note-item">
      <div>
        <div class="note-item__text">${escapeHtml(n.text)}</div>
        <div class="note-item__date">${formatDate(n.createdAt)}</div>
      </div>
      <button class="ghost danger icon-btn" data-action="delete-note" data-id="${n.id}">✕</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-action='delete-note']").forEach(btn => {
    btn.addEventListener("click", () => deleteNote(c, btn.dataset.id));
  });
}

function deleteNote(c, noteId) {
  if (!confirm("Delete this note?")) return;
  c.notes = (c.notes || []).filter(n => n.id !== noteId);
  saveCustomers();
  renderNotes(c);
}

document.getElementById("form-note").addEventListener("submit", e => {
  e.preventDefault();
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  if (!c.notes) c.notes = [];

  c.notes.push({
    id: generateId(),
    text: document.getElementById("note-text").value.trim(),
    createdAt: new Date().toISOString(),
  });

  saveCustomers();
  renderNotes(c);
  closeModal("modal-note");
  document.getElementById("note-text").value = "";
});

btnAddNote.addEventListener("click", () => openModal("modal-note"));

// ── Service Details ────────────────────────────────────────
btnSaveService.addEventListener("click", () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  c.plan = document.getElementById("detail-plan").value;
  c.startDate = document.getElementById("detail-start-date").value;
  c.minutesLimit = Number(document.getElementById("detail-minutes").value) || 75;
  c.status = document.getElementById("detail-status").value;
  saveCustomers();

  btnSaveService.textContent = "Saved ✓";
  setTimeout(() => { btnSaveService.textContent = "Save Service Details"; }, 2000);
  renderCustomerList(searchInput.value);
});

// ── Add / Edit Customer modal ──────────────────────────────
btnAddCustomer.addEventListener("click", () => {
  state.editingCustomerId = null;
  document.getElementById("modal-customer-title").textContent = "Add Customer";
  document.getElementById("cust-first").value = "";
  document.getElementById("cust-last").value = "";
  document.getElementById("cust-address").value = "";
  document.getElementById("cust-email").value = "";
  document.getElementById("cust-phone").value = "";
  openModal("modal-customer");
});

btnEditCustomer.addEventListener("click", () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  state.editingCustomerId = c.id;
  document.getElementById("modal-customer-title").textContent = "Edit Customer";
  document.getElementById("cust-first").value = c.firstName || "";
  document.getElementById("cust-last").value = c.lastName || "";
  document.getElementById("cust-address").value = c.address || "";
  document.getElementById("cust-email").value = c.email || "";
  document.getElementById("cust-phone").value = c.phone || "";
  openModal("modal-customer");
});

document.getElementById("form-customer").addEventListener("submit", e => {
  e.preventDefault();
  const data = {
    firstName: document.getElementById("cust-first").value.trim(),
    lastName: document.getElementById("cust-last").value.trim(),
    address: document.getElementById("cust-address").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
  };

  if (state.editingCustomerId) {
    const idx = state.customers.findIndex(c => c.id === state.editingCustomerId);
    if (idx !== -1) {
      state.customers[idx] = { ...state.customers[idx], ...data };
      // Update detail view header
      document.getElementById("detail-name").textContent = `${data.firstName} ${data.lastName}`;
      document.getElementById("detail-address").textContent = data.address;
    }
  } else {
    state.customers.push({
      id: generateId(),
      ...data,
      status: "active",
      contacts: [],
      notes: [],
    });
  }

  saveCustomers();
  renderCustomerList(searchInput.value);
  closeModal("modal-customer");
});

// ── Delete Customer ────────────────────────────────────────
btnDeleteCustomer.addEventListener("click", () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  if (!confirm(`Delete ${c.firstName} ${c.lastName}? This cannot be undone.`)) return;
  state.customers = state.customers.filter(x => x.id !== state.currentCustomerId);
  saveCustomers();
  viewDetail.style.display = "none";
  viewCustomers.style.display = "block";
  state.currentCustomerId = null;
  renderCustomerList(searchInput.value);
});

// ── Modal helpers ──────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).style.display = "flex";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal(modal.id);
  });
});
