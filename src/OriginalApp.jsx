import { useEffect, useMemo, useRef, useState } from "react";
import { signOutUser } from "./auth/firebase";
export default function App() {
  const [clips, setClips] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null); // current auth user

  // filters
  const [q, setQ] = useState("");
  const [activeTags, setActiveTags] = useState([]);

  // inline edit
  const [editingId, setEditingId] = useState(null);
  const [editSummary, setEditSummary] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // tag edit
  const [newTag, setNewTag] = useState("");

  // bulk + view
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [compactView, setCompactView] = useState(false);

  // settings & header menu
  const [openaiKey, setOpenaiKey] = useState("");
  const [useMockIfFail, setUseMockIfFail] = useState(true);
  const [aiDisabled, setAiDisabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // per-clip menus
  const [openClipMenuId, setOpenClipMenuId] = useState(null);
  const [openBulkPanelId, setOpenBulkPanelId] = useState(null);

  // summary toggle (per-clip)
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState({});
  const [expandedSummaryIds, setExpandedSummaryIds] = useState(new Set());
  const isSummaryOpen = (id) => expandedSummaryIds.has(id);
  const toggleSummary = (id) =>
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // import
  const fileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);

  // ---------- load ----------
  async function loadAll() {
    const {
      clips = [],
      projects = [],
      openaiKey = "",
      useMockIfFail = true,
      aiDisabled = false,
      authUser = null,
      lastActiveProjectId = "",
    } = await chrome.storage.local.get([
      "clips",
      "projects",
      "openaiKey",
      "useMockIfFail",
      "aiDisabled",
      "authUser",
      "lastActiveProjectId",
    ]);

    setMe(authUser);

    // only my data
    const myClips = authUser?.uid
      ? clips.filter((c) => c.ownerUid === authUser.uid)
      : [];
    const myProjects = authUser?.uid
      ? projects.filter((p) => p.ownerUid === authUser.uid)
      : [];

    setClips(myClips);
    setOpenaiKey(openaiKey);
    setUseMockIfFail(!!useMockIfFail);
    setAiDisabled(!!aiDisabled);

    if (myProjects.length === 0) {
      setProjects([]);
      setActiveProjectId("");
    } else {
      setProjects(myProjects);
      // try to keep current selection; otherwise use lastActiveProjectId if valid
      const desired =
        activeProjectId ||
        (lastActiveProjectId &&
          myProjects.find((p) => p.id === lastActiveProjectId)?.id) ||
        "";
      setActiveProjectId(desired);
    }
  }

  useEffect(() => {
    loadAll();
    const listener = (changes, area) => {
      if (area !== "local") return;
      if (
        changes.clips ||
        changes.projects ||
        changes.openaiKey ||
        changes.useMockIfFail ||
        changes.aiDisabled ||
        changes.authUser
      ) {
        loadAll();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // ---------- actions ----------
  async function saveFromSelection() {
    setSaving(true);
    const payload = {
      type: "SAVE_SELECTION_FROM_POPUP",
      ...(activeProjectId ? { projectId: activeProjectId } : {}),
    };
    const res = await chrome.runtime.sendMessage(payload);
    setSaving(false);
    if (!res?.ok) alert("Could not save selection.");
  }
  const addNote = (cid, note) => {
    if (!note.trim()) return;

    setNotes((prev) => ({
      ...prev,
      [cid]: [...(prev[cid] || []), note], // agar pehle notes hain to add karo warna naya array banao
    }));

    setNewNote(""); // input clear
  };
  const handleDelete = (cid, idx, setNotes) => {
    setNotes((prev) => {
      const updatedNotes = [...(prev[cid] || [])];
      updatedNotes.splice(idx, 1); // index wala note remove karo
      return { ...prev, [cid]: updatedNotes };
    });
  };

  async function createProject() {
    if (!me?.uid) {
      alert("Please sign in first.");
      return;
    }
    const name = prompt("Project name?");
    if (!name) return;
    const id =
      name.toLowerCase().replace(/\s+/g, "-") +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const { projects: all = [] } = await chrome.storage.local.get("projects");
    const newProject = {
      id,
      name,
      ownerUid: me.uid,
      ownerEmail: me.email || "",
    };
    await chrome.storage.local.set({ projects: [...all, newProject] });
    setActiveProjectId(id);
  }

  async function deleteProject(projectId) {
    if (!projectId) return;
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    if (!confirm(`Delete project "${proj.name}" and all its clips?`)) return;

    const { projects: allProjects = [], clips = [] } =
      await chrome.storage.local.get(["projects", "clips"]);
    const updatedProjects = allProjects.filter((p) => p.id !== projectId);
    const updatedClips = clips.filter((c) => c.projectId !== projectId);

    await chrome.storage.local.set({
      projects: updatedProjects,
      clips: updatedClips,
    });

    setSelectedIds(new Set());
    if (activeProjectId === projectId) {
      setActiveProjectId(updatedProjects[0]?.id || "");
    }
  }

  async function moveClip(clipId, newProjectId) {
    if (!newProjectId) return;
    const { clips = [] } = await chrome.storage.local.get("clips");
    const next = clips.map((c) =>
      c.id === clipId ? { ...c, projectId: newProjectId } : c
    );
    await chrome.storage.local.set({ clips: next });
  }

  async function saveEdits(clipId) {
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.map((c) =>
      c.id === clipId ? { ...c, summary: editSummary, notes: editNotes } : c
    );
    await chrome.storage.local.set({ clips: updated });
    setEditingId(null);
    setEditSummary("");
    setEditNotes("");
  }

  async function deleteClip(clipId) {
    if (!confirm("Delete this clip?")) return;
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.filter((c) => c.id !== clipId);
    await chrome.storage.local.set({ clips: updated });
  }

  // ---------- filtering ----------
  const nameOf = (id) => projects.find((p) => p.id === id)?.name || "";

  const projectClips = useMemo(
    () =>
      clips.filter((c) =>
        activeProjectId ? c.projectId === activeProjectId : true
      ),
    [clips, activeProjectId]
  );

  const allTagsInProject = useMemo(() => {
    const set = new Set();
    projectClips.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [projectClips]);

  const filteredClips = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projectClips.filter((c) => {
      const hay = [c.url, c.selectedText, c.summary, c.notes, ...(c.tags || [])]
        .join(" ")
        .toLowerCase();

      const matchesText = needle ? hay.includes(needle) : true;
      const matchesTags = activeTags.length
        ? (c.tags || []).some((t) => activeTags.includes(t))
        : true;

      return matchesText && matchesTags;
    });
  }, [projectClips, q, activeTags]);

  // ---------- selection / bulk ----------
  const isSelected = (id) => selectedIds.has(id);
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () =>
    setSelectedIds(new Set(filteredClips.map((c) => c.id)));
  const clearSelection = () => setSelectedIds(new Set());

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected clip(s)?`)) return;
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.filter((c) => !selectedIds.has(c.id));
    await chrome.storage.local.set({ clips: updated });
    setSelectedIds(new Set());
  }

  async function bulkMove(newProjectId) {
    if (!newProjectId || selectedIds.size === 0) return;
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.map((c) =>
      selectedIds.has(c.id) ? { ...c, projectId: newProjectId } : c
    );
    await chrome.storage.local.set({ clips: updated });
    setSelectedIds(new Set());
  }

  // ---------- reorder ----------
  async function moveCard(id, direction) {
    const { clips: all = [] } = await chrome.storage.local.get("clips");
    const visibleIds = filteredClips.map((c) => c.id);
    const idx = visibleIds.indexOf(id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= visibleIds.length) return;

    const aId = visibleIds[idx];
    const bId = visibleIds[targetIdx];

    const iA = all.findIndex((c) => c.id === aId);
    const iB = all.findIndex((c) => c.id === bId);
    if (iA < 0 || iB < 0) return;

    const copy = all.slice();
    const [a] = copy.splice(iA, 1);
    copy.splice(iB, 0, a);
    await chrome.storage.local.set({ clips: copy });
  }

  // ---------- export/import helpers ----------
  function downloadFile(filename, content, mime = "text/plain") {
    if (!content || content.length === 0) {
      alert("No data to export.");
      return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toMarkdown(projectName, clipsArr) {
    const lines = [];
    lines.push(`# ${projectName} — Clips Export`);
    lines.push(`_Exported: ${new Date().toLocaleString()}_`);
    lines.push("");
    clipsArr.forEach((c, i) => {
      lines.push(`## ${i + 1}. ${c.url}`);
      lines.push(`**Saved:** ${new Date(c.createdAt).toLocaleString()}`);
      if (c.tags?.length) lines.push(`**Tags:** ${c.tags.join(", ")}`);
      lines.push("");
      lines.push(`> ${String(c.selectedText || "").replace(/\n/g, " ")}`);
      if (c.summary) {
        lines.push("");
        lines.push(`**Summary:** ${c.summary}`);
      }
      if (c.notes) {
        lines.push("");
        lines.push(`**Notes:**`);
        lines.push(String(c.notes));
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    });
    return lines.join("\n");
  }

  function toJSON(projectName, clipsArr) {
    const payload = {
      project: projectName,
      exportedAt: new Date().toISOString(),
      count: clipsArr.length,
      clips: clipsArr.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        url: c.url,
        selectedText: c.selectedText,
        summary: c.summary || "",
        notes: c.notes || "",
        tags: c.tags || [],
        projectId: c.projectId || "",
        aiStatus: c.aiStatus || "",
        aiSource: c.aiSource || "",
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  function exportMarkdown() {
    const name = nameOf(activeProjectId) || "project";
    const md = toMarkdown(name, filteredClips);
    const fname = `${name.replace(/\s+/g, "_")}-${new Date()
      .toISOString()
      .slice(0, 10)}.md`;
    downloadFile(fname, md, "text/markdown");
    setShowMenu(false);
  }
  function exportJSON() {
    const name = nameOf(activeProjectId) || "project";
    const json = toJSON(name, filteredClips);
    const fname = `${name.replace(/\s+/g, "_")}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    downloadFile(fname, json, "application/json");
    setShowMenu(false);
  }

  function exportAllJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        clips: clips.filter((c) => c.projectId === p.id),
      })),
    };
    const fname = `all-projects-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(fname, JSON.stringify(payload, null, 2), "application/json");
    setShowMenu(false);
  }
  function exportAllMD() {
    const lines = [];
    lines.push(`# AI Clipper — All Projects`);
    lines.push(`_Exported: ${new Date().toLocaleString()}_`);
    lines.push("");
    projects.forEach((p) => {
      lines.push(`\n# Project: ${p.name}\n`);
      const pcs = clips.filter((c) => c.projectId === p.id);
      if (pcs.length === 0) {
        lines.push("_No clips._\n");
        return;
      }
      lines.push(toMarkdown(p.name, pcs));
    });
    const fname = `all-projects-${new Date().toISOString().slice(0, 10)}.md`;
    downloadFile(fname, lines.join("\n"), "text/markdown");
    setShowMenu(false);
  }

  function exportClipMD(c) {
    const md = toMarkdown(nameOf(c.projectId) || "project", [c]);
    const fname = `clip-${(c.id || "").slice(0, 8)}.md`;
    downloadFile(fname, md, "text/markdown");
  }
  function exportClipJSON(c) {
    const json = toJSON(nameOf(c.projectId) || "project", [c]);
    const fname = `clip-${(c.id || "").slice(0, 8)}.json`;
    downloadFile(fname, json, "application/json");
  }

  function exportSelectedMD() {
    const list = filteredClips.filter((c) => selectedIds.has(c.id));
    const md = toMarkdown(nameOf(activeProjectId) || "project", list);
    const fname = `selected-${new Date().toISOString().slice(0, 10)}.md`;
    downloadFile(fname, md, "text/markdown");
  }
  function exportSelectedJSON() {
    const list = filteredClips.filter((c) => selectedIds.has(c.id));
    const json = toJSON(nameOf(activeProjectId) || "project", list);
    const fname = `selected-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(fname, json, "application/json");
  }

  // import
  function triggerImport() {
    setShowMenu(false);
    fileInputRef.current?.click();
  }
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const projectName =
        data.project || `Imported ${new Date().toLocaleDateString()}`;
      const newProjectId =
        projectName.toLowerCase().replace(/\s+/g, "-") +
        "-" +
        Math.random().toString(36).slice(2, 6);

      const { projects: existingProjects = [], clips: existingClips = [] } =
        await chrome.storage.local.get(["projects", "clips"]);

      // 🔒 project ownership
      const newProject = {
        id: newProjectId,
        name: projectName,
        ownerUid: me?.uid || "",
        ownerEmail: me?.email || "",
      };
      const nextProjects = [...existingProjects, newProject];

      const importedClips = Array.isArray(data.clips) ? data.clips : [];
      const sanitized = importedClips.map((c) => ({
        id: crypto.randomUUID(),
        createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
        url: String(c.url || ""),
        selectedText: String(c.selectedText || ""),
        summary: String(c.summary || ""),
        notes: String(c.notes || ""),
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        projectId: newProjectId,
        aiStatus: "done",
        aiSource: c.aiSource || "import",
        ownerUid: me?.uid || "",
        ownerEmail: me?.email || "",
      }));

      await chrome.storage.local.set({
        projects: nextProjects,
        clips: [...sanitized, ...existingClips],
      });

      setActiveProjectId(newProjectId);
      alert(
        `Imported ${sanitized.length} clip(s) into project "${projectName}".`
      );
    } catch (err) {
      console.error("Import failed:", err);
      alert("Invalid JSON file.");
    } finally {
      e.target.value = "";
    }
  }

  function triggerBulkImport() {
    setShowMenu(false);
    bulkFileInputRef.current?.click();
  }
  async function handleBulkImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const { projects: existingProjects = [], clips: existingClips = [] } =
        await chrome.storage.local.get(["projects", "clips"]);

      const collectedProjects = [];
      const collectedClips = [];

      const list = Array.isArray(data?.projects)
        ? data.projects
        : Array.isArray(data)
        ? data
        : data?.project
        ? [data]
        : [];

      if (!Array.isArray(list) || list.length === 0) {
        alert("Unsupported JSON shape for bulk import.");
        e.target.value = "";
        return;
      }

      for (const item of list) {
        const name =
          item.name ||
          item.project ||
          `Imported ${Math.random().toString(36).slice(2, 6)}`;
        const newProjectId =
          name.toLowerCase().replace(/\s+/g, "-") +
          "-" +
          Math.random().toString(36).slice(2, 6);

        // 🔒 ownership on projects
        collectedProjects.push({
          id: newProjectId,
          name,
          ownerUid: me?.uid || "",
          ownerEmail: me?.email || "",
        });

        const arr = Array.isArray(item.clips) ? item.clips : [];
        arr.forEach((c) => {
          collectedClips.push({
            id: crypto.randomUUID(),
            createdAt:
              typeof c.createdAt === "number" ? c.createdAt : Date.now(),
            url: String(c.url || ""),
            selectedText: String(c.selectedText || ""),
            summary: String(c.summary || ""),
            notes: String(c.notes || ""),
            tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
            projectId: newProjectId,
            aiStatus: "done",
            aiSource: c.aiSource || "import",
            // 🔒 clip ownership
            ownerUid: me?.uid || "",
            ownerEmail: me?.email || "",
          });
        });
      }

      await chrome.storage.local.set({
        projects: [...existingProjects, ...collectedProjects],
        clips: [...collectedClips, ...existingClips],
      });

      setActiveProjectId(
        collectedProjects[0]?.id || existingProjects[0]?.id || ""
      );
      alert(
        `Imported ${collectedClips.length} clip(s) across ${collectedProjects.length} project(s).`
      );
    } catch (err) {
      console.error("Bulk import failed:", err);
      alert("Invalid JSON file for bulk import.");
    } finally {
      e.target.value = "";
    }
  }

  // settings save
  async function saveSettings() {
    await chrome.storage.local.set({
      openaiKey: openaiKey.trim(),
      useMockIfFail: !!useMockIfFail,
      aiDisabled: !!aiDisabled,
    });
    alert("Settings saved.");
  }
  async function clearKey() {
    setOpenaiKey("");
    await chrome.storage.local.set({ openaiKey: "" });
  }

  // ---------- Tag management ----------
  async function addTag(clipId, tag) {
    const t = String(tag || "")
      .toLowerCase()
      .trim();
    if (!t) return;
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.map((c) =>
      c.id === clipId
        ? { ...c, tags: Array.from(new Set([...(c.tags || []), t])) }
        : c
    );
    await chrome.storage.local.set({ clips: updated });
    setNewTag("");
  }
  async function removeTag(clipId, tag) {
    const { clips = [] } = await chrome.storage.local.get("clips");
    const updated = clips.map((c) =>
      c.id === clipId
        ? { ...c, tags: (c.tags || []).filter((x) => x !== tag) }
        : c
    );
    await chrome.storage.local.set({ clips: updated });
  }

  // ---------- render ----------
  const selectionCount = selectedIds.size;

  return (
    <div
      className="p-6 w-[430px] text-sm min-h-screen rounded-2xl 
    bg-gradient-to-br from-gray-900 via-gray-800 to-black 
    shadow-2xl border border-gray-700 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <h2
          className="text-3xl font-extrabold tracking-tight text-white drop-shadow 
      px-6 py-2 rounded-2xl 
      bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 
      shadow-lg"
        >
          AI Clipper
        </h2>
        <button
          className="text-xs border border-white-800 rounded px-2 py-2 
                      bg-gray-600/60 hover:text-indigo-300 transition"
          title="Menu"
          onClick={() => setShowMenu((v) => !v)}
        >
          ⋮
        </button>
        {showMenu && (
          <div
            className="absolute right-0 top-12 z-50 w-52 rounded-1xl 
        border border-gray-700 bg-gray-900 shadow-xl backdrop-blur-lg"
          >
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={() => {
                setShowSettings((v) => !v);
                setShowMenu(false);
              }}
            >
              Settings
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-400"
              onClick={async () => {
                setShowMenu(false);
                try {
                  await signOutUser();
                } catch {}
              }}
            >
              Sign out
            </button>
            <hr className="border-gray-700" />
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={exportMarkdown}
            >
              Export MD (current)
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={exportJSON}
            >
              Export JSON (current)
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={triggerImport}
            >
              Import JSON (project)
            </button>
            <hr className="border-gray-700" />
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={exportAllMD}
            >
              Export ALL MD
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={exportAllJSON}
            >
              Export ALL JSON
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800 text-gray-200"
              onClick={triggerBulkImport}
            >
              Bulk Import (multi)
            </button>
          </div>
        )}
      </div>

      {/* hidden file inputs */}
      <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        onChange={handleImportFile}
        className="hidden"
      />
      <input
        type="file"
        accept="application/json"
        ref={bulkFileInputRef}
        onChange={handleBulkImportFile}
        className="hidden"
      />

      {/* Project selector */}
      <div className="mb-3 flex gap-2">
        <select
          className="flex-1 rounded-2xl border border-gray-700 bg-gray-900 text-gray-200 
      px-3 py-2 shadow-md focus:ring-2 focus:ring-purple-500 transition"
          value={activeProjectId}
          onChange={async (e) => {
            const v = e.target.value;
            setActiveProjectId(v);
            try {
              await chrome.storage.local.set({ lastActiveProjectId: v });
            } catch {}
          }}
        >
          <option value="">-- Select Project --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="rounded-2xl border border-gray-700 px-3 py-2  bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-medium 
      shadow hover:scale-105 hover:shadow-lg transition-all"
          onClick={createProject}
        >
          + New
        </button>
        <button
          className="rounded-2xl border border-gray-700 px-3 py-2 bg-gradient-to-r 
      from-red-500 to-rose-600 text-white font-medium 
      shadow hover:scale-105 hover:shadow-lg transition-all disabled:opacity-50"
          onClick={() => deleteProject(activeProjectId)}
          disabled={!activeProjectId}
          title="Delete selected project"
        >
          🗑
        </button>
      </div>

      {/* Search + view */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded-2xl border border-gray-700 bg-gray-900 text-gray-200 
      px-3 py-2 shadow-md focus:ring-2 focus:ring-indigo-500 transition"
          placeholder="Search text, URL, tags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="text-xs flex items-center gap-1 text-gray-300">
          <input
            type="checkbox"
            className="accent-purple-500"
            checked={compactView}
            onChange={(e) => setCompactView(e.target.checked)}
          />{" "}
          Compact
        </label>
        <label className="text-xs flex items-center gap-1 text-gray-300">
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={reorderMode}
            onChange={(e) => setReorderMode(e.target.checked)}
          />{" "}
          Reorder
        </label>
      </div>

      {/* Tag filter bar */}
      {allTagsInProject.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allTagsInProject.map((t, i) => {
            const on = activeTags.includes(t);
            return (
              <button
                key={i}
                onClick={() =>
                  setActiveTags((prev) =>
                    prev.includes(t)
                      ? prev.filter((x) => x !== t)
                      : [...prev, t]
                  )
                }
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium tracking-tight transition-all duration-300 shadow 
            ${
              on
                ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-transparent shadow-lg scale-105"
                : "bg-gray-900 text-gray-300 border border-gray-700 hover:border-indigo-500 hover:text-white hover:shadow-md"
            }`}
              >
                {t}
              </button>
            );
          })}
          {(q || activeTags.length) > 0 && (
            <button
              onClick={() => {
                setQ("");
                setActiveTags([]);
              }}
              className="ml-auto text-xs text-red-400 underline hover:text-red-300 transition"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Save + Refresh */}
      <button
        className="mt-3 w-full rounded-2xl border px-3 py-2 font-semibold 
             bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 
             text-white shadow-md hover:shadow-xl hover:scale-[1.02] 
             transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={saveFromSelection}
        disabled={saving || !me?.uid} // 🔒 disable if not signed in
      >
        {saving ? "Saving..." : me?.uid ? "Save selection" : "Sign in to save"}
      </button>

      <button
        className="mt-2 w-full rounded-2xl border border-gray-700 px-3 py-2 
             bg-gray-900 text-gray-200 shadow hover:border-indigo-500 
             hover:text-white hover:shadow-lg hover:scale-[1.02] 
             transition-all duration-300"
        onClick={loadAll}
      >
        Refresh
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mt-4 rounded-2xl border border-gray-700 bg-gray-900/60 backdrop-blur-lg p-4 space-y-3 shadow-xl">
          <div className="font-semibold text-lg text-indigo-300">
            ⚙️ OpenAI Settings
          </div>

          <div className="flex gap-2 items-center">
            <input
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800/70 text-gray-200 px-3 py-2 
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                   placeholder-gray-400 shadow-sm"
              type="password"
              placeholder="OpenAI API Key"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
            <button
              className="rounded-xl px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 
                   text-white font-medium shadow-md hover:shadow-lg hover:scale-[1.03] 
                   transition-all duration-300"
              onClick={saveSettings}
            >
              Save
            </button>
            <button
              className="rounded-xl px-3 py-2 border border-red-600 text-red-400 
                   hover:bg-red-600/20 hover:text-red-300 transition-all duration-300"
              onClick={clearKey}
            >
              Clear
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={useMockIfFail}
              onChange={(e) => setUseMockIfFail(e.target.checked)}
            />
            Use mock AI if key missing or API fails
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={aiDisabled}
              onChange={(e) => setAiDisabled(e.target.checked)}
            />
            Disable AI entirely (never call OpenAI)
          </label>

          <div className="text-xs text-gray-400 italic">
            💡 Tip: Prefer saving the key via this UI or a small proxy—avoid
            hardcoding.
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-3 space-y-3">
        {filteredClips.length === 0 ? (
          <p className="opacity-70 text-gray-400 italic">
            {q || activeTags.length
              ? "No matches. Try clearing filters."
              : activeProjectId
              ? `No clips in "${nameOf(activeProjectId)}".`
              : "Create or select a project to see clips."}
          </p>
        ) : (
          filteredClips.map((c) => (
            <article
              key={c.id}
              className={`relative rounded-2xl border border-gray-700/50 
                    bg-gray-900/50 backdrop-blur-lg shadow-md 
                    hover:shadow-xl hover:scale-[1.01] transition-all duration-300 p-4 
                    ${compactView ? "py-2" : ""}`}
              onMouseLeave={() =>
                openBulkPanelId === c.id && setOpenBulkPanelId(null)
              }
            >
              {/* Header */}
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    title="Select for bulk actions"
                    className="accent-indigo-500 scale-110"
                  />
                  <time className="text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleString()}
                  </time>
                </div>
                <div className="flex items-center gap-1">
                  {reorderMode && (
                    <>
                      <button
                        className="text-xs border border-white-600 rounded px-2 py-0.5 
                             hover:bg-gray-700/60 hover:text-indigo-300 transition"
                        onClick={() => moveCard(c.id, "up")}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="text-xs border border-white-600 rounded px-2 py-0.5 
                             hover:bg-gray-700/60 hover:text-indigo-300 transition"
                        onClick={() => moveCard(c.id, "down")}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <select
                    className="text-xs rounded-xl border border-gray-700 bg-gray-800/70 
                         px-2 py-0.5 text-gray-200 focus:ring-2 focus:ring-indigo-500"
                    value={c.projectId || ""}
                    onChange={(e) => moveClip(c.id, e.target.value)}
                  >
                    <option value="">--</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="text-xs border border-white-800 rounded px-2 py-0.5 
                      bg-gray-600/60 hover:text-indigo-300 transition"
                    title="More"
                    onClick={() =>
                      setOpenClipMenuId((prev) => (prev === c.id ? null : c.id))
                    }
                  >
                    ⋮
                  </button>
                </div>
              </header>
              {/* Dropdown Menu */}
              {openClipMenuId === c.id && (
                <div
                  className="absolute right-2 top-10 z-40 w-48 rounded-lg 
                  border border-white-700 bg-[#0f172a]/95 shadow-xl overflow-hidden"
                >
                  <button
                    className="w-full text-left px-3 py-2 text-gray-200 text-sm 
                 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                    onClick={() => {
                      exportClipMD(c);
                      setOpenClipMenuId(null);
                    }}
                  >
                    Export MD (current)
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-gray-200 text-sm 
                 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                    onClick={() => {
                      exportClipJSON(c);
                      setOpenClipMenuId(null);
                    }}
                  >
                    Export JSON (current)
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-gray-200 text-sm 
                 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                    onClick={() => {
                      setOpenBulkPanelId(c.id);
                      setOpenClipMenuId(null);
                      if (!selectedIds.has(c.id))
                        setSelectedIds(new Set([...selectedIds, c.id]));
                    }}
                  >
                    Bulk actions…
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-red-400 
                 hover:bg-red-600/20 hover:text-red-300 transition"
                    onClick={() => {
                      deleteClip(c.id);
                      setOpenClipMenuId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
              {/* Bulk Panel */}
              {openBulkPanelId === c.id && (
                <div
                  className="absolute right-2 top-10 z-40 w-72 rounded-lg 
                  border border-gray-700 bg-[#0f172a]/95 shadow-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-400">
                      {selectionCount} selected
                    </div>
                    <button
                      className="text-xs border border-gray-600 rounded px-2 py-0.5 
                   hover:bg-gray-700/70 hover:text-indigo-300 transition"
                      onClick={() => setOpenBulkPanelId(null)}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="text-xs border border-gray-600 rounded px-2 py-1 
                   hover:bg-gray-700/70 hover:text-indigo-300 transition"
                      onClick={selectAllVisible}
                    >
                      Select all
                    </button>
                    <button
                      className="text-xs border border-gray-600 rounded px-2 py-1 
                   hover:bg-gray-700/70 hover:text-indigo-300 transition"
                      onClick={clearSelection}
                    >
                      Clear
                    </button>
                    <select
                      className="text-xs rounded border border-gray-700 bg-gray-800/80 
                   px-2 py-1 flex-1 text-gray-200 focus:ring-2 focus:ring-indigo-500"
                      onChange={(e) => {
                        if (!e.target.value) return;
                        bulkMove(e.target.value);
                        e.target.value = "";
                      }}
                      defaultValue=""
                    >
                      <option value="">Move to…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-xs border border-red-600 text-red-400 rounded px-2 py-1 
                   hover:bg-red-600/20 hover:text-red-300 transition"
                      onClick={bulkDelete}
                    >
                      Delete selected
                    </button>
                    <button
                      className="text-xs border border-gray-600 rounded px-2 py-1 
                   hover:bg-gray-700/70 hover:text-indigo-300 transition"
                      onClick={exportSelectedMD}
                    >
                      Export MD
                    </button>
                    <button
                      className="text-xs border border-gray-600 rounded px-2 py-1 
                   hover:bg-gray-700/70 hover:text-indigo-300 transition"
                      onClick={exportSelectedJSON}
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              )}
              {/* Source link + content */}
              {!compactView && (
                <>
                  <div className="flex items-center gap-2">
                    <a
                      className="inline-flex items-center gap-1 rounded-xl border border-gray-700 
                           bg-gray-800/80 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-600/20 
                           shadow-sm transition"
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      title={c.url}
                    >
                      Source <span aria-hidden>↗</span>
                    </a>
                  </div>

                  <div className="mt-3 relative pt-4">
                    <span className="absolute top-0 left-0 text-[11px] uppercase tracking-wide text-gray-400">
                      Text:
                    </span>
                    <p className="text-[13px] whitespace-pre-line leading-tight text-gray-200">
                      {(c.selectedText || "")
                        .replace(/\r/g, "")
                        .replace(/\n{2,}/g, "\n")
                        .trim()}
                    </p>
                  </div>
                </>
              )}
              {(notes[c.id] || []).length > 0 && (
                <div className="mt-3 relative pt-4">
                  <span className="absolute top-0 left-0 text-[11px] uppercase tracking-wide text-gray-400">
                    Notes:
                  </span>

                  {/* Single Box for All Notes */}
                  <div className="p-3 bg-gray-800 rounded-lg shadow-md border border-gray-200 space-y-2">
                    {(notes[c.id] || []).map((n, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start"
                      >
                        <p className="text-[13px] text-white leading-tight whitespace-pre-line">
                          {n}
                        </p>
                        <button
                          onClick={() => handleDelete(c.id, idx, setNotes)}
                          className="text-red-400 hover:text-red-600"
                        >
                          ✖
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Add Tag Row + Summary Toggle */}
              <hr className="my-3 border-gray-700/60" />
              {/* Summary Section */}
              {c.summary && isSummaryOpen(c.id) && (
                <>
                  <span className="block text-[11px] uppercase tracking-wide text-gray-400">
                    Summary:
                  </span>
                  <div className="mt-2 text-[13px] leading-tight text-gray-300">
                    {c.summary}
                  </div>
                </>
              )}
              <hr className="my-3 border-gray-700/60" />
              {c.tags && c.tags.length > 0 && (
                <div className="mt-2">
                  <span className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                    Tags:
                  </span>
                  {c.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-full bg-gray-900 text-white text-xs  border border-gray-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <hr className="my-3 border-gray-700/60" />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1 text-sm 
           text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => addNote(c.id, newNote)}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-600 
        hover:bg-indigo-600/20 text-gray-200 transition"
                >
                  Add Note
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1 text-sm 
 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => addTag(c.id, newTag)}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-600 
 hover:bg-indigo-600/20 text-gray-200 transition"
                >
                  Add
                </button>

                {/* Summary Toggle Button */}
                {c.summary && (
                  <button
                    onClick={() => toggleSummary(c.id)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-600 
   hover:bg-indigo-600/20 text-gray-200 transition"
                  >
                    {isSummaryOpen(c.id) ? "Close Summary" : "Summary"}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
