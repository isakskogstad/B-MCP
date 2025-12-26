#!/usr/bin/env python3
"""Hämta FULLSTÄNDIG årsredovisning med all data."""

import sys
import json
sys.path.insert(0, '/Users/isak/Desktop/CLAUDE_CODE /projects/B-MCP')

from bolagsverket_mcp import (
    fetch_and_parse_arsredovisning,
    fetch_company_info,
    format_org_nummer,
    asdict
)

TEST_ORGNR = "5590387444"  # A Retro Tale AB

print("=" * 70)
print("FULLSTÄNDIG ÅRSREDOVISNING")
print("=" * 70)

# 1. Hämta företagsinfo
print("\n📋 FÖRETAGSINFORMATION")
print("-" * 50)
info = fetch_company_info(TEST_ORGNR)
print(f"Namn:              {info.namn}")
print(f"Org.nr:            {info.org_nummer}")
print(f"Organisationsform: {info.organisationsform}")
print(f"Juridisk form:     {info.juridisk_form}")
print(f"Registrerad:       {info.registreringsdatum}")
print(f"Status:            {info.status}")
print(f"Säte:              {info.sate}")

print("\n📍 ADRESS")
print("-" * 50)
print(f"  {info.adress.get('utdelningsadress', '-')}")
print(f"  {info.adress.get('postnummer', '')} {info.adress.get('postort', '')}")

print("\n📝 VERKSAMHETSBESKRIVNING")
print("-" * 50)
print(f"  {info.verksamhet or 'Ingen beskrivning'}")

print("\n🏭 SNI-KODER (BRANSCH)")
print("-" * 50)
for sni in info.sni_koder:
    if sni['kod'].strip():
        print(f"  {sni['kod']}: {sni['klartext']}")

# 2. Hämta årsredovisning
print("\n" + "=" * 70)
print("📊 ÅRSREDOVISNING (SENASTE)")
print("=" * 70)

arsred, xhtml_bytes, zip_bytes = fetch_and_parse_arsredovisning(TEST_ORGNR, 0)

print(f"\nFöretag:       {arsred.foretag_namn}")
print(f"Org.nr:        {format_org_nummer(arsred.org_nummer)}")
print(f"Räkenskapsår:  {arsred.rakenskapsar_start} – {arsred.rakenskapsar_slut}")

# Metadata
print("\n📋 METADATA")
print("-" * 50)
for key, val in arsred.metadata.items():
    if val:
        print(f"  {key}: {val}")

# Nyckeltal
print("\n💰 NYCKELTAL")
print("-" * 50)
n = arsred.nyckeltal
data = [
    ("Nettoomsättning", n.nettoomsattning, "SEK"),
    ("Resultat efter fin. poster", n.resultat_efter_finansiella, "SEK"),
    ("Årets resultat", n.arets_resultat, "SEK"),
    ("Eget kapital", n.eget_kapital, "SEK"),
    ("Balansomslutning", n.balansomslutning, "SEK"),
    ("Soliditet", n.soliditet, "%"),
    ("Vinstmarginal", n.vinstmarginal, "%"),
    ("ROE", n.roe, "%"),
    ("Antal anställda", n.antal_anstallda, "st"),
]
for label, val, unit in data:
    if val is not None:
        if isinstance(val, int) and unit == "SEK":
            print(f"  {label:30} {val:>15,} {unit}")
        else:
            print(f"  {label:30} {val:>15} {unit}")

# Resultaträkning
print("\n📈 RESULTATRÄKNING")
print("-" * 50)
for key, val in arsred.resultatrakning.items():
    if val is not None:
        label = key.replace('_', ' ').title()
        print(f"  {label:35} {val:>15,} SEK")

# Balansräkning - Tillgångar
print("\n📊 BALANSRÄKNING - TILLGÅNGAR")
print("-" * 50)
tillgangar = arsred.balansrakning.get('tillgangar', {})
for key, val in tillgangar.items():
    if val is not None:
        label = key.replace('_', ' ').title()
        print(f"  {label:35} {val:>15,} SEK")

# Balansräkning - Eget kapital & Skulder
print("\n📊 BALANSRÄKNING - EGET KAPITAL & SKULDER")
print("-" * 50)
skulder = arsred.balansrakning.get('eget_kapital_skulder', {})
for key, val in skulder.items():
    if val is not None:
        label = key.replace('_', ' ').title()
        print(f"  {label:35} {val:>15,} SEK")

# Personer
print("\n👥 PERSONER (STYRELSE/VD/REVISORER)")
print("-" * 50)
for p in arsred.personer:
    print(f"  {p.fullnamn:30} | {p.roll}")

# Noter
print("\n📝 NOTER")
print("-" * 50)
if arsred.noter:
    for key, val in arsred.noter.items():
        print(f"  {key}: {val[:100]}...")
else:
    print("  (Inga noter extraherade)")

# Filstorlekar
print("\n📁 FILDATA")
print("-" * 50)
print(f"  XHTML-storlek: {len(xhtml_bytes) / 1024:.1f} KB")
print(f"  ZIP-storlek:   {len(zip_bytes) / 1024:.1f} KB")

print("\n" + "=" * 70)
print("✅ KOMPLETT ÅRSREDOVISNING HÄMTAD")
print("=" * 70)

# Exportera som JSON
print("\n📄 FULLSTÄNDIG JSON-EXPORT:")
print("-" * 50)
full_data = {
    "foretag_info": asdict(info),
    "arsredovisning": asdict(arsred)
}
print(json.dumps(full_data, indent=2, ensure_ascii=False, default=str)[:3000])
print("... (trunkerad)")
