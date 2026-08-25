(() => {
  "use strict";

  const STORAGE_KEY = "curriculum-mapping-workspace-v1";
  const HISTORY_KEY = "curriculum-mapping-workspace-history-v1";
  const SESSION_NAME_KEY = "curriculum-mapping-session-name-v1";
  const CLIENT_ID_KEY = "curriculum-mapping-client-id-v1";
  const TEACHING_WEEKS = 12;
  const NZQCF_LEVEL_OPTIONS = [5, 6, 7, 8, 9, 10];
  const PAPER_REQUIREMENTS = ["Elective", "Compulsory"];
  const PAPER_STRUCTURES = ["Single code", "Double-coded"];
  const DELIVERY_MODES = ["On campus", "Distance learning", "Hybrid / block"];
  const ASSESSMENT_SIDES = ["Whole paper", "First code side", "Second code side"];
  const CONFIG = window.CURRICULUM_MAPPING_CONFIG || {};
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const cloud = {
    client: null,
    workspace: URL_PARAMS.get("workspace") || "",
    token: URL_PARAMS.get("token") || "",
    adminToken: "",
    editToken: "",
    viewToken: "",
    enabled: false,
    canEdit: true,
    canManageTemplate: true,
    loaded: false,
    pendingLocalChanges: false,
    applyingRemote: false,
    lastUpdatedAt: "",
    saveTimer: null,
    pollTimer: null,
    activeSavePromise: null
  };
  const ROLE_OPTIONS = [
    "Gateway / attracts students",
    "Core disciplinary spine",
    "Entry to a pathway",
    "Methods / skills",
    "Service / shared provision",
    "Advanced synthesis / capstone"
  ];
  const CONNECTION_TYPES = ["required", "recommended", "related"];
  const CONNECTION_TYPE_ORDER = { required: 0, recommended: 1, related: 2 };
  const DEFAULT_WORDING = {
    tabs: {
      programme: "1. Program",
      assessment: "2. Assessments",
      paper: "3. Papers",
      staff: "4. Staff",
      actions: "5. Actions"
    },
    programme: {
      title: "Programme Whole Picture",
      help: "Clarify programme outcomes, map direct paper alignment, then explore pathways and progression.",
      ploTitle: "Programme Learning Outcomes",
      ploHelp: "Click a PLO to edit it. Dragging is not needed here; the order sets the table order.",
      alignmentTitle: "Alignment Mapping Exercise",
      alignmentHelp: "Click each PLO cell to cycle through blank → Introduced → Developed → Mastered.",
      pathwaysTitle: "Student Pathways & Programme Network",
      pathwaysHelp: "Drag papers freely across levels to make possible journeys visible. Use lines to show required, recommended, or related movement between papers.",
      addPlo: "Add PLO",
      addPaper: "Add paper",
      levelBands: [
        { label: "100-level", description: "Entry and introduction", min: 0, max: 199, defaultLevel: 100 },
        { label: "200-level", description: "Development and choice", min: 200, max: 299, defaultLevel: 200 },
        { label: "300-level", description: "Advanced work and synthesis", min: 300, max: 999, defaultLevel: 300 }
      ]
    },
    alignment: {
      introduced: "Introduced",
      developed: "Developed",
      mastered: "Mastered"
    },
    network: {
      move: "Move papers",
      required: "Required before",
      recommended: "Recommended progression",
      related: "Related",
      clearLines: "Remove line",
      remove: "Remove line",
      moveStatus: "Drag papers freely. Patterns and journeys emerge from where the team places papers.",
      requiredStatus: "Select the earlier paper, then the paper that must follow.",
      recommendedStatus: "Select the earlier paper, then the recommended next paper.",
      relatedStatus: "Select two related or mutually supporting papers.",
      removeStatus: "Select the two papers whose relationship line should be removed.",
      selectedSuffix: "selected. Choose the second paper.",
      requiredKey: "Required before / must precede",
      recommendedKey: "Recommended progression",
      relatedKey: "Related or mutually supporting",
      hint: "Right-click a paper to open its details or a line to remove it."
    },
    assessment: {
      title: "Assessment Mapping",
      help: "Review programme-level assessment evidence, assessment roles, student progress, workload, and AI-readiness across the programme.",
      evidenceTitle: "PLO × Assessment Evidence",
      evidenceHelp: "Click a cell to cycle through blank → Partial evidence → Direct evidence.",
      itemsTitle: "Assessment Items",
      itemsHelp: "Assessment details can be entered here or from the relevant paper page. The assessed PLOs are carried through from the evidence table.",
      summaryTitle: "PLO Evidence Summary By Level",
      summaryHelp: "Use this to see where each programme learning outcome is directly or partially assessed across the programme levels.",
      programmeEvidenceTitle: "Programme Evidence of Learning",
      programmeEvidenceHelp: "Shows what evidence each paper contributes to a programme-level picture of student progress and capability development.",
      workloadTitle: "Student Workload",
      workloadHelp: "Assessment items are placed by due week. Higher-weight items are shown more strongly.",
      addAssessment: "Add assessment item"
    },
    paper: {
      title: "Paper Details",
      help: "Review each paper's programme contribution, course learning outcomes, learning activities, assessment, and internal alignment.",
      addPaper: "Add paper",
      findPaper: "Find a paper"
    },
    staff: {
      title: "Staff",
      help: "Summarise who teaches which papers, how many paper points are attached, and where expertise patterns may need discussion.",
      summaryTitle: "Staff Summary",
      summaryHelp: "This is a planning view derived from paper information. It is not an official FTE calculation."
    },
    actions: {
      title: "Decisions & Actions",
      help: "Bring diagnosis notes from the programme, paper, and assessment pages into decisions and accountable actions.",
      diagnosisTitle: "Diagnosis Notes From Mapping",
      diagnosisHelp: "These are carried through from programme notes, paper diagnosis notes, and assessment diagnosis notes.",
      addAction: "Add action"
    }
  };

  const HELP_TEXT = {
    programmeSettings: "Set the programme name, version, workshop date, participants, and the workspace title used in links and PDFs.",
    templateWording: "Admin-only. Customise headings and terminology for this programme workspace before or during use.",
    createPrivateLink: "Create a cloud workspace for one programme. After it is created, use edit/view links for the team and keep the admin link for yourself.",
    copyAdminLink: "Keep this link private. It can edit template wording and manage share links for this workspace.",
    copyEditLink: "Share this with people who should add or change mapping content during the workshop.",
    copyViewLink: "Share this with reviewers who should read the workspace and add comments without changing the mapping.",
    sessionName: "Enter your name so comments, edit-presence warnings, and the admin log can show who contributed.",
    comments: "Use comments for review feedback that should not directly change the team's mapping.",
    adminLog: "Admin-only record of recent edits, comments, and key changes. It helps trace who changed what and when.",
    saveVersion: "Save a restorable version inside this workspace. It is not a downloaded file; use Export JSON for a portable backup.",
    versions: "Open saved versions and restore an earlier point if the team needs to go back.",
    newWorkspace: "Start a separate workspace for another programme. This creates a new programme URL when you are already in cloud mode.",
    importJson: "Import a JSON backup into the current dashboard. Use carefully because it replaces the current workspace content.",
    exportJson: "Download a complete JSON backup for archiving, migration, or recovering the workspace later.",
    printPdf: "Prepare a printable report. In the browser print dialog, choose landscape and Save as PDF when needed.",
    addPlo: "Add a new programme learning outcome. The PLO order here also controls the order used in mapping tables.",
    addPaper: "Add a new paper/course to the programme map. You can complete details later in the Papers tab.",
    plos: "Click any PLO card to edit its code, title, or description.",
    alignment: "Click each cell to cycle through blank, I, D, and M. Use this to discuss how each paper supports each PLO.",
    network: "Drag paper cards to shape possible student journeys. Choose a relationship mode, then click two papers to draw or remove a line.",
    networkModes: "Move = drag cards. Required/Recommended/Related = click the earlier paper, then the next paper. Remove line = click the two connected papers.",
    boardGrouping: "Switch whether the board groups papers by Otago paper code level or by NZQCF level.",
    assessmentEvidence: "Click cells to map assessment evidence to PLOs: P means partial evidence, D means direct evidence.",
    assessmentItems: "Enter assessment item, week, weight, mode, role, AI-ready note, and diagnosis note. These rows are shared with Paper Details.",
    assessmentSummary: "Use this to check whether each PLO has assessment evidence across the programme levels.",
    programmeEvidence: "Shows which assessment items can contribute to a programme-level picture of student progress.",
    studentWorkload: "Shows assessment timing across 12 teaching weeks. Heavier weighted items appear more strongly.",
    paperDetails: "Use this page to complete one paper profile and check its internal alignment from PLO to CLO, activities, and assessment.",
    paperRoles: "Select one or more roles for the paper, such as core spine, gateway, service paper, methods, or capstone.",
    paperPloLinks: "This shows which PLOs the paper supports based on the Program alignment table.",
    paperNetwork: "These relationships come from the Program network board. You can adjust type, direction, or related paper here.",
    doubleCodedPaper: "Use this when one teaching paper carries two paper codes, levels, or enrolment identities. The board shows it as one wider split card, while the paper profile can separate the second-side CLOs, activities, and assessment notes.",
    paperDescription: "Use this for the official or locally agreed paper description.",
    clos: "Enter one Course Learning Outcome per line. The app labels them CLO1, CLO2, and so on.",
    learningActivities: "Enter one activity per line. The app labels them LA1, LA2, and so on for internal alignment.",
    paperAssessment: "These assessment rows are shared with the Assessment tab. Editing here updates the programme assessment map.",
    internalAlignment: "Map how this paper connects PLOs to CLOs, then to learning activities and assessment evidence.",
    diagnosisNote: "Use diagnosis notes for issues, decisions, or questions that should carry through to the Actions page.",
    staffSummary: "Staff cards are generated from Teaching staff entered in Papers and sorted by the number of papers attached.",
    staffProfile: "Use staff profile fields to capture research interests, teaching strengths, assessment experience, and student cohorts.",
    actions: "Diagnosis notes from Program, Papers, Staff, and Assessments collect here so the team can turn them into decisions and actions."
  };

  const sampleData = {
    meta: {
      programme: "Example Humanities Programme",
      workspaceTitle: "Example Humanities Programme Curriculum Mapping Workspace",
      department: "Te Kete Aronui",
      version: "Version 1",
      workshopDate: "2026-06-23",
      participants: "",
      levelGroupingMode: "paperCode"
    },
    plos: [
      { id: "plo1", code: "PLO1", title: "Disciplinary Knowledge", description: "Explain key concepts, debates, and knowledge traditions in the field." },
      { id: "plo2", code: "PLO2", title: "Critical Inquiry", description: "Analyse texts, evidence, contexts, and competing interpretations." },
      { id: "plo3", code: "PLO3", title: "Research", description: "Develop and communicate an independent inquiry using appropriate methods." },
      { id: "plo4", code: "PLO4", title: "Communication", description: "Communicate effectively with disciplinary, public, and professional audiences." },
      { id: "plo5", code: "PLO5", title: "Ethical and Cultural Understanding", description: "Engage thoughtfully with ethical, cultural, and social complexity." }
    ],
    papers: [
      paper("p101", "HUMS101", "Ways of Reading Culture", 100, 70, 100, ["Gateway / attracts students", "Entry to a pathway"]),
      paper("p108", "HUMS108", "Foundations for the Major", 100, 150, 300, ["Core disciplinary spine"]),
      paper("p102", "HUMS102", "Stories, Society, and Power", 100, 60, 500, ["Service / shared provision"]),
      paper("p201", "HUMS201", "Debates in the Discipline", 200, 540, 95, ["Core disciplinary spine", "Entry to a pathway"]),
      paper("p215", "HUMS215", "Methods and Evidence", 200, 600, 285, ["Methods / skills"]),
      paper("p230", "HUMS230", "Humanities in the World", 200, 530, 490, ["Service / shared provision"]),
      paper("p301", "HUMS301", "Advanced Topics Seminar", 300, 1010, 105, ["Core disciplinary spine"]),
      paper("p399", "HUMS399", "Humanities Futures", 300, 1070, 305, ["Advanced synthesis / capstone"]),
      paper("p315", "HUMS315", "Research Project", 300, 980, 500, ["Methods / skills", "Advanced synthesis / capstone"])
    ],
    alignments: {
      p101: { plo1: "I", plo2: "I", plo3: "", plo4: "I", plo5: "" },
      p108: { plo1: "I", plo2: "I", plo3: "", plo4: "I", plo5: "I" },
      p102: { plo1: "I", plo2: "I", plo3: "", plo4: "I", plo5: "I" },
      p201: { plo1: "D", plo2: "D", plo3: "I", plo4: "D", plo5: "D" },
      p215: { plo1: "", plo2: "D", plo3: "D", plo4: "D", plo5: "" },
      p230: { plo1: "D", plo2: "D", plo3: "", plo4: "D", plo5: "D" },
      p301: { plo1: "M", plo2: "M", plo3: "D", plo4: "M", plo5: "D" },
      p399: { plo1: "M", plo2: "M", plo3: "M", plo4: "M", plo5: "M" },
      p315: { plo1: "D", plo2: "M", plo3: "M", plo4: "M", plo5: "D" }
    },
    notes: {
      p101: "Is PLO4 taught, assessed, or both?",
      p215: "Clarify the evidence for PLO3.",
      p399: "Confirm which PLOs are demonstrated in assessment."
    },
    pathways: [],
    connections: [
      { id: "c1", from: "p101", to: "p201", type: "recommended" },
      { id: "c2", from: "p201", to: "p301", type: "recommended" },
      { id: "c3", from: "p108", to: "p215", type: "required" },
      { id: "c4", from: "p215", to: "p399", type: "recommended" },
      { id: "c5", from: "p230", to: "p315", type: "related" }
    ],
    assessments: [
      assessment("a1", "p101", "Interpretive essay", 7, 35, "Individual written", "AI-resilient", { plo1: "D", plo2: "D", plo4: "P" }, "Check whether communication is practised before this assessment.", "Early evidence + formative feedback"),
      assessment("a2", "p201", "Comparative analysis", 9, 40, "Essay or presentation", "AI allowed with acknowledgement", { plo1: "P", plo2: "D", plo4: "D", plo5: "P" }, "", "Summative judgement point"),
      assessment("a3", "p215", "Research proposal", 9, 30, "Individual proposal", "AI-ready", { plo2: "P", plo3: "D", plo4: "P" }, "", "Research readiness evidence"),
      assessment("a4", "p399", "Public-facing capstone", 12, 50, "Project and reflection", "AI-integrated design", { plo1: "P", plo2: "D", plo3: "D", plo4: "D", plo5: "D" }, "Confirm capstone evidence expectations across the teaching team.", "Capstone / programme-level evidence")
    ],
    actions: [
      { id: "act1", title: "Clarify HUMS101 communication evidence", owner: "Paper coordinator", due: "2026-08-01", status: "To do", notes: "Review CLO and essay rubric." },
      { id: "act2", title: "Review research preparation before HUMS215", owner: "Programme team", due: "2026-09-01", status: "In progress", notes: "Check 100-level activities." },
      { id: "act3", title: "Confirm capstone PLO evidence", decision: "Use the capstone project and reflection as direct PLO evidence.", owner: "HUMS399 team", due: "2026-07-15", status: "Completed", notes: "Mapped to project and reflection." }
    ],
    staffNotes: {},
    staffProfiles: {},
    wording: clone(DEFAULT_WORDING)
  };

  function paper(id, code, title, level, x, y, roles) {
    return {
      id, code, title, level, x, y, roles,
      structure: "Single code",
      secondaryCode: "",
      secondaryLevel: "",
      secondaryNzqfLevel: "",
      requirement: "Elective",
      deliveryMode: "On campus",
      nzqfLevel: "",
      points: "",
      teachingStaff: "",
      status: "Draft",
      description: "",
      concepts: "Key concepts and knowledge domains.",
      learningOutcomes: "Explain selected concepts.\nAnalyse relevant texts or evidence.\nCommunicate a supported claim.",
      learningActivities: "Lectures and guided workshops.\nPractice activities with feedback.\nPeer discussion.",
      secondaryLearningOutcomes: "",
      secondaryLearningActivities: "",
      secondaryAssessmentNotes: "",
      ploLinks: {},
      activityLinks: {},
      secondaryPloLinks: {},
      secondaryActivityLinks: {},
      diagnosisNote: "",
      agreedAction: ""
    };
  }

  function assessment(id, paperId, name, week, weight, mode, aiContext, evidence, diagnosisNote = "", purpose = "", side = "Whole paper") {
    return { id, paperId, name, week, weight, mode, aiContext, purpose, evidence, diagnosisNote, side };
  }

  let state = loadState();
  let selectedPaperId = state.papers[0]?.id || null;
  let canvasMode = "move";
  let connectionSource = null;
  let dialogContext = null;
  let saveTimer = null;
  const deferredRender = new Set();
  const connectionTombstones = new Set();
  let pendingConnectionChange = false;
  let connectionChangeVersion = 0;
  let sessionName = "";
  let clientId = "";
  let reviewComments = [];
  let activityLog = [];
  let presenceRecords = [];
  let presenceTimer = null;
  let focusedEdit = null;
  let activePresenceField = "";
  let reviewBackendAvailable = true;
  let activeHelpButton = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = (id) => document.getElementById(id);
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function localStorageGet(key, fallback = "") {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function localStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("Unable to write local preference", error);
    }
  }

  function workspaceScopedKey(baseKey) {
    return `${baseKey}:${cloud.workspace || "local"}`;
  }

  function getClientId() {
    const existing = localStorageGet(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = uid("client");
    localStorageSet(CLIENT_ID_KEY, next);
    return next;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeObject(base, value) {
    return { ...base, ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}) };
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

  function isDistanceLearningPaper(paperItem) {
    return normaliseDeliveryMode(paperItem.deliveryMode) === "Distance learning";
  }

  function normalisePaperStructure(value) {
    const text = String(value || "").trim().toLowerCase();
    return text.includes("double") || text.includes("dual") || text.includes("cross") ? "Double-coded" : "Single code";
  }

  function isDoubleCodedPaper(paperItem) {
    return normalisePaperStructure(paperItem?.structure) === "Double-coded";
  }

  function normaliseAssessmentSide(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text.includes("second") || text.includes("secondary") || text.includes("right") || text === "2") return "Second code side";
    if (text.includes("first") || text.includes("primary") || text.includes("left") || text === "1") return "First code side";
    return "Whole paper";
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

  function normaliseStaffProfile(value = {}) {
    const profile = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      researchInterests: String(profile.researchInterests || ""),
      teachingApproaches: String(profile.teachingApproaches || ""),
      assessmentExperience: String(profile.assessmentExperience || ""),
      studentCohorts: String(profile.studentCohorts || "")
    };
  }

  function normaliseStaffProfiles(value = {}) {
    const profiles = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, normaliseStaffProfile(profile)]));
  }

  function levelGroupingMode() {
    return state.meta?.levelGroupingMode === "nzqf" ? "nzqf" : "paperCode";
  }

  function isNzqfGrouping() {
    return levelGroupingMode() === "nzqf";
  }

  function normaliseLevelBands(value) {
    const source = Array.isArray(value) && value.length ? value : DEFAULT_WORDING.programme.levelBands;
    return source
      .map((band, index) => {
        const fallback = DEFAULT_WORDING.programme.levelBands[index] || DEFAULT_WORDING.programme.levelBands.at(-1);
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
      .slice(0, 6);
  }

  function normaliseConnections(value, validPaperIds = null) {
    const latestByDirection = new Map();
    (Array.isArray(value) ? value : []).forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const from = String(item.from || "");
      const to = String(item.to || "");
      if (!from || !to || from === to) return;
      if (validPaperIds && (!validPaperIds.has(from) || !validPaperIds.has(to))) return;
      const type = CONNECTION_TYPES.includes(item.type) ? item.type : "recommended";
      latestByDirection.set(`${from}->${to}`, {
        id: String(item.id || `connection-${index}-${from}-${to}`).replace(/[^a-z0-9_-]+/gi, "-"),
        from,
        to,
        type,
        createdAt: item.createdAt || ""
      });
    });
    return [...latestByDirection.values()];
  }

  function dedupeConnections() {
    const validPaperIds = new Set(state.papers.map((paperItem) => paperItem.id));
    state.connections = normaliseConnections(state.connections, validPaperIds);
  }

  function connectionDirectionKey(from, to) {
    return `${from}->${to}`;
  }

  function connectionPairKey(from, to) {
    return [from, to].sort().join("<->");
  }

  function markConnectionChanged() {
    pendingConnectionChange = true;
    connectionChangeVersion += 1;
  }

  function markConnectionDeleted(from, to, scope = "direction") {
    pendingConnectionChange = true;
    connectionChangeVersion += 1;
    const key = scope === "both"
      ? `both:${connectionPairKey(from, to)}`
      : `direction:${connectionDirectionKey(from, to)}`;
    connectionTombstones.add(key);
  }

  function isConnectionTombstoned(connection) {
    return connectionTombstones.has(`both:${connectionPairKey(connection.from, connection.to)}`)
      || connectionTombstones.has(`direction:${connectionDirectionKey(connection.from, connection.to)}`);
  }

  function mergeConnectionsFromCloudData(remoteData) {
    if (!remoteData || !Array.isArray(remoteData.connections)) return;
    const validPaperIds = new Set(state.papers.map((paperItem) => paperItem.id));
    const remoteConnections = normaliseConnections(remoteData.connections, validPaperIds);

    if (!pendingConnectionChange) {
      state.connections = remoteConnections;
      return;
    }

    const merged = new Map();
    remoteConnections
      .filter((connection) => !isConnectionTombstoned(connection))
      .forEach((connection) => merged.set(connectionDirectionKey(connection.from, connection.to), connection));
    normaliseConnections(state.connections, validPaperIds)
      .forEach((connection) => merged.set(connectionDirectionKey(connection.from, connection.to), connection));
    state.connections = [...merged.values()];
  }

  function upsertConnection(from, to, type) {
    if (!from || !to || from === to) return false;
    state.connections = state.connections.filter((item) => !(item.from === from && item.to === to));
    state.connections.push({
      id: uid("connection"),
      from,
      to,
      type: CONNECTION_TYPES.includes(type) ? type : "recommended",
      createdAt: new Date().toISOString()
    });
    dedupeConnections();
    markConnectionChanged();
    return true;
  }

  function normaliseWording(value = {}) {
    value = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const base = clone(DEFAULT_WORDING);
    const wording = mergeObject(base, value);
    wording.tabs = mergeObject(base.tabs, value.tabs);
    if (/staff/i.test(wording.tabs.staff || "") && /workload/i.test(wording.tabs.staff || "")) {
      wording.tabs.staff = base.tabs.staff;
    }
    if (!value.tabs?.staff && wording.tabs.actions === "4. Actions") wording.tabs.actions = base.tabs.actions;
    wording.programme = mergeObject(base.programme, value.programme);
    wording.programme.levelBands = normaliseLevelBands(value.programme?.levelBands);
    wording.alignment = mergeObject(base.alignment, value.alignment);
    wording.network = mergeObject(base.network, value.network);
    wording.assessment = mergeObject(base.assessment, value.assessment);
    wording.paper = mergeObject(base.paper, value.paper);
    wording.staff = mergeObject(base.staff, value.staff);
    if (/teaching staff\s*&\s*workload/i.test(wording.staff.title || "")) wording.staff.title = base.staff.title;
    if (/staff workload summary/i.test(wording.staff.summaryTitle || "")) wording.staff.summaryTitle = base.staff.summaryTitle;
    if (/workload patterns/i.test(wording.staff.help || "")) wording.staff.help = base.staff.help;
    if (/official FTE workload calculation/i.test(wording.staff.summaryHelp || "")) wording.staff.summaryHelp = base.staff.summaryHelp;
    wording.actions = mergeObject(base.actions, value.actions);
    return wording;
  }

  function getWording() {
    state.wording = normaliseWording(state.wording);
    return state.wording;
  }

  function connectionTypeLabel(type) {
    const labels = getWording().network;
    if (type === "required") return labels.required;
    if (type === "related") return labels.related;
    return labels.recommended;
  }

  function getLevelBands() {
    return getWording().programme.levelBands;
  }

  function getNzqfBands() {
    const levels = [...new Set(state.papers
      .flatMap((paperItem) => [
        normaliseNzqfLevel(paperItem.nzqfLevel),
        isDoubleCodedPaper(paperItem) ? normaliseNzqfLevel(paperItem.secondaryNzqfLevel) : ""
      ])
      .filter(Boolean))]
      .sort((a, b) => a - b);
    const hasUnassigned = state.papers.some((paperItem) =>
      !normaliseNzqfLevel(paperItem.nzqfLevel)
      || (isDoubleCodedPaper(paperItem) && !normaliseNzqfLevel(paperItem.secondaryNzqfLevel))
    );
    const source = levels.length ? levels : [7, 8, 9];
    const bands = source.map((level) => ({
      label: `NZQCF Level ${level}`,
      description: "Qualification level",
      min: level,
      max: level,
      defaultLevel: level
    }));
    return hasUnassigned
      ? [{ label: "NZQCF not set", description: "Confirm in Papers tab", min: 0, max: 0, defaultLevel: 0 }, ...bands]
      : bands;
  }

  function getCanvasBands() {
    return isNzqfGrouping() ? getNzqfBands() : getLevelBands();
  }

  function bandForLevel(level) {
    const value = Number(level) || 0;
    return getLevelBands().find((band) => value >= band.min && value <= band.max) || null;
  }

  function bandLabelForLevel(level) {
    return bandForLevel(level)?.label || `${level}-level`;
  }

  function uniqueLabels(values) {
    const seen = new Set();
    return values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function paperCodeLabel(paperItem) {
    if (!isDoubleCodedPaper(paperItem)) return paperItem.code || "Untitled paper";
    return uniqueLabels([paperItem.code, paperItem.secondaryCode || "Second code"]).join(" / ");
  }

  function paperCanvasLevelLabel(paperItem) {
    if (isNzqfGrouping()) {
      const levels = uniqueLabels([
        paperItem.nzqfLevel ? `NZQCF ${paperItem.nzqfLevel}` : "NZQCF not set",
        isDoubleCodedPaper(paperItem)
          ? (paperItem.secondaryNzqfLevel ? `NZQCF ${paperItem.secondaryNzqfLevel}` : "Second NZQCF not set")
          : ""
      ]);
      return levels.join(" / ");
    }
    const levels = uniqueLabels([
      bandLabelForLevel(paperItem.level),
      isDoubleCodedPaper(paperItem) && paperItem.secondaryLevel ? bandLabelForLevel(paperItem.secondaryLevel) : ""
    ]);
    return `Otago ${levels.join(" / ")}`;
  }

  function paperMetaLabel(paperItem) {
    const codeLevel = `Otago ${uniqueLabels([
      bandLabelForLevel(paperItem.level),
      isDoubleCodedPaper(paperItem) && paperItem.secondaryLevel ? bandLabelForLevel(paperItem.secondaryLevel) : ""
    ]).join(" / ")}`;
    const nzqf = uniqueLabels([
      paperItem.nzqfLevel ? `NZQCF ${paperItem.nzqfLevel}` : "NZQCF not set",
      isDoubleCodedPaper(paperItem)
        ? (paperItem.secondaryNzqfLevel ? `NZQCF ${paperItem.secondaryNzqfLevel}` : "Second NZQCF not set")
        : ""
    ]).join(" / ");
    const structure = isDoubleCodedPaper(paperItem) ? "Double-coded" : "";
    return [structure, codeLevel, nzqf, paperPointsLabel(paperItem), normaliseDeliveryMode(paperItem.deliveryMode)].filter(Boolean).join(" · ");
  }

  function paperPointsLabel(paperItem) {
    return paperItem.points ? `${paperItem.points} points` : "Points not set";
  }

  function nzqfLevelOptions() {
    return [...new Set([
      ...NZQCF_LEVEL_OPTIONS,
      ...state.papers.flatMap((paperItem) => [
        normaliseNzqfLevel(paperItem.nzqfLevel),
        normaliseNzqfLevel(paperItem.secondaryNzqfLevel)
      ]).filter(Boolean)
    ])].sort((a, b) => a - b);
  }

  function paperLevelOptions() {
    return [...new Set([
      ...getLevelBands().map((band) => band.defaultLevel),
      ...state.papers.flatMap((paperItem) => [
        Number(paperItem.level) || 0,
        Number(paperItem.secondaryLevel) || 0
      ])
    ].filter(Boolean))].sort((a, b) => a - b);
  }

  function levelBandsToText() {
    return getLevelBands()
      .map((band) => `${band.label} | ${band.description} | ${band.min} | ${band.max} | ${band.defaultLevel}`)
      .join("\n");
  }

  function parseLevelBands(text) {
    const rows = String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [label, description = "", min = "", max = "", defaultLevel = ""] = line.split("|").map((part) => part.trim());
        const fallback = DEFAULT_WORDING.programme.levelBands[index] || DEFAULT_WORDING.programme.levelBands.at(-1);
        return {
          label: label || fallback.label,
          description,
          min: Number(min || fallback.min),
          max: Number(max || fallback.max),
          defaultLevel: Number(defaultLevel || min || fallback.defaultLevel)
        };
      });
    return normaliseLevelBands(rows);
  }

  function loadState() {
    if (cloud.workspace && cloud.token) {
      return blankWorkspaceState("Loading cloud workspace...", clone(DEFAULT_WORDING));
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normaliseState(JSON.parse(saved)) : clone(sampleData);
    } catch (error) {
      console.warn("Unable to load saved workspace", error);
      return clone(sampleData);
    }
  }

  function normaliseState(input) {
    const base = clone(sampleData);
    const meta = { ...base.meta, ...(input.meta || {}) };
    meta.levelGroupingMode = meta.levelGroupingMode === "nzqf" ? "nzqf" : "paperCode";
    const papers = (Array.isArray(input.papers) ? input.papers : base.papers).map((item) => ({
      ...paper(item.id, item.code, item.title, Number(item.level) || 100, Number(item.x) || 70, Number(item.y) || 100, Array.isArray(item.roles) ? item.roles : []),
      ...item,
      structure: normalisePaperStructure(item.structure || (item.secondaryCode || item.alternateCode ? "Double-coded" : "")),
      level: Number(item.level) || 100,
      secondaryLevel: Number(item.secondaryLevel) || "",
      nzqfLevel: normaliseNzqfLevel(item.nzqfLevel),
      secondaryNzqfLevel: normaliseNzqfLevel(item.secondaryNzqfLevel),
      secondaryCode: String(item.secondaryCode || item.alternateCode || ""),
      requirement: normaliseRequirement(item.requirement),
      deliveryMode: normaliseDeliveryMode(item.deliveryMode),
      points: normalisePaperPoints(item.points),
      teachingStaff: item.teachingStaff || "",
      roles: Array.isArray(item.roles) ? item.roles : [],
      description: item.description || "",
      secondaryLearningOutcomes: item.secondaryLearningOutcomes || "",
      secondaryLearningActivities: item.secondaryLearningActivities || "",
      secondaryAssessmentNotes: item.secondaryAssessmentNotes || "",
      ploLinks: item.ploLinks || {},
      activityLinks: item.activityLinks || {},
      secondaryPloLinks: item.secondaryPloLinks || {},
      secondaryActivityLinks: item.secondaryActivityLinks || {},
      diagnosisNote: item.diagnosisNote || "",
      agreedAction: item.agreedAction || ""
    }));
    const assessments = (Array.isArray(input.assessments) ? input.assessments : []).map((item) => ({
      ...assessment(item.id, item.paperId, item.name, Number(item.week) || 1, Number(item.weight) || 0, item.mode || "", item.aiContext || "", item.evidence || {}),
      ...item,
      week: Number(item.week) || 1,
      weight: Number(item.weight) || 0,
      side: normaliseAssessmentSide(item.side),
      evidence: item.evidence || {},
      diagnosisNote: item.diagnosisNote || ""
    }));
    const validPaperIds = new Set(papers.map((paperItem) => paperItem.id));
    const actions = (Array.isArray(input.actions) ? input.actions : []).map((item) => ({
      ...item,
      status: item.status === "Done" ? "Completed" : (item.status || "To do"),
      decision: item.decision || ""
    }));
    return {
      ...base,
      ...input,
      meta,
      plos: Array.isArray(input.plos) ? input.plos : base.plos,
      papers,
      alignments: input.alignments || {},
      notes: input.notes || {},
      pathways: Array.isArray(input.pathways) ? input.pathways : base.pathways,
      connections: normaliseConnections(input.connections, validPaperIds),
      assessments,
      actions,
      staffNotes: input.staffNotes && typeof input.staffNotes === "object" && !Array.isArray(input.staffNotes) ? input.staffNotes : {},
      staffProfiles: normaliseStaffProfiles(input.staffProfiles),
      wording: normaliseWording(input.wording)
    };
  }

  function scheduleSave(message = "Saved locally") {
    if (!canEditWorkspace(false)) {
      byId("save-status").textContent = "View-only";
      return;
    }
    byId("save-status").textContent = "Saving...";
    cloud.pendingLocalChanges = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        dedupeConnections();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        byId("save-status").textContent = cloud.enabled ? "Saved locally; syncing..." : message;
      } catch (error) {
        console.warn("Unable to save workspace locally", error);
        byId("save-status").textContent = "Local save unavailable";
      }
      queueCloudSave();
    }, 180);
  }

  function saveLocalStateNow(message = "Saved locally") {
    dedupeConnections();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      byId("save-status").textContent = message;
    } catch (error) {
      console.warn("Unable to save workspace locally", error);
      byId("save-status").textContent = "Local save unavailable";
    }
  }

  function canEditWorkspace(showMessage = true) {
    const allowed = !cloud.enabled || cloud.canEdit;
    if (!allowed && showMessage) toast("This is a view-only link");
    return allowed;
  }

  function canManageTemplate(showMessage = true) {
    const allowed = !cloud.enabled || cloud.canManageTemplate;
    if (!allowed && showMessage) toast("Only the workspace admin can edit template wording");
    return allowed;
  }

  function cloudAccessLabel() {
    if (!cloud.enabled) return "Cloud ready";
    if (!cloud.canEdit) return "Cloud view-only link";
    return cloud.canManageTemplate ? "Cloud admin setup link" : "Cloud edit link";
  }

  function setCloudStatus(message, kind = "") {
    const element = byId("cloud-status");
    element.textContent = message;
    element.classList.remove("online", "readonly", "error");
    if (kind) element.classList.add(kind);
  }

  function getWorkspaceTitle() {
    const configuredTitle = String(state.meta.workspaceTitle || "").trim();
    if (configuredTitle) return configuredTitle;

    return workspaceTitleForProgramme(state.meta.programme);
  }

  function workspaceTitleForProgramme(programmeName) {
    const name = String(programmeName || "").trim() || "Untitled Programme";
    return /curriculum mapping workspace$/i.test(name)
      ? name
      : `${name} Curriculum Mapping Workspace`;
  }

  function programmeNameValue(value) {
    return String(value || "").trim() || "Untitled Programme";
  }

  function blankWorkspaceState(programmeName, wording = getWording()) {
    const name = programmeNameValue(programmeName);
    return normaliseState({
      meta: {
        programme: name,
        workspaceTitle: workspaceTitleForProgramme(name),
        department: "",
        version: "Working version",
        workshopDate: "",
        participants: ""
      },
      plos: [],
      papers: [],
      alignments: {},
      notes: {},
      pathways: [],
      connections: [],
      assessments: [],
      actions: [],
      staffNotes: {},
      staffProfiles: {},
      wording: normaliseWording(wording)
    });
  }

  function toast(message) {
    const element = byId("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
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
      setCloudStatus("Offline/local mode");
      return false;
    }

    try {
      await loadSupabaseLibrary();
    } catch (error) {
      console.error(error);
      setCloudStatus("Cloud library unavailable", "error");
      return false;
    }

    cloud.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    return true;
  }

  function refreshSessionIdentity() {
    clientId = clientId || getClientId();
    sessionName = localStorageGet(workspaceScopedKey(SESSION_NAME_KEY)) || localStorageGet(SESSION_NAME_KEY);
    updateShareButtons();
  }

  function setSessionName(value) {
    sessionName = String(value || "").trim();
    if (sessionName) {
      localStorageSet(workspaceScopedKey(SESSION_NAME_KEY), sessionName);
      localStorageSet(SESSION_NAME_KEY, sessionName);
    }
    updateShareButtons();
    return sessionName;
  }

  function ensureSessionName(reason = "identify your contribution") {
    refreshSessionIdentity();
    if (sessionName) return sessionName;
    const entered = window.prompt(`Please enter your name so the workspace can ${reason}.`, "");
    return setSessionName(entered || "Anonymous reviewer");
  }

  function rpcUnavailable(error) {
    const message = String(error?.message || error || "");
    return /function .* does not exist|Could not find the function|schema cache|does not exist/i.test(message);
  }

  function reviewBackendMissingMessage() {
    return "Review comments, activity log, and editing-presence need the latest Supabase SQL migration. Run the updated supabase-schema.sql once in Supabase.";
  }

  async function callReviewRpc(name, params, options = {}) {
    if (!cloud.enabled || !cloud.client) return null;
    if (!reviewBackendAvailable && !options.force) return null;
    const { data, error } = await cloud.client.rpc(name, params);
    if (error) {
      if (rpcUnavailable(error)) {
        reviewBackendAvailable = false;
        if (!options.silent) toast(reviewBackendMissingMessage());
        return null;
      }
      throw error;
    }
    return data;
  }

  function currentViewLabel() {
    const activeTab = $(".tab.active");
    return activeTab?.textContent?.trim() || "Workspace";
  }

  function commentTargetOptions() {
    const options = [
      { value: currentViewLabel(), label: `Current view: ${currentViewLabel()}` },
      { value: "Program page", label: "Program page" },
      { value: "Assessment page", label: "Assessment page" },
      { value: "Paper page", label: "Paper page" },
      { value: "Actions page", label: "Actions page" }
    ];
    const selected = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
    if (selected) options.unshift({ value: `Paper: ${selected.code}`, label: `Selected paper: ${selected.code} · ${selected.title}` });
    return options;
  }

  function reviewCommentHtml() {
    if (!reviewComments.length) return `<div class="empty-state compact">No comments yet.</div>`;
    return `<div class="comment-list">${reviewComments.map((comment) => `
      <article class="comment-card">
        <b>${escapeHtml(comment.author || "Anonymous reviewer")}</b>
        <small>${escapeHtml(comment.target || "Workspace")} · ${escapeHtml(formatSnapshotTimestamp(new Date(comment.createdAt || Date.now())))}</small>
        <p>${escapeHtml(comment.body || "")}</p>
      </article>
    `).join("")}</div>`;
  }

  async function fetchReviewComments(silent = false) {
    const data = await callReviewRpc("list_curriculum_workspace_comments", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token
    }, { silent });
    if (Array.isArray(data)) reviewComments = data;
    return reviewComments;
  }

  async function createReviewComment(values) {
    const author = ensureSessionName("add review comments");
    const body = String(values.body || "").trim();
    if (!body) return toast("Comment is empty");
    const data = await callReviewRpc("create_curriculum_workspace_comment", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token,
      comment_author: author,
      comment_body: body,
      comment_target: values.target || currentViewLabel()
    });
    if (!data) return;
    await fetchReviewComments(true);
    toast("Comment added");
  }

  async function openComments() {
    if (!cloud.enabled) return toast("Comments are available on cloud links.");
    ensureSessionName("add review comments");
    reviewBackendAvailable = true;
    try {
      await fetchReviewComments();
      openDialog({
        eyebrow: cloud.canEdit ? "Comments" : "Review",
        title: "Review Comments",
        fields: [
          { name: "existingComments", type: "html", html: reviewCommentHtml() },
          { name: "target", label: "Comment relates to", value: commentTargetOptions()[0]?.value || "Workspace", type: "select", options: commentTargetOptions() },
          { name: "body", label: "Add a comment", value: "", type: "textarea", required: true }
        ],
        async onSave(values) {
          await createReviewComment(values);
        }
      });
    } catch (error) {
      alert(`Unable to open comments: ${error.message}`);
    }
  }

  function activityLogHtml() {
    if (!activityLog.length) return `<div class="empty-state compact">No activity logged yet.</div>`;
    return `<div class="activity-log-list">${activityLog.map((item) => `
      <article class="activity-log-card">
        <b>${escapeHtml(item.action || "Workspace activity")}</b>
        <small>${escapeHtml(item.author || "Unknown")} · ${escapeHtml(item.target || "Workspace")} · ${escapeHtml(formatSnapshotTimestamp(new Date(item.createdAt || Date.now())))}</small>
        <p>${escapeHtml(item.detailsText || "")}</p>
      </article>
    `).join("")}</div>`;
  }

  async function fetchActivityLog() {
    const data = await callReviewRpc("list_curriculum_workspace_activity", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token
    });
    if (Array.isArray(data)) {
      activityLog = data.map((item) => ({
        ...item,
        detailsText: item.details ? JSON.stringify(item.details, null, 2) : ""
      }));
    }
    return activityLog;
  }

  async function openActivityLog() {
    if (!cloud.canManageTemplate) return toast("Only the admin link can view the activity log.");
    reviewBackendAvailable = true;
    try {
      await fetchActivityLog();
      openDialog({
        eyebrow: "Admin",
        title: "Activity Log",
        fields: [
          { name: "activity", type: "html", html: activityLogHtml() }
        ],
        onSave() {}
      });
    } catch (error) {
      alert(`Unable to open activity log: ${error.message}`);
    }
  }

  async function logActivity(action, target, details = {}) {
    if (!cloud.enabled || !cloud.client || !cloud.canEdit) return;
    const author = ensureSessionName("record who changed the workspace");
    await callReviewRpc("create_curriculum_workspace_activity", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token,
      activity_author: author,
      activity_action: action,
      activity_target: target,
      activity_details: details
    }, { silent: true });
  }

  function activePresenceForField(fieldKey) {
    if (!fieldKey) return [];
    return presenceRecords.filter((item) => item.clientId !== clientId && item.fieldKey === fieldKey);
  }

  function applyPresenceIndicators() {
    $$("[data-presence-key]").forEach((element) => {
      const conflicts = activePresenceForField(element.dataset.presenceKey);
      element.classList.toggle("presence-conflict", conflicts.length > 0);
      element.title = conflicts.length
        ? `${conflicts.map((item) => item.author || "Someone").join(", ")} editing this field`
        : "";
    });
  }

  async function fetchPresence(silent = false) {
    if (!cloud.enabled || !cloud.canEdit) return [];
    const data = await callReviewRpc("list_curriculum_workspace_presence", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token
    }, { silent });
    if (Array.isArray(data)) {
      presenceRecords = data.map((item) => ({
        clientId: item.clientId,
        author: item.author,
        fieldKey: item.fieldKey,
        fieldLabel: item.fieldLabel,
        updatedAt: item.updatedAt
      }));
      applyPresenceIndicators();
    }
    return presenceRecords;
  }

  async function setPresence(field) {
    if (!cloud.enabled || !cloud.canEdit || !field?.key) return;
    const author = ensureSessionName("show who is editing");
    activePresenceField = field.key;
    const data = await callReviewRpc("set_curriculum_workspace_presence", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token,
      client_identifier: clientId,
      presence_author: author,
      presence_field_key: field.key,
      presence_field_label: field.label
    }, { silent: true });
    if (Array.isArray(data)) {
      presenceRecords = data.map((item) => ({
        clientId: item.clientId,
        author: item.author,
        fieldKey: item.fieldKey,
        fieldLabel: item.fieldLabel,
        updatedAt: item.updatedAt
      }));
      const conflicts = activePresenceForField(field.key);
      if (conflicts.length) toast(`${conflicts.map((item) => item.author || "Someone").join(", ")} is also editing ${field.label}`);
      applyPresenceIndicators();
    }
  }

  async function clearPresence() {
    if (!cloud.enabled || !cloud.canEdit || !activePresenceField) return;
    activePresenceField = "";
    await callReviewRpc("clear_curriculum_workspace_presence", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token,
      client_identifier: clientId
    }, { silent: true });
  }

  function markDiscreteEditPresence(field) {
    if (!cloud.enabled || !cloud.canEdit || !field?.key) return;
    void setPresence(field);
    window.setTimeout(() => {
      if (activePresenceField === field.key && !focusedEdit) void clearPresence();
    }, 3500);
  }

  async function initCloud() {
    if (!(await configureCloud())) {
      updateShareButtons();
      return;
    }

    if (!cloud.workspace || !cloud.token) {
      setCloudStatus("Cloud ready");
      updateShareButtons();
      return;
    }

    try {
      setCloudStatus("Loading cloud workspace...");
      const { data, error } = await cloud.client.rpc("load_curriculum_workspace", {
        workspace_slug: cloud.workspace,
        access_token: cloud.token
      });
      if (error) throw error;

      applyCloudPayload(data);
      cloud.enabled = true;
      cloud.loaded = true;
      cloud.canEdit = Boolean(data.canEdit);
      cloud.canManageTemplate = Object.prototype.hasOwnProperty.call(data, "canManageTemplate")
        ? Boolean(data.canManageTemplate)
        : cloud.canEdit;
      cloud.adminToken = data.adminToken || (cloud.canManageTemplate ? cloud.token : "");
      cloud.editToken = data.editToken || (cloud.canEdit && !cloud.canManageTemplate ? cloud.token : "");
      cloud.viewToken = data.viewToken || (!cloud.canEdit ? cloud.token : "");
      cloud.lastUpdatedAt = data.updatedAt || "";
      reviewBackendAvailable = true;
      refreshSessionIdentity();
      selectedPaperId = state.papers[0]?.id || null;
      renderAll();
      updateShareButtons();
      setCloudStatus(cloudAccessLabel(), cloud.canEdit ? "online" : "readonly");
      startCloudPolling();
      void fetchReviewComments(true);
      void fetchPresence(true);
    } catch (error) {
      console.error("Unable to load cloud workspace", error);
      setCloudStatus("Cloud link invalid", "error");
      toast("Cloud workspace could not be loaded");
      updateShareButtons();
    }
  }

  function applyCloudPayload(payload) {
    cloud.applyingRemote = true;
    state = normaliseState(payload.data || payload);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Unable to cache cloud workspace locally", error);
    }
    cloud.applyingRemote = false;
  }

  function mergeTemplateFieldsFromCloudData(remoteData, render = false) {
    if (!remoteData || typeof remoteData !== "object") return;
    if (remoteData.wording) state.wording = normaliseWording(remoteData.wording);
    if (remoteData.meta && Object.prototype.hasOwnProperty.call(remoteData.meta, "workspaceTitle")) {
      state.meta ||= {};
      state.meta.workspaceTitle = remoteData.meta.workspaceTitle || "";
    }
    if (render) {
      renderWording();
      renderHeader();
      if (byId("view-programme")?.classList.contains("active")) renderCanvas();
    }
  }

  async function mergeLatestCloudFieldsBeforeSave(options = {}) {
    if (!cloud.enabled || !cloud.canEdit || !cloud.client) return;
    const { data, error } = await cloud.client.rpc("load_curriculum_workspace", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token
    });
    if (error) throw error;
    const remoteData = data.data || data;
    if (!cloud.canManageTemplate) mergeTemplateFieldsFromCloudData(remoteData, true);
    if (!options.preserveLocalConnections) mergeConnectionsFromCloudData(remoteData);
  }

  async function createCloudWorkspace() {
    if (!cloud.client && !(await configureCloud())) {
      alert("Cloud collaboration is not configured yet. Add Supabase values to config.js first.");
      return;
    }

    const defaultName = programmeNameValue(state.meta.programme) === "Untitled Programme" ? "" : state.meta.programme;
    openDialog({
      eyebrow: "Cloud",
      title: "Create Programme Workspace",
      fields: [
        { name: "programme", label: "Programme / workspace name", value: defaultName, required: true }
      ],
      async onSave(values) {
        const programmeName = programmeNameValue(values.programme);
        const workspaceTitle = workspaceTitleForProgramme(programmeName);
        state.meta.programme = programmeName;
        state.meta.workspaceTitle = workspaceTitle;
        renderHeader();

        try {
          setCloudStatus("Creating private link...");
          const { data, error } = await cloud.client.rpc("create_curriculum_workspace", {
            title: workspaceTitle,
            initial_data: state
          });
          if (error) throw error;

          cloud.enabled = true;
          cloud.loaded = true;
          cloud.canEdit = true;
          cloud.canManageTemplate = true;
          cloud.workspace = data.slug;
          cloud.adminToken = data.adminToken || data.editToken;
          cloud.token = cloud.adminToken;
          cloud.editToken = data.editToken;
          cloud.viewToken = data.viewToken;
          cloud.lastUpdatedAt = data.updatedAt || "";
          refreshSessionIdentity();
          const nextUrl = buildWorkspaceUrl(cloud.workspace, cloud.adminToken);
          window.history.replaceState(null, "", nextUrl);
          updateShareButtons();
          setCloudStatus("Cloud admin setup link", "online");
          startCloudPolling();
          toast("Private admin link created");
        } catch (error) {
          console.error("Unable to create cloud workspace", error);
          setCloudStatus("Cloud create failed", "error");
          alert(`Unable to create private link: ${error.message}`);
        }
      }
    });
  }

  function queueCloudSave() {
    if (!cloud.enabled || !cloud.canEdit || cloud.applyingRemote || !cloud.client) return;
    clearTimeout(cloud.saveTimer);
    cloud.saveTimer = setTimeout(saveCloudWorkspace, 900);
  }

  async function saveCloudWorkspace(options = {}) {
    if (!cloud.enabled || !cloud.canEdit || !cloud.client) return;
    if (cloud.activeSavePromise) {
      try {
        await cloud.activeSavePromise;
      } catch {
        // The next save attempt below will report its own error if it also fails.
      }
    }

    const saveConnectionVersion = connectionChangeVersion;
    const savePromise = (async () => {
      dedupeConnections();
      await mergeLatestCloudFieldsBeforeSave(options);
      setCloudStatus("Syncing...");
      const { data, error } = await cloud.client.rpc("save_curriculum_workspace", {
        workspace_slug: cloud.workspace,
        access_token: cloud.token,
        next_data: state
      });
      if (error) throw error;
      cloud.lastUpdatedAt = data.updatedAt || cloud.lastUpdatedAt;
      if (connectionChangeVersion === saveConnectionVersion) {
        cloud.pendingLocalChanges = false;
        pendingConnectionChange = false;
        connectionTombstones.clear();
      } else {
        cloud.pendingLocalChanges = true;
      }
      if (!cloud.canManageTemplate) mergeTemplateFieldsFromCloudData(data.data || data, true);
      setCloudStatus("Cloud synced", "online");
      byId("save-status").textContent = "Saved to cloud";
    })();

    cloud.activeSavePromise = savePromise;
    try {
      await savePromise;
    } catch (error) {
      console.error("Unable to save cloud workspace", error);
      setCloudStatus("Cloud sync failed", "error");
      byId("save-status").textContent = "Cloud sync failed";
      if (options.rethrow) throw error;
    } finally {
      if (cloud.activeSavePromise === savePromise) cloud.activeSavePromise = null;
    }
  }

  async function flushPendingWorkspaceSave(message = "Saved locally", options = {}) {
    if (!canEditWorkspace(false)) return;
    clearTimeout(saveTimer);
    clearTimeout(cloud.saveTimer);
    saveLocalStateNow(cloud.enabled ? "Saved locally; syncing..." : message);
    if (cloud.activeSavePromise) await cloud.activeSavePromise;
    if (cloud.enabled && cloud.canEdit && cloud.client) {
      await saveCloudWorkspace({ ...options, rethrow: true });
    }
  }

  function commitConnectionChange(message = "Relationship changes saved") {
    clearTimeout(saveTimer);
    clearTimeout(cloud.saveTimer);
    cloud.pendingLocalChanges = true;
    saveLocalStateNow(cloud.enabled ? "Saving relationship changes..." : "Saved locally");
    if (!cloud.enabled || !cloud.canEdit || !cloud.client) {
      toast(message);
      return;
    }

    void (async () => {
      try {
        await saveCloudWorkspace({ rethrow: true });
        toast(message);
      } catch (error) {
        alert(`Unable to save relationship changes: ${error.message}`);
      }
    })();
  }

  function startCloudPolling() {
    clearInterval(cloud.pollTimer);
    const interval = Number(CONFIG.syncIntervalMs || 4000);
    cloud.pollTimer = setInterval(pollCloudWorkspace, Math.max(2500, interval));
    startPresencePolling();
  }

  function startPresencePolling() {
    clearInterval(presenceTimer);
    if (!cloud.enabled || !cloud.canEdit) return;
    presenceTimer = setInterval(() => {
      if (focusedEdit) {
        void setPresence({ key: focusedEdit.key, label: focusedEdit.label });
      } else if (!isTextEditingActive()) {
        void clearPresence();
      }
      void fetchPresence(true);
    }, 5000);
  }

  async function pollCloudWorkspace() {
    if (!cloud.enabled || !cloud.client || cloud.pendingLocalChanges || isTextEditingActive()) return;
    try {
      const { data, error } = await cloud.client.rpc("load_curriculum_workspace", {
        workspace_slug: cloud.workspace,
        access_token: cloud.token
      });
      if (error) throw error;
      if (data.updatedAt && data.updatedAt !== cloud.lastUpdatedAt) {
        applyCloudPayload(data);
        cloud.lastUpdatedAt = data.updatedAt;
        selectedPaperId = state.papers.some((paperItem) => paperItem.id === selectedPaperId) ? selectedPaperId : state.papers[0]?.id || null;
        renderAll();
        updateShareButtons();
        setCloudStatus(cloud.canEdit ? "Cloud synced" : cloudAccessLabel(), cloud.canEdit ? "online" : "readonly");
      }
    } catch (error) {
      console.warn("Cloud polling failed", error);
      setCloudStatus("Cloud sync paused", "error");
    }
  }

  function buildWorkspaceUrl(workspace, token) {
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("token", token);
    return url.toString();
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      openDialog({
        eyebrow: "Copy",
        title: `Copy ${label}`,
        fields: [
          { name: "link", label: `Copy this ${label}`, value: text, type: "textarea" }
        ]
      });
    }
  }

  function updateShareButtons() {
    const adminButton = byId("copy-admin-link-button");
    const editButton = byId("copy-edit-link-button");
    const viewButton = byId("copy-view-link-button");
    const sessionButton = byId("session-name-button");
    const commentsButton = byId("comments-button");
    const activityButton = byId("activity-log-button");
    byId("create-cloud-workspace-button").hidden = cloud.enabled;
    adminButton.hidden = !(cloud.enabled && cloud.canManageTemplate && (cloud.adminToken || cloud.token));
    editButton.hidden = !(cloud.enabled && cloud.canManageTemplate && (cloud.editToken || cloud.token));
    viewButton.hidden = !(cloud.enabled && cloud.canManageTemplate && cloud.viewToken);
    sessionButton.hidden = !cloud.enabled;
    commentsButton.hidden = !cloud.enabled;
    activityButton.hidden = !(cloud.enabled && cloud.canManageTemplate);
    sessionButton.textContent = sessionName ? `Name: ${sessionName}` : "My name";
    document.body.classList.toggle("read-only", cloud.enabled && !cloud.canEdit);
    const lockForReadOnly = cloud.enabled && !cloud.canEdit;
    $$("[data-requires-edit], #add-plo-button, #add-paper-button, #paper-view-add-button, #add-assessment-button, #add-action-button, #save-snapshot-button")
      .forEach((button) => { button.disabled = lockForReadOnly; });
    $$("[data-requires-admin], #wording-settings-button, #new-template-button, #import-button")
      .forEach((button) => { button.disabled = lockForReadOnly || (cloud.enabled && !cloud.canManageTemplate); });
    byId("wording-settings-button").hidden = cloud.enabled && !cloud.canManageTemplate;
    byId("new-template-button").hidden = cloud.enabled && !cloud.canManageTemplate;
    byId("import-button").hidden = cloud.enabled && !cloud.canManageTemplate;
    setReadOnlyFields(lockForReadOnly);
  }

  function setReadOnlyFields(readOnly) {
    $$("main input, main textarea").forEach((field) => {
      field.readOnly = readOnly;
      if (readOnly && field.tagName === "TEXTAREA") {
        field.style.height = "auto";
        field.style.height = `${Math.max(field.scrollHeight + 4, field.offsetHeight)}px`;
      } else if (!readOnly) {
        field.style.height = "";
      }
    });
    $$("main select").forEach((field) => { field.disabled = readOnly; });
    $$("main [contenteditable]").forEach((field) => {
      field.setAttribute("contenteditable", readOnly ? "false" : "true");
    });
  }

  function applyReadOnlyStateSoon() {
    requestAnimationFrame(() => setReadOnlyFields(cloud.enabled && !cloud.canEdit));
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function helpButton(key, label = "Help") {
    return `<button class="help-tip" type="button" data-help-key="${escapeHtml(key)}" aria-label="${escapeHtml(label)} help" title="Show help">?</button>`;
  }

  function closeHelpPopover() {
    const popover = byId("help-popover");
    if (!popover) return;
    popover.hidden = true;
    if (activeHelpButton) activeHelpButton.setAttribute("aria-expanded", "false");
    activeHelpButton = null;
  }

  function toggleHelpPopover(button) {
    const key = button.dataset.helpKey;
    const text = HELP_TEXT[key];
    if (!text) return;
    if (activeHelpButton === button && !byId("help-popover")?.hidden) {
      closeHelpPopover();
      return;
    }

    const popover = byId("help-popover");
    const content = byId("help-popover-text");
    if (!popover || !content) return;
    if (activeHelpButton) activeHelpButton.setAttribute("aria-expanded", "false");
    content.textContent = text;
    popover.hidden = false;
    activeHelpButton = button;
    button.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      const rect = button.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const margin = 12;
      const left = Math.min(
        window.innerWidth - popoverRect.width - margin,
        Math.max(margin, rect.left)
      );
      let top = rect.bottom + 8;
      if (top + popoverRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popoverRect.height - 8);
      }
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    });
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  function renderAll() {
    deferredRender.clear();
    renderWording();
    renderHeader();
    renderPlos();
    renderMappingTable();
    renderCanvas();
    renderPaperList();
    renderPaperEditor();
    renderAssessments();
    renderStaffWorkload();
    renderActions();
    applyReadOnlyStateSoon();
  }

  function deferRender(...targets) {
    targets.forEach((target) => deferredRender.add(target));
  }

  function flushDeferredRender() {
    if (!deferredRender.size) return;
    const targets = new Set(deferredRender);
    deferredRender.clear();
    if (targets.has("paperList")) renderPaperList();
    if (targets.has("mapping")) renderMappingTable();
    if (targets.has("canvas")) renderCanvas();
    if (targets.has("paperEditor")) renderPaperEditor();
    if (targets.has("assessments")) renderAssessments();
    if (targets.has("staff")) renderStaffWorkload();
    if (targets.has("actions")) renderActions();
    applyReadOnlyStateSoon();
  }

  function isTextEditingActive() {
    const active = document.activeElement;
    return Boolean(active?.matches?.("input, textarea, [contenteditable='true']"));
  }

  function renderWording() {
    const w = getWording();
    $$("[data-view='programme']").forEach((element) => { element.textContent = w.tabs.programme; });
    $$("[data-view='assessment']").forEach((element) => { element.textContent = w.tabs.assessment; });
    $$("[data-view='paper']").forEach((element) => { element.textContent = w.tabs.paper; });
    $$("[data-view='staff']").forEach((element) => { element.textContent = w.tabs.staff; });
    $$("[data-view='actions']").forEach((element) => { element.textContent = w.tabs.actions; });

    setText("programme-view-title", w.programme.title);
    setText("programme-view-help", w.programme.help);
    setText("plo-section-title", w.programme.ploTitle);
    setText("plo-section-help", w.programme.ploHelp);
    setText("alignment-section-title", w.programme.alignmentTitle);
    setText("alignment-section-help", w.programme.alignmentHelp);
    setText("pathways-section-title", w.programme.pathwaysTitle);
    setText("pathways-section-help", w.programme.pathwaysHelp);
    setText("add-plo-button", w.programme.addPlo);
    setText("add-paper-button", w.programme.addPaper);
    setText("paper-view-add-button", w.paper.addPaper);
    setText("add-assessment-button", w.assessment.addAssessment);
    setText("add-action-button", w.actions.addAction);

    byId("alignment-legend").innerHTML = `
      <span><b>I</b> ${escapeHtml(w.alignment.introduced)}</span>
      <span><b>D</b> ${escapeHtml(w.alignment.developed)}</span>
      <span><b>M</b> ${escapeHtml(w.alignment.mastered)}</span>`;

    setText("assessment-view-title", w.assessment.title);
    setText("assessment-view-help", w.assessment.help);
    setText("assessment-evidence-title", w.assessment.evidenceTitle);
    setText("assessment-evidence-help", w.assessment.evidenceHelp);
    setText("assessment-items-title", w.assessment.itemsTitle);
    setText("assessment-items-help", w.assessment.itemsHelp);
    setText("assessment-summary-title", w.assessment.summaryTitle);
    setText("assessment-summary-help", w.assessment.summaryHelp);
    setText("programme-evidence-title", w.assessment.programmeEvidenceTitle);
    setText("programme-evidence-help", w.assessment.programmeEvidenceHelp);
    setText("student-workload-title", w.assessment.workloadTitle);
    setText("student-workload-help", w.assessment.workloadHelp);

    setText("paper-view-title", w.paper.title);
    setText("paper-view-help", w.paper.help);
    setText("paper-search-label", w.paper.findPaper);

    setText("staff-view-title", w.staff.title);
    setText("staff-view-help", w.staff.help);
    setText("staff-summary-title", w.staff.summaryTitle);
    setText("staff-summary-help", w.staff.summaryHelp);

    setText("actions-view-title", w.actions.title);
    setText("actions-view-help", w.actions.help);
    setText("diagnosis-notes-title", w.actions.diagnosisTitle);
    setText("diagnosis-notes-help", w.actions.diagnosisHelp);

    const modeLabels = {
      move: w.network.move,
      required: w.network.required,
      recommended: w.network.recommended,
      related: w.network.related,
      remove: w.network.remove || "Remove line"
    };
    $$(".mode-button").forEach((button) => { button.textContent = modeLabels[button.dataset.mode] || button.textContent; });
    setText("canvas-status", w.network[`${canvasMode}Status`] || w.network.moveStatus);
    byId("canvas-key").innerHTML = `
      <span><i class="line required"></i>${escapeHtml(w.network.requiredKey)}</span>
      <span><i class="line recommended"></i>${escapeHtml(w.network.recommendedKey)}</span>
      <span><i class="line related"></i>${escapeHtml(w.network.relatedKey)}</span>
      <span><i class="paper-key compulsory"></i>Compulsory paper</span>
      <span><i class="paper-key distance"></i>Distance learning paper</span>
      <span><i class="paper-key double-coded"></i>Double-coded paper</span>
      <span class="hint">${escapeHtml(w.network.hint)}</span>`;
  }

  function renderHeader() {
    byId("programme-title").textContent = state.meta.programme || "Untitled Programme";
    byId("version-label").textContent = state.meta.version || "Working version";
    document.title = getWorkspaceTitle();
  }

  function renderPlos() {
    byId("plo-grid").innerHTML = state.plos.map((plo) => `
      <article class="plo-card" data-plo-id="${plo.id}" title="Click to edit">
        <b>${escapeHtml(plo.code)} · ${escapeHtml(plo.title)}</b>
        <span>${escapeHtml(plo.description)}</span>
      </article>
    `).join("");
  }

  function renderMappingTable() {
    const table = byId("mapping-table");
    const head = state.plos.map((plo) => `<th title="${escapeHtml(plo.title)}">${escapeHtml(plo.code)}</th>`).join("");
    const rows = state.papers
      .slice()
      .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
      .map((paperItem) => {
        const cells = state.plos.map((plo) => {
          const value = state.alignments[paperItem.id]?.[plo.id] || "";
          return `<td class="alignment-cell" data-paper-id="${paperItem.id}" data-plo-id="${plo.id}" data-value="${value}">
            <span class="alignment-mark">${value || "–"}</span>
          </td>`;
        }).join("");
        return `<tr>
          <td class="paper-cell" data-open-paper="${paperItem.id}">
            <b>${escapeHtml(paperCodeLabel(paperItem))}</b><span>${escapeHtml(paperItem.title)}</span>
            <small class="paper-cell-meta">${escapeHtml(paperMetaLabel(paperItem))} · ${escapeHtml(paperItem.requirement)}</small>
          </td>
          ${cells}
          <td class="discussion-note" contenteditable="true" data-note-paper="${paperItem.id}">${escapeHtml(state.notes[paperItem.id] || "")}</td>
        </tr>`;
      }).join("");
    table.innerHTML = `<thead><tr><th>Paper</th>${head}<th>Discussion Notes</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function supportedPlos(paperItem) {
    return state.plos
      .map((plo) => ({ ...plo, level: state.alignments[paperItem.id]?.[plo.id] || "" }))
      .filter((plo) => plo.level);
  }

  function paperAssessments(paperId) {
    return state.assessments.filter((item) => item.paperId === paperId);
  }

  function paperCardCodesHtml(paperItem) {
    if (!isDoubleCodedPaper(paperItem)) return `<b>${escapeHtml(paperItem.code)}</b>`;
    return `<div class="paper-card-double-codes" aria-label="Double-coded paper codes">
      <b>${escapeHtml(paperItem.code || "Main code")}</b>
      <b>${escapeHtml(paperItem.secondaryCode || "Second code")}</b>
    </div>`;
  }

  function assessmentPloSummary(item) {
    const mapped = state.plos
      .filter((plo) => item.evidence?.[plo.id])
      .map((plo) => `${plo.code} ${item.evidence[plo.id]}`);
    return mapped.length ? mapped.join(", ") : "No PLO evidence mapped yet";
  }

  function assessmentSideLabel(item) {
    const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
    if (!isDoubleCodedPaper(paperItem)) return "Whole paper";
    const side = normaliseAssessmentSide(item?.side);
    if (side === "Whole paper") return "Whole paper";
    if (side === "First code side") return `${paperItem?.code || "First code"} side`;
    return `${paperItem?.secondaryCode || "Second code"} side`;
  }

  function assessmentSideOptionsHtml(item) {
    const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
    const selected = isDoubleCodedPaper(paperItem) ? normaliseAssessmentSide(item.side) : "Whole paper";
    const options = isDoubleCodedPaper(paperItem)
      ? ASSESSMENT_SIDES.map((side) => {
        const label = side === "First code side"
          ? `${paperItem.code || "First code"} side`
          : side === "Second code side"
            ? `${paperItem.secondaryCode || "Second code"} side`
            : side;
        return { value: side, label };
      })
      : [{ value: "Whole paper", label: "Whole paper" }];
    return options.map((option) => `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  }

  function assessmentOtagoLevels(item) {
    const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
    if (!paperItem) return [0];
    if (!isDoubleCodedPaper(paperItem)) return [Number(paperItem.level) || 0];
    const side = normaliseAssessmentSide(item.side);
    if (side === "First code side") return [Number(paperItem.level) || 0];
    if (side === "Second code side") return [Number(paperItem.secondaryLevel) || Number(paperItem.level) || 0];
    return uniqueLabels([paperItem.level, paperItem.secondaryLevel]).map((level) => Number(level) || 0);
  }

  function numberedItems(value, prefix) {
    const rows = String(value || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    return rows.length ? rows.map((text, index) => ({ code: `${prefix}${index + 1}`, text })) : [];
  }

  function numberedItemPreview(value, prefix, emptyText) {
    const rows = numberedItems(value, prefix);
    if (!rows.length) return `<div class="empty-state compact">${emptyText}</div>`;
    return `<div class="item-preview">${rows.map((row) => `
      <article class="numbered-item"><b>${escapeHtml(row.code)}</b><span>${escapeHtml(row.text)}</span></article>
    `).join("")}</div>`;
  }

  function paperNetworkConnections(paperItem) {
    const validPaperIds = new Set(state.papers.map((item) => item.id));
    return normaliseConnections(state.connections, validPaperIds)
      .filter((connection) => connection.from === paperItem.id || connection.to === paperItem.id)
      .map((connection) => {
        const otherId = connection.from === paperItem.id ? connection.to : connection.from;
        const other = state.papers.find((item) => item.id === otherId);
        return { connection, other, isOutgoing: connection.from === paperItem.id };
      })
      .sort((a, b) => {
        const typeOrder = (CONNECTION_TYPE_ORDER[a.connection.type] ?? 99) - (CONNECTION_TYPE_ORDER[b.connection.type] ?? 99);
        if (typeOrder) return typeOrder;
        const levelOrder = (a.other?.level || 0) - (b.other?.level || 0);
        if (levelOrder) return levelOrder;
        const codeOrder = String(a.other?.code || "").localeCompare(String(b.other?.code || ""));
        if (codeOrder) return codeOrder;
        return String(a.other?.title || "").localeCompare(String(b.other?.title || ""));
      });
  }

  function paperOptionsHtml(selectedId, excludeId) {
    return state.papers
      .filter((item) => item.id !== excludeId)
      .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
      .map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(paperCodeLabel(item))} · ${escapeHtml(item.title)}</option>`)
      .join("");
  }

  function relationshipDirectionLabel(connection, isOutgoing) {
    if (connection.type === "related") return isOutgoing ? "relates to" : "is related from";
    return isOutgoing ? "leads to" : "comes after";
  }

  function paperNetworkHtml(paperItem) {
    const rows = paperNetworkConnections(paperItem);
    if (!rows.length) return `<div class="empty-state compact">No network relationships mapped yet.</div>`;
    return `<div class="relationship-list">${rows.map(({ connection, other, isOutgoing }) => `
      <article class="relationship-item" data-connection-row="${connection.id}">
        <div class="relationship-main">
          <select data-connection-field="type" aria-label="Relationship type">
            ${CONNECTION_TYPES.map((type) => `<option value="${type}" ${connection.type === type ? "selected" : ""}>${escapeHtml(connectionTypeLabel(type))}</option>`).join("")}
          </select>
          <span>${escapeHtml(relationshipDirectionLabel(connection, isOutgoing))}</span>
          <select data-connection-field="${isOutgoing ? "to" : "from"}" aria-label="Related paper">
            ${paperOptionsHtml(other?.id || "", paperItem.id)}
          </select>
        </div>
        <div class="relationship-actions">
          <button type="button" class="button" data-reverse-connection="${connection.id}">Reverse</button>
          <button type="button" class="button danger-text" data-delete-connection="${connection.id}">Remove</button>
        </div>
      </article>
    `).join("")}</div>`;
  }

  function renderCanvas() {
    const bands = getCanvasBands();
    const levelModeControl = byId("level-grouping-mode");
    if (levelModeControl) levelModeControl.value = levelGroupingMode();
    const headings = byId("level-headings");
    headings.style.setProperty("--level-band-count", String(Math.max(1, bands.length)));
    headings.innerHTML = bands.map((band) => `
      <div><b>${escapeHtml(band.label)}</b><span>${escapeHtml(band.description)}</span></div>
    `).join("");

    const cards = byId("paper-cards");
    cards.innerHTML = state.papers.map((paperItem) => `
      <article class="paper-card ${paperItem.requirement === "Compulsory" ? "compulsory" : ""} ${isDistanceLearningPaper(paperItem) ? "distance" : ""} ${isDoubleCodedPaper(paperItem) ? "double-coded" : ""}" id="card-${paperItem.id}" data-paper-id="${paperItem.id}"
        style="left:${paperItem.x}px;top:${paperItem.y}px">
        <div class="paper-card-head">
          ${paperCardCodesHtml(paperItem)}
          <small>${escapeHtml(paperCanvasLevelLabel(paperItem))}</small>
        </div>
        <span>${escapeHtml(paperItem.title)}</span>
        <div class="paper-card-tags">
          ${isDoubleCodedPaper(paperItem) ? `<em class="double-code-tag">Double-coded</em>` : ""}
          ${paperItem.requirement === "Compulsory" ? `<em class="requirement-tag">Compulsory</em>` : ""}
          ${isDistanceLearningPaper(paperItem) ? `<em class="delivery-tag">Distance</em>` : ""}
          ${paperItem.points ? `<em class="points-tag">${escapeHtml(`${paperItem.points} pts`)}</em>` : ""}
          ${(paperItem.roles || []).slice(0, 2).map((role) => `<em>${escapeHtml(role.split(" / ")[0])}</em>`).join("")}
        </div>
      </article>
    `).join("");
    requestAnimationFrame(drawConnections);
  }

  function drawConnections() {
    const svg = byId("connection-layer");
    $$(".connection", svg).forEach((line) => line.remove());
    const canvas = byId("pathway-canvas");
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);

    state.connections.forEach((connection) => {
      const from = byId(`card-${connection.from}`);
      const to = byId(`card-${connection.to}`);
      if (!from || !to) return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const endpoints = connectionEndpoints(a, b, canvasRect);
      const style = connectionStyle(connection.type);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("connection");
      line.dataset.connectionId = connection.id;
      line.setAttribute("x1", endpoints.start.x);
      line.setAttribute("y1", endpoints.start.y);
      line.setAttribute("x2", endpoints.end.x);
      line.setAttribute("y2", endpoints.end.y);
      line.setAttribute("stroke", style.color);
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-dasharray", style.dash);
      line.setAttribute("marker-end", `url(#arrow-${connection.type})`);
      line.setAttribute("opacity", ".82");
      line.style.pointerEvents = "stroke";
      svg.appendChild(line);
    });
  }

  function connectionEndpoints(fromRect, toRect, canvasRect) {
    const startCenter = {
      x: fromRect.left - canvasRect.left + fromRect.width / 2,
      y: fromRect.top - canvasRect.top + fromRect.height / 2
    };
    const endCenter = {
      x: toRect.left - canvasRect.left + toRect.width / 2,
      y: toRect.top - canvasRect.top + toRect.height / 2
    };
    return {
      start: cardEdgePoint(startCenter, endCenter, fromRect.width, fromRect.height, 5),
      end: cardEdgePoint(endCenter, startCenter, toRect.width, toRect.height, 11)
    };
  }

  function cardEdgePoint(center, target, width, height, padding = 0) {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (!dx && !dy) return center;
    const xScale = dx ? (width / 2 + padding) / Math.abs(dx) : Infinity;
    const yScale = dy ? (height / 2 + padding) / Math.abs(dy) : Infinity;
    const scale = Math.min(xScale, yScale);
    return {
      x: Math.round(center.x + dx * scale),
      y: Math.round(center.y + dy * scale)
    };
  }

  function connectionStyle(type) {
    if (type === "required") return { color: "#b83f59", dash: "" };
    if (type === "related") return { color: "#147c68", dash: "2 7" };
    return { color: "#2563d8", dash: "9 7" };
  }

  function renderPaperList() {
    const query = byId("paper-search")?.value.trim().toLowerCase() || "";
    const filtered = state.papers
      .filter((item) => !query || `${item.code} ${item.secondaryCode || ""} ${item.title}`.toLowerCase().includes(query))
      .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
    byId("paper-list").innerHTML = filtered.map((item) => `
      <article class="paper-list-item ${item.id === selectedPaperId ? "active" : ""} ${item.requirement === "Compulsory" ? "compulsory" : ""} ${isDoubleCodedPaper(item) ? "double-coded" : ""}" data-select-paper="${item.id}">
        <b>${escapeHtml(paperCodeLabel(item))} · ${escapeHtml(item.requirement || "Elective")}</b>
        <span>${escapeHtml(item.title)}</span>
        <small>${escapeHtml(paperMetaLabel(item))}</small>
      </article>
    `).join("") || `<div class="empty-state compact">No matching papers.</div>`;
  }

  function renderPaperEditor() {
    const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
    if (!item) {
      byId("paper-editor").innerHTML = `<div class="empty-state">Select or add a paper to begin.</div>`;
      byId("diagnosis-panel").innerHTML = `<h3>Diagnosis Notes</h3><div class="empty-state compact">Select a paper.</div>`;
      return;
    }

    const alignedPlos = supportedPlos(item);
    const assessments = paperAssessments(item.id);
    const doubleCoded = isDoubleCodedPaper(item);
    const cloHeading = doubleCoded ? "Course Learning Outcomes (First Code Side)" : "Course Learning Outcomes (CLOs)";
    const activityHeading = doubleCoded ? "Learning Activities (First Code Side)" : "Learning Activities";
    const secondaryLevelOptions = [
      `<option value="" ${item.secondaryLevel ? "" : "selected"}>Not set</option>`,
      ...paperLevelOptions().map((level) => `<option value="${level}" ${Number(item.secondaryLevel) === level ? "selected" : ""}>${level}</option>`)
    ].join("");
    const secondaryNzqfOptions = [
      `<option value="" ${item.secondaryNzqfLevel ? "" : "selected"}>Not set</option>`,
      ...nzqfLevelOptions().map((level) => `<option value="${level}" ${item.secondaryNzqfLevel === level ? "selected" : ""}>NZQCF Level ${level}</option>`)
    ].join("");
    const doubleCodeFields = doubleCoded ? `
        <label class="field"><span>Second paper code</span><input data-paper-field="secondaryCode" value="${escapeHtml(item.secondaryCode || "")}" placeholder="e.g. ANTH302"></label>
        <label class="field"><span>Second Otago paper code level</span><select data-paper-field="secondaryLevel">${secondaryLevelOptions}</select></label>
        <label class="field"><span>Second NZQCF level</span><select data-paper-field="secondaryNzqfLevel">${secondaryNzqfOptions}</select></label>
      ` : `
        <div class="field wide double-code-hint">
          <b>Double-coded paper?</b>
          <span>Choose “Double-coded” above when one teaching paper carries two codes, levels, or enrolment identities.</span>
        </div>
      `;
    const roles = ROLE_OPTIONS.map((role) => `
      <button type="button" class="role-chip ${item.roles?.includes(role) ? "selected" : ""}"
        data-paper-role="${escapeHtml(role)}">${escapeHtml(role)}</button>
    `).join("");
    const ploBadges = alignedPlos.length
      ? alignedPlos.map((plo) => `<span class="plo-badge" data-level="${plo.level}"><b>${escapeHtml(plo.code)}</b>${escapeHtml(plo.level)} · ${escapeHtml(plo.title)}</span>`).join("")
      : `<div class="empty-state compact">No PLO support selected yet. Add I/D/M in the Program mapping table.</div>`;
    const internalRows = alignedPlos.map((plo) => {
      const assessmentEvidence = assessments
        .filter((assessmentItem) => assessmentItem.evidence?.[plo.id])
        .map((assessmentItem) => `${assessmentItem.name} (${assessmentItem.evidence[plo.id]}, ${assessmentSideLabel(assessmentItem)})`)
        .join("; ");
      const secondaryLinks = doubleCoded ? `
        <label><span>Second-side CLO connection</span><div class="editable-box" contenteditable="true" data-paper-secondary-plo-link="${plo.id}">${escapeHtml(item.secondaryPloLinks?.[plo.id] || "")}</div></label>
        <label><span>Second-side learning activities connection</span><div class="editable-box" contenteditable="true" data-paper-secondary-activity-link="${plo.id}">${escapeHtml(item.secondaryActivityLinks?.[plo.id] || "")}</div></label>
      ` : "";
      return `<article class="internal-map-card ${doubleCoded ? "double-coded-map" : ""}">
        <div class="internal-map-plo"><b>${escapeHtml(plo.code)}</b><span>${escapeHtml(plo.level)} · ${escapeHtml(plo.title)}</span></div>
        <label><span>${doubleCoded ? "First/shared CLO connection" : "CLO connection"}</span><div class="editable-box" contenteditable="true" data-paper-plo-link="${plo.id}">${escapeHtml(item.ploLinks?.[plo.id] || "")}</div></label>
        <label><span>${doubleCoded ? "First/shared learning activities connection" : "Learning activities connection"}</span><div class="editable-box" contenteditable="true" data-paper-activity-link="${plo.id}">${escapeHtml(item.activityLinks?.[plo.id] || "")}</div></label>
        ${secondaryLinks}
        <div><span>Assessment evidence</span><p>${escapeHtml(assessmentEvidence || "No assessment evidence mapped yet")}</p></div>
      </article>`;
    }).join("");
    const assessmentRows = assessments.map((assessmentItem) => `
      <tr data-assessment-row="${assessmentItem.id}">
        <td class="editable-cell" contenteditable="true" data-assessment-field="name">${escapeHtml(assessmentItem.name)}</td>
        <td><select data-assessment-field="side" aria-label="Code side">${assessmentSideOptionsHtml(assessmentItem)}</select></td>
        <td><input type="number" min="1" max="${TEACHING_WEEKS}" data-assessment-field="week" value="${assessmentItem.week}" aria-label="Due week"></td>
        <td><input type="number" min="0" max="100" data-assessment-field="weight" value="${assessmentItem.weight}" aria-label="Weight percent"></td>
        <td class="editable-cell" contenteditable="true" data-assessment-field="mode">${escapeHtml(assessmentItem.mode)}</td>
        <td class="editable-cell" contenteditable="true" data-assessment-field="purpose">${escapeHtml(assessmentItem.purpose || "")}</td>
        <td>${escapeHtml(assessmentPloSummary(assessmentItem))}</td>
        <td><button class="button danger-text" data-delete-assessment="${assessmentItem.id}">Delete</button></td>
      </tr>
    `).join("");
    const doubleCodeSideSection = doubleCoded ? `
        <section class="paper-section double-code-section">
          <h3>Second Code Side ${helpButton("doubleCodedPaper", "Double-coded paper")}</h3>
          <p class="section-help">Use this area when the second code has distinct CLOs, learning activities, assessment design, or expectations. The main boxes above remain the first code side or shared design.</p>
          <div class="double-code-grid">
            <label><span>Second-side CLOs</span><textarea class="large-textarea" data-paper-field="secondaryLearningOutcomes" placeholder="One second-side CLO per line">${escapeHtml(item.secondaryLearningOutcomes || "")}</textarea></label>
            <div>${numberedItemPreview(item.secondaryLearningOutcomes, "CLO-S", "No second-side CLOs entered yet.")}</div>
            <label><span>Second-side learning activities</span><textarea class="large-textarea" data-paper-field="secondaryLearningActivities" placeholder="One second-side learning activity per line">${escapeHtml(item.secondaryLearningActivities || "")}</textarea></label>
            <div>${numberedItemPreview(item.secondaryLearningActivities, "LA-S", "No second-side learning activities entered yet.")}</div>
            <label class="double-code-full"><span>Second-side assessment notes</span><textarea data-paper-field="secondaryAssessmentNotes" placeholder="Describe how assessment differs for the second code side, or note that assessment is shared.">${escapeHtml(item.secondaryAssessmentNotes || "")}</textarea></label>
          </div>
        </section>
      ` : "";

    byId("paper-editor").innerHTML = `
      <div class="editor-heading">
        <div><h2>${escapeHtml(paperCodeLabel(item))} · ${escapeHtml(item.title)}</h2><p>Paper profile and internal alignment</p></div>
        <button class="button danger-text" data-delete-paper="${item.id}">Delete paper</button>
      </div>
      <div class="field-grid">
        <label class="field"><span>Paper code</span><input data-paper-field="code" value="${escapeHtml(item.code)}"></label>
        <label class="field"><span>Paper title</span><input data-paper-field="title" value="${escapeHtml(item.title)}"></label>
        <label class="field"><span>Paper structure ${helpButton("doubleCodedPaper", "Paper structure")}</span><select data-paper-field="structure">
          ${PAPER_STRUCTURES.map((structure) => `<option value="${structure}" ${normalisePaperStructure(item.structure) === structure ? "selected" : ""}>${structure}</option>`).join("")}
        </select></label>
        ${doubleCodeFields}
        <label class="field wide"><span>Teaching staff</span><textarea class="staff-textarea" data-paper-field="teachingStaff" placeholder="One name per line, or separate names with commas / semicolons">${escapeHtml(item.teachingStaff || "")}</textarea></label>
        <label class="field"><span>Points</span><input type="number" min="1" step="1" data-paper-field="points" value="${escapeHtml(item.points || "")}" placeholder="e.g. 15, 18, 30, 60"></label>
        <label class="field"><span>Otago paper code level</span><select data-paper-field="level">
          ${paperLevelOptions().map((level) => `<option ${item.level === level ? "selected" : ""}>${level}</option>`).join("")}
        </select></label>
        <label class="field"><span>NZQCF level</span><select data-paper-field="nzqfLevel">
          <option value="" ${item.nzqfLevel ? "" : "selected"}>Not set</option>
          ${nzqfLevelOptions().map((level) => `<option value="${level}" ${item.nzqfLevel === level ? "selected" : ""}>NZQCF Level ${level}</option>`).join("")}
        </select></label>
        <label class="field"><span>Programme requirement</span><select data-paper-field="requirement">
          ${PAPER_REQUIREMENTS.map((requirement) => `<option ${item.requirement === requirement ? "selected" : ""}>${requirement}</option>`).join("")}
        </select></label>
        <label class="field"><span>Delivery mode</span><select data-paper-field="deliveryMode">
          ${DELIVERY_MODES.map((mode) => `<option ${normaliseDeliveryMode(item.deliveryMode) === mode ? "selected" : ""}>${mode}</option>`).join("")}
        </select></label>
        <label class="field"><span>Review status</span><select data-paper-field="status">
          ${["Draft","In discussion","Ready"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select></label>
        <div class="field wide"><span>Programme role / contribution ${helpButton("paperRoles", "Programme role")}</span><div class="role-options">${roles}</div></div>
        <div class="field wide"><span>Supported Programme Learning Outcomes ${helpButton("paperPloLinks", "Supported PLOs")}</span><div class="plo-badge-grid">${ploBadges}</div></div>
        <div class="field wide"><span>Network relationships from Program page ${helpButton("paperNetwork", "Paper network relationships")}</span>
          ${paperNetworkHtml(item)}
        </div>
      </div>
      <div class="paper-detail-stack">
        <section class="paper-section">
          <h3>Paper Description ${helpButton("paperDescription", "Paper description")}</h3>
          <p class="section-help">Add the official or locally agreed paper description used for programme approval, handbook, or course design documentation.</p>
          <textarea class="large-textarea" data-paper-field="description">${escapeHtml(item.description || "")}</textarea>
        </section>
        <section class="paper-section">
          <h3>${escapeHtml(cloHeading)} ${helpButton("clos", "Course learning outcomes")}</h3>
          <p class="section-help">Enter one CLO per line. The app identifies them as CLO1, CLO2, CLO3 so they can be referenced in the alignment map.</p>
          <textarea class="large-textarea" data-paper-field="learningOutcomes">${escapeHtml(item.learningOutcomes)}</textarea>
          ${numberedItemPreview(item.learningOutcomes, "CLO", "No CLOs entered yet.")}
        </section>
        <section class="paper-section">
          <h3>${escapeHtml(activityHeading)} ${helpButton("learningActivities", "Learning activities")}</h3>
          <p class="section-help">Enter one learning activity per line. The app identifies them as LA1, LA2, LA3.</p>
          <textarea class="large-textarea" data-paper-field="learningActivities">${escapeHtml(item.learningActivities)}</textarea>
          ${numberedItemPreview(item.learningActivities, "LA", "No learning activities entered yet.")}
        </section>
        ${doubleCodeSideSection}
        <label class="paper-section"><h3>Key concepts / knowledge domains</h3><textarea data-paper-field="concepts">${escapeHtml(item.concepts)}</textarea></label>
        <section class="paper-section"><h3>Assessment ${helpButton("paperAssessment", "Paper assessment")}</h3>
          <p class="section-help">These rows are shared with the Assessments tab. Editing them here updates the programme assessment map.</p>
          <div class="mini-table-wrap">
            <table class="mini-table">
              <thead><tr><th>Item</th><th>Code side</th><th>Week</th><th>Weight</th><th>Mode</th><th>Role</th><th>PLOs</th><th></th></tr></thead>
              <tbody>${assessmentRows || `<tr><td colspan="8">No assessment items yet.</td></tr>`}</tbody>
            </table>
          </div>
          <button class="button" data-add-paper-assessment="${item.id}">Add assessment for this paper</button>
        </section>
      </div>
      <section class="internal-map">
        <h3>Internal Alignment Map ${helpButton("internalAlignment", "Internal alignment map")}</h3>
        <p>Map the chain from PLO → CLO → learning activity → assessment evidence for this paper.</p>
        <div class="internal-map-cards">${internalRows || `<div class="empty-state compact">Add I/D/M alignment in the Program page to generate this map.</div>`}</div>
      </section>
      <section class="paper-section diagnosis-section">
        <h3>Diagnosis Note ${helpButton("diagnosisNote", "Diagnosis note")}</h3>
        <p class="section-help">Use this only for issues or questions that should carry through to the Actions page.</p>
        <label><span>Diagnosis note</span><textarea data-paper-field="diagnosisNote">${escapeHtml(item.diagnosisNote || "")}</textarea></label>
      </section>`;

    byId("diagnosis-panel").innerHTML = "";
  }

  function diagnostic(title, text) {
    return `<div class="diagnostic-card"><b>${title}</b><span>${text}</span></div>`;
  }

  function renderAssessments() {
    const directPlos = new Set();
    state.assessments.forEach((item) => Object.entries(item.evidence || {}).forEach(([ploId, value]) => {
      if (value === "D") directPlos.add(ploId);
    }));
    const highWeeks = new Set(state.assessments.filter((item) => Number(item.weight) >= 35).map((item) => Number(item.week)));
    const aiReadyItems = state.assessments.filter((item) => (item.aiContext || "").trim()).length;
    const evidenceItems = state.assessments.filter((item) => Object.values(item.evidence || {}).some(Boolean)).length;
    const metrics = [
      [state.assessments.length, "Assessment items mapped"],
      [directPlos.size, "PLOs with direct evidence"],
      [evidenceItems, "Items with PLO evidence"],
      [aiReadyItems, "AI-ready considered"],
      [highWeeks.size, "High-weight weeks"]
    ];
    byId("assessment-metrics").innerHTML = metrics.map(([value, label]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join("");

    const rows = state.assessments.map((item) => {
      const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
      return `<tr data-assessment-row="${item.id}">
        <td class="paper-cell"><b>${escapeHtml(paperItem ? paperCodeLabel(paperItem) : "Unassigned")}</b></td>
        <td><select data-assessment-field="side" aria-label="Code side">${assessmentSideOptionsHtml(item)}</select></td>
        <td class="editable-cell" contenteditable="true" data-assessment-field="name">${escapeHtml(item.name)}</td>
        <td><input type="number" min="1" max="${TEACHING_WEEKS}" data-assessment-field="week" value="${item.week}" aria-label="Due week"></td>
        <td><input type="number" min="0" max="100" data-assessment-field="weight" value="${item.weight}" aria-label="Weight percent"></td>
        <td class="editable-cell" contenteditable="true" data-assessment-field="mode">${escapeHtml(item.mode)}</td>
        <td class="editable-cell compact-edit" contenteditable="true" data-assessment-field="purpose">${escapeHtml(item.purpose || "")}</td>
        <td class="editable-cell compact-edit" contenteditable="true" data-assessment-field="aiContext">${escapeHtml(item.aiContext || "")}</td>
        <td class="editable-cell compact-edit" contenteditable="true" data-assessment-field="diagnosisNote">${escapeHtml(item.diagnosisNote || "")}</td>
        <td><button class="button danger-text" data-delete-assessment="${item.id}">Delete</button></td>
      </tr>`;
    }).join("");
    byId("assessment-table").innerHTML = `<thead><tr><th>Paper</th><th>Code side</th><th>Assessment item</th><th>Teaching week</th><th>Weight %</th><th>Assessment form / mode</th><th>Role / contribution</th><th>AI-ready</th><th>Diagnosis note</th><th></th></tr></thead><tbody>${rows}</tbody>`;

    const evidenceHead = state.plos.map((plo) => `<th>${escapeHtml(plo.code)}</th>`).join("");
    const evidenceRows = state.assessments.map((item) => {
      const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
      const cells = state.plos.map((plo) => {
        const value = item.evidence?.[plo.id] || "";
        return `<td class="evidence-cell" data-assessment-id="${item.id}" data-plo-id="${plo.id}" data-value="${value}">${value || "–"}</td>`;
      }).join("");
      return `<tr><td>${escapeHtml(paperItem ? paperCodeLabel(paperItem) : "")} · ${escapeHtml(item.name)}<br><small>${escapeHtml(assessmentSideLabel(item))}</small></td>${cells}</tr>`;
    }).join("");
    byId("evidence-table").innerHTML = `<thead><tr><th>Assessment item</th>${evidenceHead}</tr></thead><tbody>${evidenceRows}</tbody>`;

    renderPloEvidenceSummary();
    renderProgrammeEvidence();

    const weeks = Array.from({ length: TEACHING_WEEKS }, (_, index) => index + 1);
    byId("assessment-timeline").innerHTML = weeks.map((week) => {
      const items = state.assessments.filter((item) => Number(item.week) === week);
      return `<div class="week"><b>W${week}</b>${items.map((item) => {
        const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
        const weightClass = item.weight >= 40 ? "heavy" : item.weight >= 25 ? "medium" : "";
        return `<span class="assessment-block ${weightClass}" title="${escapeHtml(item.name)}">${escapeHtml(paperItem ? paperCodeLabel(paperItem) : "")} ${item.weight}%</span>`;
      }).join("")}</div>`;
    }).join("");
  }

  function renderProgrammeEvidence() {
    byId("programme-evidence-grid").innerHTML = state.papers
      .slice()
      .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
      .map((paperItem) => {
        const items = state.assessments.filter((assessmentItem) => assessmentItem.paperId === paperItem.id);
        const evidenceItems = items.filter((assessmentItem) => Object.values(assessmentItem.evidence || {}).some(Boolean));
        const evidenceHtml = evidenceItems.map((assessmentItem) => `
          <article class="programme-evidence-item">
            <b>${escapeHtml(assessmentItem.name)}</b>
            <span>${escapeHtml(assessmentItem.purpose || "Assessment role to be clarified")}</span>
            <small>${escapeHtml(assessmentSideLabel(assessmentItem))}</small>
            <small>${escapeHtml(assessmentPloSummary(assessmentItem))}</small>
          </article>
        `).join("");
        const directCount = evidenceItems.filter((assessmentItem) => Object.values(assessmentItem.evidence || {}).includes("D")).length;
        return `<article class="programme-evidence-card">
          <div class="programme-evidence-heading">
            <div>
              <b>${escapeHtml(paperCodeLabel(paperItem))}</b>
              <span>${escapeHtml(paperItem.title)}</span>
            </div>
            <small>${escapeHtml(paperCanvasLevelLabel(paperItem))} · ${directCount} direct evidence item${directCount === 1 ? "" : "s"}</small>
          </div>
          ${evidenceHtml || `<p class="muted-text">No assessment evidence mapped yet.</p>`}
        </article>`;
      }).join("");
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

  function uniqueTextList(values, limit = 6) {
    const seen = new Set();
    const rows = [];
    values.forEach((value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      rows.push(text);
    });
    return rows.slice(0, limit);
  }

  function staffWorkloadSummaries() {
    const summaries = new Map();
    state.papers.forEach((paperItem) => {
      staffNamesForPaper(paperItem).forEach((name) => {
        if (!summaries.has(name)) {
          summaries.set(name, {
            name,
            papers: [],
            points: 0,
            levels: new Set(),
            nzqcfLevels: new Set(),
            requirements: new Set(),
            deliveryModes: new Set(),
            roles: new Set(),
            learningActivities: [],
            assessmentPatterns: []
          });
        }
        const summary = summaries.get(name);
        summary.papers.push(paperItem);
        summary.points += Number(paperItem.points) || 0;
        summary.levels.add(bandLabelForLevel(paperItem.level));
        if (isDoubleCodedPaper(paperItem) && paperItem.secondaryLevel) summary.levels.add(bandLabelForLevel(paperItem.secondaryLevel));
        summary.nzqcfLevels.add(paperItem.nzqfLevel ? `NZQCF ${paperItem.nzqfLevel}` : "NZQCF not set");
        if (isDoubleCodedPaper(paperItem)) summary.nzqcfLevels.add(paperItem.secondaryNzqfLevel ? `NZQCF ${paperItem.secondaryNzqfLevel}` : "Second NZQCF not set");
        summary.requirements.add(paperItem.requirement || "Elective");
        summary.deliveryModes.add(normaliseDeliveryMode(paperItem.deliveryMode));
        (paperItem.roles || []).forEach((role) => summary.roles.add(role));
        summary.learningActivities.push(...numberedItems(paperItem.learningActivities, "LA").map((item) => item.text));
        if (isDoubleCodedPaper(paperItem)) {
          summary.learningActivities.push(...numberedItems(paperItem.secondaryLearningActivities, "LA-S").map((item) => item.text));
        }
        summary.assessmentPatterns.push(...paperAssessments(paperItem.id).map((item) => [item.mode, item.purpose, assessmentSideLabel(item)].filter(Boolean).join(" / ")));
      });
    });
    return [...summaries.values()].sort((a, b) =>
      b.papers.length - a.papers.length
      || b.points - a.points
      || a.name.localeCompare(b.name)
    );
  }

  function renderStaffWorkload() {
    const metricsElement = byId("staff-metrics");
    const gridElement = byId("staff-workload-grid");
    if (!metricsElement || !gridElement) return;
    const summaries = staffWorkloadSummaries();
    const papersWithStaff = state.papers.filter((paperItem) => staffNamesForPaper(paperItem).length);
    const papersWithoutStaff = state.papers.filter((paperItem) => !staffNamesForPaper(paperItem).length);
    const namedPaperPoints = papersWithStaff.reduce((total, paperItem) => total + (Number(paperItem.points) || 0), 0);
    const attachedPoints = summaries.reduce((total, summary) => total + summary.points, 0);
    metricsElement.innerHTML = [
      [summaries.length, "Named teaching staff"],
      [papersWithStaff.length, "Papers with staff entered"],
      [namedPaperPoints, "Named paper points"],
      [attachedPoints, "Staff-attached points"],
      [papersWithoutStaff.length, "Papers missing staff"]
    ].map(([value, label]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join("");

    if (!summaries.length) {
      gridElement.innerHTML = `<div class="empty-state compact">No teaching staff entered yet. Add staff names in the Papers tab.</div>`;
      return;
    }

    const cards = summaries.map((summary) => {
      const learningActivities = uniqueTextList(summary.learningActivities, 5);
      const assessmentPatterns = uniqueTextList(summary.assessmentPatterns, 5);
      const note = state.staffNotes?.[summary.name] || "";
      const profile = normaliseStaffProfile(state.staffProfiles?.[summary.name]);
      return `<article class="staff-card">
        <div class="staff-card-heading">
          <div><h3>${escapeHtml(summary.name)}</h3><p>${summary.papers.length} paper${summary.papers.length === 1 ? "" : "s"} · ${summary.points || 0} attached points</p></div>
          <span>${escapeHtml([...summary.requirements].join(" / "))}</span>
        </div>
        <div class="staff-chip-row">
          <b>Otago levels:</b> ${[...summary.levels].map((item) => `<em>${escapeHtml(item)}</em>`).join("") || "<em>Not set</em>"}
        </div>
        <div class="staff-chip-row">
          <b>NZQCF:</b> ${[...summary.nzqcfLevels].map((item) => `<em>${escapeHtml(item)}</em>`).join("") || "<em>Not set</em>"}
        </div>
        <div class="staff-chip-row">
          <b>Delivery:</b> ${[...summary.deliveryModes].map((item) => `<em>${escapeHtml(item)}</em>`).join("") || "<em>Not set</em>"}
        </div>
        <div class="staff-paper-list">
          ${summary.papers.slice().sort((a, b) => a.level - b.level || a.code.localeCompare(b.code)).map((paperItem) => `
            <button type="button" data-open-paper="${paperItem.id}">
              <b>${escapeHtml(paperCodeLabel(paperItem))}</b>
              <span>${escapeHtml(paperItem.title)}</span>
              <small>${escapeHtml(paperPointsLabel(paperItem))} · ${escapeHtml(paperItem.requirement || "Elective")}</small>
            </button>
          `).join("")}
        </div>
        <div class="staff-patterns">
          <div><b>Programme roles / expertise signals</b><p>${escapeHtml([...summary.roles].join("; ") || "No paper role selected yet.")}</p></div>
          <div><b>Learning activity / pedagogy signals</b><p>${escapeHtml(learningActivities.join("; ") || "No learning activities entered yet.")}</p></div>
          <div><b>Assessment patterns</b><p>${escapeHtml(assessmentPatterns.join("; ") || "No assessment mode entered yet.")}</p></div>
        </div>
        <div class="staff-profile-heading"><b>Staff profile</b>${helpButton("staffProfile", "Staff profile")}</div>
        <div class="staff-profile-grid">
          <label><span>Research areas / interests</span><textarea data-staff-profile-field="researchInterests" data-staff-name="${escapeHtml(summary.name)}" placeholder="e.g. public health policy; infectious disease; health equity">${escapeHtml(profile.researchInterests)}</textarea></label>
          <label><span>Teaching approaches / strengths</span><textarea data-staff-profile-field="teachingApproaches" data-staff-name="${escapeHtml(summary.name)}" placeholder="e.g. case-based teaching; problem-based learning; community-engaged learning">${escapeHtml(profile.teachingApproaches)}</textarea></label>
          <label><span>Assessment formats / experience</span><textarea data-staff-profile-field="assessmentExperience" data-staff-name="${escapeHtml(summary.name)}" placeholder="e.g. ICA; portfolio; oral presentation; case study; exam">${escapeHtml(profile.assessmentExperience)}</textarea></label>
          <label><span>Student cohorts / supervision</span><textarea data-staff-profile-field="studentCohorts" data-staff-name="${escapeHtml(summary.name)}" placeholder="e.g. first year; senior students; postgraduate students; research supervision">${escapeHtml(profile.studentCohorts)}</textarea></label>
        </div>
        <label class="staff-note"><span>Workload / expertise note for Actions</span><textarea data-staff-note="${escapeHtml(summary.name)}" placeholder="Add workload, capacity, expertise, or succession-risk notes. These carry to Actions.">${escapeHtml(note)}</textarea></label>
      </article>`;
    }).join("");

    const missing = papersWithoutStaff.length
      ? `<section class="staff-missing"><h3>Papers Without Teaching Staff</h3><p>${papersWithoutStaff.map((paperItem) => `${paperCodeLabel(paperItem)} · ${paperItem.title}`).join("; ")}</p></section>`
      : "";
    gridElement.innerHTML = `${cards}${missing}`;
  }

  function renderPloEvidenceSummary() {
    const levels = getLevelBands().map((band) => ({
      label: band.label,
      test: (level) => level >= band.min && level <= band.max
    }));
    const rows = state.plos.map((plo) => {
      const cells = levels.map(({ test }) => {
        const items = state.assessments
          .filter((assessmentItem) => assessmentItem.evidence?.[plo.id] && assessmentOtagoLevels(assessmentItem).some((level) => test(level)))
          .map((assessmentItem) => {
            const paperItem = state.papers.find((paperValue) => paperValue.id === assessmentItem.paperId);
            return `<span class="evidence-pill" data-value="${assessmentItem.evidence[plo.id]}">${escapeHtml(paperItem ? paperCodeLabel(paperItem) : "Unassigned")} · ${escapeHtml(assessmentItem.name)} (${escapeHtml(assessmentItem.evidence[plo.id])}, ${escapeHtml(assessmentSideLabel(assessmentItem))})</span>`;
          }).join("");
        return `<td>${items || `<span class="muted-text">No evidence mapped</span>`}</td>`;
      }).join("");
      return `<tr><td><b>${escapeHtml(plo.code)}</b><span>${escapeHtml(plo.title)}</span></td>${cells}</tr>`;
    }).join("");
    byId("plo-evidence-summary").innerHTML = `<thead><tr><th>PLO</th>${levels.map((level) => `<th>${level.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
  }

  function renderActions() {
    const diagnosis = collectDiagnosisNotes();
    byId("diagnosis-inbox").innerHTML = `<div class="empty-state compact">Diagnosis notes and actions are combined in the table below.</div>`;
    const diagnosisRows = diagnosis.map((note) => actionRow(note, actionForDiagnosis(note.id))).join("");
    const standaloneRows = state.actions
      .filter((action) => !action.sourceId)
      .map((action) => standaloneActionRow(action))
      .join("");
    byId("action-board").innerHTML = `
      <div class="action-table-wrap">
        <table class="action-table">
          <thead><tr><th>Diagnosis note</th><th>Decision / action</th><th>Track</th><th>Owner</th><th>Notes</th></tr></thead>
          <tbody>${diagnosisRows || `<tr><td colspan="5">No diagnosis notes yet.</td></tr>`}${standaloneRows}</tbody>
        </table>
      </div>`;
  }

  function actionForDiagnosis(sourceId) {
    return state.actions.find((action) => action.sourceId === sourceId) || null;
  }

  function ensureDiagnosisAction(sourceId, fallbackTitle) {
    let item = actionForDiagnosis(sourceId);
    if (!item) {
      item = { id: uid("action"), sourceId, title: fallbackTitle, decision: "", owner: "", due: "", status: "To do", notes: "" };
      state.actions.push(item);
    }
    return item;
  }

  function actionRow(note, action) {
    return `<tr data-diagnosis-source="${escapeHtml(note.id)}" data-diagnosis-title="${escapeHtml(note.title)}">
      <td><span class="source-label">${escapeHtml(note.source)}</span><b>${escapeHtml(note.title)}</b><p>${escapeHtml(note.note)}</p></td>
      <td><textarea data-note-action-field="decision" placeholder="What decision or action follows from this diagnosis?">${escapeHtml(action?.decision || note.decision || "")}</textarea></td>
      <td><select data-note-action-field="status">
        ${["To do", "In progress", "Completed"].map((status) => `<option ${((action?.status || "To do") === status) ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
      <td><input data-note-action-field="owner" value="${escapeHtml(action?.owner || "")}" placeholder="Owner"></td>
      <td><textarea data-note-action-field="notes" placeholder="Follow-up notes">${escapeHtml(action?.notes || "")}</textarea></td>
    </tr>`;
  }

  function standaloneActionRow(action) {
    return `<tr data-standalone-action="${action.id}">
      <td><span class="source-label">Standalone action</span><b>${escapeHtml(action.title)}</b><p>${escapeHtml(action.decision || "")}</p></td>
      <td><textarea data-standalone-action-field="decision">${escapeHtml(action.decision || "")}</textarea></td>
      <td><select data-standalone-action-field="status">
        ${["To do", "In progress", "Completed"].map((status) => `<option ${action.status === status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
      <td><input data-standalone-action-field="owner" value="${escapeHtml(action.owner || "")}"></td>
      <td><textarea data-standalone-action-field="notes">${escapeHtml(action.notes || "")}</textarea></td>
    </tr>`;
  }

  function collectDiagnosisNotes() {
    const notes = [];
    Object.entries(state.notes || {}).forEach(([paperId, note]) => {
      if (!note?.trim()) return;
      const paperItem = state.papers.find((item) => item.id === paperId);
      notes.push({
        id: `program:${paperId}`,
        source: "Program mapping note",
        title: paperItem ? `${paperCodeLabel(paperItem)} · ${paperItem.title}` : "Programme note",
        note,
        decision: ""
      });
    });
    state.papers.forEach((paperItem) => {
      if (paperItem.diagnosisNote?.trim()) {
        notes.push({
          id: `paper:${paperItem.id}`,
          source: "Paper diagnosis note",
          title: `${paperCodeLabel(paperItem)} · ${paperItem.title}`,
          note: paperItem.diagnosisNote,
          decision: ""
        });
      }
    });
    state.assessments.forEach((assessmentItem) => {
      if (assessmentItem.diagnosisNote?.trim()) {
        const paperItem = state.papers.find((item) => item.id === assessmentItem.paperId);
        notes.push({
          id: `assessment:${assessmentItem.id}`,
          source: "Assessment diagnosis note",
          title: `${paperItem ? paperCodeLabel(paperItem) : "Unassigned"} · ${assessmentItem.name}`,
          note: assessmentItem.diagnosisNote,
          decision: ""
        });
      }
    });
    Object.entries(state.staffNotes || {}).forEach(([staffName, note]) => {
      if (!note?.trim()) return;
      notes.push({
        id: `staff:${staffName}`,
        source: "Staff workload note",
        title: staffName,
        note,
        decision: ""
      });
    });
    return notes;
  }

  function openDialog(config) {
    dialogContext = config;
    byId("dialog-eyebrow").textContent = config.eyebrow || "Edit";
    byId("dialog-title").textContent = config.title;
    byId("dialog-fields").innerHTML = config.fields.map(fieldHtml).join("");
    byId("dialog-delete-button").hidden = !config.onDelete;
    byId("edit-dialog").showModal();
  }

  function fieldHtml(field) {
    const value = escapeHtml(field.value ?? "");
    if (field.type === "html") {
      return `<div class="dialog-field html-field">${field.html || ""}</div>`;
    }
    if (field.type === "textarea") {
      return `<div class="dialog-field"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? "required" : ""}>${value}</textarea></div>`;
    }
    if (field.type === "select") {
      return `<div class="dialog-field"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map((option) => `<option value="${escapeHtml(option.value ?? option)}" ${(option.value ?? option) == field.value ? "selected" : ""}>${escapeHtml(option.label ?? option)}</option>`).join("")}</select></div>`;
    }
    return `<div class="dialog-field"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || "text"}" value="${value}" ${field.required ? "required" : ""}></div>`;
  }

  function switchView(view) {
    flushDeferredRender();
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
    $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
    if (view === "programme") requestAnimationFrame(drawConnections);
    if (view === "paper") {
      renderPaperList();
      renderPaperEditor();
    }
    if (view === "staff") renderStaffWorkload();
    applyReadOnlyStateSoon();
  }

  function addPlo() {
    if (!canEditWorkspace()) return;
    openDialog({
      title: "Add Programme Learning Outcome",
      fields: [
        { name: "code", label: "Code", value: `PLO${state.plos.length + 1}`, required: true },
        { name: "title", label: "Short title", value: "", required: true },
        { name: "description", label: "Outcome statement", value: "", type: "textarea", required: true }
      ],
      onSave(values) {
        const id = uid("plo");
        state.plos.push({ id, ...values });
        state.papers.forEach((item) => {
          state.alignments[item.id] ||= {};
          state.alignments[item.id][id] = "";
        });
        renderPlos(); renderMappingTable(); renderPaperEditor(); renderAssessments(); scheduleSave(); toast("PLO added");
      }
    });
  }

  function editPlo(id) {
    if (!canEditWorkspace()) return;
    const item = state.plos.find((plo) => plo.id === id);
    if (!item) return;
    openDialog({
      title: `Edit ${item.code}`,
      fields: [
        { name: "code", label: "Code", value: item.code, required: true },
        { name: "title", label: "Short title", value: item.title, required: true },
        { name: "description", label: "Outcome statement", value: item.description, type: "textarea", required: true }
      ],
      onSave(values) { Object.assign(item, values); renderPlos(); renderMappingTable(); renderPaperEditor(); renderAssessments(); scheduleSave(); },
      onDelete() {
        state.plos = state.plos.filter((plo) => plo.id !== id);
        Object.values(state.alignments).forEach((alignment) => delete alignment[id]);
        state.papers.forEach((paperItem) => {
          delete paperItem.ploLinks?.[id];
          delete paperItem.activityLinks?.[id];
          delete paperItem.secondaryPloLinks?.[id];
          delete paperItem.secondaryActivityLinks?.[id];
        });
        state.assessments.forEach((assessmentItem) => delete assessmentItem.evidence[id]);
        renderPlos(); renderMappingTable(); renderPaperEditor(); renderAssessments(); scheduleSave(); toast("PLO deleted");
      }
    });
  }

  function addPaper() {
    if (!canEditWorkspace()) return;
    openDialog({
      title: "Add Paper",
      fields: [
        { name: "code", label: "Paper code", value: "", required: true },
        { name: "title", label: "Paper title", value: "", required: true },
        { name: "structure", label: "Paper structure", value: "Single code", type: "select", options: PAPER_STRUCTURES },
        { name: "secondaryCode", label: "Second paper code", value: "" },
        { name: "teachingStaff", label: "Teaching staff", value: "", type: "textarea" },
        { name: "points", label: "Points", value: "", type: "number" },
        { name: "level", label: "Otago paper code level", value: String(paperLevelOptions()[0] || 100), type: "select", options: paperLevelOptions().map(String) },
        { name: "secondaryLevel", label: "Second Otago paper code level", value: "", type: "select", options: [{ value: "", label: "Not set" }, ...paperLevelOptions().map((level) => ({ value: String(level), label: String(level) }))] },
        { name: "nzqfLevel", label: "NZQCF level", value: "", type: "select", options: [{ value: "", label: "Not set" }, ...nzqfLevelOptions().map((level) => ({ value: String(level), label: `NZQCF Level ${level}` }))] },
        { name: "secondaryNzqfLevel", label: "Second NZQCF level", value: "", type: "select", options: [{ value: "", label: "Not set" }, ...nzqfLevelOptions().map((level) => ({ value: String(level), label: `NZQCF Level ${level}` }))] },
        { name: "requirement", label: "Programme requirement", value: "Elective", type: "select", options: PAPER_REQUIREMENTS },
        { name: "deliveryMode", label: "Delivery mode", value: "On campus", type: "select", options: DELIVERY_MODES }
      ],
      onSave(values) {
        const id = uid("paper");
        const level = Number(values.level);
        const bands = getLevelBands();
        const column = Math.max(0, bands.findIndex((band) => level >= band.min && level <= band.max));
        const columnWidth = Math.max(280, Math.floor(1360 / Math.max(1, bands.length)));
        const item = paper(id, values.code, values.title, level, 70 + column * columnWidth, 100 + (state.papers.length % 3) * 190, []);
        item.structure = normalisePaperStructure(values.structure);
        item.secondaryCode = values.secondaryCode || "";
        item.secondaryLevel = Number(values.secondaryLevel) || "";
        item.secondaryNzqfLevel = normaliseNzqfLevel(values.secondaryNzqfLevel);
        item.nzqfLevel = normaliseNzqfLevel(values.nzqfLevel);
        item.requirement = normaliseRequirement(values.requirement);
        item.deliveryMode = normaliseDeliveryMode(values.deliveryMode);
        item.points = normalisePaperPoints(values.points);
        item.teachingStaff = values.teachingStaff || "";
        state.papers.push(item);
        state.alignments[id] = Object.fromEntries(state.plos.map((plo) => [plo.id, ""]));
        selectedPaperId = id;
        renderAll(); scheduleSave(); toast("Paper added");
      }
    });
  }

  function deletePaper(id) {
    if (!canEditWorkspace()) return;
    if (!confirm("Delete this paper and its mapping, connections, and assessments?")) return;
    state.papers = state.papers.filter((item) => item.id !== id);
    delete state.alignments[id];
    delete state.notes[id];
    state.connections = state.connections.filter((item) => item.from !== id && item.to !== id);
    state.assessments = state.assessments.filter((item) => item.paperId !== id);
    selectedPaperId = state.papers[0]?.id || null;
    renderAll(); scheduleSave(); toast("Paper deleted");
  }

  function addAssessment(defaultPaperId = "") {
    if (!canEditWorkspace()) return;
    if (!state.papers.length) return toast("Add a paper first");
    const initialPaperId = defaultPaperId || selectedPaperId || state.papers[0].id;
    openDialog({
      title: "Add Assessment Item",
      fields: [
        { name: "paperId", label: "Paper", value: initialPaperId, type: "select", options: state.papers.map((item) => ({ value: item.id, label: `${paperCodeLabel(item)} · ${item.title}` })) },
        { name: "name", label: "Assessment name", value: "", required: true },
        { name: "side", label: "Code side (for double-coded papers)", value: "Whole paper", type: "select", options: ASSESSMENT_SIDES },
        { name: "week", label: "Due week", value: "6", type: "number" },
        { name: "weight", label: "Weight %", value: "20", type: "number" },
        { name: "mode", label: "Mode / type", value: "" },
        { name: "purpose", label: "Assessment role / contribution", value: "" },
        { name: "aiContext", label: "AI-ready / resilient", value: "" },
        { name: "diagnosisNote", label: "Diagnosis note", value: "", type: "textarea" }
      ],
      onSave(values) {
        const paperItem = state.papers.find((item) => item.id === values.paperId);
        const side = isDoubleCodedPaper(paperItem) ? normaliseAssessmentSide(values.side) : "Whole paper";
        state.assessments.push(assessment(uid("assessment"), values.paperId, values.name, Number(values.week), Number(values.weight), values.mode, values.aiContext, {}, values.diagnosisNote, values.purpose, side));
        renderPaperEditor(); renderAssessments(); renderStaffWorkload(); renderActions(); scheduleSave(); toast("Assessment added");
      }
    });
  }

  function addAction() {
    if (!canEditWorkspace()) return;
    openDialog({
      title: "Add Action",
      fields: [
        { name: "title", label: "Action", value: "", required: true },
        { name: "decision", label: "Decision / rationale", value: "", type: "textarea" },
        { name: "owner", label: "Owner", value: "" },
        { name: "due", label: "Due date", value: "", type: "date" },
        { name: "status", label: "Status", value: "To do", type: "select", options: ["To do","In progress","Completed"] },
        { name: "notes", label: "Notes", value: "", type: "textarea" }
      ],
      onSave(values) {
        state.actions.push({ id: uid("action"), ...values });
        renderActions(); scheduleSave(); toast("Action added");
      }
    });
  }

  function editAction(id) {
    if (!canEditWorkspace()) return;
    const item = state.actions.find((action) => action.id === id);
    if (!item) return;
    openDialog({
      title: "Edit Action",
      fields: [
        { name: "title", label: "Action", value: item.title, required: true },
        { name: "decision", label: "Decision / rationale", value: item.decision || "", type: "textarea" },
        { name: "owner", label: "Owner", value: item.owner },
        { name: "due", label: "Due date", value: item.due, type: "date" },
        { name: "status", label: "Status", value: item.status === "Done" ? "Completed" : item.status, type: "select", options: ["To do","In progress","Completed"] },
        { name: "notes", label: "Notes", value: item.notes, type: "textarea" }
      ],
      onSave(values) { Object.assign(item, values); renderActions(); scheduleSave(); },
      onDelete() { state.actions = state.actions.filter((action) => action.id !== id); renderActions(); scheduleSave(); }
    });
  }

  function editProgrammeSettings() {
    if (!canEditWorkspace()) return;
    const fields = [
      { name: "programme", label: "Programme / major name", value: state.meta.programme, required: true },
      { name: "department", label: "Department / school", value: state.meta.department },
      { name: "version", label: "Version label", value: state.meta.version },
      { name: "workshopDate", label: "Workshop date", value: state.meta.workshopDate, type: "date" },
      { name: "participants", label: "Participants", value: state.meta.participants, type: "textarea" }
    ];
    if (canManageTemplate(false)) {
      fields.splice(1, 0, { name: "workspaceTitle", label: "Workspace/link title", value: state.meta.workspaceTitle || getWorkspaceTitle() });
    }
    openDialog({
      title: "Programme Settings",
      fields,
      async onSave(values) {
        Object.assign(state.meta, values);
        renderHeader();
        if (canManageTemplate(false)) {
          try {
            await flushPendingWorkspaceSave("Programme settings saved locally");
            toast(cloud.enabled ? "Programme settings updated and synced" : "Programme settings updated");
          } catch (error) {
            alert(`Unable to sync programme settings: ${error.message}`);
            throw error;
          }
        } else {
          scheduleSave();
        }
      }
    });
  }

  function editTemplateWording() {
    if (!canManageTemplate()) return;
    const w = getWording();
    openDialog({
      title: "Template Wording",
      fields: [
        { name: "programmeTab", label: "Program tab label", value: w.tabs.programme },
        { name: "assessmentTab", label: "Assessments tab label", value: w.tabs.assessment },
        { name: "paperTab", label: "Papers tab label", value: w.tabs.paper },
        { name: "staffTab", label: "Staff / workload tab label", value: w.tabs.staff },
        { name: "actionsTab", label: "Actions tab label", value: w.tabs.actions },
        { name: "programmeTitle", label: "Program page title", value: w.programme.title },
        { name: "programmeHelp", label: "Program page description", value: w.programme.help, type: "textarea" },
        { name: "ploTitle", label: "PLO section title", value: w.programme.ploTitle },
        { name: "ploHelp", label: "PLO section help text", value: w.programme.ploHelp, type: "textarea" },
        { name: "alignmentTitle", label: "Alignment section title", value: w.programme.alignmentTitle },
        { name: "alignmentHelp", label: "Alignment section help text", value: w.programme.alignmentHelp, type: "textarea" },
        { name: "introduced", label: "I label", value: w.alignment.introduced },
        { name: "developed", label: "D label", value: w.alignment.developed },
        { name: "mastered", label: "M label", value: w.alignment.mastered },
        { name: "pathwaysTitle", label: "Pathways/network section title", value: w.programme.pathwaysTitle },
        { name: "pathwaysHelp", label: "Pathways/network section help text", value: w.programme.pathwaysHelp, type: "textarea" },
        { name: "levelBands", label: "Level bands (one per line: Label | Description | Min | Max | Default level)", value: levelBandsToText(), type: "textarea" },
        { name: "moveLabel", label: "Move mode label", value: w.network.move },
        { name: "requiredLabel", label: "Required connection label", value: w.network.required },
        { name: "recommendedLabel", label: "Recommended connection label", value: w.network.recommended },
        { name: "relatedLabel", label: "Related connection label", value: w.network.related },
        { name: "removeLabel", label: "Remove line mode label", value: w.network.remove || "Remove line" },
        { name: "assessmentTitle", label: "Assessment page title", value: w.assessment.title },
        { name: "assessmentHelp", label: "Assessment page description", value: w.assessment.help, type: "textarea" },
        { name: "paperTitle", label: "Paper page title", value: w.paper.title },
        { name: "paperHelp", label: "Paper page description", value: w.paper.help, type: "textarea" },
        { name: "staffTitle", label: "Staff page title", value: w.staff.title },
        { name: "staffHelp", label: "Staff page description", value: w.staff.help, type: "textarea" },
        { name: "actionsTitle", label: "Actions page title", value: w.actions.title },
        { name: "actionsHelp", label: "Actions page description", value: w.actions.help, type: "textarea" }
      ],
      async onSave(values) {
        state.wording = normaliseWording({
          tabs: {
            programme: values.programmeTab,
            assessment: values.assessmentTab,
            paper: values.paperTab,
            staff: values.staffTab,
            actions: values.actionsTab
          },
          programme: {
            title: values.programmeTitle,
            help: values.programmeHelp,
            ploTitle: values.ploTitle,
            ploHelp: values.ploHelp,
            alignmentTitle: values.alignmentTitle,
            alignmentHelp: values.alignmentHelp,
            pathwaysTitle: values.pathwaysTitle,
            pathwaysHelp: values.pathwaysHelp,
            addPlo: getWording().programme.addPlo,
            addPaper: getWording().programme.addPaper,
            levelBands: parseLevelBands(values.levelBands)
          },
          alignment: {
            introduced: values.introduced,
            developed: values.developed,
            mastered: values.mastered
          },
          network: {
            ...getWording().network,
            move: values.moveLabel,
            required: values.requiredLabel,
            recommended: values.recommendedLabel,
            related: values.relatedLabel,
            remove: values.removeLabel
          },
          assessment: {
            ...getWording().assessment,
            title: values.assessmentTitle,
            help: values.assessmentHelp
          },
          paper: {
            ...getWording().paper,
            title: values.paperTitle,
            help: values.paperHelp
          },
          staff: {
            ...getWording().staff,
            title: values.staffTitle,
            help: values.staffHelp
          },
          actions: {
            ...getWording().actions,
            title: values.actionsTitle,
            help: values.actionsHelp
          }
        });
        renderAll();
        try {
          await flushPendingWorkspaceSave("Template wording saved locally");
          toast(cloud.enabled ? "Template wording updated and synced" : "Template wording updated");
        } catch (error) {
          alert(`Unable to sync template wording: ${error.message}`);
          throw error;
        }
      }
    });
  }

  function exportJson() {
    dedupeConnections();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const safeName = (state.meta.programme || "curriculum-map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeName || "curriculum-map"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("JSON exported");
  }

  function printableText(value) {
    return escapeHtml(value || "").replace(/\n/g, "<br>");
  }

  function printableRoles(paperItem) {
    return (paperItem.roles || []).length ? paperItem.roles.join("; ") : "No role selected";
  }

  function printableAlignmentValue(paperId, ploId) {
    return state.alignments[paperId]?.[ploId] || "–";
  }

  function printableRelationshipRows() {
    const validPaperIds = new Set(state.papers.map((paperItem) => paperItem.id));
    return normaliseConnections(state.connections, validPaperIds)
      .slice()
      .sort((a, b) => {
        const typeOrder = (CONNECTION_TYPE_ORDER[a.type] ?? 99) - (CONNECTION_TYPE_ORDER[b.type] ?? 99);
        if (typeOrder) return typeOrder;
        return paperLabel(a.from).localeCompare(paperLabel(b.from)) || paperLabel(a.to).localeCompare(paperLabel(b.to));
      })
      .map((connection) => `<tr><td>${escapeHtml(connectionTypeLabel(connection.type))}</td><td>${escapeHtml(paperLabel(connection.from))}</td><td>${escapeHtml(paperLabel(connection.to))}</td></tr>`)
      .join("") || `<tr><td colspan="3">No relationships mapped.</td></tr>`;
  }

  function printableActionRows() {
    const diagnosis = collectDiagnosisNotes();
    const diagnosisRows = diagnosis.map((note) => {
      const action = actionForDiagnosis(note.id);
      return `<tr>
        <td>${escapeHtml(note.source)}<br><b>${escapeHtml(note.title)}</b><br>${printableText(note.note)}</td>
        <td>${printableText(action?.decision || "")}</td>
        <td>${escapeHtml(action?.status || "To do")}</td>
        <td>${escapeHtml(action?.owner || "")}</td>
        <td>${printableText(action?.notes || "")}</td>
      </tr>`;
    }).join("");
    const standaloneRows = state.actions
      .filter((action) => !action.sourceId)
      .map((action) => `<tr>
        <td>Standalone action<br><b>${escapeHtml(action.title)}</b></td>
        <td>${printableText(action.decision || "")}</td>
        <td>${escapeHtml(action.status || "To do")}</td>
        <td>${escapeHtml(action.owner || "")}</td>
        <td>${printableText(action.notes || "")}</td>
      </tr>`).join("");
    return diagnosisRows || standaloneRows ? `${diagnosisRows}${standaloneRows}` : `<tr><td colspan="5">No actions or diagnosis notes.</td></tr>`;
  }

  function printableStaffRows() {
    const rows = staffWorkloadSummaries().map((summary) => {
      const profile = normaliseStaffProfile(state.staffProfiles?.[summary.name]);
      const profileText = [
        profile.researchInterests ? `Research areas / interests: ${profile.researchInterests}` : "",
        profile.teachingApproaches ? `Teaching approaches / strengths: ${profile.teachingApproaches}` : "",
        profile.assessmentExperience ? `Assessment formats / experience: ${profile.assessmentExperience}` : "",
        profile.studentCohorts ? `Student cohorts / supervision: ${profile.studentCohorts}` : "",
        state.staffNotes?.[summary.name] ? `Workload / expertise note: ${state.staffNotes[summary.name]}` : ""
      ].filter(Boolean).join("\n");
      const papers = summary.papers
        .slice()
        .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
        .map((paperItem) => `${paperCodeLabel(paperItem)} ${paperPointsLabel(paperItem)}`)
        .join("; ");
      const learningActivities = uniqueTextList(summary.learningActivities, 4).join("; ");
      const assessmentPatterns = uniqueTextList(summary.assessmentPatterns, 4).join("; ");
      return `<tr>
        <td><b>${escapeHtml(summary.name)}</b><br>${printableText(profileText || "")}</td>
        <td>${printableText(papers || "No papers")}</td>
        <td>${escapeHtml(summary.points || 0)}</td>
        <td>${escapeHtml([...summary.levels].join("; ") || "Not set")}</td>
        <td>${escapeHtml([...summary.nzqcfLevels].join("; ") || "Not set")}</td>
        <td>${printableText([...summary.roles].join("; ") || "No paper role selected.")}</td>
        <td>${printableText(learningActivities || "No learning activities entered.")}</td>
        <td>${printableText(assessmentPatterns || "No assessment mode entered.")}</td>
      </tr>`;
    }).join("");
    return rows || `<tr><td colspan="8">No teaching staff entered.</td></tr>`;
  }

  function printableReportHtml() {
    const sortedPapers = state.papers.slice().sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
    const reportDate = formatSnapshotTimestamp();
    const ploHead = state.plos.map((plo) => `<th>${escapeHtml(plo.code)}</th>`).join("");
    const alignmentRows = sortedPapers.map((paperItem) => `<tr>
      <td><b>${escapeHtml(paperCodeLabel(paperItem))}</b><br>${escapeHtml(paperItem.title)}<br><small>${escapeHtml(paperMetaLabel(paperItem))} · ${escapeHtml(paperItem.requirement)}</small></td>
      ${state.plos.map((plo) => `<td>${escapeHtml(printableAlignmentValue(paperItem.id, plo.id))}</td>`).join("")}
      <td>${printableText(state.notes[paperItem.id] || "")}</td>
    </tr>`).join("");
    const assessmentRows = state.assessments.map((item) => `<tr>
      <td>${escapeHtml(paperLabel(item.paperId))}</td>
      <td>${escapeHtml(assessmentSideLabel(item))}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.week)}</td>
      <td>${escapeHtml(item.weight)}%</td>
      <td>${escapeHtml(item.mode || "")}</td>
      <td>${printableText(item.purpose || "")}</td>
      <td>${printableText(item.aiContext || "")}</td>
      <td>${printableText(item.diagnosisNote || "")}</td>
    </tr>`).join("") || `<tr><td colspan="9">No assessment items.</td></tr>`;
    const evidenceRows = state.assessments.map((item) => `<tr>
      <td>${escapeHtml(paperLabel(item.paperId))}<br><b>${escapeHtml(item.name)}</b></td>
      ${state.plos.map((plo) => `<td>${escapeHtml(item.evidence?.[plo.id] || "–")}</td>`).join("")}
    </tr>`).join("") || `<tr><td colspan="${state.plos.length + 1}">No assessment evidence mapped.</td></tr>`;
    const commentsRows = reviewComments.map((comment) => `<tr>
      <td>${escapeHtml(comment.author || "Anonymous reviewer")}</td>
      <td>${escapeHtml(comment.target || "Workspace")}</td>
      <td>${escapeHtml(formatSnapshotTimestamp(new Date(comment.createdAt || Date.now())))}</td>
      <td>${printableText(comment.body || "")}</td>
    </tr>`).join("") || `<tr><td colspan="4">No review comments.</td></tr>`;
    const paperSections = sortedPapers.map((paperItem) => {
      const alignedPlos = supportedPlos(paperItem);
      const relationships = paperNetworkConnections(paperItem)
        .map(({ connection, other, isOutgoing }) => `${connectionTypeLabel(connection.type)}: ${relationshipDirectionLabel(connection, isOutgoing)} ${other ? `${paperCodeLabel(other)} · ${other.title}` : "unknown paper"}`)
        .join("\n");
      const assessments = paperAssessments(paperItem.id)
        .map((item) => `${item.name}; ${assessmentSideLabel(item)}; week ${item.week}; ${item.weight}%; ${item.mode}; ${assessmentPloSummary(item)}`)
        .join("\n");
      const secondSideInfo = isDoubleCodedPaper(paperItem)
        ? `
            <tr><th>Second paper code</th><td>${escapeHtml(paperItem.secondaryCode || "Not set")}</td><th>Second Otago level</th><td>${escapeHtml(paperItem.secondaryLevel || "Not set")}</td></tr>
            <tr><th>Second NZQCF level</th><td colspan="3">${escapeHtml(paperItem.secondaryNzqfLevel || "Not set")}</td></tr>
            <tr><th>Second-side CLOs</th><td colspan="3">${printableText(paperItem.secondaryLearningOutcomes || "")}</td></tr>
            <tr><th>Second-side learning activities</th><td colspan="3">${printableText(paperItem.secondaryLearningActivities || "")}</td></tr>
            <tr><th>Second-side assessment notes</th><td colspan="3">${printableText(paperItem.secondaryAssessmentNotes || "")}</td></tr>
          `
        : "";
      return `<section class="paper-print-block">
        <h3>${escapeHtml(paperCodeLabel(paperItem))} · ${escapeHtml(paperItem.title)}</h3>
        <table>
          <tbody>
            <tr><th>Paper structure</th><td colspan="3">${escapeHtml(normalisePaperStructure(paperItem.structure))}</td></tr>
            <tr><th>Otago paper code level</th><td>${escapeHtml(paperItem.level)}</td><th>NZQCF level</th><td>${escapeHtml(paperItem.nzqfLevel || "Not set")}</td></tr>
            ${secondSideInfo}
            <tr><th>Points</th><td>${escapeHtml(paperItem.points || "Not set")}</td><th>Requirement</th><td>${escapeHtml(paperItem.requirement || "Elective")}</td></tr>
            <tr><th>Delivery mode</th><td colspan="3">${escapeHtml(normaliseDeliveryMode(paperItem.deliveryMode))}</td></tr>
            <tr><th>Review status</th><td colspan="3">${escapeHtml(paperItem.status || "")}</td></tr>
            <tr><th>Teaching staff</th><td colspan="3">${printableText(staffNamesForPaper(paperItem).join("; ") || "Not set")}</td></tr>
            <tr><th>Role / contribution</th><td colspan="3">${escapeHtml(printableRoles(paperItem))}</td></tr>
            <tr><th>Supported PLOs</th><td colspan="3">${escapeHtml(alignedPlos.map((plo) => `${plo.code} ${plo.level}`).join("; ") || "None mapped")}</td></tr>
            <tr><th>Network relationships</th><td colspan="3">${printableText(relationships || "No network relationships mapped.")}</td></tr>
            <tr><th>Paper description</th><td colspan="3">${printableText(paperItem.description || "")}</td></tr>
            <tr><th>Course Learning Outcomes</th><td colspan="3">${printableText(paperItem.learningOutcomes || "")}</td></tr>
            <tr><th>Learning Activities</th><td colspan="3">${printableText(paperItem.learningActivities || "")}</td></tr>
            <tr><th>Key concepts</th><td colspan="3">${printableText(paperItem.concepts || "")}</td></tr>
            <tr><th>Assessment</th><td colspan="3">${printableText(assessments || "No assessment items.")}</td></tr>
            <tr><th>Diagnosis note</th><td colspan="3">${printableText(paperItem.diagnosisNote || "")}</td></tr>
          </tbody>
        </table>
      </section>`;
    }).join("");

    return `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(getWorkspaceTitle())} PDF report</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #182536; font: 9.5px/1.38 Arial, sans-serif; background: white; }
          h1 { margin: 0 0 4px; font-size: 22px; color: #102b46; }
          h2 { margin: 18px 0 8px; padding-top: 8px; border-top: 2px solid #102b46; font-size: 15px; color: #102b46; break-after: avoid; }
          h3 { margin: 12px 0 6px; font-size: 12px; color: #102b46; break-after: avoid; }
          p { margin: 0 0 6px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; page-break-inside: auto; }
          th, td { border: 1px solid #ccd7e3; padding: 4px 5px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
          th { background: #eef5fc; color: #42536a; text-align: left; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          .cover { margin-bottom: 12px; }
          .muted { color: #5f6f83; }
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .plo-card { border: 1px solid #ccd7e3; border-radius: 8px; padding: 7px; margin-bottom: 6px; break-inside: avoid; }
          .plo-card b { color: #102b46; }
          .paper-print-block { break-inside: avoid; page-break-inside: avoid; }
          .section { break-before: auto; }
        </style>
      </head>
      <body>
        <section class="cover">
          <h1>${escapeHtml(state.meta.programme || "Curriculum Mapping Workspace")}</h1>
          <p class="muted">${escapeHtml(getWorkspaceTitle())} · Printed ${escapeHtml(reportDate)}</p>
          <table><tbody>
            <tr><th>Department / school</th><td>${escapeHtml(state.meta.department || "")}</td><th>Version</th><td>${escapeHtml(state.meta.version || "")}</td></tr>
            <tr><th>Workshop date</th><td>${escapeHtml(state.meta.workshopDate || "")}</td><th>Participants</th><td>${printableText(state.meta.participants || "")}</td></tr>
          </tbody></table>
        </section>

        <h2>Programme Learning Outcomes</h2>
        <div class="two-col">${state.plos.map((plo) => `<article class="plo-card"><b>${escapeHtml(plo.code)} · ${escapeHtml(plo.title)}</b><p>${printableText(plo.description)}</p></article>`).join("") || "<p>No PLOs entered.</p>"}</div>

        <h2>Program Alignment Matrix</h2>
        <table><thead><tr><th>Paper</th>${ploHead}<th>Discussion notes</th></tr></thead><tbody>${alignmentRows || `<tr><td colspan="${state.plos.length + 2}">No papers entered.</td></tr>`}</tbody></table>

        <h2>Student Pathways And Programme Network</h2>
        <table><thead><tr><th>Relationship type</th><th>From paper</th><th>To paper</th></tr></thead><tbody>${printableRelationshipRows()}</tbody></table>

        <h2>Assessment Evidence Matrix</h2>
        <table><thead><tr><th>Assessment item</th>${ploHead}</tr></thead><tbody>${evidenceRows}</tbody></table>

        <h2>Assessment Items</h2>
        <table><thead><tr><th>Paper</th><th>Code side</th><th>Item</th><th>Week</th><th>Weight</th><th>Mode</th><th>Role / contribution</th><th>AI-ready</th><th>Diagnosis note</th></tr></thead><tbody>${assessmentRows}</tbody></table>

        <h2>Paper Details</h2>
        ${paperSections || "<p>No paper details entered.</p>"}

        <h2>Staff</h2>
        <p class="muted">Paper points are attached to named staff for planning discussion; they are not divided across co-teachers and are not an official FTE calculation.</p>
        <table><thead><tr><th>Staff</th><th>Papers</th><th>Attached points</th><th>Otago levels</th><th>NZQCF levels</th><th>Roles / expertise signals</th><th>Learning activity signals</th><th>Assessment patterns</th></tr></thead><tbody>${printableStaffRows()}</tbody></table>

        <h2>Decisions And Actions</h2>
        <table><thead><tr><th>Diagnosis note</th><th>Decision / action</th><th>Status</th><th>Owner</th><th>Notes</th></tr></thead><tbody>${printableActionRows()}</tbody></table>

        <h2>Review Comments</h2>
        <table><thead><tr><th>Author</th><th>Target</th><th>Time</th><th>Comment</th></tr></thead><tbody>${commentsRows}</tbody></table>
      </body>
      </html>`;
  }

  async function preparePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Unable to open the printable report. Please allow pop-ups for this site, then try Print / PDF again.");
      return;
    }
    printWindow.document.write("<!doctype html><title>Preparing PDF report</title><p>Preparing printable curriculum mapping report...</p>");
    try {
      if (cloud.enabled) await fetchReviewComments(true);
    } catch (error) {
      console.warn("Unable to include review comments in PDF report", error);
    }
    printWindow.document.open();
    printWindow.document.write(printableReportHtml());
    printWindow.document.close();
    let printed = false;
    const printReport = () => {
      if (printed) return;
      printed = true;
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    };
    printWindow.onload = printReport;
    window.setTimeout(printReport, 700);
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function formatSnapshotTimestamp(date = new Date()) {
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function defaultSnapshotLabel() {
    const programme = state.meta.programme && state.meta.programme !== "Untitled Programme" ? state.meta.programme : "Workspace";
    return `${programme} version · ${formatSnapshotTimestamp()}`;
  }

  function snapshotOptionLabel(item, index, total) {
    const number = total - index;
    const created = item.createdAt ? formatSnapshotTimestamp(new Date(item.createdAt)) : "time unknown";
    return `#${number} · ${item.label} · ${created}`;
  }

  async function fetchCloudVersions() {
    const { data, error } = await cloud.client.rpc("list_curriculum_workspace_versions", {
      workspace_slug: cloud.workspace,
      access_token: cloud.token
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function saveSnapshot() {
    if (!canEditWorkspace()) return;
    openDialog({
      title: "Save Version",
      fields: [
        { name: "label", label: "Version label", value: defaultSnapshotLabel(), required: true },
        { name: "notes", label: "Version notes", value: "", type: "textarea" }
      ],
      async onSave(values) {
        try {
          await flushPendingWorkspaceSave("Preparing version...");
          const snapshotData = normaliseState(clone(state));
          if (cloud.enabled && cloud.canEdit && cloud.client) {
            const { error } = await cloud.client.rpc("create_curriculum_workspace_version", {
              workspace_slug: cloud.workspace,
              access_token: cloud.token,
              version_label: values.label,
              version_notes: values.notes,
              version_data: snapshotData
            });
            if (error) throw error;
            const versions = await fetchCloudVersions();
            toast(`Cloud version saved (${versions.length} total)`);
            return;
          }
          const history = loadHistory();
          history.unshift({
            id: uid("snapshot"),
            label: values.label,
            notes: values.notes,
            createdAt: new Date().toISOString(),
            data: snapshotData
          });
          const savedHistory = history.slice(0, 20);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(savedHistory));
          toast(`Version saved (${savedHistory.length} total)`);
        } catch (error) {
          alert(`Unable to save a version: ${error.message}`);
        }
      }
    });
  }

  function openVersions() {
    if (cloud.enabled && cloud.client) {
      openCloudVersions();
      return;
    }
    const history = loadHistory();
    if (!history.length) {
      toast("No saved versions yet");
      return;
    }
    openDialog({
      title: `Restore Saved Version (${history.length} saved)`,
      fields: [
        {
          name: "snapshotId",
          label: "Saved version",
          value: history[0].id,
          type: "select",
          options: history.map((item, index) => ({
            value: item.id,
            label: snapshotOptionLabel(item, index, history.length)
          }))
        }
      ],
      onSave(values) {
        const snapshot = history.find((item) => item.id === values.snapshotId);
        if (!snapshot || !confirm(`Restore "${snapshot.label}"? Current unsaved changes will be replaced.`)) return;
        state = normaliseState(clone(snapshot.data));
        selectedPaperId = state.papers[0]?.id || null;
        renderAll();
        scheduleSave("Restored and saved");
        toast("Version restored");
      }
    });
  }

  async function openCloudVersions() {
    try {
      const history = await fetchCloudVersions();
      if (!history.length) {
        toast("No cloud versions yet");
        return;
      }
      openDialog({
        title: `Restore Cloud Version (${history.length} saved)`,
        fields: [
          {
            name: "snapshotId",
            label: "Saved version",
            value: history[0].id,
            type: "select",
            options: history.map((item, index) => ({
              value: item.id,
              label: snapshotOptionLabel(item, index, history.length)
            }))
          }
        ],
        async onSave(values) {
          if (!canEditWorkspace()) return;
          const snapshot = history.find((item) => item.id === values.snapshotId);
          if (!snapshot || !confirm(`Restore "${snapshot.label}"? Current cloud data will be replaced.`)) return;
          state = normaliseState(clone(snapshot.data));
          selectedPaperId = state.papers[0]?.id || null;
          renderAll();
          await flushPendingWorkspaceSave("Restored and syncing", { preserveLocalConnections: true });
          toast("Cloud version restored");
        }
      });
    } catch (error) {
      console.error("Unable to load cloud versions", error);
      alert(`Unable to load cloud versions: ${error.message}`);
    }
  }

  async function importJson(file) {
    if (!canManageTemplate()) return;
    try {
      const text = await file.text();
      state = normaliseState(JSON.parse(text));
      selectedPaperId = state.papers[0]?.id || null;
      renderAll();
      await flushPendingWorkspaceSave("Imported and saved", { preserveLocalConnections: true });
      toast("Workspace imported");
    } catch (error) {
      alert(`Unable to import this file: ${error.message}`);
    }
  }

  async function newTemplate() {
    if (!canManageTemplate()) return;
    openDialog({
      eyebrow: "New",
      title: cloud.enabled ? "Create New Cloud Workspace" : "Create New Local Workspace",
      fields: [
        { name: "programme", label: "Programme / workspace name", value: "", required: true }
      ],
      async onSave(values) {
        const programmeName = programmeNameValue(values.programme);
        const nextState = blankWorkspaceState(programmeName, getWording());
        const workspaceTitle = nextState.meta.workspaceTitle;

        if (cloud.enabled) {
          if (!cloud.client && !(await configureCloud())) {
            alert("Cloud collaboration is not configured yet. Add Supabase values to config.js first.");
            return;
          }
          try {
            setCloudStatus("Creating new workspace...");
            const { data, error } = await cloud.client.rpc("create_curriculum_workspace", {
              title: workspaceTitle,
              initial_data: nextState
            });
            if (error) throw error;

            state = normaliseState(data.data || nextState);
            cloud.enabled = true;
            cloud.loaded = true;
            cloud.canEdit = true;
            cloud.canManageTemplate = true;
            cloud.workspace = data.slug;
            cloud.adminToken = data.adminToken || data.editToken;
            cloud.token = cloud.adminToken;
            cloud.editToken = data.editToken;
            cloud.viewToken = data.viewToken;
            cloud.lastUpdatedAt = data.updatedAt || "";
            refreshSessionIdentity();
            const nextUrl = buildWorkspaceUrl(cloud.workspace, cloud.adminToken);
            window.history.replaceState(null, "", nextUrl);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (error) {
              console.warn("Unable to cache new workspace locally", error);
            }
            selectedPaperId = null;
            renderAll();
            updateShareButtons();
            setCloudStatus("Cloud admin setup link", "online");
            byId("save-status").textContent = "Saved to cloud";
            startCloudPolling();
            toast("New workspace created");
          } catch (error) {
            console.error("Unable to create new workspace", error);
            setCloudStatus("Cloud create failed", "error");
            alert(`Unable to create new workspace: ${error.message}`);
          }
          return;
        }

        state = nextState;
        selectedPaperId = null;
        renderAll();
        scheduleSave();
        toast("Blank workspace created");
      }
    });
  }

  function paperLabel(paperId) {
    const paperItem = state.papers.find((item) => item.id === paperId);
    return paperItem ? `${paperCodeLabel(paperItem)} · ${paperItem.title}` : "Unknown paper";
  }

  function assessmentLabel(assessmentId) {
    const item = state.assessments.find((assessmentItem) => assessmentItem.id === assessmentId);
    if (!item) return "Unknown assessment";
    return `${paperLabel(item.paperId)} · ${item.name}`;
  }

  function valueForElement(element) {
    if (!element) return "";
    if (element.isContentEditable || element.getAttribute("contenteditable") === "false") return element.textContent.trim();
    return element.value ?? "";
  }

  function applyPaperFieldValue(paperField) {
    const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
    if (!item) return false;
    const field = paperField.dataset.paperField;
    let nextValue;
    if (field === "level" || field === "secondaryLevel") {
      nextValue = Number(paperField.value);
      if (field === "secondaryLevel" && !paperField.value) nextValue = "";
    } else if (field === "nzqfLevel") {
      nextValue = normaliseNzqfLevel(paperField.value);
    } else if (field === "secondaryNzqfLevel") {
      nextValue = normaliseNzqfLevel(paperField.value);
    } else if (field === "structure") {
      nextValue = normalisePaperStructure(paperField.value);
    } else if (field === "requirement") {
      nextValue = normaliseRequirement(paperField.value);
    } else if (field === "deliveryMode") {
      nextValue = normaliseDeliveryMode(paperField.value);
    } else if (field === "points") {
      nextValue = normalisePaperPoints(paperField.value);
    } else {
      nextValue = paperField.value;
    }
    if (item[field] === nextValue) return false;
    item[field] = nextValue;
    if (["code", "title", "status", "structure", "secondaryCode", "requirement", "deliveryMode", "nzqfLevel", "secondaryNzqfLevel", "level", "secondaryLevel", "points"].includes(field)) deferRender("paperList");
    if (["code", "title", "structure", "secondaryCode", "level", "secondaryLevel", "nzqfLevel", "secondaryNzqfLevel", "requirement", "deliveryMode", "points"].includes(field)) {
      deferRender("mapping", "canvas", "assessments");
    }
    if (["structure", "secondaryCode", "teachingStaff", "points", "level", "secondaryLevel", "nzqfLevel", "secondaryNzqfLevel", "requirement", "deliveryMode", "learningActivities", "secondaryLearningActivities"].includes(field)) deferRender("staff");
    if (["structure", "secondaryCode", "secondaryLevel", "secondaryNzqfLevel"].includes(field)) deferRender("paperEditor");
    if (field === "diagnosisNote" || field === "agreedAction") deferRender("actions");
    return true;
  }

  function applyAssessmentFieldValue(assessmentField) {
    const row = assessmentField.closest("[data-assessment-row]");
    const item = state.assessments.find((assessmentItem) => assessmentItem.id === row?.dataset.assessmentRow);
    if (!item) return false;
    const field = assessmentField.dataset.assessmentField;
    const rawValue = assessmentField.matches("input, textarea, select") ? assessmentField.value : assessmentField.textContent.trim();
    let nextValue = ["week", "weight"].includes(field) ? Number(rawValue) : rawValue;
    if (field === "side") {
      const paperItem = state.papers.find((paperValue) => paperValue.id === item.paperId);
      nextValue = isDoubleCodedPaper(paperItem) ? normaliseAssessmentSide(rawValue) : "Whole paper";
    }
    if (item[field] === nextValue) return false;
    item[field] = nextValue;
    if (["mode", "purpose", "side"].includes(field)) deferRender("staff");
    if (field === "side") deferRender("paperEditor", "assessments");
    if (field === "diagnosisNote") deferRender("actions");
    return true;
  }

  function truncateForLog(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  function editableTrackingTarget(target) {
    return target.closest?.([
      "[data-note-paper]",
      "[data-paper-plo-link]",
      "[data-paper-activity-link]",
      "[data-paper-secondary-plo-link]",
      "[data-paper-secondary-activity-link]",
      "[data-paper-field]",
      "[data-assessment-field]",
      "[data-staff-profile-field]",
      "[data-staff-note]",
      "[data-note-action-field]",
      "[data-standalone-action-field]",
      "[data-connection-field]"
    ].join(","));
  }

  function fieldInfoForElement(element) {
    if (!element) return null;
    if (element.matches("[data-note-paper]")) {
      const paperId = element.dataset.notePaper;
      return { key: `program-note:${paperId}`, label: `Program note for ${paperLabel(paperId)}`, value: valueForElement(element) };
    }
    if (element.matches("[data-paper-plo-link]")) {
      const plo = state.plos.find((item) => item.id === element.dataset.paperPloLink);
      return { key: `paper-plo-link:${selectedPaperId}:${element.dataset.paperPloLink}`, label: `${paperLabel(selectedPaperId)} PLO/CLO link ${plo?.code || ""}`.trim(), value: valueForElement(element) };
    }
    if (element.matches("[data-paper-activity-link]")) {
      const plo = state.plos.find((item) => item.id === element.dataset.paperActivityLink);
      return { key: `paper-activity-link:${selectedPaperId}:${element.dataset.paperActivityLink}`, label: `${paperLabel(selectedPaperId)} learning activity link ${plo?.code || ""}`.trim(), value: valueForElement(element) };
    }
    if (element.matches("[data-paper-secondary-plo-link]")) {
      const plo = state.plos.find((item) => item.id === element.dataset.paperSecondaryPloLink);
      return { key: `paper-secondary-plo-link:${selectedPaperId}:${element.dataset.paperSecondaryPloLink}`, label: `${paperLabel(selectedPaperId)} second-side PLO/CLO link ${plo?.code || ""}`.trim(), value: valueForElement(element) };
    }
    if (element.matches("[data-paper-secondary-activity-link]")) {
      const plo = state.plos.find((item) => item.id === element.dataset.paperSecondaryActivityLink);
      return { key: `paper-secondary-activity-link:${selectedPaperId}:${element.dataset.paperSecondaryActivityLink}`, label: `${paperLabel(selectedPaperId)} second-side learning activity link ${plo?.code || ""}`.trim(), value: valueForElement(element) };
    }
    if (element.matches("[data-paper-field]")) {
      const field = element.dataset.paperField;
      return { key: `paper-field:${selectedPaperId}:${field}`, label: `${paperLabel(selectedPaperId)} ${field}`, value: valueForElement(element) };
    }
    if (element.matches("[data-assessment-field]")) {
      const row = element.closest("[data-assessment-row]");
      const assessmentId = row?.dataset.assessmentRow || "unknown";
      const field = element.dataset.assessmentField;
      return { key: `assessment-field:${assessmentId}:${field}`, label: `${assessmentLabel(assessmentId)} ${field}`, value: valueForElement(element) };
    }
    if (element.matches("[data-staff-note]")) {
      const staffName = element.dataset.staffNote || "Unknown staff";
      return { key: `staff-note:${staffName}`, label: `Staff workload note for ${staffName}`, value: valueForElement(element) };
    }
    if (element.matches("[data-staff-profile-field]")) {
      const staffName = element.dataset.staffName || "Unknown staff";
      const field = element.dataset.staffProfileField;
      return { key: `staff-profile:${staffName}:${field}`, label: `Staff profile for ${staffName} ${field}`, value: valueForElement(element) };
    }
    if (element.matches("[data-note-action-field]")) {
      const row = element.closest("[data-diagnosis-source]");
      const field = element.dataset.noteActionField;
      return { key: `diagnosis-action:${row?.dataset.diagnosisSource || "unknown"}:${field}`, label: `Action for ${row?.dataset.diagnosisTitle || "diagnosis"} ${field}`, value: valueForElement(element) };
    }
    if (element.matches("[data-standalone-action-field]")) {
      const row = element.closest("[data-standalone-action]");
      const field = element.dataset.standaloneActionField;
      return { key: `standalone-action:${row?.dataset.standaloneAction || "unknown"}:${field}`, label: `Standalone action ${field}`, value: valueForElement(element) };
    }
    if (element.matches("[data-connection-field]")) {
      const row = element.closest("[data-connection-row]");
      const field = element.dataset.connectionField;
      return { key: `relationship:${row?.dataset.connectionRow || "unknown"}:${field}`, label: `Network relationship ${field}`, value: valueForElement(element) };
    }
    return null;
  }

  function setCanvasMode(mode) {
    canvasMode = mode;
    connectionSource = null;
    $$(".paper-card").forEach((card) => card.classList.remove("selected"));
    $$(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    const w = getWording().network;
    const messages = {
      move: w.moveStatus,
      required: w.requiredStatus,
      recommended: w.recommendedStatus,
      related: w.relatedStatus,
      remove: w.removeStatus || "Select the two papers whose relationship line should be removed."
    };
    byId("canvas-status").textContent = messages[mode];
  }

  function handleCanvasPaperClick(card, event) {
    if (!canEditWorkspace()) return;
    if (canvasMode === "move") return;
    event.preventDefault();
    const paperId = card.dataset.paperId;
    if (!connectionSource) {
      connectionSource = paperId;
      card.classList.add("selected");
      byId("canvas-status").textContent = `${card.querySelector("b").textContent} ${getWording().network.selectedSuffix}`;
      return;
    }
    if (connectionSource !== paperId) {
      if (canvasMode === "remove") {
        const before = state.connections.length;
        state.connections = state.connections.filter((item) => !(
          (item.from === connectionSource && item.to === paperId) ||
          (item.from === paperId && item.to === connectionSource)
        ));
        const removedCount = before - state.connections.length;
        if (removedCount) {
          markConnectionDeleted(connectionSource, paperId, "both");
          renderPaperEditor();
          drawConnections();
          void logActivity("Removed relationship", `${paperLabel(connectionSource)} ↔ ${paperLabel(paperId)}`, { removed: removedCount });
          commitConnectionChange(`${removedCount} relationship line${removedCount === 1 ? "" : "s"} removed and saved`);
        } else {
          toast("No line found between those papers");
        }
      } else {
        upsertConnection(connectionSource, paperId, canvasMode);
        drawConnections();
        void logActivity("Added relationship", `${paperLabel(connectionSource)} → ${paperLabel(paperId)}`, { type: canvasMode });
        commitConnectionChange("Relationship line saved");
      }
    }
    setCanvasMode(canvasMode);
  }

  function startDrag(card, event) {
    if (!canEditWorkspace(false)) return;
    if (canvasMode !== "move") return;
    event.preventDefault();
    const paperItem = state.papers.find((item) => item.id === card.dataset.paperId);
    if (!paperItem) return;
    const canvas = byId("pathway-canvas");
    const canvasRect = canvas.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const offsetX = event.clientX - cardRect.left;
    const offsetY = event.clientY - cardRect.top;
    card.setPointerCapture(event.pointerId);

    const move = (pointerEvent) => {
      const x = Math.max(0, Math.min(canvasRect.width - card.offsetWidth, pointerEvent.clientX - canvasRect.left - offsetX));
      const y = Math.max(56, Math.min(canvasRect.height - card.offsetHeight, pointerEvent.clientY - canvasRect.top - offsetY));
      paperItem.x = Math.round(x);
      paperItem.y = Math.round(y);
      card.style.left = `${paperItem.x}px`;
      card.style.top = `${paperItem.y}px`;
      drawConnections();
    };
    const stop = () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", stop);
      scheduleSave();
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", stop);
  }

  document.addEventListener("click", (event) => {
    const helpClose = event.target.closest("[data-help-close]");
    if (helpClose) return closeHelpPopover();

    const helpTip = event.target.closest("[data-help-key]");
    if (helpTip) {
      event.preventDefault();
      return toggleHelpPopover(helpTip);
    }

    if (!event.target.closest("#help-popover")) closeHelpPopover();

    const tab = event.target.closest(".tab");
    if (tab) return switchView(tab.dataset.view);

    const ploCard = event.target.closest(".plo-card[data-plo-id]");
    if (ploCard) return editPlo(ploCard.dataset.ploId);

    const alignmentCell = event.target.closest(".alignment-cell");
    if (alignmentCell) {
      if (!canEditWorkspace()) return;
      const sequence = ["", "I", "D", "M"];
      const paperId = alignmentCell.dataset.paperId;
      const ploId = alignmentCell.dataset.ploId;
      const current = state.alignments[paperId]?.[ploId] || "";
      const plo = state.plos.find((item) => item.id === ploId);
      markDiscreteEditPresence({ key: `alignment-cell:${paperId}:${ploId}`, label: `${paperLabel(paperId)} × ${plo?.code || "PLO"}` });
      const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
      state.alignments[paperId] ||= {};
      state.alignments[paperId][ploId] = next;
      alignmentCell.dataset.value = next;
      alignmentCell.querySelector(".alignment-mark").textContent = next || "–";
      renderPaperEditor();
      void logActivity("Updated PLO alignment", `${paperLabel(paperId)} × ${plo?.code || "PLO"}`, { before: current || "blank", after: next || "blank" });
      return scheduleSave();
    }

    const openPaper = event.target.closest("[data-open-paper]");
    if (openPaper) {
      selectedPaperId = openPaper.dataset.openPaper;
      renderPaperList(); renderPaperEditor(); return switchView("paper");
    }

    const selectPaper = event.target.closest("[data-select-paper]");
    if (selectPaper) {
      selectedPaperId = selectPaper.dataset.selectPaper;
      renderPaperList(); return renderPaperEditor();
    }

    const roleChip = event.target.closest("[data-paper-role]");
    if (roleChip) {
      if (!canEditWorkspace()) return;
      const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
      if (!item) return;
      item.roles ||= [];
      const role = roleChip.dataset.paperRole;
      item.roles = item.roles.includes(role) ? item.roles.filter((value) => value !== role) : [...item.roles, role];
      roleChip.classList.toggle("selected");
      renderCanvas();
      void logActivity("Updated paper role", paperLabel(item.id), { role, selected: item.roles.includes(role) });
      return scheduleSave();
    }

    const modeButton = event.target.closest(".mode-button");
    if (modeButton) {
      if (!canEditWorkspace()) return;
      return setCanvasMode(modeButton.dataset.mode);
    }

    const paperCard = event.target.closest(".paper-card");
    if (paperCard) return handleCanvasPaperClick(paperCard, event);

    const deletePaperButton = event.target.closest("[data-delete-paper]");
    if (deletePaperButton) return deletePaper(deletePaperButton.dataset.deletePaper);

    const deleteAssessment = event.target.closest("[data-delete-assessment]");
    if (deleteAssessment) {
      if (!canEditWorkspace()) return;
      state.assessments = state.assessments.filter((item) => item.id !== deleteAssessment.dataset.deleteAssessment);
      renderPaperEditor(); renderAssessments(); renderStaffWorkload(); renderActions(); return scheduleSave();
    }

    const deleteConnection = event.target.closest("[data-delete-connection]");
    if (deleteConnection) {
      if (!canEditWorkspace()) return;
      const item = state.connections.find((connection) => connection.id === deleteConnection.dataset.deleteConnection);
      if (!item) return;
      markConnectionDeleted(item.from, item.to);
      state.connections = state.connections.filter((connection) => connection.id !== item.id);
      renderPaperEditor();
      renderCanvas();
      void logActivity("Removed relationship", `${paperLabel(item.from)} → ${paperLabel(item.to)}`, { type: item.type });
      return commitConnectionChange("Relationship removed and saved");
    }

    const reverseConnection = event.target.closest("[data-reverse-connection]");
    if (reverseConnection) {
      if (!canEditWorkspace()) return;
      const item = state.connections.find((connection) => connection.id === reverseConnection.dataset.reverseConnection);
      if (!item) return;
      markConnectionDeleted(item.from, item.to);
      state.connections = state.connections.filter((connection) => connection.id !== item.id);
      upsertConnection(item.to, item.from, item.type);
      renderPaperEditor();
      renderCanvas();
      void logActivity("Reversed relationship", `${paperLabel(item.from)} ↔ ${paperLabel(item.to)}`, { type: item.type });
      return commitConnectionChange("Relationship direction reversed and saved");
    }

    const evidenceCell = event.target.closest(".evidence-cell");
    if (evidenceCell) {
      if (!canEditWorkspace()) return;
      const item = state.assessments.find((assessmentItem) => assessmentItem.id === evidenceCell.dataset.assessmentId);
      if (!item) return;
      const sequence = ["", "P", "D"];
      const current = item.evidence?.[evidenceCell.dataset.ploId] || "";
      const plo = state.plos.find((ploItem) => ploItem.id === evidenceCell.dataset.ploId);
      markDiscreteEditPresence({ key: `evidence-cell:${item.id}:${evidenceCell.dataset.ploId}`, label: `${assessmentLabel(item.id)} × ${plo?.code || "PLO"}` });
      const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
      item.evidence ||= {};
      item.evidence[evidenceCell.dataset.ploId] = next;
      void logActivity("Updated assessment evidence", `${assessmentLabel(item.id)} × ${plo?.code || "PLO"}`, { before: current || "blank", after: next || "blank" });
      renderPaperEditor(); renderAssessments(); return scheduleSave();
    }

    const addPaperAssessment = event.target.closest("[data-add-paper-assessment]");
    if (addPaperAssessment) return addAssessment(addPaperAssessment.dataset.addPaperAssessment);

    const actionCard = event.target.closest("[data-action-id]");
    if (actionCard) return editAction(actionCard.dataset.actionId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelpPopover();
  });

  document.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".paper-card");
    if (card && canEditWorkspace(false)) startDrag(card, event);
  });

  document.addEventListener("focusin", (event) => {
    const target = editableTrackingTarget(event.target);
    if (!target || !canEditWorkspace(false)) return;
    const field = fieldInfoForElement(target);
    if (!field) return;
    target.dataset.presenceKey = field.key;
    focusedEdit = {
      element: target,
      key: field.key,
      label: field.label,
      value: field.value
    };
    void setPresence(field);
  });

  document.addEventListener("input", (event) => {
    const note = event.target.closest("[data-note-paper]");
    if (note) {
      if (!canEditWorkspace(false)) return;
      state.notes[note.dataset.notePaper] = note.textContent.trim();
      deferRender("actions");
      return scheduleSave();
    }

    const paperPloLink = event.target.closest("[data-paper-plo-link]");
    if (paperPloLink) {
      if (!canEditWorkspace(false)) return;
      const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
      if (!item) return;
      item.ploLinks ||= {};
      item.ploLinks[paperPloLink.dataset.paperPloLink] = paperPloLink.textContent.trim();
      return scheduleSave();
    }

    const paperActivityLink = event.target.closest("[data-paper-activity-link]");
    if (paperActivityLink) {
      if (!canEditWorkspace(false)) return;
      const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
      if (!item) return;
      item.activityLinks ||= {};
      item.activityLinks[paperActivityLink.dataset.paperActivityLink] = paperActivityLink.textContent.trim();
      return scheduleSave();
    }

    const paperSecondaryPloLink = event.target.closest("[data-paper-secondary-plo-link]");
    if (paperSecondaryPloLink) {
      if (!canEditWorkspace(false)) return;
      const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
      if (!item) return;
      item.secondaryPloLinks ||= {};
      item.secondaryPloLinks[paperSecondaryPloLink.dataset.paperSecondaryPloLink] = paperSecondaryPloLink.textContent.trim();
      return scheduleSave();
    }

    const paperSecondaryActivityLink = event.target.closest("[data-paper-secondary-activity-link]");
    if (paperSecondaryActivityLink) {
      if (!canEditWorkspace(false)) return;
      const item = state.papers.find((paperItem) => paperItem.id === selectedPaperId);
      if (!item) return;
      item.secondaryActivityLinks ||= {};
      item.secondaryActivityLinks[paperSecondaryActivityLink.dataset.paperSecondaryActivityLink] = paperSecondaryActivityLink.textContent.trim();
      return scheduleSave();
    }

    const paperField = event.target.closest("[data-paper-field]");
    if (paperField) {
      if (!canEditWorkspace(false)) return;
      if (applyPaperFieldValue(paperField)) return scheduleSave();
    }

    const assessmentField = event.target.closest("[data-assessment-field]");
    if (assessmentField) {
      if (!canEditWorkspace(false)) return;
      if (applyAssessmentFieldValue(assessmentField)) return scheduleSave();
    }

    const staffNote = event.target.closest("[data-staff-note]");
    if (staffNote) {
      if (!canEditWorkspace(false)) return;
      state.staffNotes ||= {};
      state.staffNotes[staffNote.dataset.staffNote] = staffNote.value;
      deferRender("actions");
      return scheduleSave();
    }

    const staffProfileField = event.target.closest("[data-staff-profile-field]");
    if (staffProfileField) {
      if (!canEditWorkspace(false)) return;
      const staffName = staffProfileField.dataset.staffName;
      const field = staffProfileField.dataset.staffProfileField;
      state.staffProfiles ||= {};
      state.staffProfiles[staffName] = normaliseStaffProfile(state.staffProfiles[staffName]);
      state.staffProfiles[staffName][field] = staffProfileField.value;
      return scheduleSave();
    }

    const noteActionField = event.target.closest("[data-note-action-field]");
    if (noteActionField) {
      if (!canEditWorkspace(false)) return;
      const row = noteActionField.closest("[data-diagnosis-source]");
      const item = ensureDiagnosisAction(row.dataset.diagnosisSource, row.dataset.diagnosisTitle || "Mapping action");
      const field = noteActionField.dataset.noteActionField;
      item[field] = noteActionField.value;
      return scheduleSave();
    }

    const standaloneActionField = event.target.closest("[data-standalone-action-field]");
    if (standaloneActionField) {
      if (!canEditWorkspace(false)) return;
      const row = standaloneActionField.closest("[data-standalone-action]");
      const item = state.actions.find((action) => action.id === row?.dataset.standaloneAction);
      if (!item) return;
      item[standaloneActionField.dataset.standaloneActionField] = standaloneActionField.value;
      return scheduleSave();
    }
  });

  document.addEventListener("change", (event) => {
    const levelGrouping = event.target.closest("[data-level-grouping-mode]");
    if (levelGrouping) {
      if (!canEditWorkspace()) return;
      state.meta.levelGroupingMode = levelGrouping.value === "nzqf" ? "nzqf" : "paperCode";
      renderCanvas();
      void logActivity("Changed board grouping", state.meta.levelGroupingMode === "nzqf" ? "NZQCF level" : "Otago paper code level");
      return scheduleSave();
    }

    const connectionField = event.target.closest("[data-connection-field]");
    if (connectionField) {
      if (!canEditWorkspace()) return;
      const row = connectionField.closest("[data-connection-row]");
      const item = state.connections.find((connection) => connection.id === row?.dataset.connectionRow);
      if (!item) return;
      const field = connectionField.dataset.connectionField;
      const from = field === "from" ? connectionField.value : item.from;
      const to = field === "to" ? connectionField.value : item.to;
      const type = field === "type" ? connectionField.value : item.type;
      markConnectionDeleted(item.from, item.to);
      state.connections = state.connections.filter((connection) => connection.id !== item.id);
      upsertConnection(from, to, type);
      renderPaperEditor();
      renderCanvas();
      void logActivity("Updated relationship", `${paperLabel(from)} → ${paperLabel(to)}`, { type });
      commitConnectionChange("Relationship updated and saved");
      return;
    }

    const changedAssessmentField = event.target.closest("[data-assessment-field]");
    if (changedAssessmentField) {
      const changed = canEditWorkspace(false) ? applyAssessmentFieldValue(changedAssessmentField) : false;
      deferRender("paperEditor", "assessments");
      const field = changedAssessmentField.dataset.assessmentField;
      if (["mode", "purpose", "side"].includes(field)) deferRender("staff");
      if (changed) scheduleSave();
    }
    const changedPaperField = event.target.closest("[data-paper-field]");
    if (changedPaperField && changedPaperField.matches("select") && applyPaperFieldValue(changedPaperField)) {
      scheduleSave();
    }
    if (changedPaperField && ["learningOutcomes", "learningActivities", "secondaryLearningOutcomes", "secondaryLearningActivities"].includes(changedPaperField.dataset.paperField)) {
      deferRender("paperEditor");
    }
    if (event.target.closest("[data-note-action-field]") || event.target.closest("[data-standalone-action-field]")) {
      deferRender("actions");
    }
    flushDeferredRender();
  });

  document.addEventListener("focusout", (event) => {
    const trackedTarget = editableTrackingTarget(event.target);
    if (trackedTarget && focusedEdit?.element === trackedTarget) {
      const nextValue = valueForElement(trackedTarget);
      const beforeValue = focusedEdit.value;
      const fieldLabel = focusedEdit.label;
      focusedEdit = null;
      void clearPresence();
      if (nextValue !== beforeValue) {
        void logActivity("Updated field", fieldLabel, {
          before: truncateForLog(beforeValue),
          after: truncateForLog(nextValue)
        });
      }
    }
    if (event.target.closest(".editable-cell[data-assessment-field]")) {
      deferRender("paperEditor", "assessments");
    }
    flushDeferredRender();
    if (cloud.enabled) {
      window.setTimeout(() => {
        if (!isTextEditingActive()) pollCloudWorkspace();
      }, 250);
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const card = event.target.closest(".paper-card");
    if (card) {
      event.preventDefault();
      selectedPaperId = card.dataset.paperId;
      renderPaperList();
      renderPaperEditor();
      switchView("paper");
      return;
    }

    const line = event.target.closest(".connection");
    if (line) {
      if (!canEditWorkspace()) return;
      event.preventDefault();
      const item = state.connections.find((connection) => connection.id === line.dataset.connectionId);
      if (!item) return;
      markConnectionDeleted(item.from, item.to);
      state.connections = state.connections.filter((connection) => connection.id !== item.id);
      drawConnections();
      void logActivity("Removed relationship", `${paperLabel(item.from)} → ${paperLabel(item.to)}`, { type: item.type });
      commitConnectionChange("Connection removed and saved");
    }
  });

  byId("dialog-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await dialogContext?.onSave?.(values);
      byId("edit-dialog").close();
      dialogContext = null;
    } catch (error) {
      console.error("Dialog save failed", error);
    }
  });

  byId("dialog-delete-button").addEventListener("click", () => {
    if (!dialogContext?.onDelete || !confirm("Delete this item?")) return;
    dialogContext.onDelete();
    byId("edit-dialog").close();
    dialogContext = null;
  });

  byId("paper-search").addEventListener("input", renderPaperList);
  byId("add-plo-button").addEventListener("click", addPlo);
  byId("add-paper-button").addEventListener("click", addPaper);
  byId("paper-view-add-button").addEventListener("click", addPaper);
  byId("add-assessment-button").addEventListener("click", addAssessment);
  byId("add-action-button").addEventListener("click", addAction);
  byId("programme-settings-button").addEventListener("click", editProgrammeSettings);
  byId("wording-settings-button").addEventListener("click", editTemplateWording);
  byId("create-cloud-workspace-button").addEventListener("click", createCloudWorkspace);
  byId("copy-admin-link-button").addEventListener("click", () => {
    copyText(buildWorkspaceUrl(cloud.workspace, cloud.adminToken || cloud.token), "admin link");
  });
  byId("copy-edit-link-button").addEventListener("click", () => {
    copyText(buildWorkspaceUrl(cloud.workspace, cloud.editToken || cloud.token), "edit link");
  });
  byId("copy-view-link-button").addEventListener("click", () => {
    copyText(buildWorkspaceUrl(cloud.workspace, cloud.viewToken || cloud.token), "view link");
  });
  byId("session-name-button").addEventListener("click", () => {
    openDialog({
      eyebrow: "Identity",
      title: "Your name for this workspace",
      fields: [
        { name: "name", label: "Name shown in comments and admin log", value: sessionName || "", required: true }
      ],
      onSave(values) {
        setSessionName(values.name);
        toast("Name saved for this browser");
      }
    });
  });
  byId("comments-button").addEventListener("click", openComments);
  byId("activity-log-button").addEventListener("click", openActivityLog);
  byId("save-snapshot-button").addEventListener("click", saveSnapshot);
  byId("versions-button").addEventListener("click", openVersions);
  byId("new-template-button").addEventListener("click", newTemplate);
  byId("export-button").addEventListener("click", exportJson);
  byId("import-button").addEventListener("click", () => byId("import-file").click());
  byId("import-file").addEventListener("change", (event) => {
    if (event.target.files[0]) importJson(event.target.files[0]);
    event.target.value = "";
  });
  byId("print-button").addEventListener("click", preparePrint);
  window.addEventListener("resize", drawConnections);
  window.addEventListener("beforeprint", () => {
    document.body.classList.add("print-mode");
    renderAll();
    drawConnections();
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-mode");
    requestAnimationFrame(drawConnections);
  });
  window.addEventListener("beforeunload", () => {
    void clearPresence();
  });

  renderAll();
  updateShareButtons();
  initCloud();
})();
