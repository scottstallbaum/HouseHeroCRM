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
  globalTasks: [],
  contactLog: {},
  technicians: [],
  currentTechnicianId: null,
  editingTechnicianId: null,
  returnTo: null,      // tracks where to go back from customer detail
  techReturnTo: null,   // tracks where to go back from technician detail
  appointments: [],
  editingAppointmentId: null,
  completingAppointmentId: null,
  apptContext: null, // "customer" | "technician" | "calendar"
  calendarView: "week",
  calendarDate: new Date(),
  calendarTechFilter: "",
  weeklyAvailability: [],       // { id, technicianId, dayOfWeek, startTime, endTime }
  availabilityOverrides: [],    // { id, technicianId(null=company), date, isDayOff, blocks, note }
  editingOverrideId: null,
  overrideContext: null,         // "technician" | "company"
};

// ── DB Mappers ─────────────────────────────────────────────
function customerFromDb(row) {
  return {
    id: row.id,
    customerNumber: row.customer_number || null,
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
    technicianId: row.technician_id || null,
    secondary: row.secondary || null,
    contacts: row.contacts || [],
    notes: row.notes || [],
  };
}

function customerToDb(c) {
  return {
    customer_number: c.customerNumber || null,
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
    technician_id: c.technicianId || null,
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
    secondary: row.secondary || null,
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
    secondary: p.secondary || null,
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
  if (!data.customerNumber) {
    data.customerNumber = await generateCustomerNumber();
  }
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

// ── Contact Log DB ─────────────────────────────────────
async function dbLoadContactLog(prospectId) {
  const { data, error } = await sb.from("prospect_contact_log")
    .select("*").eq("prospect_id", prospectId).order("contact_date", { ascending: false });
  if (error) { console.error("Load contact log error:", error); return []; }
  return data || [];
}

async function dbAddContactEntry(entry) {
  const { data, error } = await sb.from("prospect_contact_log").insert(entry).select().single();
  if (error) { console.error("Add contact log error:", error); alert("Error saving contact: " + error.message); return null; }
  return data;
}

async function dbDeleteContactEntry(id) {
  const { error } = await sb.from("prospect_contact_log").delete().eq("id", id);
  if (error) console.error("Delete contact entry error:", error);
}

// ── Global Task Library DB ─────────────────────────────
async function dbLoadGlobalTasks() {
  const { data, error } = await sb.from("global_tasks").select("*").order("category").order("name");
  if (error) { console.error("Load global tasks error:", error); return []; }
  return data || [];
}

async function dbInsertGlobalTask(task) {
  const { data, error } = await sb.from("global_tasks").insert(task).select().single();
  if (error) { alert("Error adding task: " + error.message); return null; }
  return data;
}

async function dbUpdateGlobalTask(task) {
  const { error } = await sb.from("global_tasks").update({
    name: task.name, minutes: task.minutes, category: task.category, frequency: task.frequency
  }).eq("id", task.id);
  if (error) console.error("Update global task error:", error);
}

async function dbDeleteGlobalTask(id) {
  const { error } = await sb.from("global_tasks").delete().eq("id", id);
  if (error) console.error("Delete global task error:", error);
}

// ── Customer Number Generator ──────────────────────────────
async function generateCustomerNumber() {
  const { data } = await sb.from("customers").select("customer_number").not("customer_number", "is", null);
  let max = 0;
  (data || []).forEach(row => {
    const match = (row.customer_number || "").match(/HH-(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `HH-${String(max + 1).padStart(4, "0")}`;
}

// ── Technician Mappers ─────────────────────────────
function technicianFromDb(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone || "",
    email: row.email || "",
    role: row.role || "lead",
    status: row.status || "active",
  };
}

function technicianToDb(t) {
  return {
    first_name: t.firstName,
    last_name: t.lastName,
    phone: t.phone || null,
    email: t.email || null,
    role: t.role || "lead",
    status: t.status || "active",
  };
}

async function dbInsertTechnician(t) {
  const { data: row, error } = await sb.from("technicians").insert(technicianToDb(t)).select().single();
  if (error) { console.error(error); alert("Error saving technician: " + error.message); return null; }
  return technicianFromDb(row);
}

async function dbUpdateTechnician(t) {
  const { error } = await sb.from("technicians").update(technicianToDb(t)).eq("id", t.id);
  if (error) console.error("Update technician error:", error);
}

async function dbDeleteTechnician(id) {
  const { error } = await sb.from("technicians").delete().eq("id", id);
  if (error) console.error("Delete technician error:", error);
}

// ── Appointment Mappers ────────────────────────────────────
function appointmentFromDb(row) {
  return {
    id: row.id,
    technicianId: row.technician_id || null,
    customerId: row.customer_id || null,
    prospectId: row.prospect_id || null,
    type: row.type,
    title: row.title || "",
    notes: row.notes || "",
    date: row.date,
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    recurrence: row.recurrence || null,
    recurrenceEndDate: row.recurrence_end_date || null,
    status: row.status || "scheduled",
    scheduledTasks: row.scheduled_tasks || [],
    additionalWork: row.additional_work || "",
    createdAt: row.created_at,
  };
}

function appointmentToDb(a) {
  return {
    technician_id: a.technicianId || null,
    customer_id: a.customerId || null,
    prospect_id: a.prospectId || null,
    type: a.type,
    title: a.title || null,
    notes: a.notes || null,
    date: a.date,
    start_time: a.startTime || null,
    end_time: a.endTime || null,
    recurrence: a.recurrence || null,
    recurrence_end_date: a.recurrenceEndDate || null,
    status: a.status || "scheduled",
    scheduled_tasks: a.scheduledTasks || [],
    additional_work: a.additionalWork || null,
  };
}

async function dbInsertAppointment(a) {
  const { data: row, error } = await sb.from("appointments").insert(appointmentToDb(a)).select().single();
  if (error) { console.error(error); alert("Error saving appointment: " + error.message); return null; }
  return appointmentFromDb(row);
}

async function dbUpdateAppointment(a) {
  const { error } = await sb.from("appointments").update(appointmentToDb(a)).eq("id", a.id);
  if (error) console.error("Update appointment error:", error);
}

async function dbDeleteAppointment(id) {
  const { error } = await sb.from("appointments").delete().eq("id", id);
  if (error) console.error("Delete appointment error:", error);
}

// ── Availability Mappers ───────────────────────────────────
function weeklyAvailFromDb(row) {
  return {
    id: row.id,
    technicianId: row.technician_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function overrideFromDb(row) {
  return {
    id: row.id,
    technicianId: row.technician_id || null,
    date: row.date,
    isDayOff: row.is_day_off,
    blocks: row.blocks || [],
    note: row.note || "",
    createdAt: row.created_at,
  };
}

// ── Availability DB Functions ──────────────────────────────
async function dbInsertWeeklyAvail(item) {
  const { data: row, error } = await sb.from("technician_weekly_availability").insert({
    technician_id: item.technicianId,
    day_of_week: item.dayOfWeek,
    start_time: item.startTime,
    end_time: item.endTime,
  }).select().single();
  if (error) { console.error(error); alert("Error saving availability: " + error.message); return null; }
  return weeklyAvailFromDb(row);
}

async function dbDeleteWeeklyAvail(id) {
  const { error } = await sb.from("technician_weekly_availability").delete().eq("id", id);
  if (error) console.error("Delete weekly avail error:", error);
}

async function dbInsertOverride(item) {
  const { data: row, error } = await sb.from("availability_overrides").insert({
    technician_id: item.technicianId || null,
    date: item.date,
    is_day_off: item.isDayOff,
    blocks: item.blocks || [],
    note: item.note || null,
  }).select().single();
  if (error) { console.error(error); alert("Error saving override: " + error.message); return null; }
  return overrideFromDb(row);
}

async function dbUpdateOverride(item) {
  const { error } = await sb.from("availability_overrides").update({
    date: item.date,
    is_day_off: item.isDayOff,
    blocks: item.blocks || [],
    note: item.note || null,
  }).eq("id", item.id);
  if (error) console.error("Update override error:", error);
}

async function dbDeleteOverride(id) {
  const { error } = await sb.from("availability_overrides").delete().eq("id", id);
  if (error) console.error("Delete override error:", error);
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
  const [custResult, prospResult, globalTasksResult, techResult, apptResult, weeklyAvailResult, overrideResult] = await Promise.all([
    sb.from("customers").select("*").order("created_at", { ascending: false }),
    sb.from("prospects").select("*").order("created_at", { ascending: false }),
    sb.from("global_tasks").select("*").order("category").order("name"),
    sb.from("technicians").select("*").order("last_name"),
    sb.from("appointments").select("*").order("date").order("start_time"),
    sb.from("technician_weekly_availability").select("*").order("day_of_week").order("start_time"),
    sb.from("availability_overrides").select("*").order("date"),
  ]);
  if (custResult.error) console.error("Load customers error:", custResult.error);
  if (prospResult.error) console.error("Load prospects error:", prospResult.error);
  state.customers = (custResult.data || []).map(customerFromDb);
  state.prospects = (prospResult.data || []).map(prospectFromDb);
  state.globalTasks = globalTasksResult.data || [];
  state.technicians = (techResult.data || []).map(technicianFromDb);
  state.appointments = (apptResult.data || []).map(appointmentFromDb);
  state.weeklyAvailability = (weeklyAvailResult.data || []).map(weeklyAvailFromDb);
  state.availabilityOverrides = (overrideResult.data || []).map(overrideFromDb);
  // Seed global tasks table if empty (first run)
  if (state.globalTasks.length === 0 && !globalTasksResult.error) {
    const defaults = seedScheduleTasks();
    const inserted = await Promise.all(defaults.map(t =>
      sb.from("global_tasks").insert({ name: t.name, minutes: t.minutes, category: t.category, frequency: t.frequency }).select().single()
    ));
    state.globalTasks = inserted.map(r => r.data).filter(Boolean);
  }
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

  customerList.innerHTML = filtered.map(c => {
    const tech = c.technicianId ? state.technicians.find(t => t.id === c.technicianId) : null;
    return `
    <div class="customer-card" data-id="${c.id}">
      <div>
        <div class="customer-card__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}${c.secondary?.firstName ? ` <span class="customer-card__secondary">&amp; ${escapeHtml(c.secondary.firstName)} ${escapeHtml(c.secondary.lastName)} <span class="customer-card__rel">(${escapeHtml(c.secondary.relationship || "secondary")})</span></span>` : ""}</div>
        <div class="customer-card__meta">
          ${getFullAddress(c) ? `<span>&#128205; ${escapeHtml(getFullAddress(c))}</span>` : ""}
          ${c.phone ? `<span>&#128222; ${escapeHtml(c.phone)}</span>` : ""}
          ${c.email ? `<span>&#9993; ${escapeHtml(c.email)}</span>` : ""}
          ${c.startDate ? `<span>&#128197; Since ${formatDate(c.startDate)}</span>` : ""}
          ${tech ? `<span>🔧 ${escapeHtml(tech.firstName)} ${escapeHtml(tech.lastName)}</span>` : ""}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;">
        ${c.customerNumber ? `<span class="customer-number-badge">${escapeHtml(c.customerNumber)}</span>` : ""}
        <span class="customer-card__badge badge--${c.status || "active"}">${c.status || "active"}</span>
      </div>
    </div>
  `;
  }).join("");

  customerList.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openCustomer(el.dataset.id));
  });
}

searchInput.addEventListener("input", () => renderCustomerList(searchInput.value));

// ── Open Customer Detail ───────────────────────────────────
function openCustomerToSchedule(id) {
  openCustomer(id);
  // Scroll to schedule section after render
  requestAnimationFrame(() => {
    const el = document.getElementById("schedule-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function openCustomer(id) {
  state.currentCustomerId = id;
  const c = getCustomer(id);
  if (!c) return;

  document.getElementById("detail-name").textContent = `${c.firstName} ${c.lastName}`;
  document.getElementById("detail-customer-number").textContent = c.customerNumber || "";
  const secondaryLine = c.secondary?.firstName
    ? ` & ${c.secondary.firstName} ${c.secondary.lastName}${c.secondary.relationship ? ` (${c.secondary.relationship})` : ""}`
    : "";
  document.getElementById("detail-address").textContent = getFullAddress(c) + (secondaryLine ? " · " + secondaryLine : "");
  document.getElementById("detail-plan").value = c.plan || "";
  document.getElementById("detail-start-date").value = c.startDate || "";
  document.getElementById("detail-minutes").value = c.minutesLimit || 75;
  document.getElementById("detail-status").value = c.status || "active";
  populateTechnicianDropdown();
  document.getElementById("detail-technician").value = c.technicianId || "";

  document.getElementById("btn-open-scheduler").onclick = () => {
    window.open(`https://scottstallbaum.github.io/HouseHeroSchedulerv1/?customer=${encodeURIComponent(c.firstName + " " + c.lastName)}`, "_blank");
  };

  renderAccountHolders(c);
  renderContacts(c);
  renderNotes(c);
  openScheduleForCustomer(id);
  renderCustomerAppointments(id);

  document.getElementById("btn-back").textContent =
    state.returnTo === "technician" ? "← Back to technician" :
    state.returnTo === "schedule"   ? "← Back to schedule" :
    "← Back to customers";

  viewCustomers.style.display = "none";
  viewDetail.style.display = "block";
}

btnBack.addEventListener("click", () => {
  viewDetail.style.display = "none";
  state.currentCustomerId = null;
  const rt = state.returnTo;
  state.returnTo = null;
  if (rt === "technician") {
    document.getElementById("view-technician-detail").style.display = "block";
  } else if (rt === "schedule") {
    document.getElementById("view-schedule").style.display = "block";
    document.querySelectorAll(".sidebar__link[data-view]").forEach(l => l.classList.remove("sidebar__link--active"));
    document.querySelector(".sidebar__link[data-view='schedule']")?.classList.add("sidebar__link--active");
  } else {
    viewCustomers.style.display = "block";
    renderCustomerList(searchInput.value);
  }
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
  c.technicianId = document.getElementById("detail-technician").value || null;
  await dbUpdateCustomer(c);

  btnSaveService.textContent = "Saved \u2713";
  setTimeout(() => { btnSaveService.textContent = "Save Service Details"; }, 2000);
  renderCustomerList(searchInput.value);
});

function populateTechnicianDropdown() {
  const sel = document.getElementById("detail-technician");
  const current = sel.value;
  sel.innerHTML = `<option value="">-- Unassigned --</option>` +
    state.technicians
      .filter(t => t.status === "active")
      .map(t => `<option value="${t.id}">${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}</option>`)
      .join("");
  sel.value = current;
}

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
    document.getElementById("view-task-library").style.display = "none";
    document.getElementById("view-technicians").style.display = "none";
    document.getElementById("view-technician-detail").style.display = "none";
    document.getElementById("view-calendar").style.display = "none";
    if (view === "customers") {
      viewCustomers.style.display = "block";
      renderCustomerList(searchInput.value);
    } else if (view === "prospects") {
      document.getElementById("view-prospects").style.display = "block";
      renderProspectList();
    } else if (view === "schedule") {
      document.getElementById("view-schedule").style.display = "block";
      openMasterScheduleView();
    } else if (view === "task-library") {
      document.getElementById("view-task-library").style.display = "block";
      renderGlobalTaskLibraryView();
    } else if (view === "technicians") {
      document.getElementById("view-technicians").style.display = "block";
      renderTechnicianList();
    } else if (view === "calendar") {
      document.getElementById("view-calendar").style.display = "block";
      state.apptContext = "calendar";
      openCalendarView();
    }
  });
});

// ── Technicians ────────────────────────────────────────────
const TECH_ROLE_LABELS = {
  lead: "Lead Technician", assistant: "Assistant",
  "part-time": "Part-Time", subcontractor: "Subcontractor",
};

function getTechnician(id) {
  return state.technicians.find(t => t.id === id);
}

function renderTechnicianList() {
  const listEl = document.getElementById("technician-list");
  const countEl = document.getElementById("technician-count");
  const total = state.technicians.length;
  countEl.textContent = `${total} technician${total !== 1 ? "s" : ""}`;
  if (total === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No technicians yet.</p><p>Click "+ Add Technician" to get started.</p></div>`;
    return;
  }
  listEl.innerHTML = state.technicians.map(t => {
    const assignedCount = state.customers.filter(c => c.technicianId === t.id).length;
    return `
      <div class="customer-card" data-id="${t.id}">
        <div>
          <div class="customer-card__name">${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}</div>
          <div class="customer-card__meta">
            <span>${escapeHtml(TECH_ROLE_LABELS[t.role] || t.role)}</span>
            ${t.phone ? `<span>&#128222; ${escapeHtml(t.phone)}</span>` : ""}
            ${t.email ? `<span>&#9993; ${escapeHtml(t.email)}</span>` : ""}
            <span>&#128100; ${assignedCount} customer${assignedCount !== 1 ? "s" : ""} assigned</span>
          </div>
        </div>
        <div><span class="customer-card__badge badge--${t.status}">${t.status}</span></div>
      </div>`;
  }).join("");
  listEl.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openTechnician(el.dataset.id));
  });
}

function openTechnician(id) {
  state.currentTechnicianId = id;
  const t = getTechnician(id);
  if (!t) return;
  document.getElementById("technician-detail-name").textContent = `${t.firstName} ${t.lastName}`;
  document.getElementById("technician-detail-role").textContent = TECH_ROLE_LABELS[t.role] || t.role;

  const info = document.getElementById("technician-contact-info");
  info.innerHTML = `
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Phone</span>
      <span>${t.phone ? `<a href="tel:${escapeHtml(t.phone)}">${escapeHtml(t.phone)}</a>` : '<em style="color:var(--muted)">Not on file</em>'}</span>
    </div>
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Email</span>
      <span>${t.email ? `<a href="mailto:${escapeHtml(t.email)}">${escapeHtml(t.email)}</a>` : '<em style="color:var(--muted)">Not on file</em>'}</span>
    </div>
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Role</span>
      <span>${escapeHtml(TECH_ROLE_LABELS[t.role] || t.role)}</span>
    </div>
    <div class="prospect-contact-info__row">
      <span class="prospect-contact-info__label">Status</span>
      <span><span class="customer-card__badge badge--${t.status}">${t.status}</span></span>
    </div>`;

  // Assigned customers list
  const assigned = state.customers.filter(c => c.technicianId === id)
    .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
  const assignedEl = document.getElementById("technician-assigned-customers");
  if (assigned.length === 0) {
    assignedEl.innerHTML = `<div class="empty-state"><p>No customers assigned yet.</p></div>`;
  } else {
    assignedEl.innerHTML = assigned.map(c => `
      <div class="tech-customer-row" data-id="${c.id}">
        <div>
          <div class="tech-customer-row__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</div>
          <div class="customer-card__meta">
            ${getFullAddress(c) ? `<span>&#128205; ${escapeHtml(getFullAddress(c))}</span>` : ""}
            ${c.phone ? `<span>&#128222; ${escapeHtml(c.phone)}</span>` : ""}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          ${c.customerNumber ? `<span class="customer-number-badge">${escapeHtml(c.customerNumber)}</span>` : ""}
          <span class="customer-card__badge badge--${c.status || "active"}">${c.status || "active"}</span>
          <span class="tech-customer-row__arrow">&rsaquo;</span>
        </div>
      </div>`).join("");
    assignedEl.querySelectorAll(".tech-customer-row").forEach(el => {
      el.addEventListener("click", () => {
        state.returnTo = "technician";
        document.getElementById("view-technician-detail").style.display = "none";
        openCustomer(el.dataset.id);
      });
    });
  }

  renderTechnicianAppointments(id);
  renderTechnicianAvailability(id);
  document.getElementById("view-technicians").style.display = "none";
  document.getElementById("view-technician-detail").style.display = "block";
}

document.getElementById("btn-back-technician").addEventListener("click", () => {
  document.getElementById("view-technician-detail").style.display = "none";
  const rt = state.techReturnTo;
  state.techReturnTo = null;
  state.currentTechnicianId = null;
  if (rt === "schedule") {
    document.getElementById("view-schedule").style.display = "block";
    document.querySelectorAll(".sidebar__link[data-view]").forEach(l => l.classList.remove("sidebar__link--active"));
    document.querySelector(".sidebar__link[data-view='schedule']")?.classList.add("sidebar__link--active");
  } else {
    document.getElementById("view-technicians").style.display = "block";
    renderTechnicianList();
  }
});

document.getElementById("btn-add-technician").addEventListener("click", () => {
  state.editingTechnicianId = null;
  document.getElementById("modal-technician-title").textContent = "Add Technician";
  document.getElementById("tech-first").value = "";
  document.getElementById("tech-last").value = "";
  document.getElementById("tech-phone").value = "";
  document.getElementById("tech-email").value = "";
  document.getElementById("tech-role").value = "lead";
  document.getElementById("tech-status").value = "active";
  openModal("modal-technician");
});

document.getElementById("btn-edit-technician").addEventListener("click", () => {
  const t = getTechnician(state.currentTechnicianId);
  if (!t) return;
  state.editingTechnicianId = t.id;
  document.getElementById("modal-technician-title").textContent = "Edit Technician";
  document.getElementById("tech-first").value = t.firstName;
  document.getElementById("tech-last").value = t.lastName;
  document.getElementById("tech-phone").value = t.phone || "";
  document.getElementById("tech-email").value = t.email || "";
  document.getElementById("tech-role").value = t.role || "lead";
  document.getElementById("tech-status").value = t.status || "active";
  openModal("modal-technician");
});

document.getElementById("btn-delete-technician").addEventListener("click", async () => {
  const t = getTechnician(state.currentTechnicianId);
  if (!t) return;
  const assigned = state.customers.filter(c => c.technicianId === t.id);
  if (assigned.length > 0) {
    if (!confirm(`${t.firstName} ${t.lastName} is assigned to ${assigned.length} customer${assigned.length !== 1 ? "s" : ""}. Deleting will unassign them. Continue?`)) return;
    for (const c of assigned) {
      c.technicianId = null;
      await dbUpdateCustomer(c);
    }
  } else {
    if (!confirm(`Delete ${t.firstName} ${t.lastName}? This cannot be undone.`)) return;
  }
  await dbDeleteTechnician(state.currentTechnicianId);
  state.technicians = state.technicians.filter(x => x.id !== state.currentTechnicianId);
  document.getElementById("view-technician-detail").style.display = "none";
  document.getElementById("view-technicians").style.display = "block";
  state.currentTechnicianId = null;
  renderTechnicianList();
});

document.getElementById("form-technician").addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    firstName: document.getElementById("tech-first").value.trim(),
    lastName: document.getElementById("tech-last").value.trim(),
    phone: document.getElementById("tech-phone").value.trim(),
    email: document.getElementById("tech-email").value.trim(),
    role: document.getElementById("tech-role").value,
    status: document.getElementById("tech-status").value,
  };
  if (state.editingTechnicianId) {
    const idx = state.technicians.findIndex(t => t.id === state.editingTechnicianId);
    if (idx !== -1) {
      state.technicians[idx] = { ...state.technicians[idx], ...data };
      await dbUpdateTechnician(state.technicians[idx]);
      openTechnician(state.editingTechnicianId);
    }
  } else {
    const newTech = await dbInsertTechnician(data);
    if (newTech) state.technicians.push(newTech);
    renderTechnicianList();
  }
  closeModal("modal-technician");
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
  document.getElementById("btn-followups-due").classList.remove("btn--active");
  state.activePipelineStage = tab.dataset.stage;
  renderProspectList();
});

document.getElementById("btn-followups-due").addEventListener("click", () => {
  document.querySelectorAll(".pipeline-tab").forEach(t => t.classList.remove("pipeline-tab--active"));
  document.getElementById("btn-followups-due").classList.add("btn--active");
  state.activePipelineStage = "followups";
  renderProspectList();
});

document.getElementById("prospect-search-input").addEventListener("input", () => renderProspectList());

// ── Render Prospect List ───────────────────────────────────
const STAGE_LABELS = {
  new: "New Lead", contacted: "Contacted", "follow-up": "Follow-up",
  consultation: "In-Home Consultation Complete",
  proposal: "Proposed Schedule Sent", one_off: "One-Off Client", won: "Won", lost: "Lost",
};

function prospectCardHtml(p) {
  const addr = getProspectAddress(p);
  const stageLabel = STAGE_LABELS[p.stage] || "New Lead";
  return `
    <div class="customer-card" data-id="${p.id}">
      <div>
        <div class="customer-card__name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}${p.secondary?.firstName ? ` <span class="customer-card__secondary">&amp; ${escapeHtml(p.secondary.firstName)} ${escapeHtml(p.secondary.lastName)}${p.secondary.relationship ? ` <span class="customer-card__rel">(${escapeHtml(p.secondary.relationship)})</span>` : ""}</span>` : ""}</div>
        <div class="customer-card__meta">
          ${addr ? `<span>&#128205; ${escapeHtml(addr)}</span>` : ""}
          ${p.phone ? `<span>&#128222; ${escapeHtml(p.phone)}</span>` : ""}
          ${p.followUpDate ? `<span>&#128197; Follow-up: ${formatDate(p.followUpDate)}</span>` : ""}
        </div>
      </div>
      <div><span class="customer-card__badge badge--${p.stage || "new"}">${stageLabel}</span></div>
    </div>`;
}

function renderFollowUpsList() {
  const listEl = document.getElementById("prospect-list");
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeekEnd = new Date(today); nextWeekEnd.setDate(today.getDate() + 7);

  const withDates = state.prospects.filter(p => p.followUpDate && p.stage !== "won" && p.stage !== "lost");

  const groups = {
    pastDue:   withDates.filter(p => new Date(p.followUpDate) < today),
    today:     withDates.filter(p => new Date(p.followUpDate).toDateString() === today.toDateString()),
    tomorrow:  withDates.filter(p => new Date(p.followUpDate).toDateString() === tomorrow.toDateString()),
    thisWeek:  withDates.filter(p => {
      const d = new Date(p.followUpDate);
      return d > tomorrow && d <= nextWeekEnd;
    }),
  };

  const total = groups.pastDue.length + groups.today.length + groups.tomorrow.length + groups.thisWeek.length;
  if (total === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No follow-ups due. You're all caught up! ✅</p></div>`;
    return;
  }

  const section = (label, urgency, prospects) => {
    if (prospects.length === 0) return "";
    const sorted = [...prospects].sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
    return `<div class="followup-section">
      <div class="followup-section__header followup-section__header--${urgency}">${label} <span class="followup-section__count">${prospects.length}</span></div>
      ${sorted.map(prospectCardHtml).join("")}
    </div>`;
  };

  listEl.innerHTML =
    section("⚠️ Past Due", "pastdue", groups.pastDue) +
    section("🔴 Due Today", "today", groups.today) +
    section("🟡 Due Tomorrow", "tomorrow", groups.tomorrow) +
    section("🟢 Due This Week", "week", groups.thisWeek);

  listEl.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openProspect(el.dataset.id));
  });
}

function renderProspectList() {
  const stage = state.activePipelineStage;
  const total = state.prospects.length;
  document.getElementById("prospect-count").textContent = `${total} prospect${total !== 1 ? "s" : ""}`;

  if (stage === "followups") {
    renderFollowUpsList();
    return;
  }

  const q = document.getElementById("prospect-search-input").value.toLowerCase();
  const filtered = state.prospects.filter(p => {
    const nameMatch = `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      getProspectAddress(p).toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q);
    const stageMatch = stage === "all" || p.stage === stage;
    return nameMatch && stageMatch;
  });

  const listEl = document.getElementById("prospect-list");
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No prospects found.</p><p>Click "+ Add Prospect" to get started.</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(prospectCardHtml).join("");

  listEl.querySelectorAll(".customer-card").forEach(el => {
    el.addEventListener("click", () => openProspect(el.dataset.id));
  });
}

// ── Open Prospect Detail ───────────────────────────────────
function openProspect(id) {
  state.currentProspectId = id;
  const p = getProspect(id);
  if (!p) return;

  const secNameLine = p.secondary?.firstName
    ? ` <span class="detail-secondary-name">&amp; ${escapeHtml(p.secondary.firstName)} ${escapeHtml(p.secondary.lastName)}${p.secondary.relationship ? ` <span class="detail-secondary-rel">(${escapeHtml(p.secondary.relationship)})</span>` : ""}</span>`
    : "";
  document.getElementById("prospect-detail-name").innerHTML = `${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}${secNameLine}`;
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
    ${p.secondary?.firstName ? `
    <div class="prospect-contact-info__row" style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--stroke);">
      <span class="prospect-contact-info__label">${escapeHtml(p.secondary.relationship ? p.secondary.relationship.charAt(0).toUpperCase()+p.secondary.relationship.slice(1) : "Secondary")}</span>
      <span><strong>${escapeHtml(p.secondary.firstName)} ${escapeHtml(p.secondary.lastName)}</strong></span>
    </div>
    ${p.secondary.phone ? `<div class="prospect-contact-info__row"><span class="prospect-contact-info__label">Phone</span><span>${escapeHtml(p.secondary.phone)}</span></div>` : ""}
    ${p.secondary.email ? `<div class="prospect-contact-info__row"><span class="prospect-contact-info__label">Email</span><span>${escapeHtml(p.secondary.email)}</span></div>` : ""}
    ` : ""}
    ${p.source ? `<div class="prospect-contact-info__row"><span class="prospect-contact-info__label">Source</span><span>${escapeHtml(STAGE_LABELS[p.source] || p.source)}</span></div>` : ""}
  `;

  renderProspectNotes(p);
  loadAndRenderContactLog(id);
  document.getElementById("view-prospects").style.display = "none";
  document.getElementById("view-prospect-detail").style.display = "block";
}

document.getElementById("btn-back-prospect").addEventListener("click", () => {
  document.getElementById("view-prospect-detail").style.display = "none";
  document.getElementById("view-prospects").style.display = "block";
  state.currentProspectId = null;
  renderProspectList();
});

// ── Contact Log UI ─────────────────────────────────────────
const METHOD_LABELS = { call: "📞 Call", text: "💬 Text", email: "✉️ Email", "in-person": "🤝 In-Person" };

async function loadAndRenderContactLog(prospectId) {
  const entries = await dbLoadContactLog(prospectId);
  state.contactLog[prospectId] = entries;
  renderContactLog(prospectId);
}

function renderContactLog(prospectId) {
  const entries = state.contactLog[prospectId] || [];
  const el = document.getElementById("contact-log-list");
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No contacts logged yet. Click <strong>+ Log Contact</strong> to record an outreach.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="clog-list">${entries.map(e => {
    const repliedHtml = e.replied === "yes"
      ? `<span class="clog-replied--yes">✓ Responded</span>`
      : e.replied === "no"
        ? `<span class="clog-replied--no">✗ No response</span>`
        : "";
    const followupHtml = e.follow_up_date
      ? `<div class="clog-followup">📅 Follow-up: ${formatDate(e.follow_up_date)}</div>`
      : "";
    return `<div class="clog-item">
      <div class="clog-date">${formatDate(e.contact_date)}</div>
      <div class="clog-badges">
        <span class="clog-method">${escapeHtml(METHOD_LABELS[e.method] || e.method)}</span>
        ${repliedHtml}
      </div>
      <div>
        <div class="clog-notes">${escapeHtml(e.notes || "")}</div>
        ${followupHtml}
      </div>
      <button class="ghost danger icon-btn" data-action="delete-clog" data-id="${e.id}">✕</button>
    </div>`;
  }).join("")}</div>`;
  el.querySelectorAll("[data-action='delete-clog']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this contact entry?")) return;
      await dbDeleteContactEntry(btn.dataset.id);
      await loadAndRenderContactLog(prospectId);
    });
  });
}

document.getElementById("btn-add-contact-log").addEventListener("click", () => {
  document.getElementById("clog-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("clog-method").value = "call";
  document.getElementById("clog-replied").value = "yes";
  document.getElementById("clog-followup").value = "";
  document.getElementById("clog-notes").value = "";
  openModal("modal-contact-log");
});

document.getElementById("form-contact-log").addEventListener("submit", async e => {
  e.preventDefault();
  const prospectId = state.currentProspectId;
  if (!prospectId) return;
  const entry = {
    prospect_id: prospectId,
    contact_date: document.getElementById("clog-date").value,
    method: document.getElementById("clog-method").value,
    replied: document.getElementById("clog-replied").value,
    follow_up_date: document.getElementById("clog-followup").value || null,
    notes: document.getElementById("clog-notes").value.trim(),
  };
  const saved = await dbAddContactEntry(entry);
  if (saved) {
    const p = getProspect(prospectId);
    if (p) {
      p.lastContactDate = entry.contact_date;
      if (entry.follow_up_date) p.followUpDate = entry.follow_up_date;
      await dbUpdateProspect(p);
      document.getElementById("prospect-last-contact").value = entry.contact_date;
      if (entry.follow_up_date) document.getElementById("prospect-followup").value = entry.follow_up_date;
    }
    await loadAndRenderContactLog(prospectId);
  }
  closeModal("modal-contact-log");
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
  ["prospect-first","prospect-last","prospect-street","prospect-city","prospect-state","prospect-zip","prospect-email","prospect-phone","prospect-form-last-contact","prospect-form-followup","prospect-second-first","prospect-second-last","prospect-second-phone","prospect-second-email"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("prospect-form-stage").value = "new";
  document.getElementById("prospect-form-source").value = "";
  document.getElementById("prospect-second-rel").value = "";
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
  document.getElementById("prospect-second-first").value = p.secondary?.firstName || "";
  document.getElementById("prospect-second-last").value = p.secondary?.lastName || "";
  document.getElementById("prospect-second-rel").value = p.secondary?.relationship || "";
  document.getElementById("prospect-second-phone").value = p.secondary?.phone || "";
  document.getElementById("prospect-second-email").value = p.secondary?.email || "";
  openModal("modal-prospect");
});

document.getElementById("form-prospect").addEventListener("submit", async e => {
  e.preventDefault();
  const secFirst = document.getElementById("prospect-second-first").value.trim();
  const secLast = document.getElementById("prospect-second-last").value.trim();
  const secondary = (secFirst || secLast) ? {
    firstName: secFirst,
    lastName: secLast,
    relationship: document.getElementById("prospect-second-rel").value,
    phone: document.getElementById("prospect-second-phone").value.trim(),
    email: document.getElementById("prospect-second-email").value.trim(),
  } : null;
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
    secondary,
  };

  if (state.editingProspectId) {
    const idx = state.prospects.findIndex(p => p.id === state.editingProspectId);
    if (idx !== -1) {
      state.prospects[idx] = { ...state.prospects[idx], ...data };
      await dbUpdateProspect(state.prospects[idx]);
      const secNameLine = data.secondary?.firstName
        ? ` <span class="detail-secondary-name">&amp; ${escapeHtml(data.secondary.firstName)} ${escapeHtml(data.secondary.lastName)}${data.secondary.relationship ? ` <span class="detail-secondary-rel">(${escapeHtml(data.secondary.relationship)})</span>` : ""}</span>`
        : "";
      document.getElementById("prospect-detail-name").innerHTML = `${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}${secNameLine}`;
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
    startDate: new Date().toISOString().slice(0, 10),
    secondary: p.secondary || null,
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

function getPeriodFromDate(dateStr) {
  if (!dateStr) return null;
  const month = parseInt(dateStr.split("-")[1], 10);
  return SCHEDULE_PERIODS[Math.floor((month - 1) / 2)] || null;
}

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
    const tasks = state.globalTasks.length > 0
      ? state.globalTasks.map(gt => ({ id: generateId(), globalId: gt.id, name: gt.name, minutes: gt.minutes, category: gt.category, frequency: gt.frequency }))
      : seedScheduleTasks();
    state.schedules[customerId] = { year: SCHEDULE_YEAR, tasks, schedule: {} };
    await dbSaveSchedule(customerId, SCHEDULE_YEAR, tasks, {});
  }

  // Reset to view mode
  state.scheduleEditMode = false;
  const editBtn = document.getElementById("btn-edit-schedule");
  if (editBtn) editBtn.textContent = "Edit Schedule";

  renderScheduleCard(customerId);
}

// ── Render Schedule Card (view or edit mode) ──────────────
function renderScheduleCard(customerId) {
  const sched = state.schedules[customerId];
  const el = document.getElementById("schedule-card-body");
  if (!el || !sched) return;
  const c = getCustomer(customerId);
  const limitMinutes = c?.minutesLimit || 75;

  if (!state.scheduleEditMode) {
    // Build period → completed appointment map
    const completedByPeriod = {};
    state.appointments
      .filter(a => a.customerId === customerId && a.type === "maintenance" && a.status === "completed" && a.date)
      .forEach(a => {
        const period = getPeriodFromDate(a.date);
        if (period && !completedByPeriod[period]) completedByPeriod[period] = a;
      });
    el.innerHTML = buildScheduleSummaryHTML(sched.tasks, sched.schedule, limitMinutes, completedByPeriod);
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

function buildScheduleSummaryHTML(tasks, schedule, limitMinutes, completedByPeriod = {}) {
  const anyTasks = SCHEDULE_PERIODS.some(p => {
    const ids = schedule[p];
    return Array.isArray(ids) && ids.length > 0;
  });

  if (!anyTasks) {
    return `<div class="empty-state"><p>No tasks scheduled yet.</p><p>Click <strong>Edit Schedule</strong> to build this customer's annual plan.</p></div>`;
  }

  // Pre-calculate per-period totals and over-limit status
  const periodTotals = {};
  const overSet = new Set();
  SCHEDULE_PERIODS.forEach(p => {
    const ids = Array.isArray(schedule[p]) ? schedule[p] : [];
    const total = ids.reduce((sum, id) => { const t = tasks.find(t => t.id === id); return sum + (t?.minutes || 0); }, 0);
    periodTotals[p] = total;
    if (total > limitMinutes) overSet.add(p);
  });

  // Only show categories that have at least one task scheduled in any period
  const activeCategories = SCHEDULE_CATEGORIES.filter(cat =>
    tasks.some(t => t.category === cat &&
      SCHEDULE_PERIODS.some(p => (schedule[p] || []).includes(t.id))
    )
  );

  const headerCols = SCHEDULE_PERIODS.map(p => {
    const overClass = overSet.has(p) ? "sched-summary-col--over" : "";
    const done = completedByPeriod[p];
    let doneHtml = "";
    if (done) {
      const total = done.scheduledTasks ? done.scheduledTasks.length : 0;
      const completed = done.scheduledTasks ? done.scheduledTasks.filter(t => t.completed).length : 0;
      const dateStr = done.date ? formatApptDate(done.date) : "";
      doneHtml = `<div class="sched-period-done">✓ ${total > 0 ? `${completed}/${total} tasks` : "completed"}${dateStr ? `<br><span class="sched-period-done__date">${dateStr}</span>` : ""}</div>`;
    }
    return `<th class="${overClass}">${escapeHtml(p)}${doneHtml}</th>`;
  }).join("");

  const bodyRows = activeCategories.map(category => {
    const catTasks = tasks.filter(t => t.category === category);
    const cells = SCHEDULE_PERIODS.map(period => {
      const ids = Array.isArray(schedule[period]) ? schedule[period] : [];
      const cellTasks = catTasks.filter(t => ids.includes(t.id));
      const overClass = overSet.has(period) ? " sched-summary-col--over" : "";
      const content = cellTasks.length > 0
        ? cellTasks.map(t => `<div class="sched-view-task"><span>${escapeHtml(t.name)}</span><span class="task-min">${t.minutes}m</span></div>`).join("")
        : `<span class="sched-view-empty">—</span>`;
      return `<td class="${overClass}">${content}</td>`;
    }).join("");
    return `<tr><th class="category-cell">${escapeHtml(category)}</th>${cells}</tr>`;
  }).join("");

  const totalsRow = `<tr class="schedule-total-row"><th>Total minutes</th>${
    SCHEDULE_PERIODS.map(p => {
      const overClass = overSet.has(p) ? "schedule-total--over" : "";
      return `<td class="${overClass}">${periodTotals[p]} / ${limitMinutes}m</td>`;
    }).join("")
  }</tr>`;

  return `<div class="schedule-table-wrap"><table class="schedule-table">
    <thead><tr><th>Category</th>${headerCols}</tr></thead>
    <tbody>${bodyRows}${totalsRow}</tbody>
  </table></div>`;
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

// ── Print Schedule ───────────────────────────────────────
function printSchedule(customerId) {
  const sched = state.schedules[customerId];
  const c = getCustomer(customerId);
  if (!sched || !c) return;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const address = getFullAddress(c);
  const { tasks, schedule } = sched;

  const activeCategories = SCHEDULE_CATEGORIES.filter(cat =>
    tasks.some(t => t.category === cat &&
      SCHEDULE_PERIODS.some(p => (schedule[p] || []).includes(t.id))
    )
  );

  const headerCols = SCHEDULE_PERIODS.map(p =>
    `<th>${escapeHtml(p)}</th>`
  ).join("");

  const bodyRows = activeCategories.map(cat => {
    const catTasks = tasks.filter(t => t.category === cat);
    const cells = SCHEDULE_PERIODS.map(p => {
      const ids = Array.isArray(schedule[p]) ? schedule[p] : [];
      const cellTasks = catTasks.filter(t => ids.includes(t.id));
      const content = cellTasks.length > 0
        ? cellTasks.map(t => `<div class="ptask">&#9656; ${escapeHtml(t.name)}</div>`).join("")
        : "";
      return `<td>${content}</td>`;
    }).join("");
    return `<tr><th>${escapeHtml(cat)}</th>${cells}</tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Home Maintenance Schedule – ${escapeHtml(fullName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, serif; background: #f5f0eb; color: #2a1a0a; }
  .page { max-width: 960px; margin: 0 auto; background: #fff; }
  /* Header */
  .ph { background: #5c2d0a; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 1.2rem 2rem; }
  .ph-logo { font-size: 1.4rem; font-weight: 900; letter-spacing: -0.5px; color: #fff; }
  .ph-logo span { display: block; font-size: 0.65rem; font-weight: 400; letter-spacing: 2px; text-transform: uppercase; color: #f0c88a; }
  .ph-title { text-align: center; }
  .ph-title h1 { font-size: 1.5rem; font-weight: 700; }
  .ph-title p { font-size: 0.8rem; font-style: italic; color: #f0c88a; margin-top: 0.2rem; }
  .ph-contact { text-align: right; font-size: 0.75rem; line-height: 1.8; color: #f0c88a; }
  /* Customer line */
  .cust-bar { display: flex; gap: 2rem; padding: 0.9rem 2rem; border-bottom: 2px solid #8b4513; background: #fff; }
  .cust-bar label { font-size: 0.78rem; color: #8b4513; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 0.4rem; }
  .cust-bar span { font-size: 0.95rem; border-bottom: 1px solid #c8a882; padding-bottom: 2px; min-width: 200px; display: inline-block; }
  /* Table */
  .wrap { padding: 1.5rem 2rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  thead th { background: #3d1f08; color: #fff; text-align: center; padding: 0.6rem 0.5rem; font-size: 0.78rem; border: 1px solid #5c2d0a; }
  thead th:first-child { text-align: left; width: 130px; }
  tbody th { font-style: italic; font-weight: 700; color: #5c2d0a; text-align: left; padding: 0.5rem 0.5rem; border: 1px solid #d4b896; vertical-align: top; background: #fdf8f2; }
  tbody td { border: 1px solid #d4b896; padding: 0.4rem 0.6rem; vertical-align: top; min-width: 80px; }
  .ptask { margin: 2px 0; line-height: 1.4; padding-left: 1em; text-indent: -1em; }
  /* Footer */
  .pf { background: #f5f0eb; text-align: center; font-size: 0.72rem; color: #8b4513; padding: 0.7rem 2rem; border-top: 2px solid #c8a882; }
  /* Print controls */
  .print-controls { text-align: center; padding: 1.5rem; background: #f5f0eb; }
  .tip { display: inline-block; background: #fffbe6; border: 1px solid #f0c88a; border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.78rem; margin-bottom: 1rem; }
  .tip::before { content: '💡  '; }
  .btn-print { background: #2e6070; color: #fff; border: none; border-radius: 8px; padding: 0.6rem 1.8rem; font-size: 1rem; cursor: pointer; margin-right: 0.75rem; }
  .btn-cancel { background: transparent; border: 2px solid #5c2d0a; border-radius: 8px; padding: 0.6rem 1.4rem; font-size: 1rem; cursor: pointer; color: #5c2d0a; }
  @media print {
    .print-controls { display: none; }
    body { background: #fff; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="ph">
    <div class="ph-logo">House<br>Hero<span>Home Services</span></div>
    <div class="ph-title"><h1>Home Maintenance Schedule</h1><p>Your Partner for Worry-Free Home Maintenance</p></div>
    <div class="ph-contact">info@househeropa.com<br>(570) 301-6283<br>househeropa.com</div>
  </div>
  <div class="cust-bar">
    <div><label>Prepared for:</label><span>${escapeHtml(fullName)}</span></div>
    <div><label>Address:</label><span>${escapeHtml(address)}</span></div>
  </div>
  <div class="wrap">
    <table>
      <thead><tr><th>Category</th>${headerCols}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
  <div class="pf">House Hero LLC &nbsp;|&nbsp; PA Registered &amp; Insured &nbsp;|&nbsp; (570) 301-6283 &nbsp;|&nbsp; info@househeropa.com</div>
</div>
<div class="print-controls">
  <div class="tip">In the print dialog &rarr; More settings &rarr; uncheck &ldquo;Headers and footers&rdquo;</div><br>
  <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
  <button class="btn-cancel" onclick="window.close()">Cancel</button>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

document.getElementById("btn-print-schedule").addEventListener("click", () => {
  printSchedule(state.currentCustomerId);
});

// ── Schedule view/edit toggle ─────────────────────────────
document.getElementById("btn-edit-schedule").addEventListener("click", () => {
  state.scheduleEditMode = !state.scheduleEditMode;
  document.getElementById("btn-edit-schedule").textContent = state.scheduleEditMode ? "Done" : "Edit Schedule";
  renderScheduleCard(state.currentCustomerId);
});

// ── Task Library ───────────────────────────────────────────
// ── Global Task Library View ───────────────────────────────
function renderGlobalTaskLibraryView() {
  const container = document.getElementById("global-task-table");
  if (!container) return;
  if (state.globalTasks.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No tasks yet. Add one above.</p></div>`;
    return;
  }
  const html = SCHEDULE_CATEGORIES.map(category => {
    const catTasks = state.globalTasks.filter(t => t.category === category);
    if (catTasks.length === 0) return "";
    return `<div class="task-lib-group">
      <div class="task-lib-category-label">${escapeHtml(category)}</div>
      ${catTasks.map(task => `
        <div class="task-lib-row">
          <input class="task-lib-input" data-field="name" data-gid="${task.id}" type="text" value="${escapeHtml(task.name)}" />
          <input class="task-lib-input" data-field="minutes" data-gid="${task.id}" type="number" min="1" value="${task.minutes}" style="width:60px;" />
          <span class="task-lib-min-label">min</span>
          <select data-field="frequency" data-gid="${task.id}">
            <option value="every" ${task.frequency === "every" ? "selected" : ""}>Every visit</option>
            <option value="annual" ${task.frequency === "annual" ? "selected" : ""}>Annual</option>
            <option value="adhoc" ${task.frequency === "adhoc" ? "selected" : ""}>Ad hoc</option>
          </select>
          <button type="button" class="ghost danger icon-btn" data-glib-remove="${task.id}">&#10005;</button>
        </div>`).join("")}
    </div>`;
  }).join("");
  container.innerHTML = html;

  container.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("change", async () => {
      const task = state.globalTasks.find(t => t.id === input.dataset.gid);
      if (!task) return;
      if (input.dataset.field === "name") task.name = input.value.trim();
      if (input.dataset.field === "minutes") task.minutes = Number(input.value) || task.minutes;
      if (input.dataset.field === "frequency") task.frequency = input.value;
      await dbUpdateGlobalTask(task);
    });
  });

  container.querySelectorAll("[data-glib-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this task from the global library?")) return;
      await dbDeleteGlobalTask(btn.dataset.glibRemove);
      state.globalTasks = state.globalTasks.filter(t => t.id !== btn.dataset.glibRemove);
      renderGlobalTaskLibraryView();
    });
  });
}

document.getElementById("form-global-task").addEventListener("submit", async e => {
  e.preventDefault();
  const task = {
    name: document.getElementById("gtask-name").value.trim(),
    minutes: Number(document.getElementById("gtask-minutes").value) || 15,
    category: document.getElementById("gtask-category").value,
    frequency: document.getElementById("gtask-frequency").value,
  };
  const saved = await dbInsertGlobalTask(task);
  if (saved) {
    state.globalTasks.push(saved);
    // Also add to all existing customer schedules (unscheduled)
    const rows = await dbLoadAllSchedules(SCHEDULE_YEAR);
    await Promise.all(rows.map(async row => {
      const tasks = [...(row.tasks || []), { id: generateId(), globalId: saved.id, name: saved.name, minutes: saved.minutes, category: saved.category, frequency: saved.frequency }];
      await dbSaveSchedule(row.customer_id, row.year, tasks, row.schedule || {});
      if (state.schedules[row.customer_id]) state.schedules[row.customer_id].tasks = tasks;
    }));
    renderGlobalTaskLibraryView();
    e.target.reset();
  }
});

document.getElementById("btn-push-global-tasks").addEventListener("click", async () => {
  if (!confirm("Push all task name/minute/category/frequency updates to every customer's schedule?")) return;
  const btn = document.getElementById("btn-push-global-tasks");
  btn.disabled = true; btn.textContent = "Pushing...";
  const rows = await dbLoadAllSchedules(SCHEDULE_YEAR);
  let updated = 0;
  for (const row of rows) {
    let tasks = row.tasks || [];
    let changed = false;
    tasks = tasks.map(t => {
      if (!t.globalId) return t;
      const gt = state.globalTasks.find(g => g.id === t.globalId);
      if (!gt) return t;
      if (t.name !== gt.name || t.minutes !== gt.minutes || t.category !== gt.category || t.frequency !== gt.frequency) {
        changed = true;
        return { ...t, name: gt.name, minutes: gt.minutes, category: gt.category, frequency: gt.frequency };
      }
      return t;
    });
    // Add any new global tasks missing from this customer
    const existingGlobalIds = new Set(tasks.filter(t => t.globalId).map(t => t.globalId));
    const newTasks = state.globalTasks.filter(gt => !existingGlobalIds.has(gt.id)).map(gt => ({
      id: generateId(), globalId: gt.id, name: gt.name, minutes: gt.minutes, category: gt.category, frequency: gt.frequency
    }));
    if (newTasks.length) { tasks = [...tasks, ...newTasks]; changed = true; }
    if (changed) {
      await dbSaveSchedule(row.customer_id, row.year, tasks, row.schedule || {});
      if (state.schedules[row.customer_id]) state.schedules[row.customer_id].tasks = tasks;
      updated++;
    }
  }
  btn.disabled = false; btn.textContent = "↑ Push updates to all customers";
  alert(`Done! Updated ${updated} customer schedule${updated !== 1 ? "s" : ""}.`);
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
    const tech = c.technicianId ? state.technicians.find(t => t.id === c.technicianId) : null;
    const techHtml = tech
      ? `<a href="#" class="master-sched-tech master-sched-link" data-tech-id="${tech.id}">🔧 ${escapeHtml(tech.firstName)} ${escapeHtml(tech.lastName)}</a>`
      : `<span class="master-sched-tech master-sched-tech--unassigned">Unassigned</span>`;
    return `<div class="master-sched-card">
      <div class="master-sched-header">
        <div>
          <a href="#" class="master-sched-name master-sched-link" data-cust-id="${c.id}">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}${addr ? `<span style="font-weight:400;font-size:0.82rem;color:var(--muted);margin-left:0.5rem;">${escapeHtml(addr)}</span>` : ""}</a>
          ${techHtml}
        </div>
        <span class="master-sched-total ${overClass}">${total} / ${limit}m</span>
      </div>
      <ul class="master-sched-tasks">
        ${tasks.map(t => `<li><span>${escapeHtml(t.name)}</span><span class="task-min">${t.minutes}m</span></li>`).join("")}
      </ul>
    </div>`;
  }).join("");

  listEl.querySelectorAll("[data-cust-id]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      state.returnTo = "schedule";
      document.getElementById("view-schedule").style.display = "none";
      openCustomer(el.dataset.custId);
    });
  });
  listEl.querySelectorAll("[data-tech-id]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      state.techReturnTo = "schedule";
      document.getElementById("view-schedule").style.display = "none";
      openTechnician(el.dataset.techId);
    });
  });
}

// ── Appointment Constants ──────────────────────────────────
const APPT_TYPE_LABELS = {
  maintenance: "🔧 Maintenance Visit",
  consult: "🏠 In-Home Consultation",
  work_order: "🛠️ Work Order",
  a_la_carte: "✨ A La Carte Service",
};

// (appointmentToDb, dbInsertAppointment, dbUpdateAppointment, dbDeleteAppointment live at top of file)

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function addMinutesToTime(timeStr, minutes) {
  if (!timeStr || !minutes) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + parseInt(minutes, 10);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatApptDate(iso) {
  if (!iso) return "Unknown Date";
  const d = new Date(iso + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (diff === 0) return `Today \u2014 ${label}`;
  if (diff === 1) return `Tomorrow \u2014 ${label}`;
  if (diff === -1) return `Yesterday \u2014 ${label}`;
  return label;
}

function appointmentCardHtml(a, opts = {}) {
  const tech = a.technicianId ? state.technicians.find(t => t.id === a.technicianId) : null;
  const cust = a.customerId ? state.customers.find(c => c.id === a.customerId) : null;
  const prospect = a.prospectId ? state.prospects.find(p => p.id === a.prospectId) : null;
  const typeLabel = APPT_TYPE_LABELS[a.type] || a.type;
  const timeStr = a.startTime ? formatTime(a.startTime) + (a.endTime ? ` \u2013 ${formatTime(a.endTime)}` : "") : "Time TBD";
  const statusClass = a.status === "completed" ? "completed" : a.status === "cancelled" ? "cancelled" : "scheduled";
  return `
    <div class="appointment-card appt-status--${statusClass}" data-appt-id="${a.id}">
      <div class="appointment-card__main">
        <div class="appointment-card__type">${escapeHtml(typeLabel)}</div>
        <div class="appointment-card__meta">
          <span>\uD83D\uDD50 ${escapeHtml(timeStr)}</span>
          ${!opts.hideTech && tech ? `<span>\uD83D\uDD27 ${escapeHtml(tech.firstName)} ${escapeHtml(tech.lastName)}</span>` : ""}
          ${!opts.hideCust && cust ? `<span>\uD83D\uDC64 <a class="appt-cust-link" data-cust-id="${cust.id}" href="#">${escapeHtml(cust.firstName)} ${escapeHtml(cust.lastName)}</a></span>` : ""}
          ${!opts.hideCust && prospect ? `<span>\uD83D\uDC64 <a class="appt-prospect-link" data-prospect-id="${prospect.id}" href="#">${escapeHtml(prospect.firstName)} ${escapeHtml(prospect.lastName)}</a> <span class="badge--prospect">Prospect</span></span>` : ""}
          ${a.notes ? `<span class="appt-notes-preview">\uD83D\uDCAC ${escapeHtml(a.notes)}</span>` : ""}
          ${a.scheduledTasks && a.scheduledTasks.length > 0 ? `
          <div class="appt-work-summary">
            ${a.scheduledTasks.map(t => `<span class="appt-work-task appt-work-task--${t.completed ? "done" : "skip"}">${t.completed ? "\u2713" : "\u2715"} ${escapeHtml(t.name)}</span>`).join("")}
            ${a.additionalWork ? `<span class="appt-work-extra">+ ${escapeHtml(a.additionalWork)}</span>` : ""}
          </div>` : ""}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
        <span class="customer-card__badge badge--${statusClass}">${a.status || "scheduled"}</span>
        ${a.type === "maintenance" && a.status !== "completed" && a.status !== "cancelled" ? `<button class="btn--complete appt-complete-btn" data-appt-id="${a.id}" type="button">\u2705 Complete</button>` : ""}
        <button class="ghost ghost--small appt-edit-btn" data-appt-id="${a.id}" type="button">Edit</button>
        <button class="ghost danger icon-btn appt-delete-btn" data-appt-id="${a.id}" type="button">\u2715</button>
      </div>
    </div>`;
}

function appointmentPillHtml(a) {
  const cust = a.customerId ? state.customers.find(c => c.id === a.customerId) : null;
  const prospect = a.prospectId ? state.prospects.find(p => p.id === a.prospectId) : null;
  const contact = cust || prospect;
  const tech = a.technicianId ? state.technicians.find(t => t.id === a.technicianId) : null;
  const statusClass = a.status === "completed" ? "completed" : a.status === "cancelled" ? "cancelled" : "scheduled";
  const line1 = a.startTime ? formatTime(a.startTime) : "TBD";
  const line2 = contact ? `${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}${prospect ? " \u2605" : ""}` : (APPT_TYPE_LABELS[a.type] || a.type).replace(/^\S+\s/, "");
  const line3 = tech ? `${escapeHtml(tech.firstName)} ${escapeHtml(tech.lastName)}` : "";
  const tooltip = `${(APPT_TYPE_LABELS[a.type]||a.type).replace(/^\S+\s/,'')}${contact ? ' \u2014 '+contact.firstName+' '+contact.lastName+(prospect?' (Prospect)':'') : ''}${tech ? ' \u00b7 '+tech.firstName+' '+tech.lastName : ''}${a.startTime ? ' @ '+formatTime(a.startTime) : ''}`;
  return `<div class="cal-week-pill cal-week-pill--${escapeHtml(a.type)} appt-status--${statusClass}" data-appt-id="${a.id}" title="${escapeHtml(tooltip)}">
    <span class="cal-week-pill__time">${line1}</span>
    <span class="cal-week-pill__name">${line2}</span>
    ${line3 ? `<span class="cal-week-pill__tech">${line3}</span>` : ""}
  </div>`;
}

function bindApptEvents(containerEl) {
  containerEl.querySelectorAll(".appt-cust-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      openCustomer(link.dataset.custId);
    });
  });
  containerEl.querySelectorAll(".appt-prospect-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      openProspect(link.dataset.prospectId);
    });
  });
  containerEl.querySelectorAll(".appt-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditAppointmentModal(btn.dataset.apptId));
  });
  containerEl.querySelectorAll(".appt-complete-btn").forEach(btn => {
    btn.addEventListener("click", () => openCompleteAppointmentModal(btn.dataset.apptId));
  });
  containerEl.querySelectorAll(".appt-schedule-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      openCustomerToSchedule(link.dataset.custId);
    });
  });
  containerEl.querySelectorAll(".appt-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this appointment?")) return;
      await dbDeleteAppointment(btn.dataset.apptId);
      state.appointments = state.appointments.filter(a => a.id !== btn.dataset.apptId);
      refreshApptContext();
    });
  });
}

function renderAppointmentList(appointments, containerEl, opts = {}) {
  if (!containerEl) return;
  if (appointments.length === 0) {
    containerEl.innerHTML = `<div class="empty-state"><p>No appointments ${opts.past ? "found" : "upcoming"}.</p><p>Click \u201c+ Schedule Appointment\u201d to add one.</p></div>`;
    return;
  }
  const byDate = {};
  appointments.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  const sortedDates = Object.keys(byDate).sort();
  containerEl.innerHTML = sortedDates.map(date => {
    const cards = byDate[date]
      .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"))
      .map(a => appointmentCardHtml(a, opts)).join("");
    return `<div class="appt-date-group">
      <div class="appt-date-group__header">${formatApptDate(date)}</div>
      ${cards}
    </div>`;
  }).join("");
  bindApptEvents(containerEl);
}

function refreshApptContext() {
  if (state.apptContext === "customer" && state.currentCustomerId) {
    renderCustomerAppointments(state.currentCustomerId);
  } else if (state.apptContext === "technician" && state.currentTechnicianId) {
    renderTechnicianAppointments(state.currentTechnicianId);
  } else {
    renderCalendar();
  }
}

function renderCustomerAppointments(customerId) {
  const containerEl = document.getElementById("customer-appointment-list");
  if (!containerEl) return;
  const appts = state.appointments
    .filter(a => a.customerId === customerId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
  renderAppointmentList(appts, containerEl, { hideCust: true });
}

function renderTechnicianAppointments(technicianId) {
  const containerEl = document.getElementById("technician-appointment-list");
  if (!containerEl) return;
  const today = new Date().toISOString().slice(0, 10);
  const appts = state.appointments
    .filter(a => a.technicianId === technicianId && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
  renderAppointmentList(appts, containerEl, { hideTech: true });
}


// ── Availability ───────────────────────────────────────────
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function renderTechnicianAvailability(techId) {
  const weeklyEl = document.getElementById("technician-weekly-availability");
  const overrideEl = document.getElementById("technician-override-list");
  if (!weeklyEl || !overrideEl) return;

  const techBlocks = state.weeklyAvailability
    .filter(b => b.technicianId === techId)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  let gridHtml = `<div class="avail-week-grid">`;
  for (let d = 0; d < 7; d++) {
    const dayBlocks = techBlocks.filter(b => b.dayOfWeek === d);
    const isEmpty = dayBlocks.length === 0;
    const blockHtml = dayBlocks.map(b => `
      <span class="avail-block-tag">
        <span>${formatTime(b.startTime)} \u2013 ${formatTime(b.endTime)}</span>
        <button type="button" class="btn-avail-del-block avail-block-del" data-id="${b.id}" title="Remove">&times;</button>
      </span>`).join("");
    gridHtml += `
      <div class="avail-day-row" data-day="${d}" id="avail-day-${d}">
        <span class="avail-day-name${isEmpty ? " avail-day-name--off" : ""}">${DAY_NAMES[d]}</span>
        <div class="avail-day-blocks">
          ${isEmpty ? '<span class="avail-off-label">Not scheduled</span>' : blockHtml}
        </div>
        <button type="button" class="btn-avail-add-block ghost ghost--small" data-day="${d}" data-tech="${techId}">+ Add Hours</button>
      </div>`;
  }
  gridHtml += `</div>`;
  weeklyEl.innerHTML = gridHtml;

  weeklyEl.querySelectorAll(".btn-avail-del-block").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await dbDeleteWeeklyAvail(btn.dataset.id);
      state.weeklyAvailability = state.weeklyAvailability.filter(b => b.id !== btn.dataset.id);
      renderTechnicianAvailability(techId);
    });
  });

  weeklyEl.querySelectorAll(".btn-avail-add-block").forEach(btn => {
    btn.addEventListener("click", () => showInlineBlockForm(weeklyEl, parseInt(btn.dataset.day), techId));
  });

  // Overrides list
  const techOverrides = state.availabilityOverrides
    .filter(o => o.technicianId === techId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (techOverrides.length === 0) {
    overrideEl.innerHTML = `<div class="empty-state" style="padding:0.5rem 0;"><p>No date overrides yet.</p></div>`;
  } else {
    overrideEl.innerHTML = `<div class="override-list">${techOverrides.map(o => overrideRowHtml(o)).join("")}</div>`;
    overrideEl.querySelectorAll(".btn-edit-override").forEach(btn => {
      btn.addEventListener("click", () => openAvailOverrideModal({ id: btn.dataset.id, technicianId: techId }));
    });
    overrideEl.querySelectorAll(".btn-del-override").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this date override?")) return;
        await dbDeleteOverride(btn.dataset.id);
        state.availabilityOverrides = state.availabilityOverrides.filter(o => o.id !== btn.dataset.id);
        renderTechnicianAvailability(techId);
      });
    });
  }
}

function showInlineBlockForm(container, dayNum, techId) {
  const existing = container.querySelector(".avail-inline-form");
  if (existing) existing.remove();
  const row = container.querySelector(`.avail-day-row[data-day="${dayNum}"]`);
  if (!row) return;

  // Suggest a start time after the last existing block on this day
  let defStart = "08:00", defEnd = "17:00";
  const dayBlocks = state.weeklyAvailability
    .filter(b => b.technicianId === techId && b.dayOfWeek === dayNum)
    .sort((a, b) => a.endTime.localeCompare(b.endTime));
  if (dayBlocks.length) {
    const [h, m] = dayBlocks[dayBlocks.length - 1].endTime.split(":").map(Number);
    const newH = Math.min(h + 1, 22);
    defStart = `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    defEnd = `${String(Math.min(newH + 4, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  row.insertAdjacentHTML("afterend", `
    <div class="avail-inline-form" data-day="${dayNum}">
      <span class="avail-inline-label">${DAY_NAMES[dayNum]}</span>
      <input type="time" class="avail-inline-start" value="${defStart}" />
      <span class="avail-inline-sep">–</span>
      <input type="time" class="avail-inline-end" value="${defEnd}" />
      <button type="button" class="avail-inline-save">Save</button>
      <button type="button" class="avail-inline-cancel ghost ghost--small">Cancel</button>
    </div>`);

  const form = container.querySelector(".avail-inline-form");
  form.querySelector(".avail-inline-save").addEventListener("click", async () => {
    const startTime = form.querySelector(".avail-inline-start").value;
    const endTime = form.querySelector(".avail-inline-end").value;
    if (!startTime || !endTime) { alert("Please enter start and end times."); return; }
    if (startTime >= endTime) { alert("End time must be after start time."); return; }
    form.querySelector(".avail-inline-save").disabled = true;
    const newBlock = await dbInsertWeeklyAvail({ technicianId: techId, dayOfWeek: dayNum, startTime, endTime });
    if (newBlock) {
      state.weeklyAvailability.push(newBlock);
      renderTechnicianAvailability(techId);
    }
  });
  form.querySelector(".avail-inline-cancel").addEventListener("click", () => form.remove());
}

function overrideRowHtml(o) {
  const [y, mo, d] = o.date.split("-");
  const displayDate = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  let detail = o.isDayOff
    ? `<span class="override-badge override-badge--off">Day Off</span>`
    : `<span class="override-badge override-badge--custom">Custom: ${(o.blocks || []).map(b => `${formatTime(b.start)} \u2013 ${formatTime(b.end)}`).join(", ") || "No blocks"}</span>`;
  const noteHtml = o.note ? `<span class="override-note">${escapeHtml(o.note)}</span>` : "";
  return `
    <div class="override-row">
      <div class="override-row__info">
        <span class="override-row__date">${displayDate}</span>
        ${detail}${noteHtml}
      </div>
      <div class="override-row__actions">
        <button type="button" class="ghost ghost--small btn-edit-override" data-id="${o.id}">Edit</button>
        <button type="button" class="ghost ghost--small danger btn-del-override" data-id="${o.id}">&times;</button>
      </div>
    </div>`;
}

function closureRowHtml(o) {
  const [y, mo, d] = o.date.split("-");
  const displayDate = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const noteHtml = o.note ? `<span class="override-note">${escapeHtml(o.note)}</span>` : "";
  return `
    <div class="override-row">
      <div class="override-row__info">
        <span class="override-row__date">${displayDate}</span>
        <span class="override-badge override-badge--closed">Closed</span>
        ${noteHtml}
      </div>
      <div class="override-row__actions">
        <button type="button" class="ghost ghost--small btn-edit-closure" data-id="${o.id}">Edit</button>
        <button type="button" class="ghost ghost--small danger btn-del-closure" data-id="${o.id}">&times;</button>
      </div>
    </div>`;
}

function renderCompanyClosures() {
  const el = document.getElementById("company-closures-list");
  if (!el) return;
  const closures = state.availabilityOverrides
    .filter(o => o.technicianId === null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (closures.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:0.5rem 0;"><p>No company closures defined yet.</p></div>`;
  } else {
    el.innerHTML = `<div class="override-list">${closures.map(o => closureRowHtml(o)).join("")}</div>`;
    el.querySelectorAll(".btn-edit-closure").forEach(btn => {
      btn.addEventListener("click", () => openAvailOverrideModal({ id: btn.dataset.id, isCompany: true }));
    });
    el.querySelectorAll(".btn-del-closure").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this company closure?")) return;
        await dbDeleteOverride(btn.dataset.id);
        state.availabilityOverrides = state.availabilityOverrides.filter(o => o.id !== btn.dataset.id);
        renderCompanyClosures();
      });
    });
  }
}

function openAvailOverrideModal(opts = {}) {
  state.editingOverrideId = opts.id || null;
  state.overrideContext = opts.isCompany ? "company" : "technician";
  const existing = opts.id ? state.availabilityOverrides.find(o => o.id === opts.id) : null;
  const isCompany = !!opts.isCompany;

  document.getElementById("modal-avail-override-title").textContent =
    opts.id
      ? (isCompany ? "Edit Company Closure" : "Edit Date Override")
      : (isCompany ? "Add Company Closure" : "Add Date Override");

  document.getElementById("ao-date").value = existing?.date || "";
  document.getElementById("ao-type").value = (existing && !existing.isDayOff) ? "custom" : "day_off";
  document.getElementById("ao-note").value = existing?.note || "";
  document.getElementById("ao-tech-id").value = isCompany ? "" : (opts.technicianId || existing?.technicianId || "");

  // Company closures always "day off" — hide type selector
  document.getElementById("ao-type-row").style.display = isCompany ? "none" : "";
  if (isCompany) document.getElementById("ao-type").value = "day_off";

  toggleAoBlocksSection();

  // Populate blocks
  const blocksList = document.getElementById("ao-blocks-list");
  blocksList.innerHTML = "";
  (existing?.blocks || []).forEach(b => addAoBlockRow(b.start, b.end));

  const deleteBtn = document.getElementById("btn-delete-avail-override");
  deleteBtn.style.display = opts.id ? "" : "none";

  document.getElementById("modal-avail-override").style.display = "flex";
}

function toggleAoBlocksSection() {
  const type = document.getElementById("ao-type").value;
  const section = document.getElementById("ao-blocks-section");
  section.style.display = type === "custom" ? "" : "none";
  if (type === "custom" && document.getElementById("ao-blocks-list").childElementCount === 0) {
    addAoBlockRow("08:00", "17:00");
  }
}

function addAoBlockRow(start = "08:00", end = "17:00") {
  const list = document.getElementById("ao-blocks-list");
  const row = document.createElement("div");
  row.className = "ao-block-row";
  row.innerHTML = `
    <input type="time" class="ao-block-start" value="${start}" />
    <span class="avail-inline-sep">–</span>
    <input type="time" class="ao-block-end" value="${end}" />
    <button type="button" class="ghost ghost--small ao-block-del" title="Remove">&times;</button>`;
  row.querySelector(".ao-block-del").addEventListener("click", () => row.remove());
  list.appendChild(row);
}

document.getElementById("ao-type").addEventListener("change", toggleAoBlocksSection);
document.getElementById("btn-ao-add-block").addEventListener("click", () => addAoBlockRow());

document.getElementById("form-avail-override").addEventListener("submit", async e => {
  e.preventDefault();
  const date = document.getElementById("ao-date").value;
  const type = document.getElementById("ao-type").value;
  const note = document.getElementById("ao-note").value.trim();
  const technicianId = document.getElementById("ao-tech-id").value || null;
  const isDayOff = type !== "custom";

  let blocks = [];
  if (!isDayOff) {
    blocks = [...document.querySelectorAll("#ao-blocks-list .ao-block-row")].map(r => ({
      start: r.querySelector(".ao-block-start").value,
      end: r.querySelector(".ao-block-end").value,
    })).filter(b => b.start && b.end && b.start < b.end);
    if (blocks.length === 0) { alert("Please add at least one valid time block."); return; }
  }

  const submitBtn = e.target.querySelector("[type=submit]");
  submitBtn.disabled = true;
  const item = { date, isDayOff, blocks, note, technicianId };

  if (state.editingOverrideId) {
    item.id = state.editingOverrideId;
    await dbUpdateOverride(item);
    const idx = state.availabilityOverrides.findIndex(o => o.id === state.editingOverrideId);
    if (idx >= 0) state.availabilityOverrides[idx] = { ...state.availabilityOverrides[idx], ...item };
  } else {
    const saved = await dbInsertOverride(item);
    if (saved) state.availabilityOverrides.push(saved);
  }

  submitBtn.disabled = false;
  closeModal("modal-avail-override");
  if (state.overrideContext === "company") {
    renderCompanyClosures();
  } else if (state.currentTechnicianId) {
    renderTechnicianAvailability(state.currentTechnicianId);
  }
});

document.getElementById("btn-delete-avail-override").addEventListener("click", async () => {
  if (!state.editingOverrideId || !confirm("Delete this override?")) return;
  await dbDeleteOverride(state.editingOverrideId);
  state.availabilityOverrides = state.availabilityOverrides.filter(o => o.id !== state.editingOverrideId);
  closeModal("modal-avail-override");
  if (state.overrideContext === "company") {
    renderCompanyClosures();
  } else if (state.currentTechnicianId) {
    renderTechnicianAvailability(state.currentTechnicianId);
  }
});

document.getElementById("btn-add-avail-override").addEventListener("click", () => {
  openAvailOverrideModal({ technicianId: state.currentTechnicianId });
});

document.getElementById("btn-add-closure").addEventListener("click", () => {
  openAvailOverrideModal({ isCompany: true });
});

document.getElementById("cal-closures-toggle").addEventListener("click", () => {
  const panel = document.getElementById("company-closures-panel");
  const visible = panel.style.display !== "none";
  panel.style.display = visible ? "none" : "";
  if (!visible) renderCompanyClosures();
});

// ── Calendar View ──────────────────────────────────────────
function openCalendarView() {
  populateCalendarTechFilter();
  renderCalendar();
  // Refresh closures list if panel is open
  const panel = document.getElementById("company-closures-panel");
  if (panel && panel.style.display !== "none") renderCompanyClosures();
}

function populateCalendarTechFilter() {
  const sel = document.getElementById("calendar-tech-filter");
  const current = state.calendarTechFilter || "";
  sel.innerHTML = `<option value="">All Technicians</option>` +
    state.technicians.filter(t => t.status === "active").map(t =>
      `<option value="${t.id}"${t.id === current ? " selected" : ""}>${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}</option>`
    ).join("");
}

function getWeekRange(date) {
  const d = new Date(date);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getCalendarAppts() {
  const filter = state.calendarTechFilter || "";
  return state.appointments.filter(a => !filter || a.technicianId === filter);
}

function renderCalendar() {
  if (state.calendarView === "month") {
    renderMonthCalendar();
  } else {
    renderWeekCalendar();
  }
  const subtitle = document.getElementById("calendar-subtitle");
  if (subtitle) {
    if (state.calendarView === "week") {
      const { start, end } = getWeekRange(state.calendarDate);
      subtitle.textContent = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} \u2013 ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else {
      subtitle.textContent = state.calendarDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }
}

function renderWeekCalendar() {
  const el = document.getElementById("calendar-grid");
  if (!el) return;
  const { start } = getWeekRange(state.calendarDate);
  const allAppts = getCalendarAppts();
  const todayStr = new Date().toISOString().slice(0, 10);
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayAppts = allAppts
      .filter(a => a.date === dateStr)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    const isToday = dateStr === todayStr;
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const cards = dayAppts.length
      ? dayAppts.map(a => appointmentPillHtml(a)).join("")
      : `<div class="cal-empty-day">\u2014</div>`;
    return `<div class="cal-week-col${isToday ? " cal-week-col--today" : ""}">
      <div class="cal-week-day-header">
        <span class="cal-week-day-name">${dayName}</span>
        <span class="cal-week-day-num">${dayNum}</span>
      </div>
      <div class="cal-week-day-body">${cards}</div>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="cal-week-grid">${cols}</div>`;
  el.querySelectorAll(".cal-week-pill").forEach(pill => {
    pill.addEventListener("click", () => openEditAppointmentModal(pill.dataset.apptId));
  });
}

function renderMonthCalendar() {
  const el = document.getElementById("calendar-grid");
  if (!el) return;
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const allAppts = getCalendarAppts();
  const todayStr = new Date().toISOString().slice(0, 10);
  const apptMap = {};
  allAppts.forEach(a => {
    if (!apptMap[a.date]) apptMap[a.date] = [];
    apptMap[a.date].push(a);
  });
  const hdrs = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-month-hdr">${d}</div>`).join("");
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) return `<div class="cal-month-cell cal-month-cell--out"></div>`;
    const dateStr = new Date(year, month, dayNum).toISOString().slice(0, 10);
    const isToday = dateStr === todayStr;
    const dayAppts = (apptMap[dateStr] || []).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    const pills = dayAppts.slice(0, 3).map(a => {
      const short = (APPT_TYPE_LABELS[a.type] || a.type).replace(/^\S+\s/, "");
      return `<div class="cal-pill cal-pill--${escapeHtml(a.type)}" data-appt-id="${a.id}">${a.startTime ? formatTime(a.startTime) + " " : ""}${escapeHtml(short)}</div>`;
    }).join("") + (dayAppts.length > 3 ? `<div class="cal-pill-more">+${dayAppts.length - 3}</div>` : "");
    return `<div class="cal-month-cell${isToday ? " cal-month-cell--today" : ""}">
      <div class="cal-month-cell-num">${dayNum}</div>
      <div class="cal-month-cell-pills">${pills}</div>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="cal-month-wrap"><div class="cal-month-hdr-row">${hdrs}</div><div class="cal-month-grid">${cells}</div></div>`;
  el.querySelectorAll(".cal-pill[data-appt-id]").forEach(pill => {
    pill.addEventListener("click", () => openEditAppointmentModal(pill.dataset.apptId));
  });
}

document.getElementById("cal-prev").addEventListener("click", () => {
  if (state.calendarView === "week") state.calendarDate.setDate(state.calendarDate.getDate() - 7);
  else state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
  state.calendarDate = new Date(state.calendarDate);
  renderCalendar();
});
document.getElementById("cal-today").addEventListener("click", () => {
  state.calendarDate = new Date();
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  if (state.calendarView === "week") state.calendarDate.setDate(state.calendarDate.getDate() + 7);
  else state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
  state.calendarDate = new Date(state.calendarDate);
  renderCalendar();
});
document.getElementById("cal-tab-week").addEventListener("click", () => {
  state.calendarView = "week";
  document.getElementById("cal-tab-week").classList.add("pipeline-tab--active");
  document.getElementById("cal-tab-month").classList.remove("pipeline-tab--active");
  renderCalendar();
});
document.getElementById("cal-tab-month").addEventListener("click", () => {
  state.calendarView = "month";
  document.getElementById("cal-tab-month").classList.add("pipeline-tab--active");
  document.getElementById("cal-tab-week").classList.remove("pipeline-tab--active");
  renderCalendar();
});
document.getElementById("calendar-tech-filter").addEventListener("change", e => {
  state.calendarTechFilter = e.target.value;
  renderCalendar();
});

// ── Recurrence Helper ──────────────────────────────────────
function generateRecurringDates(startDate, recurrence, endDate) {
  const dates = [startDate];
  if (!recurrence || !endDate) return dates;
  const incrMonths = { monthly: 1, bimonthly: 2, quarterly: 3, biannual: 6, annual: 12 };
  const incrDays = recurrence === "weekly" ? 7 : null;
  const mths = incrMonths[recurrence];
  let current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (true) {
    const next = new Date(current);
    if (incrDays) next.setDate(next.getDate() + incrDays);
    else if (mths) next.setMonth(next.getMonth() + mths);
    else break;
    if (next > end) break;
    dates.push(next.toISOString().slice(0, 10));
    current = next;
  }
  return dates;
}

function toggleRecurrenceEnd() {
  const val = document.getElementById("appt-recurrence").value;
  document.getElementById("appt-recurrence-end-row").style.display = val ? "block" : "none";
}
document.getElementById("appt-recurrence").addEventListener("change", toggleRecurrenceEnd);

// ── Appointment Modal ──────────────────────────────────────
function populateApptDropdowns() {
  const techSel = document.getElementById("appt-technician");
  techSel.innerHTML = `<option value="">-- Unassigned --</option>` +
    state.technicians.filter(t => t.status === "active").map(t =>
      `<option value="${t.id}">${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}</option>`
    ).join("");
}

function refreshApptContactDropdown(type, preserveValue = null) {
  const labelText = document.getElementById("appt-contact-text");
  const sel = document.getElementById("appt-customer");
  if (type === "consult" || type === "a_la_carte") {
    if (labelText) labelText.textContent = "Prospect";
    const prospectOpts = [...state.prospects]
      .filter(p => p.stage !== "won" && p.stage !== "lost")
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
    sel.innerHTML = `<option value="">-- No prospect linked --</option>` +
      prospectOpts.map(p => `<option value="${p.id}">${escapeHtml(p.lastName)}, ${escapeHtml(p.firstName)}</option>`).join("");
  } else {
    if (labelText) labelText.textContent = "Customer";
    sel.innerHTML = `<option value="">-- No customer linked --</option>` +
      [...state.customers]
        .filter(c => c.status !== "inactive")
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))
        .map(c => `<option value="${c.id}">${escapeHtml(c.lastName)}, ${escapeHtml(c.firstName)}${c.customerNumber ? ` (${c.customerNumber})` : ""}</option>`)
        .join("");
  }
  if (preserveValue) sel.value = preserveValue;
}

document.getElementById("appt-type").addEventListener("change", () => {
  refreshApptContactDropdown(document.getElementById("appt-type").value);
  refreshMaintenanceTaskList();
});

function refreshMaintenanceTaskList() {
  const type = document.getElementById("appt-type").value;
  const customerId = document.getElementById("appt-customer").value;
  const dateStr = document.getElementById("appt-date").value;
  const section = document.getElementById("appt-work-order-section");
  const listEl = document.getElementById("appt-tasks-list");
  const periodEl = document.getElementById("appt-work-order-period");

  if (type !== "maintenance" || !customerId) {
    section.style.display = "none";
    return;
  }

  const period = getPeriodFromDate(dateStr);
  const sched = state.schedules[customerId];

  // If schedule not loaded yet, load it then re-render
  if (!sched) {
    section.style.display = "none";
    dbLoadSchedule(customerId, SCHEDULE_YEAR).then(row => {
      if (row) state.schedules[customerId] = { year: row.year, tasks: row.tasks || [], schedule: row.schedule || {} };
      refreshMaintenanceTaskList();
    });
    return;
  }

  const scheduledIds = period && sched.schedule[period] ? sched.schedule[period] : [];
  const tasks = scheduledIds.map(id => sched.tasks.find(t => t.id === id)).filter(Boolean);

  if (tasks.length === 0) {
    periodEl.textContent = period ? `(${period} — no tasks scheduled)` : "";
    listEl.innerHTML = `<p class="work-order-empty">No tasks scheduled for this period.</p>`;
    section.style.display = "";
    return;
  }

  periodEl.textContent = period ? `(${period})` : "";
  section.style.display = "";

  listEl.innerHTML = tasks.map(t => `
    <div class="work-order-task" data-task-id="${t.id}" data-task-name="${escapeHtml(t.name)}" data-task-minutes="${t.minutes || 0}">
      <span class="work-order-task__name">${escapeHtml(t.name)}</span>
      <span class="work-order-task__min">${t.minutes || 0}m</span>
    </div>`).join("");
}

// Re-run when customer or date changes
document.getElementById("appt-customer").addEventListener("change", refreshMaintenanceTaskList);
document.getElementById("appt-date").addEventListener("change", refreshMaintenanceTaskList);

function openAppointmentModal(defaults = {}) {
  state.editingAppointmentId = null;
  document.getElementById("modal-appointment-title").textContent = "Schedule Appointment";
  document.getElementById("btn-delete-appointment").style.display = "none";
  document.getElementById("btn-complete-appointment").style.display = "none";
  populateApptDropdowns();
  const newType = defaults.type || "maintenance";
  document.getElementById("appt-type").value = newType;
  document.getElementById("appt-status").value = "scheduled";
  document.getElementById("appt-date").value = defaults.date || new Date().toISOString().slice(0, 10);
  document.getElementById("appt-start-time").value = defaults.startTime || "09:00";
  document.getElementById("appt-duration").value = 75;
  document.getElementById("appt-notes").value = "";
  document.getElementById("appt-recurrence").value = "";
  document.getElementById("appt-recurrence-end").value = "";
  toggleRecurrenceEnd();
  document.getElementById("appt-technician").value = defaults.technicianId || "";
  const contactId = (newType === "consult" || newType === "a_la_carte") ? (defaults.prospectId || "") : (defaults.customerId || "");
  refreshApptContactDropdown(newType, contactId);
  refreshMaintenanceTaskList();
  openModal("modal-appointment");
}

function openEditAppointmentModal(apptId) {
  const a = state.appointments.find(x => x.id === apptId);
  if (!a) return;
  state.editingAppointmentId = apptId;
  document.getElementById("modal-appointment-title").textContent = "Edit Appointment";
  document.getElementById("btn-delete-appointment").style.display = "inline-block";
  // Show Complete button only for non-completed maintenance appointments
  const completeBtn = document.getElementById("btn-complete-appointment");
  completeBtn.style.display = (a.type === "maintenance" && a.status !== "completed" && a.status !== "cancelled") ? "inline-block" : "none";
  populateApptDropdowns();
  const editType = a.type || "maintenance";
  document.getElementById("appt-type").value = editType;
  document.getElementById("appt-status").value = a.status || "scheduled";
  document.getElementById("appt-date").value = a.date || "";
  document.getElementById("appt-start-time").value = a.startTime || "";
  if (a.startTime && a.endTime) {
    const [sh, sm] = a.startTime.split(":").map(Number);
    const [eh, em] = a.endTime.split(":").map(Number);
    document.getElementById("appt-duration").value = (eh * 60 + em) - (sh * 60 + sm);
  } else {
    document.getElementById("appt-duration").value = 75;
  }
  document.getElementById("appt-notes").value = a.notes || "";
  document.getElementById("appt-recurrence").value = a.recurrence || "";
  document.getElementById("appt-recurrence-end").value = a.recurrenceEndDate || "";
  toggleRecurrenceEnd();
  document.getElementById("appt-technician").value = a.technicianId || "";
  const editContactId = (editType === "consult" || editType === "a_la_carte") ? (a.prospectId || "") : (a.customerId || "");
  refreshApptContactDropdown(editType, editContactId);
  refreshMaintenanceTaskList();
  openModal("modal-appointment");
}

// ── Availability Validation ───────────────────────────────
// Returns { ok: true } or { ok: false, reason: string }
function checkTechAvailability(technicianId, dateStr, startTime, endTime) {
  if (!technicianId || !dateStr) return { ok: true };

  // Parse day-of-week safely from date string (no timezone shift)
  const [y, mo, d] = dateStr.split("-").map(Number);
  const jsDate = new Date(y, mo - 1, d);
  const dow = jsDate.getDay(); // 0=Sun .. 6=Sat

  const tech = state.technicians.find(t => t.id === technicianId);
  const techName = tech ? `${tech.firstName} ${tech.lastName}` : "This technician";

  // 1. Company-wide closure?
  const companyClosure = state.availabilityOverrides.find(
    o => o.technicianId === null && o.date === dateStr
  );
  if (companyClosure) {
    const label = companyClosure.note ? `"${companyClosure.note}"` : "a company closure";
    return { ok: false, reason: `${dateStr} is marked as ${label} (company closed).` };
  }

  // 2. Technician-specific override for this date?
  const override = state.availabilityOverrides.find(
    o => o.technicianId === technicianId && o.date === dateStr
  );
  if (override) {
    if (override.isDayOff) {
      const label = override.note ? `"${override.note}"` : "a day off";
      return { ok: false, reason: `${techName} has ${label} on ${dateStr}.` };
    }
    // Custom blocks — check if appointment fits within any block
    if (startTime && endTime && override.blocks && override.blocks.length > 0) {
      const fits = override.blocks.some(b => startTime >= b.start && endTime <= b.end);
      if (!fits) {
        const blockStr = override.blocks.map(b => `${formatTime(b.start)}–${formatTime(b.end)}`).join(", ");
        return { ok: false, reason: `${techName} has custom hours on ${dateStr}: ${blockStr}. The appointment (${formatTime(startTime)}–${formatTime(endTime)}) falls outside those hours.` };
      }
    }
    return { ok: true }; // override exists with custom hours and appt fits (or no times provided)
  }

  // 3. Weekly schedule — does the tech have any blocks on this day?
  const dayBlocks = state.weeklyAvailability.filter(
    b => b.technicianId === technicianId && b.dayOfWeek === dow
  );
  if (dayBlocks.length === 0) {
    return { ok: false, reason: `${techName} is not scheduled on ${DAY_NAMES[dow]}s.` };
  }

  // If no specific times given, just day-level check passes
  if (!startTime || !endTime) return { ok: true };

  // Check appointment fits within at least one weekly block
  const fits = dayBlocks.some(b => startTime >= b.startTime && endTime <= b.endTime);
  if (!fits) {
    const blockStr = dayBlocks
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(b => `${formatTime(b.startTime)}–${formatTime(b.endTime)}`).join(", ");
    return { ok: false, reason: `${techName}'s hours on ${DAY_NAMES[dow]}s are ${blockStr}. The appointment (${formatTime(startTime)}–${formatTime(endTime)}) falls outside those hours.` };
  }

  return { ok: true };
}

document.getElementById("form-appointment").addEventListener("submit", async e => {
  e.preventDefault();
  const startTime = document.getElementById("appt-start-time").value || null;
  const duration = parseInt(document.getElementById("appt-duration").value, 10) || 75;
  const endTime = startTime ? addMinutesToTime(startTime, duration) : null;
  const recurrence = document.getElementById("appt-recurrence").value || null;
  const recurrenceEndDate = document.getElementById("appt-recurrence-end").value || null;
  const apptType = document.getElementById("appt-type").value;
  const contactId = document.getElementById("appt-customer").value || null;
  const base = {
    type: apptType,
    status: document.getElementById("appt-status").value,
    date: document.getElementById("appt-date").value,
    startTime, endTime,
    technicianId: document.getElementById("appt-technician").value || null,
    customerId: (apptType === "consult" || apptType === "a_la_carte") ? null : contactId,
    prospectId: (apptType === "consult" || apptType === "a_la_carte") ? contactId : null,
    notes: document.getElementById("appt-notes").value.trim(),
    additionalWork: "",
    scheduledTasks: apptType === "maintenance"
      ? (() => {
          // Preserve existing completion data if editing a completed appt
          if (state.editingAppointmentId) {
            const existing = state.appointments.find(a => a.id === state.editingAppointmentId);
            if (existing && existing.status === "completed" && existing.scheduledTasks && existing.scheduledTasks.length > 0) {
              return existing.scheduledTasks;
            }
          }
          return [...document.querySelectorAll("#appt-tasks-list .work-order-task")].map(el => ({
            id: el.dataset.taskId,
            name: el.dataset.taskName,
            minutes: parseInt(el.dataset.taskMinutes, 10) || 0,
            completed: false,
          }));
        })()
      : [],
    title: "", recurrence, recurrenceEndDate,
  };

  // ── Availability check ──────────────────────────────────
  if (base.technicianId) {
    const dates = recurrence
      ? generateRecurringDates(base.date, recurrence, recurrenceEndDate)
      : [base.date];
    const conflicts = [];
    for (const date of dates) {
      const check = checkTechAvailability(base.technicianId, date, startTime, endTime);
      if (!check.ok) conflicts.push(check.reason);
    }
    if (conflicts.length > 0) {
      const unique = [...new Set(conflicts)];
      const msg = unique.length === 1
        ? `Availability conflict:\n\n${unique[0]}\n\nSchedule anyway?`
        : `Availability conflicts on ${conflicts.length} date(s):\n\n${unique.slice(0, 5).join("\n")}${unique.length > 5 ? `\n\u2026and ${unique.length - 5} more` : ""}\n\nSchedule anyway?`;
      if (!confirm(msg)) return;
    }
  }

  // ── Double-booking check ─────────────────────────────────
  if (base.technicianId && base.startTime && base.endTime) {
    const dates = recurrence
      ? generateRecurringDates(base.date, recurrence, recurrenceEndDate)
      : [base.date];
    const doubles = [];
    for (const date of dates) {
      const overlapping = state.appointments.filter(a =>
        a.id !== state.editingAppointmentId &&
        a.technicianId === base.technicianId &&
        a.date === date &&
        a.status !== "cancelled" &&
        a.startTime && a.endTime &&
        a.startTime < base.endTime &&
        a.endTime > base.startTime
      );
      overlapping.forEach(a => {
        const cust = a.customerId ? state.customers.find(c => c.id === a.customerId) : null;
        const name = cust ? `${cust.firstName} ${cust.lastName}` : "another customer";
        doubles.push(`${date}: overlaps with ${APPT_TYPE_LABELS[a.type] || a.type} for ${name} (${formatTime(a.startTime)}\u2013${formatTime(a.endTime)})`);
      });
    }
    if (doubles.length > 0) {
      const msg = `Double-booking warning:\n\n${doubles.slice(0, 5).join("\n")}${doubles.length > 5 ? `\n\u2026and ${doubles.length - 5} more` : ""}\n\nSchedule anyway?`;
      if (!confirm(msg)) return;
    }
  }
  if (state.editingAppointmentId) {
    const idx = state.appointments.findIndex(a => a.id === state.editingAppointmentId);
    if (idx !== -1) {
      state.appointments[idx] = { ...state.appointments[idx], ...base };
      await dbUpdateAppointment(state.appointments[idx]);
    }
  } else {
    const dates = generateRecurringDates(base.date, recurrence, recurrenceEndDate);
    for (const date of dates) {
      const saved = await dbInsertAppointment({ ...base, date });
      if (saved) state.appointments.push(saved);
    }
  }
  closeModal("modal-appointment");
  refreshApptContext();
});

document.getElementById("btn-complete-appointment").addEventListener("click", () => {
  const apptId = state.editingAppointmentId;
  if (!apptId) return;
  closeModal("modal-appointment");
  openCompleteAppointmentModal(apptId);
});

document.getElementById("btn-delete-appointment").addEventListener("click", async () => {
  if (!state.editingAppointmentId || !confirm("Delete this appointment?")) return;
  await dbDeleteAppointment(state.editingAppointmentId);
  state.appointments = state.appointments.filter(a => a.id !== state.editingAppointmentId);
  closeModal("modal-appointment");
  refreshApptContext();
});

// ── Complete Appointment ──────────────────────────────────
function openCompleteAppointmentModal(apptId) {
  const a = state.appointments.find(x => x.id === apptId);
  if (!a) return;
  state.completingAppointmentId = apptId;

  // Meta line
  const cust = a.customerId ? state.customers.find(c => c.id === a.customerId) : null;
  const tech = a.technicianId ? state.technicians.find(t => t.id === a.technicianId) : null;
  const metaParts = [];
  if (a.date) metaParts.push(formatApptDate(a.date));
  if (cust) metaParts.push(`${cust.firstName} ${cust.lastName}`);
  if (tech) metaParts.push(`Tech: ${tech.firstName} ${tech.lastName}`);
  document.getElementById("complete-appt-meta").textContent = metaParts.join(" \u00b7 ");

  // Period label
  const period = getPeriodFromDate(a.date);
  document.getElementById("complete-appt-period").textContent = period ? `(${period})` : "";

  // Task checkboxes
  const listEl = document.getElementById("complete-appt-tasks-list");
  const section = document.getElementById("complete-appt-tasks-section");
  if (a.scheduledTasks && a.scheduledTasks.length > 0) {
    listEl.innerHTML = a.scheduledTasks.map(t => `
      <label class="work-order-task">
        <input type="checkbox" class="complete-task-cb" data-task-id="${t.id}" data-task-name="${escapeHtml(t.name)}" data-task-minutes="${t.minutes || 0}" ${t.completed !== false ? "checked" : ""} />
        <span class="work-order-task__name">${escapeHtml(t.name)}</span>
        <span class="work-order-task__min">${t.minutes || 0}m</span>
      </label>`).join("");
    section.style.display = "";
  } else {
    listEl.innerHTML = `<p class="work-order-empty">No scheduled tasks for this appointment.</p>`;
    section.style.display = "";
  }

  document.getElementById("complete-appt-additional-work").value = a.additionalWork || "";
  openModal("modal-complete-appt");
}

document.getElementById("form-complete-appt").addEventListener("submit", async e => {
  e.preventDefault();
  const apptId = state.completingAppointmentId;
  if (!apptId) return;
  const idx = state.appointments.findIndex(x => x.id === apptId);
  if (idx === -1) return;

  const scheduledTasks = [...document.querySelectorAll("#complete-appt-tasks-list .complete-task-cb")].map(cb => ({
    id: cb.dataset.taskId,
    name: cb.dataset.taskName,
    minutes: parseInt(cb.dataset.taskMinutes, 10) || 0,
    completed: cb.checked,
  }));
  const additionalWork = document.getElementById("complete-appt-additional-work").value.trim();

  state.appointments[idx] = {
    ...state.appointments[idx],
    status: "completed",
    scheduledTasks,
    additionalWork,
  };
  await dbUpdateAppointment(state.appointments[idx]);
  closeModal("modal-complete-appt");
  refreshApptContext();
});

document.getElementById("btn-add-calendar-appointment").addEventListener("click", () => {
  state.apptContext = "calendar";
  openAppointmentModal({});
});

document.getElementById("btn-add-tech-appointment").addEventListener("click", () => {
  state.apptContext = "technician";
  openAppointmentModal({ technicianId: state.currentTechnicianId || "" });
});

document.getElementById("btn-add-customer-appointment").addEventListener("click", () => {
  state.apptContext = "customer";
  const c = getCustomer(state.currentCustomerId);
  openAppointmentModal({ customerId: state.currentCustomerId || "", technicianId: c?.technicianId || "" });
});
