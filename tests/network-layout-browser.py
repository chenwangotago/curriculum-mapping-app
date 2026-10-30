"""Check opt-in board layout and I/D/A mapping using fictional local data only."""

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
FIXTURE = r"""
  const layoutParams = new URLSearchParams(location.search);
  const layoutFixture = clone(sampleData);
  layoutFixture.papers = [paper('layout-test', 'TEST-CODE100-1', 'Fictional paper for layout checks', 100, 90, 120, [])];
  layoutFixture.connections = [];
  if (layoutParams.has('far')) Object.assign(layoutFixture.papers[0], { x: 1400, y: 800 });
  layoutFixture.assessments = [];
  layoutFixture.plos = layoutParams.has('empty') ? [] : [{id:'layout-plo',code:'PLO1',title:'Fictional outcome',description:'Test only'}];
  layoutFixture.alignments = {};
  if (layoutParams.has('wide')) layoutFixture.wording.network.cardLayout = 'wide';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutFixture));
  localStorage.setItem(SESSION_NAME_KEY, 'Fictional tester');
  window.__layoutState = () => state;
"""
CHECKS = r"""
(() => {
  const passed=[];
  const check=(value,label)=>{if(!value)throw Error(label);passed.push(label);};
  const $=s=>document.querySelector(s);
  try {
    const params=new URLSearchParams(location.search),wide=params.has('wide');
    const card=$('.paper-card'),code=$('.paper-card b'),canvas=$('#pathway-canvas');
    check(card.offsetWidth===(wide?260:190),'Only opted-in workspaces get wider cards');
    check(canvas.classList.contains('wide-paper-cards')===wide,'Layout flag is scoped to this workspace');
    if(wide){
      const range=document.createRange();range.selectNodeContents(code);
      check(range.getClientRects().length===1,'Paper code stays on a single line');
      check(code.scrollWidth<=code.clientWidth,'Complete paper code is visible');
      check(canvas.clientWidth>=1280,'Board retains usable width on narrow screens');
      check(getComputedStyle(canvas.closest('.canvas-shell')).overflowX==='auto','Narrow screens can scroll the board');
      check(card.offsetLeft+card.offsetWidth<=canvas.clientWidth&&card.offsetTop+card.offsetHeight<=canvas.clientHeight,'Canvas expands to include cards beyond the original boundaries');
    }
    if(params.has('empty')){
      check(!$('.alignment-cell'),'No invented PLO columns for an empty programme');
      $('#add-plo-button').click();
      $('#field-code').value='PLO1';$('#field-title').value='Fictional test outcome';
      $('#field-description').value='A temporary outcome used only by this isolated test.';
      $('#dialog-save-button').click();
    }
    const cell=$('.alignment-cell');
    check(Boolean(cell),'PLO columns render as mapping cells');
    check(!cell.isContentEditable,'I/D/A cells are not free-text fields');
    for(const mark of ['I','D','A','']){
      cell.click();
      check(cell.dataset.value===mark,`Cell cycles to ${mark||'blank'}`);
      check(window.__layoutState().alignments['layout-test'][cell.dataset.ploId]===mark,'Mapping value is stored');
    }
    check($('.discussion-note').isContentEditable,'Only discussion notes accept free text');
    const result=document.createElement('pre');result.id='layout-test-result';result.textContent=JSON.stringify({passed:passed.length});document.body.append(result);
  }catch(error){const result=document.createElement('pre');result.id='layout-test-result';result.textContent=JSON.stringify({passed:passed.length,error:error.stack});document.body.append(result);}
})();
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/config.js':
            return self.respond('window.CURRICULUM_MAPPING_CONFIG={};', 'text/javascript')
        if path == '/app.js':
            source = (ROOT / 'app.js').read_text().replace('  let state = loadState();', FIXTURE + '  let state = loadState();', 1)
            return self.respond(source, 'text/javascript')
        if path == '/layout-checks.js':
            return self.respond(CHECKS, 'text/javascript')
        if path == '/':
            source = (ROOT / 'index.html').read_text().replace('</body>', '<script src="/layout-checks.js"></script></body>')
            return self.respond(source, 'text/html')
        return super().do_GET()

    def respond(self, source, kind):
        body = source.encode()
        self.send_response(200)
        self.send_header('Content-Type', kind + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Content-Security-Policy', "connect-src 'self'")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def main():
    chrome = os.environ.get('CHROME_BIN') or shutil.which('google-chrome') or shutil.which('chromium') or '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        for query in ['', 'wide=1', 'wide=1&empty=1', 'wide=1&far=1']:
            for width, height in [(1440, 1000), (390, 844)]:
                with tempfile.TemporaryDirectory(prefix='curriculum-layout-qa-') as profile:
                    url = f'http://127.0.0.1:{server.server_port}/?{query}'
                    result = subprocess.run([chrome, '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', f'--user-data-dir={profile}', f'--window-size={width},{height}', '--virtual-time-budget=10000', '--dump-dom', url], capture_output=True, text=True, timeout=45)
                    match = re.search(r'<pre id="layout-test-result">(.*?)</pre>', result.stdout, re.S)
                    if not match:
                        raise RuntimeError('No browser test result: ' + result.stderr[-1000:])
                    report = json.loads(html.unescape(match.group(1)))
                    if report.get('error'):
                        raise AssertionError(report)
                    print(json.dumps({'scenario': query or 'default', 'viewport': f'{width}x{height}', **report}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
