# B-MCP - Bolagsverket MCP Server

MCP-server för att hämta och analysera svenska företagsdata från Bolagsverkets API "Värdefulla datamängder".

**Live Demo:** [isakskogstad.github.io/B-MCP](https://isakskogstad.github.io/B-MCP)

## Funktioner

- **16 verktyg** för företagsanalys
- **4 resurser** för passiv dataåtkomst
- **4 prompts** för vanliga arbetsflöden
- **Riskanalys** med automatiska varningar
- **Export** till Excel, PDF, Word, PowerPoint, CSV, JSON

## Snabbstart

```bash
# 1. Klona
git clone https://github.com/isakskogstad/B-MCP.git
cd B-MCP

# 2. Installera
pip install -r requirements.txt

# 3. Konfigurera (OBLIGATORISKT)
export BOLAGSVERKET_CLIENT_ID="din-client-id"
export BOLAGSVERKET_CLIENT_SECRET="din-client-secret"

# 4. Starta
python bolagsverket_mcp.py
```

## Säkerhet

### Credentials via miljövariabler

Servern kräver miljövariabler för autentisering - **inga credentials i kod**.

| Variabel | Beskrivning |
|----------|-------------|
| `BOLAGSVERKET_CLIENT_ID` | OAuth2 Client ID |
| `BOLAGSVERKET_CLIENT_SECRET` | OAuth2 Client Secret |

Skapa konto och hämta credentials: [portal.api.bolagsverket.se](https://portal.api.bolagsverket.se)

### .env-fil (lokal utveckling)

```bash
cp .env.example .env
# Redigera .env med dina credentials
```

`.env` ignoreras automatiskt av Git.

## Claude Desktop-konfiguration

Lägg till i `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bolagsverket": {
      "command": "python",
      "args": ["/sökväg/till/B-MCP/bolagsverket_mcp.py"],
      "env": {
        "BOLAGSVERKET_CLIENT_ID": "din-client-id",
        "BOLAGSVERKET_CLIENT_SECRET": "din-client-secret"
      }
    }
  }
}
```

## Verktyg

| Verktyg | Beskrivning |
|---------|-------------|
| `bolagsverket_check_status` | API-status |
| `bolagsverket_get_basic_info` | Grundinfo (namn, bolagsform, status) |
| `bolagsverket_get_address` | Adress och säte |
| `bolagsverket_get_verksamhet` | Verksamhet och SNI-koder |
| `bolagsverket_get_nyckeltal` | Finansiella nyckeltal |
| `bolagsverket_get_styrelse` | Styrelse och VD |
| `bolagsverket_get_trends` | 4-års trender |
| `bolagsverket_risk_analysis` | Riskbedömning |
| `bolagsverket_compare_companies` | Jämför företag |
| `bolagsverket_finansiell_snapshot` | Snabb finansöversikt |
| `bolagsverket_arenden` | Händelsetidslinje |
| `bolagsverket_styrelse_ledning` | Detaljerad styrelseinfo |
| `bolagsverket_batch_lookup` | Batch-sökning (max 20) |
| `bolagsverket_export` | Export (xlsx/pdf/docx/pptx/csv/json) |
| `bolagsverket_list_arsredovisningar` | Lista årsredovisningar |
| `bolagsverket_download_original` | Ladda ner original |

## Exempel

```python
# Sök företagsinfo
result = await bolagsverket_get_basic_info(org_nummer="5560360793")

# Riskanalys
risk = await bolagsverket_risk_analysis(org_nummer="5560360793")

# Exportera till Excel
export = await bolagsverket_export(
    org_nummer="5560360793",
    format="xlsx"
)
```

## Tech Stack

- Python 3.11+
- FastMCP
- httpx
- BeautifulSoup (lxml)
- Pydantic
- openpyxl, weasyprint, python-docx, python-pptx

## Licens

MIT
