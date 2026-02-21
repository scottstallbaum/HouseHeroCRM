// ── Supabase ───────────────────────────────────────────────
const { createClient } = window.supabase;
const sb = createClient(
  "https://qjnzyheszvkfwlgjudgo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbnp5aGVzenZrZndsZ2p1ZGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU5ODYsImV4cCI6MjA4NzIwMTk4Nn0.mHvG_WxpQbNAIpzX-iVa7fBm7wuXfFkVBsig3gLVhQI"
);

// ── State ──────────────────────────────────────────────────
const state = {
  customers: [],
  currentCustomerId: null,
  editingCustomerId: null,
  editingContactId: null,
  prospects: [],
  currentProspectId: null,
  editingProspectId: null,
  activePipelineStage: "all",
  schedules: {},
  scheduleEditMode: false,
};

// ── DB Mappers ─────────────────────────────────────────────
function customerFromDb(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    street: row.street || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    email: row.email || "",
    phone: row.phone || "",
    status: row.status || "active",
    plan: row.plan || "",
    startDate: row.start_date || "",
    minutesLimit: row.minutes_limit || 75,
    secondary: row.secondary || null,
    contacts: row.contacts || [],
    notes: row.notes || [],
  };
}

function customerToDb(c) {
  return {
    first_name: c.firstName,
    last_name: c.lastName,
    street: c.street || null,
    city: c.city || null,
    state: c.state || null,
    zip: c.zip || null,
    email: c.email || null,
    phone: c.phone || null,
    status: c.status || "active",
    plan: c.plan || null,
    start_date: c.startDate || null,
    minutes_limit: c.minutesLimit || 75,
    secondary: c.secondary || null,
    contacts: c.contacts || [],
    notes: c.notes || [],
  };
}

function prospectFromDb(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    street: row.street || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    email: row.email || "",
    phone: row.phone || "",
    stage: row.stage || "new",
    source: row.source || "",
    lastContactDate: row.last_contact_date || "",
    followUpDate: row.follow_up_date || "",
    notes: row.notes || [],
  };
}

function prospectToDb(p) {
  return {
    first_name: p.firstName,
    last_name: p.lastName,
    street: p.street || null,
    city: p.city || null,
    state: p.state || null,
    zip: p.zip || null,
    email: p.email || null,
    phone: p.phone || null,
    stage: p.stage || "new",
    source: p.source || null,
    last_contact_date: p.lastContactDate || null,
    follow_up_date: p.followUpDate || null,
    notes: p.notes || [],
  };
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

function getFullAddress(c) {
  const parts = [c.street, c.city, c.state ? c.state.toUpperCase() : null, c.zip].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return c.address || "";
}

// ── Supabase DB Operations ─────────────────────────────────
async function dbInsertCustomer(data) {
  const { data: row, error } = await sb.from("customers").insert(customerToDb(data)).select().single();
  if (error) { console.error(error); alert("Error saving customer: " + error.message); return null; }
  return customerFromDb(row);
}

async function dbUpdateCustomer(c) {
  const { error } = await sb.from("customers").update(customerToDb(c)).eq("id", c.id);
  if (error) console.error("Update customer error:", error);
}

async function dbDeleteCustomer(id) {
  const { error } = await sb.from("customers").delete().eq("id", id);
  if (error) console.error("Delete customer error:", error);
}

async function dbInsertProspect(data) {
  const { data: row, error } = await sb.from("prospects").insert(prospectToDb(data)).select().single();
  if (error) { console.error(error); alert("Error saving prospect: " + error.message); return null; }
  return prospectFromDb(row);
}

async function dbUpdateProspect(p) {
  const { error } = await sb.from("prospects").update(prospectToDb(p)).eq("id", p.id);
  if (error) console.error("Update prospect error:", error);
}

async function dbDeleteProspect(id) {
  const { error } = await sb.from("prospects").delete().eq("id", id);
  if (error) console.error("Delete prospect error:", error);
}

// ── Elements ───────────────────────────────────────────────
const viewCustomers     = document.getElementById("view-customers");
const viewDetail        = document.getElementById("view-detail");
const customerList      = document.getElementById("customer-list");
const customerCount     = document.getElementById("customer-count");
const searchInput       = document.getElementById("search-input");
const btnAddCustomer    = document.getElementById("btn-add-customer");
const btnBack           = document.getElementById("btn-back");
const btnEditCustomer   = document.getElementById("btn-edit-customer");
const btnDeleteCustomer = document.getElementById("btn-delete-customer");
const btnAddContact     = document.getElementById("btn-add-contact");
const btnAddNote        = document.getElementById("btn-add-note");
const btnSaveService    = document.getElementById("btn-save-service");

// ── Init ───────────────────────────────────────────────────
async function init() {
  customerList.innerHTML = `<div class="empty-state"><p>Loading...</p></div>`;
  const [custResult, prospResult] = await Promise.all([
    sb.from("customers").select("*").order("created_at", { ascending: false }),
    sb.from("prospects").select("*").order("created_at", { ascending: false }),
  ]);
  if (custResult.error) console.error("Load customers error:", custResult.error);
  if (prospResult.error) console.error("Load prospects error:", prospResult.error);
  state.customers = (custResult.data || []).map(customerFromDb);
  state.prospects = (prospResult.data || []).map(prospectFromDb);
  renderCustomerList();
}

init();

// ── Customer List ──────────────────────────────────────────
function renderCustomerList(filter = "") {
  const q = filter.toLowerCase();
  const filtered = state.customers.filter(c => {
    const secName = c.secondary?.firstName
      ? `${c.secondary.firstName} ${c.secondary.lastName}`.toLowerCase()
      : "";
    return (
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      secName.includes(q) ||
      getFullAddress(c).toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.secondary?.phone || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.secondary?.email || "").toLowerCase().includes(q)
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
        <div class="customer-card__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}${c.secondary?.firstName ? ` <span class="customer-card__secondary">&amp; ${escapeHtml(c.secondary.firstName)} ${escapeHtml(c.secondary.lastName)} <span class="customer-card__rel">(${escapeHtml(c.secondary.relationship || "secondary")})</span></span>` : ""}</div>
        <div class="customer-card__meta">
          ${getFullAddress(c) ? `<span>&#128205; ${escapeHtml(getFullAddress(c))}</span>` : ""}
          ${c.phone ? `<span>&#128222; ${escapeHtml(c.phone)}</span>` : ""}
          ${c.email ? `<span>&#9993; ${escapeHtml(c.email)}</span>` : ""}
          ${c.startDate ? `<span>&#128197; Since ${formatDate(c.startDate)}</span>` : ""}
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
  const secondaryLine = c.secondary?.firstName
    ? ` & ${c.secondary.firstName} ${c.secondary.lastName}${c.secondary.relationship ? ` (${c.secondary.relationship})` : ""}`
    : "";
  document.getElementById("detail-address").textContent = getFullAddress(c) + (secondaryLine ? " · " + secondaryLine : "");
  document.getElementById("detail-plan").value = c.plan || "";
  document.getElementById("detail-start-date").value = c.startDate || "";
  document.getElementById("detail-minutes").value = c.minutesLimit || 75;
  document.getElementById("detail-status").value = c.status || "active";

  document.getElementById("btn-open-scheduler").onclick = () => {
    window.open(`https://scottstallbaum.github.io/HouseHeroSchedulerv1/?customer=${encodeURIComponent(c.firstName + " " + c.lastName)}`, "_blank");
  };

  renderAccountHolders(c);
  renderContacts(c);
  renderNotes(c);
  openScheduleForCustomer(id);

  viewCustomers.style.display = "none";
  viewDetail.style.display = "block";
}

btnBack.addEventListener("click", () => {
  viewDetail.style.display = "none";
  viewCustomers.style.display = "block";
  state.currentCustomerId = null;
  renderCustomerList(searchInput.value);
});

// ── Account Holders ────────────────────────────────────────
function renderAccountHolders(c) {
  const el = document.getElementById("account-holders");
  const holderCard = (label, h) => `
    <div class="holder-card">
      <div class="holder-card__label">${escapeHtml(label)}</div>
      <div class="holder-card__name">${escapeHtml(h.firstName)} ${escapeHtml(h.lastName)}</div>
      ${h.phone ? `<div class="holder-card__row">&#128222; <a href="tel:${escapeHtml(h.phone)}">${escapeHtml(h.phone)}</a></div>` : ""}
      ${h.email ? `<div class="holder-card__row">&#9993; <a href="mailto:${escapeHtml(h.email)}">${escapeHtml(h.email)}</a></div>` : ""}
    </div>`;
  let html = holderCard("Primary", { firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email });
  if (c.secondary?.firstName) {
    const relLabel = c.secondary.relationship
      ? c.secondary.relationship.charAt(0).toUpperCase() + c.secondary.relationship.slice(1)
      : "Secondary";
    html += holderCard(relLabel, c.secondary);
  }
  el.innerHTML = html;
}

// ── Contacts ───────────────────────────────────────────────
function renderContacts(c) {
  const list = document.getElementById("contact-list");
  const contacts = c.contacts || [];

  if (contacts.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = `<div class="additional-contacts-label">Additional Contacts</div>` + contacts.map(ct => `
    <div class="contact-item">
      <div>
        <div class="contact-item__name">${escapeHtml(ct.firstName)} ${escapeHtml(ct.lastName)}${ct.role ? ` <span style="font-weight:400;font-size:0.82rem;color:var(--muted);">— ${escapeHtml(ct.role)}</span>` : ""}</div>
        <div class="contact-item__meta">
          ${ct.phone ? `&#128222; ${escapeHtml(ct.phone)}<br>` : ""}
          ${ct.email ? `&#9993; ${escapeHtml(ct.email)}<br>` : ""}
          ${ct.preferred ? `Prefers: ${escapeHtml(ct.preferred)}` : ""}
        </div>
      </div>
      <div class="contact-item__actions">
        <button class="ghost icon-btn" data-action="edit-contact" data-id="${ct.id}">Edit</button>
        <button class="ghost danger icon-btn" data-action="delete-contact" data-id="${ct.id}">&#10005;</button>
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

async function deleteContact(c, contactId) {
  if (!confirm("Delete this contact?")) return;
  c.contacts = (c.contacts || []).filter(x => x.id !== contactId);
  await dbUpdateCustomer(c);
  renderContacts(c);
}

document.getElementById("form-contact").addEventListener("submit", async e => {
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

  await dbUpdateCustomer(c);
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
      <button class="ghost danger icon-btn" data-action="delete-note" data-id="${n.id}">&#10005;</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-action='delete-note']").forEach(btn => {
    btn.addEventListener("click", () => deleteNote(c, btn.dataset.id));
  });
}

async function deleteNote(c, noteId) {
  if (!confirm("Delete this note?")) return;
  c.notes = (c.notes || []).filter(n => n.id !== noteId);
  await dbUpdateCustomer(c);
  renderNotes(c);
}

document.getElementById("form-note").addEventListener("submit", async e => {
  e.preventDefault();
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  if (!c.notes) c.notes = [];

  c.notes.push({
    id: generateId(),
    text: document.getElementById("note-text").value.trim(),
    createdAt: new Date().toISOString(),
  });

  await dbUpdateCustomer(c);
  renderNotes(c);
  closeModal("modal-note");
  document.getElementById("note-text").value = "";
});

btnAddNote.addEventListener("click", () => openModal("modal-note"));

// ── Service Details ────────────────────────────────────────
btnSaveService.addEventListener("click", async () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  c.plan = document.getElementById("detail-plan").value;
  c.startDate = document.getElementById("detail-start-date").value;
  c.minutesLimit = Number(document.getElementById("detail-minutes").value) || 75;
  c.status = document.getElementById("detail-status").value;
  await dbUpdateCustomer(c);

  btnSaveService.textContent = "Saved \u2713";
  setTimeout(() => { btnSaveService.textContent = "Save Service Details"; }, 2000);
  renderCustomerList(searchInput.value);
});

// ── Add / Edit Customer modal ──────────────────────────────
btnAddCustomer.addEventListener("click", () => {
  state.editingCustomerId = null;
  document.getElementById("modal-customer-title").textContent = "Add Customer";
  document.getElementById("cust-first").value = "";
  document.getElementById("cust-last").value = "";
  document.getElementById("cust-street").value = "";
  document.getElementById("cust-city").value = "";
  document.getElementById("cust-state").value = "";
  document.getElementById("cust-zip").value = "";
  document.getElementById("cust-email").value = "";
  document.getElementById("cust-phone").value = "";
  document.getElementById("cust-start-date").value = "";
  document.getElementById("cust-second-first").value = "";
  document.getElementById("cust-second-last").value = "";
  document.getElementById("cust-second-rel").value = "";
  document.getElementById("cust-second-phone").value = "";
  document.getElementById("cust-second-email").value = "";
  openModal("modal-customer");
});

btnEditCustomer.addEventListener("click", () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  state.editingCustomerId = c.id;
  document.getElementById("modal-customer-title").textContent = "Edit Customer";
  document.getElementById("cust-first").value = c.firstName || "";
  document.getElementById("cust-last").value = c.lastName || "";
  document.getElementById("cust-street").value = c.street || "";
  document.getElementById("cust-city").value = c.city || "";
  document.getElementById("cust-state").value = c.state || "";
  document.getElementById("cust-zip").value = c.zip || "";
  document.getElementById("cust-email").value = c.email || "";
  document.getElementById("cust-phone").value = c.phone || "";
  document.getElementById("cust-start-date").value = c.startDate || "";
  document.getElementById("cust-second-first").value = c.secondary?.firstName || "";
  document.getElementById("cust-second-last").value = c.secondary?.lastName || "";
  document.getElementById("cust-second-rel").value = c.secondary?.relationship || "";
  document.getElementById("cust-second-phone").value = c.secondary?.phone || "";
  document.getElementById("cust-second-email").value = c.secondary?.email || "";
  openModal("modal-customer");
});

document.getElementById("form-customer").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    firstName: document.getElementById("cust-first").value.trim(),
    lastName: document.getElementById("cust-last").value.trim(),
    street: document.getElementById("cust-street").value.trim(),
    city: document.getElementById("cust-city").value.trim(),
    state: document.getElementById("cust-state").value.trim().toUpperCase(),
    zip: document.getElementById("cust-zip").value.trim(),
    email: document.getElementById("cust-email").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    startDate: document.getElementById("cust-start-date").value,
    secondary: {
      firstName: document.getElementById("cust-second-first").value.trim(),
      lastName: document.getElementById("cust-second-last").value.trim(),
      relationship: document.getElementById("cust-second-rel").value,
      phone: document.getElementById("cust-second-phone").value.trim(),
      email: document.getElementById("cust-second-email").value.trim(),
    },
  };
  if (!data.secondary.firstName && !data.secondary.lastName) {
    data.secondary = null;
  }

  if (state.editingCustomerId) {
    const idx = state.customers.findIndex(c => c.id === state.editingCustomerId);
    if (idx !== -1) {
      state.customers[idx] = { ...state.customers[idx], ...data };
      await dbUpdateCustomer(state.customers[idx]);
      document.getElementById("detail-name").textContent = `${data.firstName} ${data.lastName}`;
      document.getElementById("detail-address").textContent = getFullAddress(data);
      renderAccountHolders(state.customers[idx]);
    }
  } else {
    const newCustomer = await dbInsertCustomer({
      ...data,
      status: "active",
      contacts: [],
      notes: [],
    });
    if (newCustomer) state.customers.unshift(newCustomer);
  }

  renderCustomerList(searchInput.value);
  closeModal("modal-customer");
});

// ── Delete Customer ────────────────────────────────────────
btnDeleteCustomer.addEventListener("click", async () => {
  const c = getCustomer(state.currentCustomerId);
  if (!c) return;
  if (!confirm(`Delete ${c.firstName} ${c.lastName}? This cannot be undone.`)) return;
  await dbDeleteCustomer(state.currentCustomerId);
  state.customers = state.customers.filter(x => x.id !== state.currentCustomerId);
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

// ── Sidebar Nav ────────────────────────────────────────────
document.querySelectorAll(".sidebar__link[data-view]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll(".sidebar__link[data-view]").forEach(l => l.classList.remove("sidebar__link--active"));
    link.classList.add("sidebar__link--active");
    viewCustomers.style.display = "none";
    viewDetail.style.display = "none";
    document.getElementById("view-prospects").style.display = "none";
    document.getElementById("view-prospect-detail").style.display = "none";
    document.getElementById("view-schedule").style.display = "none";
    if (view === "customers") {
      viewCustomers.style.display = "block";
      renderCustomerList(searchInput.value);
    } else if (view === "prospects") {
      document.getElementById("view-prospects").style.display = "block";
      renderProspectList();
    } else if (view === "schedule") {
      document.getElementById("view-schedule").style.display = "block";
      openMasterScheduleView();
    }
  });
});

// ── Prospects ──────────────────────────────────────────────
function getProspect(id) {
  return state.prospects.find(p => p.id === id);
}

function getProspectAddress(p) {
  const parts = [p.street, p.city, p.state ? p.state.toUpperCase() : null, p.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

// ── Pipeline Tabs ──────────────────────────────────────────
document.getElementById("pipeline-tabs").addEventListener("click", e => {
  const tab = e.target.closest(".pipeline-tab");
  if (!tab) return;
  document.querySelectorAll(".pipeline-tab").forEach(t => t.classList.remove("pipeline-tab--active"));
  tab.classList.add("pipeline-tab--active");
  state.activePipelineStage = tab.dataset.stage;
  renderProspectList();
});

document.getElementById("prospect-search-input").addEventListener("input", () => renderProspectList());

// ── Render Prospect List ───────────────────────────────────
const STAGE_LABELS = {
  new: "New Lead", contacted: "Contacted", "follow-up": "Follow-up",
  consultation: "In-Home Consultation Complete",
  proposal: "Proposed Schedule Sent", won: "Won", lost: "Lost",
};

function renderProspectList() {
  const stage = state.activePipelineStage;
  const q = document.getElementById("prospect-search-input").value.toLowerCase();
  const filtered = state.prospects.filter(p => {
    const nameMatch = `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      getProspectAddress(p).toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q);
    const stageMatch = stage === "all" || p.stage === stage;
    return nameMatch && stageMatch;
  });

  const total = state.prospects.length;
  document.getElementById("prospect-count").textContent = `${total} prospect${total !== 1 ? "s" : ""}`;

  const listEl = document.getElementById("prospect-list");
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No prospects found.</p><p>Click "+ Add Prospect" to get started.</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const addr = getProspectAddress(p);
    const stageLabel = STAGE_LABELS[p.stage] || "New Lead";
    return `
      <div class="customer-card" data-id="${p.id}">
        <div>
          <div class="customer-card__name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</div>
          <div class="customer-card__meta">
            ${addr ? `<span>&#128205; ${escapeHtml(addr)}</span>` : ""}
            ${p.phone ? `<span>&#128222; ${escapeHtml(p.phone)}</span>` : ""}
            ${p.followUpDate ? `<span>&#128197; Follow-up: ${formatDate(p.followUpDate)}</span>` : ""}
          </div>
        </div>
        <div><span class="customer-card__badge badge--${p.stage || "new"}">${stageLabel}</span></div>
      </div>`;
  }).join("");

  listEl.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openProspect(el.dataset.id));
  });
}

// ── Open Prospect Detail ───────────────────────────────────
function openProspect(id) {
  state.currentProspectId = id;
  const p = getProspect(id);
  if (!p) return;

  document.getElementById("prospect-detail-name").textContent = `${p.firstName} ${p.lastName}`;
  document.getElementById("prospect-detail-address").textContent = getProspectAddress(p);
  document.getElementById("prospect-stage").value = p.stage || "new";
  document.getElementById("prospect-source").value = p.source || "";
  document.getElementById("prospect-last-contact").value = p.lastContactDate || "";
  document.getElementById("prospect-followup").value = p.followUpDate || "";

  const info = document.getElementById("prospect-contact-info");
  info.innerHTML = `
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Phone</span>
      <span>${p.phone ? escapeHtml(p.phone) : '<em style="color:var(--muted)">Not on file</em>'}</span>
    </div>
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Email</span>
      <span>${p.email ? escapeHtml(p.email) : '<em style="color:var(--muted)">Not on file</em>'}</span>
    </div>
    ${p.source ? `<div class="prospect-contact-info__row"><span class="prospect-contact-info__label">Source</span><span>${escapeHtml(STAGE_LABELS[p.source] || p.source)}</span></div>` : ""}
  `;

  renderProspectNotes(p);
  document.getElementById("view-prospects").style.display = "none";
  document.getElementById("view-prospect-detail").style.display = "block";
}

document.getElementById("btn-back-prospect").addEventListener("click", () => {
  document.getElementById("view-prospect-detail").style.display = "none";
  document.getElementById("view-prospects").style.display = "block";
  state.currentProspectId = null;
  renderProspectList();
});

// ── Prospect Notes ─────────────────────────────────────────
function renderProspectNotes(p) {
  const list = document.getElementById("prospect-note-list");
  const notes = (p.notes || []).slice().reverse();
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
      <button class="ghost danger icon-btn" data-action="delete-prospect-note" data-id="${n.id}">&#10005;</button>
    </div>
  `).join("");
  list.querySelectorAll("[data-action='delete-prospect-note']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this note?")) return;
      p.notes = (p.notes || []).filter(n => n.id !== btn.dataset.id);
      await dbUpdateProspect(p);
      renderProspectNotes(p);
    });
  });
}

document.getElementById("btn-add-prospect-note").addEventListener("click", () => openModal("modal-prospect-note"));

document.getElementById("form-prospect-note").addEventListener("submit", async e => {
  e.preventDefault();
  const p = getProspect(state.currentProspectId);
  if (!p) return;
  if (!p.notes) p.notes = [];
  p.notes.push({ id: generateId(), text: document.getElementById("prospect-note-text").value.trim(), createdAt: new Date().toISOString() });
  await dbUpdateProspect(p);
  renderProspectNotes(p);
  closeModal("modal-prospect-note");
  document.getElementById("prospect-note-text").value = "";
});

// ── Save Pipeline Status ───────────────────────────────────
document.getElementById("btn-save-prospect-status").addEventListener("click", async () => {
  const p = getProspect(state.currentProspectId);
  if (!p) return;
  p.stage = document.getElementById("prospect-stage").value;
  p.source = document.getElementById("prospect-source").value;
  p.lastContactDate = document.getElementById("prospect-last-contact").value;
  p.followUpDate = document.getElementById("prospect-followup").value;
  await dbUpdateProspect(p);
  const btn = document.getElementById("btn-save-prospect-status");
  btn.textContent = "Saved \u2713";
  setTimeout(() => { btn.textContent = "Save Status"; }, 2000);
});

// ── Add / Edit Prospect Modal ──────────────────────────────
document.getElementById("btn-add-prospect").addEventListener("click", () => {
  state.editingProspectId = null;
  document.getElementById("modal-prospect-title").textContent = "Add Prospect";
  ["prospect-first","prospect-last","prospect-street","prospect-city","prospect-state","prospect-zip","prospect-email","prospect-phone","prospect-form-last-contact","prospect-form-followup"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("prospect-form-stage").value = "new";
  document.getElementById("prospect-form-source").value = "";
  openModal("modal-prospect");
});

document.getElementById("btn-edit-prospect").addEventListener("click", () => {
  const p = getProspect(state.currentProspectId);
  if (!p) return;
  state.editingProspectId = p.id;
  document.getElementById("modal-prospect-title").textContent = "Edit Prospect";
  document.getElementById("prospect-first").value = p.firstName || "";
  document.getElementById("prospect-last").value = p.lastName || "";
  document.getElementById("prospect-street").value = p.street || "";
  document.getElementById("prospect-city").value = p.city || "";
  document.getElementById("prospect-state").value = p.state || "";
  document.getElementById("prospect-zip").value = p.zip || "";
  document.getElementById("prospect-email").value = p.email || "";
  document.getElementById("prospect-phone").value = p.phone || "";
  document.getElementById("prospect-form-stage").value = p.stage || "new";
  document.getElementById("prospect-form-source").value = p.source || "";
  document.getElementById("prospect-form-last-contact").value = p.lastContactDate || "";
  document.getElementById("prospect-form-followup").value = p.followUpDate || "";
  openModal("modal-prospect");
});

document.getElementById("form-prospect").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    firstName: document.getElementById("prospect-first").value.trim(),
    lastName: document.getElementById("prospect-last").value.trim(),
    street: document.getElementById("prospect-street").value.trim(),
    city: document.getElementById("prospect-city").value.trim(),
    state: document.getElementById("prospect-state").value.trim().toUpperCase(),
    zip: document.getElementById("prospect-zip").value.trim(),
    email: document.getElementById("prospect-email").value.trim(),
    phone: document.getElementById("prospect-phone").value.trim(),
    stage: document.getElementById("prospect-form-stage").value,
    source: document.getElementById("prospect-form-source").value,
    lastContactDate: document.getElementById("prospect-form-last-contact").value,
    followUpDate: document.getElementById("prospect-form-followup").value,
  };

  if (state.editingProspectId) {
    const idx = state.prospects.findIndex(p => p.id === state.editingProspectId);
    if (idx !== -1) {
      state.prospects[idx] = { ...state.prospects[idx], ...data };
      await dbUpdateProspect(state.prospects[idx]);
      document.getElementById("prospect-detail-name").textContent = `${data.firstName} ${data.lastName}`;
      document.getElementById("prospect-detail-address").textContent = getProspectAddress(data);
    }
  } else {
    const newProspect = await dbInsertProspect({ ...data, notes: [] });
    if (newProspect) state.prospects.unshift(newProspect);
  }

  renderProspectList();
  closeModal("modal-prospect");
});

// ── Delete Prospect ────────────────────────────────────────
document.getElementById("btn-delete-prospect").addEventListener("click", async () => {
  const p = getProspect(state.currentProspectId);
  if (!p) return;
  if (!confirm(`Delete ${p.firstName} ${p.lastName}? This cannot be undone.`)) return;
  await dbDeleteProspect(state.currentProspectId);
  state.prospects = state.prospects.filter(x => x.id !== state.currentProspectId);
  document.getElementById("view-prospect-detail").style.display = "none";
  document.getElementById("view-prospects").style.display = "block";
  state.currentProspectId = null;
  renderProspectList();
});

// ── Convert Prospect to Customer ───────────────────────────
document.getElementById("btn-convert-prospect").addEventListener("click", async () => {
  const p = getProspect(state.currentProspectId);
  if (!p) return;
  if (!confirm(`Convert ${p.firstName} ${p.lastName} to an active customer?`)) return;

  const newCustomer = await dbInsertCustomer({
    firstName: p.firstName, lastName: p.lastName,
    street: p.street || "", city: p.city || "", state: p.state || "", zip: p.zip || "",
    email: p.email || "", phone: p.phone || "",
    status: "active", notes: p.notes || [], contacts: [],
    startDate: new Date().toISOString().slice(0, 10), secondary: null,
  });

  if (newCustomer) {
    state.customers.unshift(newCustomer);
    await dbDeleteProspect(state.currentProspectId);
    state.prospects = state.prospects.filter(x => x.id !== state.currentProspectId);
  }

  document.querySelectorAll(".sidebar__link[data-view]").forEach(l => l.classList.remove("sidebar__link--active"));
  document.querySelector(".sidebar__link[data-view='customers']").classList.add("sidebar__link--active");
  document.getElementById("view-prospect-detail").style.display = "none";
  document.getElementById("view-prospects").style.display = "none";
  viewCustomers.style.display = "block";
  state.currentProspectId = null;
  renderCustomerList();
  alert(`${p.firstName} ${p.lastName} has been added as an active customer!`);
});

// ── Schedule Constants ─────────────────────────────────────
const SCHEDULE_PERIODS = ["Jan - Feb", "Mar - Apr", "May - Jun", "Jul - Aug", "Sep - Oct", "Nov - Dec"];
const SCHEDULE_CATEGORIES = [
  "Appliance Maintenance", "Auto Maintenance", "Energy Efficiency",
  "Home Safety", "HVAC", "Seasonal", "Plumbing",
];
const SCHEDULE_YEAR = new Date().getFullYear();

function seedScheduleTasks() {
  return [
    { id: generateId(), name: "Refrigerator Filter", minutes: 5, category: "Appliance Maintenance", frequency: "every" },
    { id: generateId(), name: "Dishwasher Cleaning", minutes: 12, category: "Appliance Maintenance", frequency: "annual" },
    { id: generateId(), name: "Stove Exhaust Filter Replacement", minutes: 15, category: "Appliance Maintenance", frequency: "annual" },
    { id: generateId(), name: "Dryer Vent Cleaning", minutes: 20, category: "Appliance Maintenance", frequency: "annual" },
    { id: generateId(), name: "Car Maintenance (Filters/Wipers/Air)", minutes: 30, category: "Auto Maintenance", frequency: "annual" },
    { id: generateId(), name: "Exterior Door/Window Maintenance", minutes: 25, category: "Energy Efficiency", frequency: "annual" },
    { id: generateId(), name: "Thermal Imaging for Heat Loss", minutes: 15, category: "Energy Efficiency", frequency: "annual" },
    { id: generateId(), name: "Light Bulbs/Fan Switch", minutes: 8, category: "Energy Efficiency", frequency: "every" },
    { id: generateId(), name: "Thermal Imaging for AC Loss", minutes: 12, category: "Energy Efficiency", frequency: "annual" },
    { id: generateId(), name: "Garage Door Tune Up", minutes: 30, category: "Home Safety", frequency: "annual" },
    { id: generateId(), name: "Smoke-CO Detector Batteries", minutes: 5, category: "Home Safety", frequency: "every" },
    { id: generateId(), name: "Attic/Basement/Crawl Inspection", minutes: 15, category: "Home Safety", frequency: "annual" },
    { id: generateId(), name: "Camera/Doorbell Inspection", minutes: 5, category: "Home Safety", frequency: "annual" },
    { id: generateId(), name: "Basic Gutter/Downspout Clearing", minutes: 25, category: "Home Safety", frequency: "annual" },
    { id: generateId(), name: "Air Filter Furnace", minutes: 5, category: "HVAC", frequency: "every" },
    { id: generateId(), name: "AC Unit Check", minutes: 8, category: "HVAC", frequency: "annual" },
    { id: generateId(), name: "Fall Prep", minutes: 40, category: "Seasonal", frequency: "annual" },
    { id: generateId(), name: "Spring Prep", minutes: 20, category: "Seasonal", frequency: "annual" },
    { id: generateId(), name: "Water Softener Salt Delivery/Refill", minutes: 8, category: "Plumbing", frequency: "every" },
    { id: generateId(), name: "Whole House Water Filter Replacement", minutes: 10, category: "Plumbing", frequency: "annual" },
    { id: generateId(), name: "Hot Water Heater Drain/Flush", minutes: 45, category: "Plumbing", frequency: "annual" },
    { id: generateId(), name: "Shower/Tub/Faucet Descaling", minutes: 20, category: "Plumbing", frequency: "annual" },
  ];
}

// ── Schedule DB Operations ─────────────────────────────────
async function dbLoadSchedule(customerId, year) {
  const { data, error } = await sb.from("schedules")
    .select("*").eq("customer_id", customerId).eq("year", year).maybeSingle();
  if (error) { console.error("Load schedule error:", error); return null; }
  return data;
}

async function dbSaveSchedule(customerId, year, tasks, schedule) {
  const { error } = await sb.from("schedules").upsert(
    { customer_id: customerId, year, tasks, schedule },
    { onConflict: "customer_id,year" }
  );
  if (error) {
    console.error("Save schedule error:", error);
    alert("Schedule could not be saved: " + error.message + "\n\nMake sure the 'schedules' table has been created in Supabase.");
  }
}

async function dbLoadAllSchedules(year) {
  const { data, error } = await sb.from("schedules").select("*").eq("year", year);
  if (error) { console.error("Load all schedules error:", error); return []; }
  return data || [];
}

// ── Open Schedule for Customer ─────────────────────────────
async function openScheduleForCustomer(customerId) {
  const el = document.getElementById("schedule-card-body");
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><p>Loading schedule...</p></div>`;
  document.getElementById("schedule-year").textContent = SCHEDULE_YEAR;

  // Always load fresh from DB so data persists across page reloads
  const row = await dbLoadSchedule(customerId, SCHEDULE_YEAR);
  if (row) {
    state.schedules[customerId] = { year: row.year, tasks: row.tasks || [], schedule: row.schedule || {} };
  } else {
    const tasks = seedScheduleTasks();
    state.schedules[customerId] = { year: SCHEDULE_YEAR, tasks, schedule: {} };
    await dbSaveSchedule(customerId, SCHEDULE_YEAR, tasks, {});
  }

  // Reset to view mode
  state.scheduleEditMode = false;
  const panel = document.getElementById("task-library-panel");
  if (panel) panel.style.display = "none";
  const libBtn = document.getElementById("btn-toggle-task-library");
  if (libBtn) { libBtn.textContent = "Edit Task Library"; libBtn.style.display = "none"; }
  const editBtn = document.getElementById("btn-edit-schedule");
  if (editBtn) editBtn.textContent = "Edit Schedule";

  renderScheduleCard(customerId);
  renderScheduleTaskLibrary(customerId);
}

// ── Render Schedule Card (view or edit mode) ──────────────
function renderScheduleCard(customerId) {
  const sched = state.schedules[customerId];
  const el = document.getElementById("schedule-card-body");
  if (!el || !sched) return;
  const c = getCustomer(customerId);
  const limitMinutes = c?.minutesLimit || 75;

  if (!state.scheduleEditMode) {
    el.innerHTML = buildScheduleSummaryHTML(sched.tasks, sched.schedule, limitMinutes);
    return;
  }

  el.innerHTML = buildScheduleTableHTML(sched.tasks, sched.schedule, limitMinutes);

  el.querySelectorAll("input[data-action='toggle-task']").forEach(cb => {
    cb.addEventListener("change", async () => {
      const period = cb.dataset.period;
      const taskId = cb.dataset.id;
      const ids = Array.isArray(sched.schedule[period]) ? [...sched.schedule[period]] : [];
      if (cb.checked && !ids.includes(taskId)) {
        ids.push(taskId);
      } else if (!cb.checked) {
        const idx = ids.indexOf(taskId);
        if (idx !== -1) ids.splice(idx, 1);
      }
      sched.schedule[period] = ids;
      await dbSaveSchedule(customerId, sched.year, sched.tasks, sched.schedule);
      updateScheduleTotals(customerId);
    });
  });
}

function updateScheduleTotals(customerId) {
  const sched = state.schedules[customerId];
  const c = getCustomer(customerId);
  const limitMinutes = c?.minutesLimit || 75;
  if (!sched) return;
  SCHEDULE_PERIODS.forEach(period => {
    const ids = Array.isArray(sched.schedule[period]) ? sched.schedule[period] : [];
    const total = ids.reduce((sum, id) => {
      const task = sched.tasks.find(t => t.id === id);
      return sum + (task?.minutes || 0);
    }, 0);
    const span = document.querySelector(`[data-total-period="${period}"]`);
    if (span) {
      span.textContent = `${total} / ${limitMinutes}m`;
      const isOver = total > limitMinutes;
      span.parentElement.className = isOver ? "schedule-total--over" : "";
      // Update all body cells and header in this column
      document.querySelectorAll(`[data-period-col="${period}"]`).forEach(td => {
        td.classList.toggle("schedule-col--over", isOver);
      });
      const headerTh = document.querySelector(`[data-period-header="${period}"]`);
      if (headerTh) headerTh.classList.toggle("schedule-col--over", isOver);
    }
  });
}

function buildScheduleSummaryHTML(tasks, schedule, limitMinutes) {
  const anyTasks = SCHEDULE_PERIODS.some(p => {
    const ids = schedule[p];
    return Array.isArray(ids) && ids.length > 0;
  });

  if (!anyTasks) {
    return `<div class="empty-state"><p>No tasks scheduled yet.</p><p>Click <strong>Edit Schedule</strong> to build this customer's annual plan.</p></div>`;
  }

  const cols = SCHEDULE_PERIODS.map(period => {
    const ids = Array.isArray(schedule[period]) ? schedule[period] : [];
    const periodTasks = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean);
    const total = periodTasks.reduce((sum, t) => sum + t.minutes, 0);
    const isOver = total > limitMinutes;
    const overColClass = isOver ? " sched-summary-col--over" : "";
    const overTotalClass = isOver ? " schedule-total--over" : "";

    // Group by category
    let taskItems = "";
    if (periodTasks.length === 0) {
      taskItems = `<li style="color:var(--muted);font-style:italic;">No tasks</li>`;
    } else {
      const grouped = {};
      periodTasks.forEach(t => {
        const cat = t.category || "Other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(t);
      });
      taskItems = SCHEDULE_CATEGORIES
        .filter(cat => grouped[cat])
        .map(cat => `
          <li class="sched-summary-cat-label">${escapeHtml(cat)}</li>
          ${grouped[cat].map(t => `<li class="sched-summary-task"><span>${escapeHtml(t.name)}</span><span class="task-min">${t.minutes}m</span></li>`).join("")}
        `).join("");
    }

    return `<div class="sched-summary-col${overColClass}">
      <div class="sched-summary-period">${escapeHtml(period)}</div>
      <ul class="sched-summary-task-list">${taskItems}</ul>
      ${total > 0 ? `<div class="sched-summary-total${overTotalClass}">${total} / ${limitMinutes}m</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="sched-summary-grid">${cols}</div>`;
}

function buildScheduleTableHTML(tasks, schedule, limitMinutes) {
  // Pre-calculate which periods exceed the limit
  const overSet = new Set(SCHEDULE_PERIODS.filter(p => {
    const ids = Array.isArray(schedule[p]) ? schedule[p] : [];
    const total = ids.reduce((sum, id) => { const t = tasks.find(t => t.id === id); return sum + (t?.minutes || 0); }, 0);
    return total > limitMinutes;
  }));

  const headerCols = SCHEDULE_PERIODS.map(p =>
    `<th class="${overSet.has(p) ? 'schedule-col--over' : ''}" data-period-header="${escapeHtml(p)}">${escapeHtml(p)}</th>`
  ).join("");

  const bodyRows = SCHEDULE_CATEGORIES.map(category => {
    const catTasks = tasks.filter(t => t.category === category);
    if (catTasks.length === 0) return "";
    const cells = SCHEDULE_PERIODS.map(period => {
      const ids = Array.isArray(schedule[period]) ? schedule[period] : [];
      const overCellClass = overSet.has(period) ? " schedule-col--over" : "";
      const items = catTasks.map(task => {
        const checked = ids.includes(task.id) ? "checked" : "";
        return `<label class="schedule-choice">
          <input type="checkbox" data-action="toggle-task" data-period="${escapeHtml(period)}" data-id="${task.id}" ${checked} />
          <span class="schedule-choice__name">${escapeHtml(task.name)}</span>
          <span class="schedule-choice__time">${task.minutes}m</span>
        </label>`;
      }).join("");
      return `<td class="${overCellClass}" data-period-col="${escapeHtml(period)}">${items}</td>`;
    }).join("");
    return `<tr><th class="category-cell">${escapeHtml(category)}</th>${cells}</tr>`;
  }).join("");

  const totalsRow = `<tr class="schedule-total-row"><th>Total minutes</th>${
    SCHEDULE_PERIODS.map(period => {
      const ids = Array.isArray(schedule[period]) ? schedule[period] : [];
      const total = ids.reduce((sum, id) => {
        const task = tasks.find(t => t.id === id);
        return sum + (task?.minutes || 0);
      }, 0);
      const overClass = total > limitMinutes ? "schedule-total--over" : "";
      return `<td class="${overClass}"><span data-total-period="${escapeHtml(period)}">${total} / ${limitMinutes}m</span></td>`;
    }).join("")
  }</tr>`;

  return `<div class="schedule-table-wrap"><table class="schedule-table">
    <thead><tr><th>Category / Task</th>${headerCols}</tr></thead>
    <tbody>${bodyRows}${totalsRow}</tbody>
  </table></div>`;
}

// ── Schedule view/edit toggle ─────────────────────────────
document.getElementById("btn-edit-schedule").addEventListener("click", () => {
  state.scheduleEditMode = !state.scheduleEditMode;
  document.getElementById("btn-edit-schedule").textContent = state.scheduleEditMode ? "Done" : "Edit Schedule";
  const libBtn = document.getElementById("btn-toggle-task-library");
  libBtn.style.display = state.scheduleEditMode ? "" : "none";
  if (!state.scheduleEditMode) {
    document.getElementById("task-library-panel").style.display = "none";
    libBtn.textContent = "Edit Task Library";
  }
  renderScheduleCard(state.currentCustomerId);
});

// ── Task Library ───────────────────────────────────────────
document.getElementById("btn-toggle-task-library").addEventListener("click", () => {
  const panel = document.getElementById("task-library-panel");
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  document.getElementById("btn-toggle-task-library").textContent = isOpen ? "Edit Task Library" : "Close Task Library";
});

function renderScheduleTaskLibrary(customerId) {
  const sched = state.schedules[customerId];
  const container = document.getElementById("schedule-task-table");
  if (!container || !sched) return;

  const html = SCHEDULE_CATEGORIES.map(category => {
    const catTasks = sched.tasks.filter(t => t.category === category);
    if (catTasks.length === 0) return "";
    return `<div class="task-lib-group">
      <div class="task-lib-category-label">${escapeHtml(category)}</div>
      ${catTasks.map(task => `
        <div class="task-lib-row">
          <input class="task-lib-input" data-field="name" data-id="${task.id}" type="text" value="${escapeHtml(task.name)}" />
          <input class="task-lib-input" data-field="minutes" data-id="${task.id}" type="number" min="1" value="${task.minutes}" style="width:60px;" />
          <span class="task-lib-min-label">min</span>
          <select data-field="frequency" data-id="${task.id}">
            <option value="every" ${task.frequency === "every" ? "selected" : ""}>Every visit</option>
            <option value="annual" ${task.frequency === "annual" ? "selected" : ""}>Annual</option>
            <option value="adhoc" ${task.frequency === "adhoc" ? "selected" : ""}>Ad hoc</option>
          </select>
          <button type="button" class="ghost danger icon-btn" data-lib-remove="${task.id}">&#10005;</button>
        </div>`).join("")}
    </div>`;
  }).join("");

  container.innerHTML = html || `<div class="empty-state"><p>No tasks. Add one above.</p></div>`;

  container.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", async () => {
      const task = sched.tasks.find(t => t.id === input.dataset.id);
      if (!task) return;
      if (input.dataset.field === "name") task.name = input.value.trim();
      if (input.dataset.field === "minutes") task.minutes = Number(input.value) || task.minutes;
      if (input.dataset.field === "frequency") task.frequency = input.value;
      await dbSaveSchedule(state.currentCustomerId, sched.year, sched.tasks, sched.schedule);
      renderScheduleCard(state.currentCustomerId);
    });
  });

  container.querySelectorAll("[data-lib-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this task?")) return;
      const taskId = btn.dataset.libRemove;
      sched.tasks = sched.tasks.filter(t => t.id !== taskId);
      SCHEDULE_PERIODS.forEach(p => {
        if (Array.isArray(sched.schedule[p])) {
          sched.schedule[p] = sched.schedule[p].filter(id => id !== taskId);
        }
      });
      await dbSaveSchedule(state.currentCustomerId, sched.year, sched.tasks, sched.schedule);
      renderScheduleCard(state.currentCustomerId);
      renderScheduleTaskLibrary(state.currentCustomerId);
    });
  });
}

document.getElementById("form-schedule-task").addEventListener("submit", async e => {
  e.preventDefault();
  const customerId = state.currentCustomerId;
  const sched = state.schedules[customerId];
  if (!sched) return;
  const name = document.getElementById("sched-task-name").value.trim();
  const minutes = Number(document.getElementById("sched-task-minutes").value) || 10;
  const category = document.getElementById("sched-task-category").value;
  const frequency = document.getElementById("sched-task-frequency").value;
  sched.tasks.push({ id: generateId(), name, minutes, category, frequency });
  await dbSaveSchedule(customerId, sched.year, sched.tasks, sched.schedule);
  renderScheduleCard(customerId);
  renderScheduleTaskLibrary(customerId);
  e.target.reset();
});

// ── Master Schedule View ───────────────────────────────────
let activeMasterPeriod = SCHEDULE_PERIODS[0];

document.getElementById("master-period-tabs").addEventListener("click", e => {
  const tab = e.target.closest(".pipeline-tab");
  if (!tab) return;
  document.querySelectorAll("#master-period-tabs .pipeline-tab").forEach(t => t.classList.remove("pipeline-tab--active"));
  tab.classList.add("pipeline-tab--active");
  activeMasterPeriod = tab.dataset.period;
  renderMasterSchedule();
});

async function openMasterScheduleView() {
  document.getElementById("schedule-master-subtitle").textContent = `${SCHEDULE_YEAR} Annual Service Calendar`;
  const listEl = document.getElementById("master-schedule-list");
  listEl.innerHTML = `<div class="empty-state"><p>Loading schedules...</p></div>`;
  const rows = await dbLoadAllSchedules(SCHEDULE_YEAR);
  rows.forEach(row => {
    if (!state.schedules[row.customer_id]) {
      state.schedules[row.customer_id] = { year: row.year, tasks: row.tasks || [], schedule: row.schedule || {} };
    }
  });
  renderMasterSchedule();
}

function renderMasterSchedule() {
  const listEl = document.getElementById("master-schedule-list");
  const period = activeMasterPeriod;

  const entries = state.customers
    .map(c => {
      const sched = state.schedules[c.id];
      const ids = sched?.schedule?.[period];
      if (!Array.isArray(ids) || ids.length === 0) return null;
      const tasks = ids.map(id => sched.tasks.find(t => t.id === id)).filter(Boolean);
      const total = tasks.reduce((sum, t) => sum + t.minutes, 0);
      const limit = c.minutesLimit || 75;
      return { c, tasks, total, limit };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No customers have tasks scheduled for ${escapeHtml(period)}.</p><p>Open a customer record and check tasks to build their schedule.</p></div>`;
    return;
  }

  listEl.innerHTML = entries.map(({ c, tasks, total, limit }) => {
    const overClass = total > limit ? "schedule-total--over" : "";
    const addr = getFullAddress(c);
    return `<div class="master-sched-card">
      <div class="master-sched-header">
        <span class="master-sched-name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}${addr ? `<span style="font-weight:400;font-size:0.82rem;color:var(--muted);margin-left:0.5rem;">${escapeHtml(addr)}</span>` : ""}</span>
        <span class="master-sched-total ${overClass}">${total} / ${limit}m</span>
      </div>
      <ul class="master-sched-tasks">
        ${tasks.map(t => `<li><span>${escapeHtml(t.name)}</span><span class="task-min">${t.minutes}m</span></li>`).join("")}
      </ul>
    </div>`;
  }).join("");
}

