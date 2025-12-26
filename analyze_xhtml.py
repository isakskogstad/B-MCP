#!/usr/bin/env python3
"""Analysera XHTML/iXBRL för att hitta alla tillgängliga fält."""

import sys
import re
from collections import Counter
sys.path.insert(0, '/Users/isak/Desktop/CLAUDE_CODE /projects/B-MCP')

from bolagsverket_mcp import fetch_and_parse_arsredovisning
from bs4 import BeautifulSoup
import warnings
warnings.filterwarnings("ignore")

TEST_ORGNR = "5590387444"

print("🔍 Analyserar iXBRL-struktur...\n")

arsred, xhtml_bytes, zip_bytes = fetch_and_parse_arsredovisning(TEST_ORGNR, 0)
xhtml = xhtml_bytes.decode('utf-8')

# Parse med lxml-xml för bättre hantering
soup = BeautifulSoup(xhtml, 'lxml-xml')

# Hitta alla ix: taggar
print("=" * 70)
print("ALLA ix:nonfraction TAGGAR (numeriska värden)")
print("=" * 70)

nonfraction_names = []
for tag in soup.find_all('ix:nonfraction'):
    name = tag.get('name', '')
    nonfraction_names.append(name.split(':')[-1] if ':' in name else name)

for name, count in Counter(nonfraction_names).most_common(50):
    print(f"  {name}: {count}x")

print("\n" + "=" * 70)
print("ALLA ix:nonnumeric TAGGAR (text/datum)")
print("=" * 70)

nonnumeric_names = []
for tag in soup.find_all('ix:nonnumeric'):
    name = tag.get('name', '')
    nonnumeric_names.append(name.split(':')[-1] if ':' in name else name)

for name, count in Counter(nonnumeric_names).most_common(50):
    print(f"  {name}: {count}x")

print("\n" + "=" * 70)
print("CONTEXT-REFERENSER (perioder)")
print("=" * 70)

contexts = set()
for tag in soup.find_all(['ix:nonfraction', 'ix:nonnumeric']):
    ctx = tag.get('contextref', '')
    if ctx:
        contexts.add(ctx)

for ctx in sorted(contexts):
    print(f"  {ctx}")

print("\n" + "=" * 70)
print("EXEMPEL PÅ NOTER")
print("=" * 70)

# Sök efter not-relaterade taggar
for tag in soup.find_all('ix:nonnumeric'):
    name = tag.get('name', '').lower()
    if 'not' in name or 'upplysning' in name or 'beskrivning' in name:
        text = tag.get_text(strip=True)[:200]
        if text:
            print(f"\n{tag.get('name')}:")
            print(f"  {text}...")

print("\n" + "=" * 70)
print("FÖRETAGSDATA SOM FINNS")
print("=" * 70)

# Specifika fält
fields_to_check = [
    'ForetagetsNamn', 'Organisationsnummer', 'ForetagetsSate',
    'RakenskapsarForstaDag', 'RakenskapsarSistaDag', 'UndertecknandeDatum',
    'Verksamhetsbeskrivning', 'Verksamhetsart', 'VerksamhetensArt',
    'ForetradareNamn', 'ForetradareFornamn', 'ForetradareEfternamn',
    'StyrelseledamotFornamn', 'StyrelseledamotEfternamn',
    'VerkstallendeDirektor', 'Ordforande', 'Revisor',
    'MedelantalAnstallda', 'Soliditet', 'Kassalikviditet',
]

for field in fields_to_check:
    tag = soup.find(['ix:nonfraction', 'ix:nonnumeric'],
                    attrs={'name': lambda x: x and field.lower() in x.lower()})
    if tag:
        val = tag.get_text(strip=True)[:100]
        print(f"  ✅ {field}: {val}")
    else:
        print(f"  ❌ {field}: (saknas)")
