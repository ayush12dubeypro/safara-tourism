import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PromptTemplate } from "@langchain/core/prompts";

loadLocalEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.HF_TOKEN || process.env.HUGGINGFACEHUB_API_KEY;
const stableModel = "katanemo/Arch-Router-1.5B:hf-inference";
const modelName = process.env.HF_MODEL || stableModel;
let lastProviderError = "";
let lastProviderUsed = apiKey ? "huggingface" : "local";
let lastModelUsed = modelName;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function loadLocalEnv() {
  [".env.local", ".env"].forEach((filePath) => {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const separator = trimmed.indexOf("=");
      if (separator === -1) return;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");

      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  });
}

const tourismContext = `
You are the Safara customer support chatbot for an India tourism website.

Business context:
- Brand name: Safara
- Purpose: help travelers explore India, discover destinations, and plan trips.
- Key areas of the website: Features, Destinations, Planner, Contact.
- Available trip helpers: itinerary ideas, budget estimation, destination discovery, packing checklist, festivals, travel phrases, and inquiry form.
- Tone: friendly, concise, helpful, welcoming, and travel-focused.

Support rules:
- Answer as a customer support assistant, not as a generic AI.
- Prioritize questions about destinations, trip planning, budget tips, festivals, and how to use the website.
- If a user asks for booking, payment, or live reservation status, say Safara currently helps with trip planning and inquiries, then guide them to the contact form.
- If information is missing, be honest and suggest the contact form for personalized help.
- Keep answers short and practical.
- Give specific, relevant suggestions instead of generic travel advice.
- Prefer 4 to 8 concrete items when the user asks for lists, examples, or recommendations.
- If the user asks about food, destinations, or itineraries, tailor the answer directly to that topic.
- End with one useful follow-up suggestion only when it genuinely helps.
`;

const prompt = PromptTemplate.fromTemplate(`
{context}

Conversation so far:
{history}

Customer question:
{question}

Write the best support reply for the customer.
`);

const sessions = new Map();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(html);
}

function sendFile(res, filePath) {
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

function resolveStaticPath(requestPath) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(rootDir, relativePath);

  if (!resolvedPath.startsWith(rootDir)) {
    return null;
  }

  try {
    const stats = statSync(resolvedPath);
    if (stats.isDirectory()) {
      return path.join(resolvedPath, "index.html");
    }
    return resolvedPath;
  } catch {
    return resolvedPath;
  }
}

function getSessionHistory(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  return sessions.get(sessionId);
}

function formatHistory(history) {
  return history
    .map((message) => `${message.role === "user" ? "Customer" : "Safara"}: ${message.content}`)
    .join("\n");
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function generateAnswer({ context, history, question }) {
  if (!apiKey) {
    lastProviderUsed = "local";
    lastModelUsed = "local-fallback";
    return { answer: generateLocalAnswer(question), provider: "local" };
  }

  const compiledPrompt = await prompt.format({
    context,
    history,
    question,
  });

  const candidateModels = [...new Set([stableModel, modelName])];

  for (const candidateModel of candidateModels) {
    try {
      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: [
            {
              role: "system",
              content:
                "You are Safara customer support for an India tourism website. Be concise, relevant, practical, and specific. Give direct answers, prefer concrete suggestions, and stay focused on the user's exact tourism-related request.",
            },
            {
              role: "user",
              content: compiledPrompt,
            },
          ],
          max_tokens: 220,
          temperature: 0.35,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const details = typeof data?.error === "string" ? data.error : JSON.stringify(data);
        throw new Error(`Hugging Face API error: ${response.status} ${details}`);
      }

      if (typeof data?.choices?.[0]?.message?.content === "string") {
        lastProviderError = "";
        lastProviderUsed = "huggingface";
        lastModelUsed = candidateModel;
        return { answer: data.choices[0].message.content.trim(), provider: "huggingface" };
      }

      throw new Error(`Unexpected response from Hugging Face router: ${JSON.stringify(data)}`);
    } catch (error) {
      lastProviderError = error instanceof Error ? error.message : "Unknown Hugging Face error";
    }
  }

  lastProviderUsed = "local";
  lastModelUsed = "local-fallback";
  console.error("Falling back to local chatbot mode.", lastProviderError);
  return { answer: generateLocalAnswer(question), provider: "local" };
}

function generateLocalAnswer(question) {
  const q = question.toLowerCase().trim();
  const normalized = q.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const wantsTopList =
    normalized.includes("top 10") ||
    normalized.includes("10 most") ||
    normalized.includes("10 best") ||
    normalized.includes("most popular");
  const asksPlaces =
    normalized.includes("place") ||
    normalized.includes("places") ||
    normalized.includes("destination") ||
    normalized.includes("destinations");

  const destinationGuides = {
    kerala:
      "For Kerala, a strong trip plan is Kochi for heritage, Munnar for hills and tea estates, Alleppey for backwaters, and Varkala for beaches.",
    rajasthan:
      "For Rajasthan, Jaipur, Jodhpur, and Udaipur are the most balanced mix of forts, palaces, markets, and culture.",
    goa:
      "For Goa, North Goa suits nightlife and beach clubs, while South Goa is better for quieter beaches and relaxed stays.",
    kashmir:
      "For Kashmir, Srinagar, Gulmarg, and Pahalgam are the classic picks for lakes, mountains, and scenic stays.",
    himachal:
      "For Himachal, Shimla, Manali, and Kasol work well for a mix of views, cafes, and mountain activities.",
  };

  for (const [place, answer] of Object.entries(destinationGuides)) {
    if (q.includes(place)) {
      return `${answer} Tell me your trip length and budget, and I can turn it into a day-by-day itinerary.`;
    }
  }

  if (q.includes("rajasthan")) {
    return "For a 5 day Rajasthan trip, try Jaipur for 2 days, Jodhpur for 1 day, and Udaipur for 2 days. Focus on forts, local markets, and evening cultural shows. If you want, I can also suggest a budget-friendly version.";
  }

  if (q.includes("beach") || q.includes("goa")) {
    return "Good beach destinations in India include Goa for nightlife and water sports, Gokarna for a calmer coastal trip, Varkala for cliffside views, Kovalam for a relaxed Kerala stay, and Andaman for clearer water and island experiences. Tell me your budget or travel month and I can narrow it down.";
  }

  if (q.includes("budget")) {
    return "For a budget-friendly India trip, travel in shoulder season, use trains for longer routes, choose local stays or hostels, eat at well-reviewed local places, and keep a daily budget target. A practical starter range is INR 2000 to 3500 per day for budget travel and INR 4000 to 7000 for more comfort, depending on the destination.";
  }

  if (q.includes("food") || q.includes("dish") || q.includes("cuisine")) {
    return "Here are 10 popular foods in India: 1. Hyderabadi Biryani, 2. Butter Chicken, 3. Masala Dosa, 4. Chole Bhature, 5. Rogan Josh, 6. Vada Pav, 7. Pani Puri, 8. Idli Sambar, 9. Paneer Tikka, 10. Gulab Jamun. If you want, I can also give you a state-wise food list, vegetarian-only dishes, or famous street foods.";
  }

  if (wantsTopList && asksPlaces) {
    return "Top travel destinations in India include Jaipur, Udaipur, Goa, Kerala, Varanasi, Agra, Rishikesh, Leh-Ladakh, Kashmir, and Andaman. If you want, I can group them by beaches, mountains, heritage, or budget.";
  }

  if (q.includes("itinerary")) {
    return "I can create a day-by-day itinerary if you share the destination, number of days, and your style of travel such as budget, luxury, family, adventure, or honeymoon.";
  }

  if (q.includes("family trip")) {
    return "For a family trip in India, Kerala, Jaipur, Udaipur, Shimla, Manali, and Andaman are usually strong options because they balance sightseeing, comfort, and easy activities.";
  }

  if (q.includes("honeymoon")) {
    return "For a honeymoon in India, popular choices are Udaipur, Kerala, Goa, Kashmir, Manali, and Andaman depending on whether you want lakes, beaches, mountains, or luxury stays.";
  }

  if (q.includes("website") || q.includes("safara") || q.includes("what can i do")) {
    return "On the Safara website you can explore destinations, build a simple itinerary, estimate travel budget, convert currency, manage a packing checklist, browse festivals, and send a travel inquiry through the contact form.";
  }

  if (q.includes("festival")) {
    return "Major travel-friendly festivals include Holi in March, Jaipur Literature Festival in January, Navratri and Durga Puja around October, and Diwali in November. If you share your travel month, I can suggest the best festival destinations.";
  }

  if (q.includes("mountain") || q.includes("hill")) {
    return "For mountain trips, consider Munnar for tea hills, Manali for classic Himalayan scenery, or Shillong for cool weather and waterfalls. I can also suggest options by season or budget.";
  }

  if (q.includes("plan") || q.includes("trip")) {
    return "I can help plan your trip by destination, number of days, and budget. Tell me where you want to go, how many days you have, and whether you prefer culture, beaches, mountains, food, or a mixed itinerary.";
  }

  return "I can help with India destinations, itineraries, budget tips, food recommendations, festivals, and using the Safara website. Ask something like 'Suggest a 4 day Kerala trip', 'Top foods in India', or 'Best places in Rajasthan for 5 days'.";
}

const chatPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Safara Customer Chat</title>
  <style>
    :root {
      --bg: #fff9f1;
      --panel: rgba(255, 255, 255, 0.78);
      --text: #1f2937;
      --muted: #5b6474;
      --saffron: #ff9933;
      --green: #138808;
      --line: rgba(31, 41, 55, 0.08);
      --shadow: 0 20px 50px rgba(120, 65, 12, 0.12);
      --surface: #ffffff;
      --input: rgba(255, 255, 255, 0.72);
      --bot-border: rgba(255, 153, 51, 0.16);
    }

    body.dark {
      --bg: #07101f;
      --panel: rgba(9, 18, 34, 0.86);
      --text: #edf4ff;
      --muted: #a3b4ce;
      --line: rgba(255, 255, 255, 0.08);
      --shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
      --surface: rgba(255, 255, 255, 0.06);
      --input: rgba(255, 255, 255, 0.05);
      --bot-border: rgba(67, 198, 172, 0.2);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Poppins, Arial, sans-serif;
      background:
        linear-gradient(180deg, rgba(255, 153, 51, 0.14), rgba(255, 255, 255, 0.97) 40%, rgba(19, 136, 8, 0.14)),
        #fffdf9;
      color: var(--text);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    body.dark {
      background:
        radial-gradient(circle at top left, rgba(255, 153, 51, 0.14), transparent 26%),
        radial-gradient(circle at top right, rgba(67, 198, 172, 0.14), transparent 24%),
        linear-gradient(180deg, #07101f, #050b17);
    }

    .chat-shell {
      width: min(920px, 100%);
      background: var(--panel);
      backdrop-filter: blur(18px);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .chat-header {
      padding: 24px 28px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(90deg, rgba(255,153,51,0.18), rgba(255,255,255,0.6), rgba(19,136,8,0.18));
    }

    .chat-header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .chat-header h1 {
      margin: 0 0 8px;
      font-size: clamp(1.7rem, 3vw, 2.4rem);
    }

    .chat-header p {
      margin: 0;
      color: var(--muted);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.95rem;
      font-weight: 600;
    }

    .chat-theme-toggle {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      border-radius: 999px;
      min-width: 48px;
      height: 48px;
      padding: 0 16px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      box-shadow: var(--shadow);
    }

    .chat-log {
      height: 480px;
      overflow-y: auto;
      padding: 24px;
      display: grid;
      gap: 14px;
      background:
        radial-gradient(circle at top right, rgba(255,153,51,0.08), transparent 28%),
        radial-gradient(circle at bottom left, rgba(19,136,8,0.08), transparent 30%);
    }

    .msg {
      max-width: min(78%, 560px);
      padding: 14px 16px;
      border-radius: 18px;
      line-height: 1.5;
      white-space: pre-wrap;
      box-shadow: 0 10px 24px rgba(31, 41, 55, 0.08);
    }

    .msg.bot {
      background: var(--surface);
      border: 1px solid var(--bot-border);
    }

    .msg.user {
      margin-left: auto;
      background: linear-gradient(135deg, var(--saffron), var(--green));
      color: white;
    }

    .chat-form {
      padding: 18px;
      border-top: 1px solid var(--line);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      background: var(--input);
    }

    .chat-form input {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      outline: none;
    }

    .chat-form button {
      border: 0;
      border-radius: 14px;
      padding: 0 22px;
      font: inherit;
      font-weight: 700;
      color: white;
      cursor: pointer;
      background: linear-gradient(135deg, var(--saffron), var(--green));
    }

    .quick-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 0 18px 18px;
      background: var(--input);
    }

    .quick-row button {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      border-radius: 999px;
      padding: 10px 14px;
      cursor: pointer;
    }

    @media (max-width: 640px) {
      body { padding: 12px; }
      .chat-header-row { align-items: stretch; flex-direction: column; }
      .chat-log { height: 420px; padding: 16px; }
      .msg { max-width: 90%; }
      .chat-form { grid-template-columns: 1fr; }
      .chat-form button { padding: 14px 16px; }
      .chat-theme-toggle { align-self: flex-start; }
    }
  </style>
</head>
<body>
  <main class="chat-shell">
    <section class="chat-header">
      <div class="chat-header-row">
        <div>
          <h1>Safara Customer Chat</h1>
          <p>Ask about destinations, planning, budgets, festivals, or how to use the tourism website.</p>
          <div id="statusPill" class="status-pill">Checking AI mode...</div>
        </div>
        <button id="chatThemeToggle" class="chat-theme-toggle" type="button" aria-label="Toggle chatbot theme">☀️</button>
      </div>
    </section>

    <section id="chatLog" class="chat-log" aria-live="polite"></section>

    <form id="chatForm" class="chat-form">
      <input id="messageInput" type="text" placeholder="Ask a customer question..." autocomplete="off" required />
      <button type="submit">Send</button>
    </form>

    <div class="quick-row">
      <button type="button" data-question="Suggest a 5 day Rajasthan trip">5 day Rajasthan trip</button>
      <button type="button" data-question="What can I do on the Safara website?">Website help</button>
      <button type="button" data-question="Suggest beach destinations in India">Beach destinations</button>
      <button type="button" data-question="How can I plan a budget friendly India trip?">Budget tips</button>
    </div>
  </main>

  <script>
    const chatLog = document.getElementById("chatLog");
    const chatForm = document.getElementById("chatForm");
    const messageInput = document.getElementById("messageInput");
    const chatThemeToggle = document.getElementById("chatThemeToggle");
    const statusPill = document.getElementById("statusPill");
    const sessionId = "session-" + Math.random().toString(36).slice(2);
    const themeFromUrl = new URLSearchParams(window.location.search).get("theme");
    const themeStorageKey = "safara_chat_theme";

    function applyTheme(theme) {
      const isDark = theme === "dark";
      document.body.classList.toggle("dark", isDark);
      localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
      chatThemeToggle.textContent = isDark ? "🌙" : "☀️";
    }

    if (themeFromUrl) {
      applyTheme(themeFromUrl);
    } else {
      applyTheme(localStorage.getItem(themeStorageKey) || "light");
    }

    window.addEventListener("message", (event) => {
      if (event.data?.type === "safara-theme") {
        applyTheme(event.data.theme);
      }
    });

    chatThemeToggle.addEventListener("click", () => {
      const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
      applyTheme(nextTheme);

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "safara-theme", theme: nextTheme }, "*");
      }
    });

    function appendMessage(role, text) {
      const bubble = document.createElement("article");
      bubble.className = "msg " + role;
      bubble.textContent = text;
      chatLog.appendChild(bubble);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function loadStatus() {
      try {
        const response = await fetch("/api/status");
        const data = await response.json();
        const modeLabel = data.mode === "huggingface" ? "AI mode: Hugging Face" : "AI mode: Local fallback";
        statusPill.textContent = data.lastError ? modeLabel + " (" + data.lastError + ")" : modeLabel;
      } catch (error) {
        statusPill.textContent = "AI mode unavailable";
      }
    }

    async function sendMessage(message) {
      appendMessage("user", message);
      appendMessage("bot", "Thinking...");

      const pending = chatLog.lastElementChild;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId })
        });

        const data = await response.json();
        pending.textContent = data.answer || data.error || "Sorry, I could not answer that right now.";
        if (data.provider) {
          statusPill.textContent = data.provider === "huggingface"
            ? "AI mode: Hugging Face"
            : "AI mode: Local fallback" + (data.lastError ? " (" + data.lastError + ")" : "");
        }
      } catch (error) {
        pending.textContent = "The chatbot could not connect right now. Please try again.";
      }
    }

    chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = messageInput.value.trim();
      if (!message) return;
      messageInput.value = "";
      await sendMessage(message);
    });

    document.querySelectorAll("[data-question]").forEach((button) => {
      button.addEventListener("click", async () => {
        await sendMessage(button.dataset.question);
      });
    });

    appendMessage("bot", "Namaste! I am the Safara customer support bot. Ask me about destinations, trip planning, budgets, or how to use the website.");
    loadStatus();
  </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://localhost:${port}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/status") {
    sendJson(res, 200, {
      mode: lastProviderUsed,
      model: lastModelUsed,
      hasApiKey: Boolean(apiKey),
      lastError: lastProviderError,
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat") {
    try {
      const { message, sessionId = "default" } = await readJsonBody(req);

      if (!message || typeof message !== "string") {
        sendJson(res, 400, { error: "Message is required." });
        return;
      }

      const history = getSessionHistory(sessionId);
      const historyText = formatHistory(history.slice(-8));

      const result = await generateAnswer({
        context: tourismContext,
        history: historyText || "No earlier messages.",
        question: message,
      });

      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: result.answer.trim() });

      sendJson(res, 200, {
        answer: result.answer.trim(),
        provider: result.provider,
        lastError: lastProviderError,
      });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "The chatbot failed to answer right now.",
      });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/chat") {
    sendHtml(res, chatPageHtml);
    return;
  }

  if (req.method === "GET") {
    const filePath = resolveStaticPath(decodeURIComponent(requestUrl.pathname));
    if (!filePath) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    sendFile(res, filePath);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing process or use a different PORT.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log("Safara app server running.");
  console.log(`Website: http://127.0.0.1:${port}`);
  console.log(`Chat page: http://127.0.0.1:${port}/chat`);
  console.log(`Configured model: ${modelName}`);
  console.log(apiKey ? "Provider mode: Hugging Face" : "Provider mode: local fallback (no HF token found)");
});
