#!/usr/bin/env python3
"""Hitta företag med årsredovisningar i Bolagsverkets API."""

import sys
sys.path.insert(0, '/Users/isak/Desktop/CLAUDE_CODE /projects/B-MCP')

from bolagsverket_mcp import (
    clean_org_nummer,
    make_api_request,
    format_org_nummer
)

# Org.nr från Bevakaren.Företagslista.xlsx
ORGNR_LIST = [
    "5590692900",  # 1KOMMA5 grader AB
    "5590957949",  # 29k International AB
    "5569426546",  # 2D fab AB
    "5591830236",  # 2Heal medical AB
    "5567030415",  # 2MA Technology AB
    "5567908842",  # 3eflow AB
    "5565745394",  # 3nine AB
    "5590387444",  # A Retro Tale AB
    "5594367103",  # A.i.secure LKP AB
]

print("🔍 Söker efter företag med årsredovisningar...\n")

found = []
for orgnr in ORGNR_LIST:
    try:
        clean_nr = clean_org_nummer(orgnr)
        dok_data = make_api_request("POST", "/dokumentlista", {"identitetsbeteckning": clean_nr})
        dokument = dok_data.get("dokument", [])

        if dokument:
            print(f"✅ {format_org_nummer(clean_nr)}: {len(dokument)} årsredovisningar")
            found.append((orgnr, len(dokument)))
        else:
            print(f"❌ {format_org_nummer(clean_nr)}: Inga årsredovisningar")
    except Exception as e:
        print(f"⚠️  {orgnr}: {e}")

print(f"\n📊 Hittade {len(found)} företag med årsredovisningar")
if found:
    print("\nFörsta med årsredovisning:")
    print(f"  Org.nr: {found[0][0]}")
