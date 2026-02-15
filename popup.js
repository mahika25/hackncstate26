// popup.js — blurB UI Controller

const FLASK_BASE = "http://localhost:5000";

const PERSONAS = [
  { id: "outdoor_enthusiast", label: "Outdoor Enthusiast" },
  { id: "home_cook",          label: "Home Cook" },
  { id: "tech_reader",        label: "Tech Reader" },
  { id: "news_follower",      label: "News Follower" },
  { id: "fitness_buff",       label: "Fitness & Wellness" },
  { id: "diy_maker",          label: "DIY & Home" },
  { id: "finance_watcher",    label: "Personal Finance" },
  { id: "travel_dreamer",     label: "Travel Planner" },
  { id: "parent",             label: "Parent" },
  { id: "gamer",              label: "Gamer" },
];


const personaSelect = document.getElementById("personaSelect");
const btnGenerate   = document.getElementById("btnGenerate");
const btnSubmit     = document.getElementById("btnSubmit");
const queryList     = document.getElementById("queryList");
const statusMsg     = document.getElementById("statusMsg");

// [{ text: string, decision: 'pending'|'approved'|'denied' }]
let queryState = [];

function buildDropdown() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— select a persona —";
  placeholder.disabled = true;
  placeholder.selected = true;
  personaSelect.appendChild(placeholder);

  PERSONAS.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    personaSelect.appendChild(opt);
  });
}

async function fetchQueries(personaId) {
  const res = await fetch(`${FLASK_BASE}/api/recommendations?persona_id=${personaId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  return data.queries;
}

function renderQueries(queries) {
  queryState = queries.map(text => ({ text, decision: "pending" }));
  drawRows();
  btnSubmit.classList.add("hidden");
}

function drawRows() {
  queryList.innerHTML = "";

  queryState.forEach((q, i) => {
    const li = document.createElement("li");
    li.className = `query-item ${q.decision}`;

    const span = document.createElement("span");
    span.className = "query-text";
    span.textContent = q.text;

    const sel = document.createElement("select");
    sel.className = "decision-select";
    sel.innerHTML = `
      <option value="pending"  ${q.decision === "pending"  ? "selected" : ""}>— decide —</option>
      <option value="approved" ${q.decision === "approved" ? "selected" : ""}>✓ Approve</option>
      <option value="denied"   ${q.decision === "denied"   ? "selected" : ""}>✕ Deny</option>
    `;

    sel.addEventListener("change", () => {
      queryState[i].decision = sel.value;
      li.className = `query-item ${sel.value}`;
      updateSubmitVisibility();
    });

    li.appendChild(span);
    li.appendChild(sel);
    queryList.appendChild(li);
  });
}

function updateSubmitVisibility() {
  const hasApproved = queryState.some(q => q.decision === "approved");
  btnSubmit.classList.toggle("hidden", !hasApproved);
}

function setStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.className = `status ${type}`;
}

function clearStatus() {
  statusMsg.textContent = "";
  statusMsg.className = "status";
}

btnGenerate.addEventListener("click", async () => {
  const personaId = personaSelect.value;

  if (!personaId) {
    setStatus("Please select a persona first.", "warn");
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.textContent = "Fetching...";
  queryList.innerHTML = "";
  btnSubmit.classList.add("hidden");
  setStatus("Asking the model for queries...", "info");

  try {
    const queries = await fetchQueries(personaId);
    renderQueries(queries);
    clearStatus();
  } catch (e) {
    setStatus(`Error: ${e.message}`, "error");
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = "Generate Queries";
  }
});

btnSubmit.addEventListener("click", async () => {
  const approved = queryState
    .filter(q => q.decision === "approved")
    .map(q => q.text);

  if (approved.length === 0) return;

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Submitting...";
  setStatus("Sending approved queries...", "info");

  try {
    const res = await fetch(`${FLASK_BASE}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: approved }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    setStatus(`✓ ${data.message}`, "info");
    btnSubmit.classList.add("hidden");

  } catch (e) {
    setStatus(`Error: ${e.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Submit Approved";
  }
});

buildDropdown();