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

// ── DOM refs ───────────────────────────────────────────────────────────────────
const personaSelect = document.getElementById("personaSelect");
const btnGenerate   = document.getElementById("btnGenerate");
const queryList     = document.getElementById("queryList");
const statusMsg     = document.getElementById("statusMsg");

// ── Build dropdown ─────────────────────────────────────────────────────────────
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

// ── Fetch queries from Flask ───────────────────────────────────────────────────
async function fetchQueries(personaId) {
  const res = await fetch(`${FLASK_BASE}/api/recommendations?persona_id=${personaId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  return data.queries;
}

// ── Render query list (read-only) ──────────────────────────────────────────────
function renderQueries(queries) {
  queryList.innerHTML = "";
  queries.forEach(q => {
    const li = document.createElement("li");
    li.className = "query-item";
    li.textContent = q;
    queryList.appendChild(li);
  });
}

// ── Status helpers ─────────────────────────────────────────────────────────────
function setStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.className = `status ${type}`;
}

function clearStatus() {
  statusMsg.textContent = "";
  statusMsg.className = "status";
}

// ── Generate button handler ────────────────────────────────────────────────────
btnGenerate.addEventListener("click", async () => {
  const personaId = personaSelect.value;

  if (!personaId) {
    setStatus("Please select a persona first.", "warn");
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.textContent = "Fetching...";
  queryList.innerHTML = "";
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

// ── Init ───────────────────────────────────────────────────────────────────────
buildDropdown();