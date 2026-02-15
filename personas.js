const OLLAMA_BASE  = "http://localhost:11434";
const OLLAMA_MODEL = "llama3.2";

const PERSONAS = [
  { id: "outdoor_enthusiast", label: "Outdoor Enthusiast", description: "hiking, camping, backpacking, trail running, climbing, national parks, gear reviews" },
  { id: "home_cook", label: "Home Cook", description: "recipes, cooking techniques, baking, food science, kitchen equipment, meal prep, restaurants" },
  { id: "tech_reader", label: "Tech Reader", description: "gadgets, software, AI tools, programming tutorials, consumer electronics, tech news, apps" },
  { id: "news_follower", label: "News Follower", description: "world news, politics, economics, investigative journalism, local news, opinion pieces" },
  { id: "fitness_buff", label: "Fitness & Wellness", description: "workout routines, nutrition, running plans, yoga, supplements, weight training, recovery" },
  { id: "diy_maker", label: "DIY & Home", description: "home improvement, woodworking, plumbing, electrical, interior design, gardening, tools" },
  { id: "finance_watcher", label: "Personal Finance", description: "investing, budgeting, retirement planning, index funds, credit cards, mortgages, taxes" },
  { id: "travel_dreamer", label: "Travel Planner", description: "travel destinations, hotels, flights, itineraries, travel tips, visas, packing lists" },
  { id: "parent", label: "Parent", description: "parenting advice, child development, kids activities, school choices, family travel, toys" },
  { id: "gamer", label: "Gamer", description: "video game reviews, walkthroughs, gaming hardware, esports, indie games, game deals" }
];

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return { ok: false};
    const data = await res.json();
    const models = data.models || [];
    const hasModel = models.some(m => m.name.startsWith("llama3.2"));
    return { ok: true, hasModel, models: models.map(m => m.name) };
  } catch (e) {
    return { ok: false};
  }
}

async function generateQueries(personaIds, countPerPersona = 5) {
  const selected = PERSONAS.filter(p => personaIds.includes(p.id));
  if (selected.length === 0) throw new Error("No personas selected");

  const personaDescriptions = selected
    .map(p => `- ${p.label}: ${p.description}`)
    .join("\n");

  const totalCount = selected.length * countPerPersona;

  const prompt = `You are generating realistic Google search queries to simulate a human browsing profile.

Generate exactly ${totalCount} search queries that a real person would type into Google. 
Cover all of these interest areas proportionally:
${personaDescriptions}

Rules:
- Return ONLY a raw JSON array of strings, nothing else
- No markdown, no explanation, no code blocks, no numbering
- Each query must sound like a real human typed it — specific, natural, varied phrasing
- Mix question-style ("how do I..."), product-style ("best X under $Y"), and informational ("X vs Y")
- No duplicate topics
- Keep queries between 3-10 words

Example format: ["best hiking boots for wide feet","how long to cook chicken thighs at 375","is it worth refinancing mortgage in 2024"]

Generate ${totalCount} queries now:`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.9,
        top_p: 0.95,
        num_predict: 1024
      }
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

  const data = await response.json();
  return parseQueries(data.response.trim());
}

function parseQueries(raw) {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error("No array found");

    const arr = JSON.parse(match[0]);
    return arr
      .filter(q => typeof q === "string" && q.length > 3 && q.length < 100)
      .map(q => q.trim());
  } catch (e) {
    console.warn("[blurB] Query parse failed:", e.message, "\nRaw:", raw);
    return [];
  }
}
