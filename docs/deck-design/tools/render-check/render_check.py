"""Render design boards in a browser and check them, without the private canvas.

The board sources in ../../canvas-source are plain HTML and CSS plus a <helmet> block, so this builds a standalone copy
of each (the Artifact asset ids are mapped back to the images in ../../renders), serves it on 127.0.0.1, opens it in the
Aside browser with `aside repl`, measures overflow and saves a screenshot. Nothing is written inside the repository:
all output goes to --out.

Usage:  python3 -I render_check.py --out /tmp/boards SheetList LangPack Deck3D
        python3 -I render_check.py --out /tmp/boards --all
Needs: the `aside` CLI with a running Aside browser, and network access for Google Fonts. Screenshots are 2x.
The browser may be signed in to a different account than the canvas owner; this does not need the canvas.
"""
import argparse, glob, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(DESIGN, 'canvas-source')
RENDERS = os.path.join(DESIGN, 'renders')

# Artifact asset id -> image file (the ids come from uploading these files to the canvas)
BLOBS = {
    'b117979f86785f0bb17c3d4521ae0f4a': os.path.join(RENDERS, 'deck_hero2.png'),
    'cd9ec9218028838718f63d92c485d2cb': os.path.join(RENDERS, 'states', 'deck_normal.png'),
    'baba243ea0142f1e5d0dd4fc7e4fa118': os.path.join(RENDERS, 'states', 'deck_request.png'),
    '7eded2416420d664d6007e2287bb34d9': os.path.join(RENDERS, 'states', 'deck_question.png'),
    'd1a4fd20171b1c424c21fc33625aca62': os.path.join(RENDERS, 'states', 'deck_recording.png'),
    'b0670b08ee4da87bf1ddb2ce40253550': os.path.join(RENDERS, 'states', 'deck_offline.png'),
}


def build(harness):
    os.makedirs(os.path.join(harness, 'img'), exist_ok=True)
    for src in set(BLOBS.values()):
        shutil.copy(src, os.path.join(harness, 'img', os.path.basename(src)))
    names = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.dc.html'))):
        s = open(f, encoding='utf-8').read()
        m = re.search(r'<helmet>(.*?)</helmet>', s, re.S)
        helmet = m.group(1) if m else ''
        body = re.search(r'</helmet>(.*?)</x-dc>', s, re.S)
        if not body:
            continue
        html = body.group(1)
        for k, v in BLOBS.items():
            html = html.replace('/_blob/' + k, 'img/' + os.path.basename(v))
        name = os.path.basename(f).replace('.dc.html', '')
        open(os.path.join(harness, name + '.html'), 'w', encoding='utf-8').write(
            '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">' + helmet +
            '</head><body style="margin:0;background:#000">' + html + '</body></html>')
        names.append(name)
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True, help='directory for the standalone copy and the screenshots (outside the repo)')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--script', default='shoot.js', help='shoot.js (overflow check, default) or audit.js (targets and contrast)')
    ap.add_argument('boards', nargs='*')
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if out.startswith(DESIGN + os.sep) or out == DESIGN:
        sys.exit('--out must be outside the deck-design folder')
    harness, shots = os.path.join(out, 'harness'), os.path.join(out, 'shots')
    os.makedirs(shots, exist_ok=True)
    names = build(harness)
    boards = names if a.all else a.boards
    unknown = [b for b in boards if b not in names]
    if unknown or not boards:
        sys.exit('boards: ' + ', '.join(names))
    server = subprocess.Popen([sys.executable, '-I', '-m', 'http.server', str(a.port), '--bind', '127.0.0.1'],
                              cwd=harness, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        js = open(os.path.join(HERE, a.script), encoding='utf-8').read()
        js = js.replace('BOARDS_PLACEHOLDER', repr(boards).replace("'", '"')).replace('PORT_PLACEHOLDER', str(a.port))
        started = time.time()
        r = subprocess.run(['aside', 'repl', js], capture_output=True, text=True, timeout=115)
        open(os.path.join(out, 'last-run.txt'), 'w', encoding='utf-8').write(r.stdout + r.stderr)
        for line in (r.stdout + r.stderr).splitlines():
            if re.match(r'^\w+ \{"size"', line):
                print(line[:700])
    finally:
        server.terminate()
    # screenshots land in the newest Aside session folder; copy the ones written during this run
    sessions = os.path.expanduser('~/.aside/u/0/sessions')
    for b in boards:
        for suffix in ('.png', '.bg.png'):
            c = [p for p in glob.glob(os.path.join(sessions, '*', b + suffix)) if os.path.getmtime(p) >= started - 2]
            if c:
                shutil.copy(max(c, key=os.path.getmtime), os.path.join(shots, b + suffix))
    print('screenshots:', shots)


if __name__ == '__main__':
    main()
