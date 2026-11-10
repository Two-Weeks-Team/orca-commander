// Run inside `aside repl` (see render_check.py). BOARDS and PORT are filled in by the wrapper.
// For each board: open it on the local server, wait for fonts, report text that overflows its box or leaves the
// board, then save a screenshot. Text inside overflow:hidden boxes (ellipsis) is not reported by the DOM check.
const names = BOARDS_PLACEHOLDER;
for (const n of names) {
  const t = await openTab('http://127.0.0.1:' + PORT_PLACEHOLDER + '/' + n + '.html');
  const wide = n === 'LangCompare';
  await page.setViewportSize(wide ? { width: 1640, height: 1010 } : { width: 390, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1200);
  const rep = await page.evaluate(() => {
    const root = document.querySelector('.root') || document.body;
    const rr = root.getBoundingClientRect();
    const issues = [];
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const hasText = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
      const label = (el.textContent || '').trim().slice(0, 28);
      if (hasText && el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'hidden') issues.push(['text-overflow', el.tagName, label, el.scrollWidth, el.clientWidth]);
      if (hasText && (r.right > rr.right + 1 || r.left < rr.left - 1)) issues.push(['outside-root-x', el.tagName, label, Math.round(r.left), Math.round(r.right)]);
      if (hasText && r.bottom > rr.bottom + 1) issues.push(['below-root', el.tagName, label, Math.round(r.bottom), Math.round(rr.bottom)]);
    }
    const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i);
    return { size: [Math.round(rr.width), Math.round(rr.height)], fontsLoaded: fonts, issues: issues.slice(0, 12), nIssues: issues.length };
  });
  await page.screenshot({ path: './' + n + '.png' });
  console.log(n, JSON.stringify(rep));
  await closeTab(t);
}
