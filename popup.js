// popup.js — BrowseGuard UI Controller

// ── State ──────────────────────────────────────────────────────────────────────
let selectedPersonas = new Set();
let queryQueue       = [];   // { text, status: 'pending'|'injected'|'skipped' }
let isGenerating     = false;

// ── DOM ────────────────────────────────────────────────────────────────────────
const ollamaBar     = document.getElementById("ollamaBar");
const personaGrid   = document.getElementById("personaGrid");
const queryQueueEl  = document.getElementById("queryQueue");
const btnGenerate   = document.getElementById("btnGenerate");
const btnApproveAll = document.getElementById("btnApproveAll");
const noPersonaWarn = document.getElementById("noPersonaWarn");

// ── Persona Grid ───────────────────────────────────────────────────────────────
function buildPersonaGrid() {
  personaGrid.innerHTML = "";
  PERSONAS.forEach(p => {
    const chip = document.createElement("div");
    chip.className = "persona-chip";
    chip.dataset.id = p.id;
    chip.innerHTML = `<span class="chip-dot"></span><span>${p.emoji} ${p.label}</span>`;
    chip.addEventListener("click", () => {
      if (isGenerating) return;
      const sel = selectedPersonas.has(p.id);
      sel ? selectedPersonas.delete(p.id) : selectedPersonas.add(p.id);
      chip.classList.toggle("selected", !sel);
      noPersonaWarn.classList.remove("visible");
    });
    personaGrid.appendChild(chip);
  });
}

// ── Ollama Health Check ────────────────────────────────────────────────────────
async function checkOllamaStatus() {
  ollamaBar.textContent = "● checking llama3.2...";
  ollamaBar.className = "ollama-bar checking";

  const result = await checkOllama();

  if (!result.ok) {
    ollamaBar.textContent = `● ollama offline — run: ollama serve`;
    ollamaBar.className = "ollama-bar error";
    btnGenerate.disabled = true;
    return false;
  }
  if (!result.hasModel) {
    ollamaBar.textContent = `● model missing — run: ollama pull llama3.2`;
    ollamaBar.className = "ollama-bar warn";
    btnGenerate.disabled = true;
    return false;
  }

  ollamaBar.textContent = "● llama3.2 ready";
  ollamaBar.className = "ollama-bar ok";
  btnGenerate.disabled = false;
  return true;
}

// ── Generate Queries ───────────────────────────────────────────────────────────
btnGenerate.addEventListener("click", async () => {
  if (selectedPersonas.size === 0) {
    noPersonaWarn.classList.add("visible");
    return;
  }

  const ready = await checkOllamaStatus();
  if (!ready) return;

  isGenerating = true;
  btnGenerate.disabled = true;
  btnGenerate.textContent = "◌ ASKING LLAMA3.2...";
  btnApproveAll.classList.add("hidden");
  queryQueueEl.innerHTML = `<div class="empty-queue">» llama3.2 is generating queries...</div>`;

  try {
    const queries = await generateQueries([...selectedPersonas], 4);

    if (!queries || queries.length === 0) {
      queryQueueEl.innerHTML = `<div class="empty-queue">» no queries returned — try again</div>`;
      return;
    }

    queryQueue = queries.map(text => ({ text, status: "pending" }));
    renderQueue();
    btnApproveAll.classList.remove("hidden");

  } catch (e) {
    queryQueueEl.innerHTML = `<div class="empty-queue">» error: ${e.message}</div>`;
  } finally {
    isGenerating = false;
    btnGenerate.disabled = false;
    btnGenerate.textContent = "⬡ GENERATE QUERIES";
  }
});

// ── Approve All ────────────────────────────────────────────────────────────────
btnApproveAll.addEventListener("click", () => {
  queryQueue.forEach((q, i) => {
    if (q.status === "pending") approveQuery(i);
  });
});

// ── Render Query Queue ─────────────────────────────────────────────────────────
function renderQueue() {
  if (queryQueue.length === 0) {
    queryQueueEl.innerHTML = `<div class="empty-queue">» queue empty</div>`;
    btnApproveAll.classList.add("hidden");
    return;
  }

  queryQueueEl.innerHTML = "";

  queryQueue.forEach((q, i) => {
    const el = document.createElement("div");
    el.className = `query-item ${q.status !== "pending" ? q.status : ""}`;

    if (q.status === "pending") {
      el.innerHTML = `
        <span class="query-text">${escapeHtml(q.text)}</span>
        <div class="query-actions">
          <button class="btn-approve" data-i="${i}">✓</button>
          <button class="btn-skip"    data-i="${i}">✕</button>
        </div>`;
    } else if (q.status === "injected") {
      el.innerHTML = `
        <span class="query-text">${escapeHtml(q.text)}</span>
        <span class="query-status-icon">✓</span>`;
    } else {
      el.innerHTML = `
        <span class="query-text">${escapeHtml(q.text)}</span>
        <span class="query-status-icon" style="color:var(--muted)">✕</span>`;
    }

    queryQueueEl.appendChild(el);
  });

  queryQueueEl.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", () => approveQuery(parseInt(btn.dataset.i)));
  });
  queryQueueEl.querySelectorAll(".btn-skip").forEach(btn => {
    btn.addEventListener("click", () => skipQuery(parseInt(btn.dataset.i)));
  });
}

// ── Approve / Skip ─────────────────────────────────────────────────────────────
function approveQuery(index) {
  const q = queryQueue[index];
  if (!q || q.status !== "pending") return;
  q.status = "injected";
  renderQueue();
  chrome.runtime.sendMessage({ type: "INJECT_QUERY", query: q.text });
}

function skipQuery(index) {
  const q = queryQueue[index];
  if (!q || q.status !== "pending") return;
  q.status = "skipped";
  renderQueue();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Init ───────────────────────────────────────────────────────────────────────
buildPersonaGrid();
checkOllamaStatus();