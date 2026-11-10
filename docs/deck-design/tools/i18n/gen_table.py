"""Print the string table of ../../i18n.md as Markdown.  Usage: python3 -I gen_table.py > table.md"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strings import ROWS

esc = lambda s: s.replace('|', '\\|')
print('| Key | English | 한국어 | 日本語 (sample) | 简体中文 (sample) | Critical | Note |')
print('| --- | --- | --- | --- | --- | --- | --- |')
for k, en, ko, ja, zh, c, n in ROWS:
    print(f"| `{k}` | {esc(en)} | {esc(ko)} | {esc(ja)} | {esc(zh)} | {'yes' if c else ''} | {esc(n)} |")
