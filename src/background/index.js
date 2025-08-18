import { saveClipToFirestore } from "../auth/firebase";

async function getSettings() {
  const {
    openaiKey = "",
    useMockIfFail = true,
    aiDisabled = false,
  } = await chrome.storage.local.get([
    "openaiKey",
    "useMockIfFail",
    "aiDisabled",
  ]);
  return { openaiKey, useMockIfFail, aiDisabled };
}

// ================= Mock / Fallback =================
async function mockSummarizeAndTag(text) {
  await new Promise((r) => setTimeout(r, 500));
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { summary: "", tags: [] };
  const first = clean.split(/(?<=[.?!])\s+/)[0] || clean.slice(0, 140);
  const summary = first.length <= 160 ? first : first.slice(0, 160) + "...";
  const tags = [
    ...new Set(clean.toLowerCase().match(/\b[a-z]{4,}\b/g) || []),
  ].slice(0, 5);
  while (tags.length < 3) tags.push("note");
  return { summary, tags };
}

function fallbackSummary(input) {
  const sentence = input.split(/(?<=[.?!])\s+/)[0] || input.slice(0, 120);
  const summary =
    sentence.length <= 160 ? sentence : sentence.slice(0, 160) + "...";
  const tags = (input.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).slice(0, 5);
  while (tags.length < 3) tags.push("note");
  return { summary, tags };
}

function safeExtractJSON(s) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return {};
}

// ================= OpenAI summarize (REAL) =================
const OPENAI_MODEL = "gpt-4o-mini";

async function summarizeAndTag(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { summary: "", tags: [], aiSource: "empty" };

  const { openaiKey, useMockIfFail, aiDisabled } = await getSettings();
  const input = clean.slice(0, 4000);

  if (aiDisabled) {
    const r = await mockSummarizeAndTag(input);
    return { ...r, aiSource: "disabled" };
  }
  if (!openaiKey) {
    if (useMockIfFail) {
      const r = await mockSummarizeAndTag(input);
      return { ...r, aiSource: "mock" };
    }
    const r = fallbackSummary(input);
    return { ...r, aiSource: "fallback" };
  }

  const body = {
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You are concise. Return a compact summary (1–2 sentences) and 3–5 short, lowercase tags. Respond ONLY valid JSON: {"summary": string, "tags": string[]}.',
      },
      {
        role: "user",
        content: `Text:\n${input}\n\nReturn JSON with keys: summary, tags.`,
      },
    ],
    temperature: 0.2,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (useMockIfFail)
        return { ...(await mockSummarizeAndTag(input)), aiSource: "mock" };
      return { ...fallbackSummary(input), aiSource: "fallback" };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = safeExtractJSON(content);
    }
    const summary = String(parsed.summary || "").trim();
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t) => String(t).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (!summary) {
      if (useMockIfFail)
        return { ...(await mockSummarizeAndTag(input)), aiSource: "mock" };
      return { ...fallbackSummary(input), aiSource: "fallback" };
    }
    return { summary, tags, aiSource: "openai" };
  } catch {
    if (useMockIfFail)
      return { ...(await mockSummarizeAndTag(input)), aiSource: "mock" };
    return { ...fallbackSummary(input), aiSource: "fallback" };
  }
}

// ================= Helpers =================
function normalizeProjectId(projectId) {
  return typeof projectId === "string" ? projectId : "";
}
function canInject(url) {
  try {
    const u = new URL(url || "");
    const proto = u.protocol.replace(":", "");
    return ["http", "https", "file"].includes(proto);
  } catch {
    return false;
  }
}

// ================= Context menu =================
let menuBuildInProgress = false;
let menuBuildQueued = false;

async function buildContextMenu() {
  if (menuBuildInProgress) {
    menuBuildQueued = true;
    return;
  }
  menuBuildInProgress = true;

  const { projects = [], authUser = null } = await chrome.storage.local.get([
    "projects",
    "authUser",
  ]);
  const uid = authUser?.uid || "__none__";

  const seen = new Set();
  const myProjects = [];
  for (const p of projects) {
    if (p?.ownerUid === uid && p?.id && !seen.has(p.id)) {
      seen.add(p.id);
      myProjects.push(p);
    }
  }

  const defKey = `lastActiveProjectId_${uid || "anon"}`;
  const store = await chrome.storage.local.get(defKey);
  const defaultPid = store[defKey] || "";
  const defaultProj = myProjects.find((p) => p.id === defaultPid) || null;
  const quickTitle = defaultProj
    ? `Save to default: ${defaultProj.name}`
    : "Save (default)";

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: "save_root",
        title: "Save with AI Clipper",
        contexts: ["selection"],
        documentUrlPatterns: ["<all_urls>"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[AI Clipper] parent create:",
            chrome.runtime.lastError.message
          );
          return done();
        }

        chrome.contextMenus.create(
          {
            id: "save_quick",
            parentId: "save_root",
            title: quickTitle,
            contexts: ["selection"],
          },
          swallowDup
        );
        chrome.contextMenus.create(
          {
            id: "save_sep",
            parentId: "save_root",
            type: "separator",
            contexts: ["selection"],
          },
          swallowDup
        );
        for (const p of myProjects) {
          chrome.contextMenus.create(
            {
              id: `save_p_${p.id}`,
              parentId: "save_root",
              title: `Save to: ${p.name}`,
              contexts: ["selection"],
            },
            swallowDup
          );
        }
        done();
      }
    );
  });

  function swallowDup() {
    if (
      chrome.runtime.lastError &&
      !chrome.runtime.lastError.message?.includes("duplicate id")
    ) {
      console.warn(
        "[AI Clipper] menu create warn:",
        chrome.runtime.lastError.message
      );
    }
  }
  function done() {
    menuBuildInProgress = false;
    if (menuBuildQueued) {
      menuBuildQueued = false;
      buildContextMenu();
    }
  }
}

chrome.runtime.onInstalled.addListener(buildContextMenu);
chrome.runtime.onStartup.addListener(buildContextMenu);
buildContextMenu();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    changes.projects ||
    changes.authUser ||
    Object.keys(changes).some((k) => k.startsWith("lastActiveProjectId_"))
  ) {
    buildContextMenu();
  }
});

// ================= Core save logic =================
async function saveCurrentSelection(tabId, url, projectId) {
  if (!canInject(url)) return false;

  const pid = normalizeProjectId(projectId);

  let selectedText = "";
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() || "",
    });
    selectedText = (result || "").trim();
  } catch {}

  if (!selectedText) return false;

  const { clips = [], authUser = null } = await chrome.storage.local.get([
    "clips",
    "authUser",
  ]);
  const ownerUid = authUser?.uid || "";
  const ownerEmail = authUser?.email || "";

  const clip = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    url: url || "",
    selectedText,
    summary: "",
    tags: [],
    projectId: pid,
    aiStatus: "pending",
    aiSource: "manual",
    ownerUid,
    ownerEmail,
  };

  clips.unshift(clip);
  await chrome.storage.local.set({ clips });

  // --- Firestore test save ---
  try {
    saveClipToFirestore(clip);
  } catch (err) {
    console.error("[AI Clipper] Firestore test save error:", err);
  }

  let result;
  try {
    result = await summarizeAndTag(selectedText);
  } catch {
    result = { summary: "", tags: [], aiSource: "error" };
  }

  const updated = clips.map((c) =>
    c.id === clip.id
      ? {
          ...c,
          summary: result.summary || "",
          tags: result.tags || [],
          aiStatus: "done",
          aiSource: result.aiSource,
        }
      : c
  );
  await chrome.storage.local.set({ clips: updated });

  return true;
}

// ================= Handlers =================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  const url = info.pageUrl || tab?.url || "";
  if (!tabId || !canInject(url)) return;

  if (info.menuItemId === "save_quick") {
    await saveCurrentSelection(tabId, url, undefined);
    return;
  }
  if (
    typeof info.menuItemId === "string" &&
    info.menuItemId.startsWith("save_p_")
  ) {
    const projectId = info.menuItemId.slice("save_p_".length);
    await saveCurrentSelection(tabId, url, projectId);
  }
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg?.type === "SAVE_SELECTION_FROM_POPUP") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const ok = tab?.id
      ? await saveCurrentSelection(tab.id, tab.url || "", msg.projectId)
      : false;
    sendResponse({ ok });
  }
  return true;
});
