// Run inside `aside repl` through render_check.py --script audit.js.
// For each board it prints one line "AUDIT <name> <json>" with the size of every control and the box, colour, size and
// weight of every piece of text and every icon, then saves <name>.bg.png: the same board with all text and icons hidden,
// so that analyze.py can read the real pixels behind each piece of text.
const names = BOARDS_PLACEHOLDER;
for (const n of names) {
  const t = await openTab('http://127.0.0.1:' + PORT_PLACEHOLDER + '/' + n + '.html');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1000);
  const data = await page.evaluate(() => {
    const out = { targets: [], texts: [], icons: [] };
    const eff = (el) => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
    for (const el of document.querySelectorAll('button,[role=button],[role=radio],[role=switch],a[href]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.targets.push({ label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, dis: el.disabled === true || el.hasAttribute('disabled') });
    }
    const root = document.querySelector('.root') || document.body;
    const modal = document.querySelector('.dlg');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim();
      if (!txt) continue;
      const el = node.parentElement;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      // one box per line, around the glyphs themselves (not the whole container the text sits in)
      for (const r of [...range.getClientRects()].filter(q => q.width > 0 && q.height > 0)) {
        out.texts.push({ t: txt.slice(0, 24), x: r.left, y: r.top, w: r.width, h: r.height, c: cs.color, fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight), op: eff(el), dis: !!el.closest('[disabled],[aria-disabled=true]') || !!(modal && !modal.contains(el)) });
      }
    }
    for (const el of root.querySelectorAll('svg')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.icons.push({ x: r.left, y: r.top, w: r.width, h: r.height, c: cs.color, op: eff(el), dis: !!el.closest('[disabled],[aria-disabled=true]') || !!(modal && !modal.contains(el)) });
    }
    return out;
  });
  console.log('AUDIT ' + n + ' ' + JSON.stringify(data));
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '*{color:transparent !important;text-shadow:none !important} svg{visibility:hidden !important}';
    document.head.appendChild(s);
  });
  await page.screenshot({ path: './' + n + '.bg.png' });
  await closeTab(t);
}
