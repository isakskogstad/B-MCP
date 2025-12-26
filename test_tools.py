#!/usr/bin/env python3
"""Test B-MCP tools med riktiga API-anrop."""

import sys
sys.path.insert(0, '/Users/isak/Desktop/CLAUDE_CODE /projects/B-MCP')

from bolagsverket_mcp import (
    bolagsverket_check_status,
    bolagsverket_get_basic_info,
    bolagsverket_get_nyckeltal,
    bolagsverket_get_styrelse,
    bolagsverket_get_verksamhet,
    bolagsverket_list_arsredovisningar,
    OrgNummerInput,
    FinansiellDataInput,
    ResponseFormat
)

# Testföretag från Bevakaren.Företagslista.xlsx (med årsredovisningar)
TEST_ORGNR = "5590387444"   # A Retro Tale AB (6 årsredovisningar)
TEST_ORGNR_2 = "5591830236"  # 2Heal medical AB (2 årsredovisningar)

def test_api_status():
    print("=" * 60)
    print("TEST 1: API Status")
    print("=" * 60)
    result = bolagsverket_check_status()
    print(result)
    print()

def test_basic_info():
    print("=" * 60)
    print("TEST 2: Basic Info - Klarna")
    print("=" * 60)
    params = OrgNummerInput(org_nummer=TEST_ORGNR)
    result = bolagsverket_get_basic_info(params)
    print(result)
    print()

def test_verksamhet():
    print("=" * 60)
    print("TEST 3: Verksamhet & SNI-koder")
    print("=" * 60)
    params = OrgNummerInput(org_nummer=TEST_ORGNR)
    result = bolagsverket_get_verksamhet(params)
    print(result)
    print()

def test_list_arsredovisningar():
    print("=" * 60)
    print("TEST 4: Lista årsredovisningar")
    print("=" * 60)
    params = OrgNummerInput(org_nummer=TEST_ORGNR)
    result = bolagsverket_list_arsredovisningar(params)
    print(result)
    print()

def test_nyckeltal():
    print("=" * 60)
    print("TEST 5: Nyckeltal (finansiell data)")
    print("=" * 60)
    params = FinansiellDataInput(org_nummer=TEST_ORGNR, index=0)
    result = bolagsverket_get_nyckeltal(params)
    print(result)
    print()

def test_styrelse():
    print("=" * 60)
    print("TEST 6: Styrelse & VD")
    print("=" * 60)
    params = OrgNummerInput(org_nummer=TEST_ORGNR)
    result = bolagsverket_get_styrelse(params)
    print(result)
    print()

if __name__ == "__main__":
    print("\n🚀 TESTAR B-MCP TOOLS MED RIKTIGA API-ANROP\n")

    test_api_status()
    test_basic_info()
    test_verksamhet()
    test_list_arsredovisningar()
    test_nyckeltal()
    test_styrelse()

    print("✅ Alla tester klara!")
