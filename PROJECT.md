# B-MCP - Bolagsverket MCP Server

## Overview
MCP-server för Bolagsverkets API "Värdefulla datamängder". Hämtar och analyserar företagsdata, årsredovisningar och nyckeltal.

## Tech Stack
- **Språk:** Python 3.11+
- **MCP Framework:** FastMCP
- **HTTP Client:** httpx
- **Parser:** BeautifulSoup (lxml) för iXBRL
- **Validation:** Pydantic
- **Export:** openpyxl (Excel), weasyprint (PDF)

## Project Structure
```
B-MCP/
├── bolagsverket_mcp.py   # Huvudfil - MCP server
├── PROJECT.md            # Denna fil
├── requirements.txt      # Dependencies
└── backups/              # Automatiska backups
```

## Features

### Tools (12 st)
| Tool | Beskrivning |
|------|-------------|
| `bolagsverket_check_status` | Kontrollera API-status |
| `bolagsverket_get_basic_info` | Grundläggande företagsinfo |
| `bolagsverket_get_address` | Postadress och säte |
| `bolagsverket_get_verksamhet` | Verksamhet och SNI-koder |
| `bolagsverket_get_nyckeltal` | Finansiella nyckeltal |
| `bolagsverket_get_styrelse` | Styrelse, VD, revisorer |
| `bolagsverket_get_trends` | Flerårsöversikt (4 år) |
| `bolagsverket_batch_lookup` | Sök flera företag (max 20) |
| `bolagsverket_export` | Exportera till PDF/Excel/CSV/JSON |
| `bolagsverket_list_arsredovisningar` | Lista tillgängliga årsredovisningar |
| `bolagsverket_download_original` | Ladda ner original ZIP/XHTML |

### Resources (4 st)
- `bolagsverket://company/{org_nummer}`
- `bolagsverket://financials/{org_nummer}`
- `bolagsverket://people/{org_nummer}`
- `bolagsverket://annual-reports/{org_nummer}`

### Prompts (4 st)
- `due-diligence` - Komplett företagsanalys
- `compare-companies` - Jämför två företag
- `person-network` - Analysera nyckelpersoner
- `export-report` - Exportera rapport

## API Credentials
Credentials hanteras via miljövariabler (sätts ALDRIG i kod):
- `BOLAGSVERKET_CLIENT_ID` - Din Client ID
- `BOLAGSVERKET_CLIENT_SECRET` - Din Client Secret
- **Base URL:** `https://gw.api.bolagsverket.se/vardefulla-datamangder/v1`

Skapa konto på: https://portal.api.bolagsverket.se

## Settings

### Run MCP Server (STDIO)
```bash
python bolagsverket_mcp.py
```

### Install Dependencies
```bash
pip install fastmcp httpx beautifulsoup4 lxml pydantic openpyxl weasyprint
```

## Instructions
- OAuth2 token hanteras automatiskt via `TokenManager`
- Logging går till stderr (KRITISKT för STDIO-transport)
- Export sparas i `~/Downloads/bolagsverket/`

## Notes
- Kräver registrerade API-credentials från Bolagsverket
- iXBRL-parsing kan vara ofullständig för vissa årsredovisningar
- Batch-sökning begränsad till 20 företag per anrop
