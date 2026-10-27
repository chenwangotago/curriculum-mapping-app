"""Run isolated review and assessment UI checks with Chrome and Python's standard library.

No production workspace, credentials, network service, or mapping data is used.
"""

import functools
import html
import http.server
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = r"""
window.__reviewTest = { comments: [
  { id: 'legacy', author: 'Earlier reviewer', body: 'Existing whole-page feedback', target: '2. Assessments', createdAt: '2026-01-01' },
  { id: 'other-paper', author: 'Earlier reviewer', body: 'Existing other-paper feedback', target: 'block:paper:clos:p201', createdAt: '2026-01-01' }
], calls: [], prompts: 0, allowMappingSaves: false, savedMapping: null };
window.prompt = () => { window.__reviewTest.prompts++; return 'Fictional reviewer'; };
window.alert = (message) => { throw new Error(message); };
window.CURRICULUM_MAPPING_CONFIG = { supabaseUrl: location.origin, supabaseAnonKey: 'test-only' };
window.supabase = { createClient: () => ({
  rpc: async (name, values) => {
    const qa = window.__reviewTest;
    qa.calls.push({ name, values });
    if (name === 'load_curriculum_workspace') {
      const role = new URLSearchParams(location.search).get('role');
      return { data: { slug: 'fictional-review', data: structuredClone(qa.savedMapping || window.__reviewFixture),
        canEdit: role !== 'reviewer', canManageTemplate: role === 'admin', updatedAt: '2026-01-01' } };
    }
    if (name === 'list_curriculum_workspace_comments') return { data: structuredClone(qa.comments) };
    if (name === 'create_curriculum_workspace_comment') {
      const comment = { id: crypto.randomUUID(), author: values.comment_author,
        body: values.comment_body, target: values.comment_target, createdAt: '2026-01-02' };
      qa.comments.push(comment);
      return { data: structuredClone(comment) };
    }
    if (name === 'save_curriculum_workspace') {
      if (!qa.allowMappingSaves) throw new Error('Review UI must not save mapping data');
      qa.savedMapping = structuredClone(values.next_data);
      return { data: { data: structuredClone(qa.savedMapping), updatedAt: '2026-01-01' } };
    }
    return { data: [] };
  },
  functions: { invoke: async () => ({ data: { documents: [] } }) }
}) };
"""

CHECKS = r"""
(async () => {
  const passed = [];
  const check = (value, label) => { if (!value) throw new Error(label); passed.push(label); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
    throw new Error('Timed out waiting for the review UI');
  };
  const $ = (selector) => document.querySelector(selector);
  const close = () => $('#dialog-cancel-button').click();
  const open = () => $('#add-comment-button').click();
  const values = () => [...$('#field-target').options].map(option => option.value);
  const chooseTab = (view) => $(`.tab[data-view="${view}"]`).click();
  const save = async (target, body) => {
    $('#field-target').value = target;
    $('#field-body').value = body;
    $('#dialog-form').requestSubmit();
    await waitFor(() => !$('#edit-dialog').open);
  };
  const finish = () => {
    const output = document.createElement('pre'); output.id = 'review-test-results';
    output.textContent = JSON.stringify({ passed: passed.length, checks: passed }); document.body.append(output);
  };
  try {
    await waitFor(() => $('#cloud-status').matches('.online, .readonly'));
    const qa = window.__reviewTest;
    const role = new URLSearchParams(location.search).get('role');
    const editable = role !== 'reviewer';
    check(document.body.classList.contains('read-only') === !editable, 'Correct reviewer/editor/admin mode');
    chooseTab('assessment');
    const assessmentHeaders = [...$('#assessment-table thead').querySelectorAll('th')].map(cell => cell.textContent);
    check(assessmentHeaders.includes('Mode') && assessmentHeaders.includes('Brief description'), 'Assessment table uses simplified labels');
    check(!assessmentHeaders.some(label => /form|role|contribution/i.test(label)), 'No separate assessment form or role column');
    const oldAssessment = window.__reviewFixture.assessments[0];
    const oldRow = $(`#assessment-table [data-assessment-row="${oldAssessment.id}"]`);
    check(oldRow.querySelector('[data-assessment-field="mode"]').textContent === oldAssessment.mode, 'Existing combined form/mode text remains unchanged');
    check(oldRow.querySelector('[data-assessment-field="purpose"]').textContent === oldAssessment.purpose, 'Existing role text is retained as the brief description');
    chooseTab('paper');
    check($('#paper-editor .mini-table thead').textContent.includes('Brief description'), 'Paper assessment table uses the same label');
    check($('#paper-editor [data-assessment-field="purpose"]').textContent === oldAssessment.purpose, 'Paper page retains the same legacy description');
    const report = new DOMParser().parseFromString(window.__reviewReport(), 'text/html');
    const reportTable = [...report.querySelectorAll('h2')].find(heading => heading.textContent === 'Assessment Items').nextElementSibling;
    check(reportTable.querySelector('thead').textContent.includes('Brief description'), 'PDF assessment table uses the simplified label');
    check(reportTable.textContent.includes(oldAssessment.mode) && reportTable.textContent.includes(oldAssessment.purpose), 'PDF keeps both existing assessment text values');
    if (editable) {
      for (const view of ['programme', 'assessment', 'paper', 'accreditation', 'documents', 'staff', 'actions']) {
        chooseTab(view);
        check($('#add-comment-button').hidden && $('#review-comments-button').hidden, `${view}: no toolbar comment buttons`);
        check(!document.querySelector('.review-block-tools'), `${view}: no block comment controls after rendering`);
        for (const key of ['addComment', 'reviewComments'])
          check(getComputedStyle($(`[data-help-key="${key}"]`)).display === 'none', `${view}: no orphaned comment help button`);
      }
      chooseTab('paper'); $('[data-select-paper="p108"]').click();
      check(!document.querySelector('.review-block-tools'), 'Changing paper does not recreate comment controls');
      check(!$('#paper-editor textarea').readOnly, 'Paper editing remains enabled');
      check(!$('#add-plo-button').disabled && !$('#add-assessment-button').disabled, 'Curriculum content creation remains enabled');
      open(); $('#review-comments-button').click(); await tick();
      check(!$('#edit-dialog').open, 'Hidden comment entry points cannot open dialogs in editable mode');
      check(qa.prompts === 0, 'Editable mode does not prompt for a reviewer name');
      check(qa.comments.length === 2, 'Existing comments remain stored');
      check(!qa.calls.some(call => /^(create|update|delete)_curriculum_workspace_comment$/.test(call.name)), 'Editable mode does not write comments');
      check(!qa.calls.some(call => call.name === 'save_curriculum_workspace'), 'Separating review UI does not save mapping data');

      qa.allowMappingSaves = true;
      chooseTab('assessment'); $('#add-assessment-button').click();
      check($('label[for="field-mode"]').textContent === 'Mode', 'Add assessment keeps a separate Mode input');
      check($('label[for="field-purpose"]').textContent === 'Brief description', 'Add assessment combines format and purpose in one description');
      check($('#field-purpose').tagName === 'TEXTAREA', 'Brief description allows a short paragraph');
      check(!$('#field-mode').required && !$('#field-purpose').required, 'Mode and description are optional');
      $('#field-paperId').value = 'p101';
      $('#field-name').value = 'Fictional simplified assessment';
      $('#field-mode').value = 'Online';
      const description = 'A short written case analysis.\nProvides feedback on applied reasoning.';
      $('#field-purpose').value = description;
      $('#dialog-form').requestSubmit();
      await waitFor(() => !$('#edit-dialog').open);
      await new Promise(resolve => setTimeout(resolve, 1300));
      const saved = qa.savedMapping?.assessments.find(item => item.name === 'Fictional simplified assessment');
      check(saved?.mode === 'Online' && saved?.purpose === description, 'New mode and multiline description pass through cloud autosave');
      check(qa.savedMapping.assessments.find(item => item.id === oldAssessment.id).purpose === oldAssessment.purpose, 'Saving a new assessment preserves old description text');
      check(qa.savedMapping.assessments.find(item => item.id === oldAssessment.id).mode === oldAssessment.mode, 'Saving a new assessment preserves old mode text');
      chooseTab('paper'); $('[data-select-paper="p101"]').click();
      const paperRow = $(`#paper-editor [data-assessment-row="${saved.id}"]`);
      check(paperRow.querySelector('[data-assessment-field="purpose"]').textContent === description, 'New description carries to the correct paper');
      check(paperRow.querySelector('[data-assessment-field="mode"]').textContent === 'Online', 'New mode carries to the correct paper');
      const roundTrip = window.__reviewNormalise(JSON.parse(JSON.stringify(qa.savedMapping)));
      check(roundTrip.assessments.find(item => item.id === saved.id).purpose === description, 'JSON import normalization keeps the brief description');
      check(JSON.stringify(roundTrip.assessments.find(item => item.id === oldAssessment.id).evidence) === JSON.stringify(oldAssessment.evidence), 'Existing PLO assessment evidence remains unchanged');
      chooseTab('assessment'); $('#add-assessment-button').click();
      $('#field-name').value = 'Fictional assessment without optional details';
      $('#dialog-form').requestSubmit();
      await waitFor(() => !$('#edit-dialog').open);
      check($('#assessment-table').textContent.includes('Fictional assessment without optional details'), 'Assessments can be added without mode or description');
      finish();
      return;
    }
    check(!$('#add-comment-button').hidden && !$('#review-comments-button').hidden, 'Read-only toolbar keeps comment buttons');
    for (const view of ['programme', 'assessment', 'paper', 'accreditation', 'documents', 'staff', 'actions']) {
      chooseTab(view); open();
      const targets = values();
      check(targets.includes(`page:${view}`), `${view}: whole-page choice`);
      check(targets.some(value => value.startsWith(`block:${view}:`)), `${view}: block choices`);
      check(targets.every(value => value === `page:${view}` || value.startsWith(`block:${view}:`) || (view === 'paper' && value.startsWith('paper:'))), `${view}: no unrelated page choices`);
      check(new Set(targets).size === targets.length, `${view}: no duplicate targets`);
      if (view === 'programme') check($('#field-target').textContent.includes('Custom Graduate Outcomes'), 'Custom programme block wording');
      if (view === 'assessment') {
        for (const block of ['evidence', 'items', 'summary', 'programmeEvidence', 'workload'])
          check(targets.includes(`block:assessment:${block}`), `Assessment block: ${block}`);
        check($('#field-target').textContent.includes('Custom Evidence Matrix'), 'Custom assessment block wording');
      }
      if (view === 'paper') {
        for (const block of ['profile', 'roles', 'plos', 'network', 'description', 'clos', 'activities', 'concepts', 'assessments', 'vertical', 'internal', 'diagnosis'])
          check(targets.includes(`block:paper:${block}:p101`), `Paper block: ${block}`);
        check(!targets.includes('block:paper:secondSide:p101'), 'Single-code paper hides second-code block');
      }
      close();
      check(!$('#edit-dialog').open, `${view}: cancel works without writing a comment`);
    }

    chooseTab('paper'); open();
    await save('block:paper:clos:p101', 'Feedback on the first paper CLOs');
    check(qa.comments.at(-1).target === 'block:paper:clos:p101', 'CLO comment keeps the selected paper ID');
    check($('#paper-editor [data-review-section="clos"]').nextElementSibling.textContent.includes('(1)'), 'Saved comment count is visible beside the CLO block');
    $('#paper-editor [data-review-section="activities"]').nextElementSibling.querySelector('[data-add-block-comment]').click();
    check($('#field-target').value === 'block:paper:activities:p101', 'Block button preselects the correct target');
    await save('block:paper:activities:p101', 'Feedback on learning activities');
    $('[data-select-paper="p108"]').click(); open();
    check(values().includes('block:paper:secondSide:p108'), 'Double-coded paper offers its second-code block');
    check(!values().some(value => value.endsWith(':p101')), 'Changing paper refreshes all block targets');
    await save('block:paper:secondSide:p108', 'Feedback on second-code design');
    chooseTab('assessment'); open();
    await save('block:assessment:workload', 'Feedback on student workload');
    check(qa.comments.at(-1).target === 'block:assessment:workload', 'Assessment block comment saves its target');
    check(qa.prompts === 1, 'Reviewer name requested only once');

    $('#session-name-button').click();
    $('#field-name').value = 'Fictional programme team member';
    $('#dialog-form').requestSubmit();
    await waitFor(() => !$('#edit-dialog').open);
    open();
    await save('block:assessment:workload', 'Programme team response to workload feedback');
    check(qa.comments.at(-1).author === 'Fictional programme team member', 'Team can respond under their own name through the review link');
    check(qa.comments.filter(comment => comment.target === 'block:assessment:workload').length === 2, 'Feedback and team response share the same block');
    check(qa.comments.some(comment => comment.body === 'Feedback on student workload'), 'Responding does not replace reviewer feedback');

    $('#review-comments-button').click();
    await waitFor(() => $('#edit-dialog').open && $('#dialog-title').textContent === 'Review Comments');
    check($('#dialog-fields').textContent.includes('Existing whole-page feedback'), 'Legacy whole-page comments are retained');
    check($('#dialog-fields').textContent.includes('Existing other-paper feedback'), 'Existing paper comments are retained');
    check($('#field-reviewTarget').querySelector('option[value="block:paper:clos:p101"]'), 'Review filter includes saved paper block');
    $('#field-reviewTarget').value = 'block:paper:clos:p101';
    $('#field-reviewTarget').dispatchEvent(new Event('change', { bubbles: true }));
    check($('#dialog-fields').textContent.includes('Feedback on the first paper CLOs'), 'Review filter displays the selected block comment');
    check(!$('#dialog-fields').textContent.includes('Feedback on student workload'), 'Review filter excludes other blocks');
    close();
    check(!$('[data-comment-edit]') && !$('[data-comment-delete]'), 'Reviewer cannot edit or delete existing comments');
    check($('#paper-editor textarea').readOnly, 'Paper contents remain read-only');
    check(!qa.calls.some(call => call.name === 'save_curriculum_workspace'), 'Comment operations do not save or replace mapping data');
    check(qa.comments.some(item => item.id === 'legacy'), 'No existing comment was removed');
    finish();
  } catch (error) {
    const output = document.createElement('pre'); output.id = 'review-test-results';
    output.textContent = JSON.stringify({ passed: passed.length, error: error.stack,
      dialog: $('#dialog-title')?.textContent, filter: $('#field-reviewTarget')?.value,
      editableComments: [...document.querySelectorAll('[data-comment-edit]')].map(button => button.dataset.commentEdit),
      commentIds: window.__reviewTest.comments.map(comment => comment.id) }); document.body.append(output);
  }
})();
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/config.js":
            return self.respond(BOOTSTRAP, "text/javascript")
        if path == "/review-checks.js":
            return self.respond(CHECKS, "text/javascript")
        if path == "/app.js":
            source = (ROOT / "app.js").read_text()
            fixture = """
  window.__reviewFixture = clone(sampleData);
  window.__reviewFixture.wording.programme.ploTitle = 'Custom Graduate Outcomes';
  window.__reviewFixture.wording.assessment.evidenceTitle = 'Custom Evidence Matrix';
  window.__reviewFixture.assessments[0].mode = 'Individual written (legacy form/mode text)';
  window.__reviewFixture.assessments[0].purpose = 'Early evidence + formative feedback (legacy role text)';
  window.__reviewReport = () => printableReportHtml();
  window.__reviewNormalise = normaliseState;
  Object.assign(window.__reviewFixture.papers[1], { structure: 'Double-coded', secondaryCode: 'HUMS208', secondaryLevel: 200 });
"""
            source = source.replace("  let state = loadState();", fixture + "  let state = loadState();", 1)
            return self.respond(source, "text/javascript")
        if path == "/":
            source = (ROOT / "index.html").read_text().replace("</body>", '<script src="/review-checks.js"></script></body>')
            return self.respond(source, "text/html")
        return super().do_GET()

    def respond(self, content, content_type):
        body = content.encode()
        self.send_response(200)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", "connect-src 'self'")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def main():
    chrome = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if not Path(chrome).is_file():
        raise SystemExit("Set CHROME_BIN to a Chrome or Chromium executable.")
    handler = functools.partial(Handler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for role, width, height in [(role, width, height) for role in ("reviewer", "editor", "admin") for width, height in ((1440, 1000), (390, 844))]:
            with tempfile.TemporaryDirectory(prefix="curriculum-review-qa-") as profile:
                url = f"http://127.0.0.1:{server.server_port}/?workspace=fictional-review&token=test-only&role={role}"
                result = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}", f"--window-size={width},{height}", "--virtual-time-budget=10000", "--dump-dom", url], capture_output=True, text=True, timeout=45)
                match = re.search(r'<pre id="review-test-results">(.*?)</pre>', result.stdout, re.S)
                if not match:
                    raise RuntimeError("Browser produced no test result: " + result.stderr[-2000:])
                report = json.loads(html.unescape(match.group(1)))
                if report.get("error"):
                    raise AssertionError(report)
                print(json.dumps({"role": role, "viewport": f"{width}x{height}", "passed": report["passed"]}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
