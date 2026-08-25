(() => {
  "use strict";

  const SOURCES_KEY = "curriculum-mapping-division-sources-v1";
  const CONFIG = window.CURRICULUM_MAPPING_CONFIG || {};
  const DEFAULT_LEVEL_BANDS = [
    { label: "100-level", description: "Entry and introduction", min: 0, max: 199, defaultLevel: 100 },
    { label: "200-level", description: "Development and choice", min: 200, max: 299, defaultLevel: 200 },
    { label: "300-level", description: "Advanced work and synthesis", min: 300, max: 999, defaultLevel: 300 }
  ];

  let supabaseClient = null;
  let sources = loadSources();
  let snapshots = [];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = (id) => document.getElementById(id);
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadSources() {
    try {
      const saved = localStorage.getItem(SOURCES_KEY);
      const rows = saved ? JSON.parse(saved) : [];
      return Array.isArray(rows) ? rows.filter((item) => item?.slug && item?.token) : [];
    } catch (error) {
      console.warn("Unable to load division sources", error);
      return [];
    }
  }

  function saveSources() {
    try {
      localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
    } catch (error) {
      console.warn("Unable to save division sources", error);
      toast("Unable to save sources in this browser");
    }
  }

  function toast(message) {
    const element = byId("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  function formatPercent(numerator, denominator) {
    if (!denominator) return "0%";
    return `${Math.round((numerator / denominator) * 100)}%`;
  }

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function hasCloudConfig() {
    return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
  }

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (loadSupabaseLibrary.promise) return loadSupabaseLibrary.promise;

    loadSupabaseLibrary.promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Unable to load Supabase library"));
      document.head.appendChild(script);
    });
    return loadSupabaseLibrary.promise;
  }

  async function configureCloud() {
    if (!hasCloudConfig()) {
      setRefreshStatus("Supabase config missing");
      return false;
    }

    try {
      await loadSupabaseLibrary();
      supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      return true;
    } catch (error) {
      console.error(error);
      setRefreshStatus("Cloud library unavailable");
      return false;
    }
  }

  function setSourceStatus(message) {
    byId("division-source-status").textContent = message;
  }

  function setRefreshStatus(message) {
    byId("division-refresh-status").textContent = message;
  }

  function parseWorkspaceLinks(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        let url;
        try {
          url = new URL(line, window.location.href);
        } catch {
          throw new Error(`This does not look like a valid URL: ${line}`);
        }
        const slug = url.searchParams.get("workspace");
        const token = url.searchParams.get("token");
        if (!slug || !token) throw new Error("A programme link must include both workspace and token.");
        return {
          id: uid("source"),
          slug,
          token,
          label: "",
          addedAt: new Date().toISOString()
        };
      });
  }

  function addSourcesFromText() {
    const input = byId("division-link-input");
    let parsed = [];
    try {
      parsed = parseWorkspaceLinks(input.value);
    } catch (error) {
      alert(error.message);
      return;
    }
    if (!parsed.length) return toast("Paste at least one programme link");

    parsed.forEach((next) => {
      const existing = sources.find((item) => item.slug === next.slug);
      if (existing) {
        existing.token = next.token;
      } else {
        sources.push(next);
      }
    });
    input.value = "";
    saveSources();
    renderSourceList();
    toast(`${parsed.length} programme link${parsed.length === 1 ? "" : "s"} added`);
    void refreshAll();
  }

  function normaliseRequirement(value) {
    const text = String(value || "").trim().toLowerCase();
    return text.startsWith("comp") || text === "required" || text === "mandatory" ? "Compulsory" : "Elective";
  }

  function normaliseDeliveryMode(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text.includes("distance") || text === "online") return "Distance learning";
    if (text.includes("hybrid") || text.includes("block") || text.includes("blended")) return "Hybrid / block";
    return "On campus";
  }

  function normalisePaperStructure(value, paperItem = {}) {
    const text = String(value || "").trim().toLowerCase();
    return text.includes("double") || text.includes("dual") || text.includes("cross") || paperItem.secondaryCode
      ? "Double-coded"
      : "Single code";
  }

  function isDoubleCodedPaper(paperItem) {
    return normalisePaperStructure(paperItem?.structure, paperItem) === "Double-coded";
  }

  function normaliseNzqfLevel(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const level = Number(text);
    return Number.isFinite(level) && level > 0 ? level : "";
  }

  function normalisePaperPoints(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const points = Number(text);
    return Number.isFinite(points) && points > 0 ? points : "";
  }

  function unique(values) {
    const seen = new Set();
    return values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normaliseLevelBands(value) {
    const source = Array.isArray(value) && value.length ? value : DEFAULT_LEVEL_BANDS;
    return source
      .map((band, index) => {
        const fallback = DEFAULT_LEVEL_BANDS[index] || DEFAULT_LEVEL_BANDS.at(-1);
        const min = Number.isFinite(Number(band.min)) ? Number(band.min) : Number(fallback.min);
        const max = Number.isFinite(Number(band.max)) ? Number(band.max) : Number(fallback.max);
        const defaultLevel = Number.isFinite(Number(band.defaultLevel)) ? Number(band.defaultLevel) : min;
        return {
          label: String(band.label || fallback.label || `${defaultLevel}-level`),
          description: String(band.description || fallback.description || ""),
          min,
          max: Math.max(min, max),
          defaultLevel
        };
      })
      .filter((band) => band.label.trim())
      .slice(0, 8);
  }

  function normaliseState(input = {}) {
    const data = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      meta: data.meta && typeof data.meta === "object" ? data.meta : {},
      wording: data.wording && typeof data.wording === "object" ? data.wording : {},
      plos: Array.isArray(data.plos) ? data.plos : [],
      papers: (Array.isArray(data.papers) ? data.papers : []).map((item, index) => ({
        id: String(item.id || `paper-${index}`),
        code: String(item.code || ""),
        title: String(item.title || ""),
        structure: normalisePaperStructure(item.structure, item),
        level: Number(item.level) || 0,
        secondaryCode: String(item.secondaryCode || item.alternateCode || ""),
        secondaryLevel: Number(item.secondaryLevel) || "",
        nzqfLevel: normaliseNzqfLevel(item.nzqfLevel),
        secondaryNzqfLevel: normaliseNzqfLevel(item.secondaryNzqfLevel),
        requirement: normaliseRequirement(item.requirement),
        deliveryMode: normaliseDeliveryMode(item.deliveryMode),
        points: normalisePaperPoints(item.points),
        teachingStaff: String(item.teachingStaff || ""),
        roles: Array.isArray(item.roles) ? item.roles : [],
        diagnosisNote: String(item.diagnosisNote || "")
      })),
      assessments: (Array.isArray(data.assessments) ? data.assessments : []).map((item, index) => ({
        id: String(item.id || `assessment-${index}`),
        paperId: String(item.paperId || ""),
        name: String(item.name || ""),
        week: Number(item.week) || 0,
        weight: Number(item.weight) || 0,
        mode: String(item.mode || ""),
        purpose: String(item.purpose || ""),
        side: String(item.side || "Whole paper"),
        evidence: item.evidence && typeof item.evidence === "object" && !Array.isArray(item.evidence) ? item.evidence : {},
        diagnosisNote: String(item.diagnosisNote || "")
      })),
      actions: Array.isArray(data.actions) ? data.actions : [],
      notes: data.notes && typeof data.notes === "object" && !Array.isArray(data.notes) ? data.notes : {},
      staffNotes: data.staffNotes && typeof data.staffNotes === "object" && !Array.isArray(data.staffNotes) ? data.staffNotes : {},
      connections: Array.isArray(data.connections) ? data.connections : []
    };
  }

  function getLevelBands(state) {
    return normaliseLevelBands(state.wording?.programme?.levelBands);
  }

  function bandLabelForLevel(level, state) {
    const value = Number(level) || 0;
    const band = getLevelBands(state).find((item) => value >= item.min && value <= item.max);
    return band?.label || (value ? `${value}-level` : "Otago level not set");
  }

  function paperCodeLabel(paperItem) {
    if (!isDoubleCodedPaper(paperItem)) return paperItem.code || "Untitled paper";
    return unique([paperItem.code || "Main code", paperItem.secondaryCode || "Second code"]).join(" / ");
  }

  function paperOtagoBands(paperItem, state) {
    const bands = [bandLabelForLevel(paperItem.level, state)];
    if (isDoubleCodedPaper(paperItem) && paperItem.secondaryLevel) bands.push(bandLabelForLevel(paperItem.secondaryLevel, state));
    return unique(bands);
  }

  function paperNzqfLevels(paperItem) {
    const levels = [];
    if (paperItem.nzqfLevel) levels.push(`NZQCF ${paperItem.nzqfLevel}`);
    if (isDoubleCodedPaper(paperItem) && paperItem.secondaryNzqfLevel) levels.push(`NZQCF ${paperItem.secondaryNzqfLevel}`);
    return unique(levels);
  }

  function staffNamesForPaper(paperItem) {
    const seen = new Set();
    return String(paperItem.teachingStaff || "")
      .split(/[\n,;]+/)
      .map((name) => name.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function programmeName(state, fallback = "Untitled programme") {
    return String(state.meta?.programme || state.meta?.workspaceTitle || fallback).trim() || fallback;
  }

  function workspaceTitle(state, fallback = "Untitled programme") {
    return String(state.meta?.workspaceTitle || programmeName(state, fallback)).trim() || fallback;
  }

  function evidenceCoverage(state) {
    const ploIds = state.plos.map((plo) => plo.id);
    const any = new Set();
    const direct = new Set();
    const itemsWithEvidence = new Set();
    state.assessments.forEach((item) => {
      Object.entries(item.evidence || {}).forEach(([ploId, value]) => {
        if (!value || !ploIds.includes(ploId)) return;
        any.add(ploId);
        itemsWithEvidence.add(item.id);
        if (value === "D") direct.add(ploId);
      });
    });
    return {
      ploCount: state.plos.length,
      anyPloCount: any.size,
      directPloCount: direct.size,
      itemsWithEvidence: itemsWithEvidence.size
    };
  }

  function countTextNotes(values) {
    return Object.values(values || {}).filter((value) => String(value || "").trim()).length;
  }

  function programmeStats(state, payload = {}) {
    const papers = state.papers;
    const doubleCoded = papers.filter(isDoubleCodedPaper);
    const twoLevel = papers.filter((paperItem) => paperOtagoBands(paperItem, state).length > 1);
    const compulsory = papers.filter((paperItem) => paperItem.requirement === "Compulsory");
    const distance = papers.filter((paperItem) => paperItem.deliveryMode === "Distance learning");
    const hybrid = papers.filter((paperItem) => paperItem.deliveryMode === "Hybrid / block");
    const staff = new Set(papers.flatMap(staffNamesForPaper));
    const evidence = evidenceCoverage(state);
    const diagnosisCount =
      countTextNotes(state.notes)
      + papers.filter((paperItem) => paperItem.diagnosisNote.trim()).length
      + state.assessments.filter((item) => item.diagnosisNote.trim()).length
      + countTextNotes(state.staffNotes);
    return {
      programme: programmeName(state, payload.title || payload.slug),
      workspaceTitle: workspaceTitle(state, payload.title || payload.slug),
      papers: papers.length,
      singleCodePapers: papers.length - doubleCoded.length,
      doubleCodedPapers: doubleCoded.length,
      oneLevelPapers: papers.length - twoLevel.length,
      twoLevelPapers: twoLevel.length,
      compulsoryPapers: compulsory.length,
      electivePapers: papers.length - compulsory.length,
      distancePapers: distance.length,
      hybridPapers: hybrid.length,
      points: papers.reduce((total, paperItem) => total + (Number(paperItem.points) || 0), 0),
      teachingStaff: staff.size,
      assessments: state.assessments.length,
      relationships: state.connections.length,
      actions: state.actions.length,
      diagnosisCount,
      ...evidence
    };
  }

  async function loadWorkspaceSource(source) {
    const { data, error } = await supabaseClient.rpc("load_curriculum_workspace", {
      workspace_slug: source.slug,
      access_token: source.token
    });
    if (error) throw error;
    const state = normaliseState(data.data || data);
    source.label = data.title || workspaceTitle(state, source.slug);
    source.lastLoadedAt = new Date().toISOString();
    source.updatedAt = data.updatedAt || "";
    source.access = data.canManageTemplate ? "admin" : data.canEdit ? "edit" : "view";
    return {
      source,
      ok: true,
      state,
      loadedAt: source.lastLoadedAt,
      updatedAt: source.updatedAt,
      access: source.access,
      stats: programmeStats(state, { title: data.title, slug: source.slug })
    };
  }

  async function refreshAll() {
    renderSourceList(true);
    if (!sources.length) {
      snapshots = [];
      setSourceStatus("No programme sources loaded");
      setRefreshStatus("Add programme links to begin");
      renderDashboard();
      return;
    }
    if (!(await configureCloud())) {
      renderDashboard();
      return;
    }

    setRefreshStatus("Refreshing programme workspaces...");
    const loaded = await Promise.all(sources.map(async (source) => {
      try {
        return await loadWorkspaceSource(source);
      } catch (error) {
        console.error("Unable to load workspace", source.slug, error);
        return {
          source,
          ok: false,
          error: error.message || "Unable to load workspace"
        };
      }
    }));
    snapshots = loaded;
    saveSources();
    renderDashboard();
    const okCount = snapshots.filter((item) => item.ok).length;
    const failedCount = snapshots.length - okCount;
    setSourceStatus(`${okCount} programme${okCount === 1 ? "" : "s"} loaded${failedCount ? `, ${failedCount} failed` : ""}`);
    setRefreshStatus(`Last refreshed ${formatDate(new Date().toISOString())}`);
  }

  function validSnapshots() {
    return snapshots.filter((item) => item.ok);
  }

  function aggregateMetrics() {
    const loaded = validSnapshots();
    const totals = {
      programmes: loaded.length,
      papers: 0,
      doubleCodedPapers: 0,
      twoLevelPapers: 0,
      compulsoryPapers: 0,
      distancePapers: 0,
      points: 0,
      assessments: 0,
      directPloCount: 0,
      ploCount: 0,
      diagnosisCount: 0,
      actions: 0
    };
    const staff = new Set();
    loaded.forEach((snapshot) => {
      Object.keys(totals).forEach((key) => {
        if (key !== "programmes") totals[key] += Number(snapshot.stats[key]) || 0;
      });
      snapshot.state.papers.flatMap(staffNamesForPaper).forEach((name) => staff.add(name.toLowerCase()));
    });
    totals.teachingStaff = staff.size;
    return totals;
  }

  function renderMetric(value, label, detail = "") {
    return `<div class="metric"><b>${escapeHtml(formatNumber(value))}</b><span>${escapeHtml(label)}</span>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
  }

  function renderDashboard() {
    renderSourceList();
    renderMetrics();
    renderProgrammeTable();
    renderDoubleCodedChart();
    renderLevelMixChart();
    renderNzqcfMixChart();
    renderAssessmentTable();
    renderStaffTable();
    renderDiagnosisTable();
  }

  function renderMetrics() {
    const totals = aggregateMetrics();
    byId("division-metrics").innerHTML = [
      renderMetric(totals.programmes, "Programmes loaded"),
      renderMetric(totals.papers, "Papers mapped"),
      renderMetric(totals.doubleCodedPapers, "Double-coded papers", `${formatPercent(totals.doubleCodedPapers, totals.papers)} of papers`),
      renderMetric(totals.twoLevelPapers, "Two-level papers", `${formatPercent(totals.twoLevelPapers, totals.papers)} of papers`),
      renderMetric(totals.compulsoryPapers, "Compulsory papers", `${formatPercent(totals.compulsoryPapers, totals.papers)} of papers`),
      renderMetric(totals.distancePapers, "Distance learning papers", `${formatPercent(totals.distancePapers, totals.papers)} of papers`),
      renderMetric(totals.teachingStaff, "Named teaching staff"),
      renderMetric(totals.assessments, "Assessment items"),
      renderMetric(totals.directPloCount, "PLOs with direct evidence", `${formatPercent(totals.directPloCount, totals.ploCount)} across loaded PLOs`),
      renderMetric(totals.diagnosisCount + totals.actions, "Diagnosis/action signals")
    ].join("");
  }

  function accessBadge(snapshot) {
    if (!snapshot?.ok) return `<span class="status-pill error">Error</span>`;
    if (snapshot.access === "admin") return `<span class="status-pill warn">Admin link</span>`;
    if (snapshot.access === "edit") return `<span class="status-pill warn">Edit link</span>`;
    return `<span class="status-pill ok">View link</span>`;
  }

  function renderSourceList(loading = false) {
    const list = byId("division-source-list");
    if (!sources.length) {
      list.innerHTML = `<div class="empty-state compact">No programme links added yet.</div>`;
      return;
    }
    const snapshotById = new Map(snapshots.map((item) => [item.source.id, item]));
    list.innerHTML = sources.map((source) => {
      const snapshot = snapshotById.get(source.id);
      const label = source.label || source.slug;
      const status = loading
        ? `<span class="status-pill">Loading</span>`
        : snapshot
          ? accessBadge(snapshot)
          : `<span class="status-pill">Saved</span>`;
      const error = snapshot && !snapshot.ok ? `<p class="source-error">${escapeHtml(snapshot.error)}</p>` : "";
      const tokenHint = source.access === "admin" || source.access === "edit"
        ? `<small class="source-warning">This source uses a ${escapeHtml(source.access)} token. Prefer a view link for leadership read-only use.</small>`
        : "";
      return `<article class="source-card">
        <div>
          <b>${escapeHtml(label)}</b>
          <span>${escapeHtml(source.slug)}</span>
          <small>Updated: ${escapeHtml(formatDate(source.updatedAt))} · Added: ${escapeHtml(formatDate(source.addedAt))}</small>
          ${tokenHint}
          ${error}
        </div>
        <div class="source-card-actions">
          ${status}
          <button class="button danger-text" data-remove-source="${escapeHtml(source.id)}">Remove</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderProgrammeTable() {
    const loaded = validSnapshots().slice().sort((a, b) => a.stats.programme.localeCompare(b.stats.programme));
    if (!loaded.length) {
      byId("division-programme-table").innerHTML = `<tbody><tr><td>No programme data loaded yet.</td></tr></tbody>`;
      return;
    }
    const rows = loaded.map(({ stats, updatedAt, access }) => `<tr>
      <td><b>${escapeHtml(stats.programme)}</b><br><small>${escapeHtml(stats.workspaceTitle)}</small></td>
      <td>${stats.papers}</td>
      <td>${stats.singleCodePapers}</td>
      <td><b>${stats.doubleCodedPapers}</b><br><small>${escapeHtml(formatPercent(stats.doubleCodedPapers, stats.papers))}</small></td>
      <td>${stats.oneLevelPapers}</td>
      <td>${stats.twoLevelPapers}</td>
      <td>${stats.compulsoryPapers}</td>
      <td>${stats.electivePapers}</td>
      <td>${stats.distancePapers}</td>
      <td>${stats.assessments}</td>
      <td>${stats.directPloCount}/${stats.ploCount}</td>
      <td>${stats.teachingStaff}</td>
      <td>${stats.diagnosisCount}</td>
      <td>${stats.actions}</td>
      <td>${escapeHtml(access)}</td>
      <td>${escapeHtml(formatDate(updatedAt))}</td>
    </tr>`).join("");
    byId("division-programme-table").innerHTML = `<thead><tr>
      <th>Programme</th><th>Papers</th><th>Single code</th><th>Double-coded</th><th>One-level</th><th>Two-level</th><th>Compulsory</th><th>Elective</th><th>Distance</th><th>Assessments</th><th>Direct PLO evidence</th><th>Staff</th><th>Diagnosis notes</th><th>Actions</th><th>Access used</th><th>Updated</th>
    </tr></thead><tbody>${rows}</tbody>`;
  }

  function maxOf(rows, key) {
    return Math.max(1, ...rows.map((item) => Number(item[key]) || 0));
  }

  function renderBarRows(rows, options) {
    if (!rows.length) return `<div class="empty-state compact">No data loaded yet.</div>`;
    const max = maxOf(rows, options.value);
    return `<div class="bar-list">${rows.map((row) => {
      const value = Number(row[options.value]) || 0;
      const width = Math.max(2, Math.round((value / max) * 100));
      return `<div class="bar-row">
        <div class="bar-row-label"><b>${escapeHtml(row[options.label])}</b><span>${escapeHtml(options.detail?.(row) || "")}</span></div>
        <div class="bar-track"><span style="width:${width}%"></span></div>
        <strong>${escapeHtml(formatNumber(value))}</strong>
      </div>`;
    }).join("")}</div>`;
  }

  function renderDoubleCodedChart() {
    const rows = validSnapshots()
      .map((snapshot) => ({
        programme: snapshot.stats.programme,
        doubleCoded: snapshot.stats.doubleCodedPapers,
        papers: snapshot.stats.papers
      }))
      .sort((a, b) => b.doubleCoded - a.doubleCoded || a.programme.localeCompare(b.programme));
    byId("double-coded-chart").innerHTML = renderBarRows(rows, {
      label: "programme",
      value: "doubleCoded",
      detail: (row) => `${formatPercent(row.doubleCoded, row.papers)} of ${row.papers} papers`
    });
  }

  function aggregateLevelRows(kind) {
    const counts = new Map();
    validSnapshots().forEach((snapshot) => {
      snapshot.state.papers.forEach((paperItem) => {
        const labels = kind === "nzqcf" ? paperNzqfLevels(paperItem) : paperOtagoBands(paperItem, snapshot.state);
        labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
      });
    });
    return [...counts.entries()]
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }));
  }

  function renderLevelMixChart() {
    byId("level-mix-chart").innerHTML = renderBarRows(aggregateLevelRows("otago"), {
      label: "level",
      value: "count",
      detail: () => "paper code side count"
    });
  }

  function renderNzqcfMixChart() {
    byId("nzqcf-mix-chart").innerHTML = renderBarRows(aggregateLevelRows("nzqcf"), {
      label: "level",
      value: "count",
      detail: () => "paper count where entered"
    });
  }

  function renderAssessmentTable() {
    const loaded = validSnapshots().slice().sort((a, b) => a.stats.programme.localeCompare(b.stats.programme));
    if (!loaded.length) {
      byId("division-assessment-table").innerHTML = `<tbody><tr><td>No assessment data loaded yet.</td></tr></tbody>`;
      return;
    }
    const rows = loaded.map(({ stats }) => `<tr>
      <td><b>${escapeHtml(stats.programme)}</b></td>
      <td>${stats.ploCount}</td>
      <td>${stats.anyPloCount}</td>
      <td>${stats.directPloCount}</td>
      <td>${stats.itemsWithEvidence}</td>
      <td>${stats.assessments}</td>
      <td>${escapeHtml(formatPercent(stats.directPloCount, stats.ploCount))}</td>
    </tr>`).join("");
    byId("division-assessment-table").innerHTML = `<thead><tr><th>Programme</th><th>PLOs</th><th>PLOs with any evidence</th><th>PLOs with direct evidence</th><th>Assessment items with evidence</th><th>Total items</th><th>Direct coverage</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function staffRows() {
    const rows = new Map();
    validSnapshots().forEach((snapshot) => {
      snapshot.state.papers.forEach((paperItem) => {
        staffNamesForPaper(paperItem).forEach((name) => {
          const key = name.toLowerCase();
          if (!rows.has(key)) {
            rows.set(key, {
              name,
              programmes: new Set(),
              papers: [],
              points: 0,
              otagoBands: new Set(),
              nzqfLevels: new Set(),
              requirements: new Set(),
              deliveryModes: new Set(),
              doubleCodedPapers: 0
            });
          }
          const row = rows.get(key);
          row.programmes.add(snapshot.stats.programme);
          row.papers.push(`${snapshot.stats.programme}: ${paperCodeLabel(paperItem)} ${paperItem.title}`);
          row.points += Number(paperItem.points) || 0;
          paperOtagoBands(paperItem, snapshot.state).forEach((level) => row.otagoBands.add(level));
          paperNzqfLevels(paperItem).forEach((level) => row.nzqfLevels.add(level));
          row.requirements.add(paperItem.requirement);
          row.deliveryModes.add(paperItem.deliveryMode);
          if (isDoubleCodedPaper(paperItem)) row.doubleCodedPapers += 1;
        });
      });
    });
    return [...rows.values()].sort((a, b) =>
      b.papers.length - a.papers.length
      || b.points - a.points
      || a.name.localeCompare(b.name)
    );
  }

  function renderStaffTable() {
    const rows = staffRows();
    if (!rows.length) {
      byId("division-staff-table").innerHTML = `<tbody><tr><td>No teaching staff data loaded yet.</td></tr></tbody>`;
      return;
    }
    const html = rows.map((row) => `<tr>
      <td><b>${escapeHtml(row.name)}</b></td>
      <td>${row.programmes.size}<br><small>${escapeHtml([...row.programmes].sort().join("; "))}</small></td>
      <td>${row.papers.length}</td>
      <td>${formatNumber(row.points)}</td>
      <td>${row.doubleCodedPapers}</td>
      <td>${escapeHtml([...row.otagoBands].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join("; ") || "Not set")}</td>
      <td>${escapeHtml([...row.nzqfLevels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join("; ") || "Not set")}</td>
      <td>${escapeHtml([...row.deliveryModes].sort().join("; "))}</td>
      <td>${escapeHtml(row.papers.slice(0, 8).join("; "))}${row.papers.length > 8 ? `; +${row.papers.length - 8} more` : ""}</td>
    </tr>`).join("");
    byId("division-staff-table").innerHTML = `<thead><tr><th>Staff</th><th>Programmes</th><th>Papers</th><th>Attached points</th><th>Double-coded papers</th><th>Otago code bands</th><th>NZQCF levels</th><th>Delivery modes</th><th>Paper list</th></tr></thead><tbody>${html}</tbody>`;
  }

  function diagnosisRows() {
    const rows = [];
    validSnapshots().forEach((snapshot) => {
      const { state, stats } = snapshot;
      Object.entries(state.notes || {}).forEach(([paperId, note]) => {
        if (!String(note || "").trim()) return;
        const paperItem = state.papers.find((item) => item.id === paperId);
        rows.push({
          programme: stats.programme,
          source: "Program mapping note",
          item: paperItem ? `${paperCodeLabel(paperItem)} ${paperItem.title}` : "Programme",
          note,
          status: ""
        });
      });
      state.papers.forEach((paperItem) => {
        if (!paperItem.diagnosisNote.trim()) return;
        rows.push({
          programme: stats.programme,
          source: "Paper diagnosis note",
          item: `${paperCodeLabel(paperItem)} ${paperItem.title}`,
          note: paperItem.diagnosisNote,
          status: ""
        });
      });
      state.assessments.forEach((item) => {
        if (!item.diagnosisNote.trim()) return;
        const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
        rows.push({
          programme: stats.programme,
          source: "Assessment diagnosis note",
          item: `${paperItem ? paperCodeLabel(paperItem) : "Unassigned"} ${item.name}`,
          note: item.diagnosisNote,
          status: ""
        });
      });
      Object.entries(state.staffNotes || {}).forEach(([staffName, note]) => {
        if (!String(note || "").trim()) return;
        rows.push({
          programme: stats.programme,
          source: "Staff note",
          item: staffName,
          note,
          status: ""
        });
      });
      state.actions.forEach((action) => {
        const title = String(action.title || action.decision || action.notes || "").trim();
        if (!title) return;
        rows.push({
          programme: stats.programme,
          source: "Action",
          item: String(action.owner || "Owner not set"),
          note: [action.title, action.decision, action.notes].filter(Boolean).join(" | "),
          status: String(action.status || "To do")
        });
      });
    });
    return rows.sort((a, b) => a.programme.localeCompare(b.programme) || a.source.localeCompare(b.source));
  }

  function renderDiagnosisTable() {
    const rows = diagnosisRows();
    if (!rows.length) {
      byId("division-diagnosis-table").innerHTML = `<tbody><tr><td>No diagnosis notes or actions loaded yet.</td></tr></tbody>`;
      return;
    }
    const html = rows.slice(0, 300).map((row) => `<tr>
      <td>${escapeHtml(row.programme)}</td>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.item)}</td>
      <td>${escapeHtml(row.note)}</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>`).join("");
    byId("division-diagnosis-table").innerHTML = `<thead><tr><th>Programme</th><th>Source</th><th>Item</th><th>Note / action</th><th>Status</th></tr></thead><tbody>${html}</tbody>`;
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCsv(filename, rows) {
    if (!rows.length) return toast("No data to export");
    const columns = Object.keys(rows[0]);
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportProgrammeCsv() {
    const rows = validSnapshots().map(({ stats, updatedAt, access }) => ({
      programme: stats.programme,
      papers: stats.papers,
      single_code_papers: stats.singleCodePapers,
      double_coded_papers: stats.doubleCodedPapers,
      one_level_papers: stats.oneLevelPapers,
      two_level_papers: stats.twoLevelPapers,
      compulsory_papers: stats.compulsoryPapers,
      elective_papers: stats.electivePapers,
      distance_learning_papers: stats.distancePapers,
      hybrid_papers: stats.hybridPapers,
      points: stats.points,
      named_teaching_staff: stats.teachingStaff,
      assessment_items: stats.assessments,
      plos: stats.ploCount,
      plos_with_any_evidence: stats.anyPloCount,
      plos_with_direct_evidence: stats.directPloCount,
      diagnosis_notes: stats.diagnosisCount,
      actions: stats.actions,
      access_used: access,
      updated_at: updatedAt
    }));
    downloadCsv("division-programme-summary.csv", rows);
  }

  function exportStaffCsv() {
    const rows = staffRows().map((row) => ({
      staff: row.name,
      programmes_count: row.programmes.size,
      programmes: [...row.programmes].sort().join("; "),
      papers_count: row.papers.length,
      attached_points: row.points,
      double_coded_papers: row.doubleCodedPapers,
      otago_code_bands: [...row.otagoBands].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join("; "),
      nzqcf_levels: [...row.nzqfLevels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join("; "),
      delivery_modes: [...row.deliveryModes].sort().join("; "),
      papers: row.papers.join("; ")
    }));
    downloadCsv("division-staff-summary.csv", rows);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#add-division-link-button")) return addSourcesFromText();
    if (event.target.closest("#refresh-division-button")) return void refreshAll();
    if (event.target.closest("#export-division-csv-button")) return exportProgrammeCsv();
    if (event.target.closest("#export-staff-csv-button")) return exportStaffCsv();
    if (event.target.closest("#clear-division-sources-button")) {
      if (!sources.length) return;
      if (!confirm("Clear all programme sources from this browser?")) return;
      sources = [];
      snapshots = [];
      saveSources();
      renderDashboard();
      setSourceStatus("No programme sources loaded");
      setRefreshStatus("Sources cleared");
      return;
    }
    const removeButton = event.target.closest("[data-remove-source]");
    if (removeButton) {
      sources = sources.filter((source) => source.id !== removeButton.dataset.removeSource);
      snapshots = snapshots.filter((snapshot) => snapshot.source.id !== removeButton.dataset.removeSource);
      saveSources();
      renderDashboard();
      setSourceStatus(`${validSnapshots().length} programme${validSnapshots().length === 1 ? "" : "s"} loaded`);
    }
  });

  byId("division-link-input").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addSourcesFromText();
  });

  renderDashboard();
  if (sources.length) {
    setSourceStatus(`${sources.length} programme source${sources.length === 1 ? "" : "s"} saved in this browser`);
    void refreshAll();
  } else {
    setSourceStatus("No programme sources loaded");
    setRefreshStatus("Add programme links to begin");
  }
})();
