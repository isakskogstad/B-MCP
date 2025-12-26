/**
 * MCP Server Implementation for Bolagsverket API
 * Remote MCP server that can be used with Claude Desktop, Cursor, etc.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Types
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// OAuth2 Token Manager
class TokenManager {
  private token: string | null = null;
  private expiresAt: Date | null = null;

  async getToken(): Promise<string> {
    if (this.token && this.expiresAt && this.expiresAt > new Date()) {
      return this.token;
    }

    const clientId = process.env.BOLAGSVERKET_CLIENT_ID;
    const clientSecret = process.env.BOLAGSVERKET_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "BOLAGSVERKET_CLIENT_ID and BOLAGSVERKET_CLIENT_SECRET must be set"
      );
    }

    const tokenUrl = "https://portal.api.bolagsverket.se/oauth2/token";

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "vardefulla-datamangder:ping vardefulla-datamangder:read",
      }),
    });

    if (!response.ok) {
      throw new Error(`Token error: ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.token = data.access_token;
    this.expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.token!;
  }
}

const tokenManager = new TokenManager();
const API_BASE = "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";

// API helper
async function apiRequest(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<unknown> {
  const token = await tokenManager.getToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Get organization data
async function getOrganisation(orgNummer: string): Promise<unknown> {
  const cleanOrg = orgNummer.replace(/\D/g, "");
  return apiRequest("/organisationer", "POST", {
    identitetsbeteckning: cleanOrg,
  });
}

// Get document list
async function getDokumentlista(orgNummer: string): Promise<unknown> {
  const cleanOrg = orgNummer.replace(/\D/g, "");
  return apiRequest("/dokumentlista", "POST", {
    identitetsbeteckning: cleanOrg,
  });
}

// MCP Tool definitions
const MCP_TOOLS: Tool[] = [
  {
    name: "bolagsverket_check_status",
    description: "Kontrollera API-status och anslutning till Bolagsverket",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "bolagsverket_get_basic_info",
    description:
      "Hämta grundläggande företagsinformation: namn, bolagsform, status, registreringsdatum",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer: {
          type: "string",
          description:
            "Organisationsnummer (10 siffror, med eller utan bindestreck)",
        },
      },
      required: ["org_nummer"],
    },
  },
  {
    name: "bolagsverket_get_address",
    description: "Hämta företagets postadress och säte",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer: {
          type: "string",
          description: "Organisationsnummer",
        },
      },
      required: ["org_nummer"],
    },
  },
  {
    name: "bolagsverket_get_nyckeltal",
    description:
      "Hämta finansiella nyckeltal från senaste årsredovisningen: omsättning, resultat, soliditet etc",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer: {
          type: "string",
          description: "Organisationsnummer",
        },
      },
      required: ["org_nummer"],
    },
  },
  {
    name: "bolagsverket_list_arsredovisningar",
    description: "Lista alla tillgängliga årsredovisningar för ett företag",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer: {
          type: "string",
          description: "Organisationsnummer",
        },
      },
      required: ["org_nummer"],
    },
  },
  {
    name: "bolagsverket_risk_analysis",
    description:
      "Genomför en riskanalys av företaget baserat på tillgänglig data",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer: {
          type: "string",
          description: "Organisationsnummer",
        },
      },
      required: ["org_nummer"],
    },
  },
  {
    name: "bolagsverket_compare_companies",
    description: "Jämför två företag sida vid sida",
    inputSchema: {
      type: "object",
      properties: {
        org_nummer_1: {
          type: "string",
          description: "Första företagets organisationsnummer",
        },
        org_nummer_2: {
          type: "string",
          description: "Andra företagets organisationsnummer",
        },
      },
      required: ["org_nummer_1", "org_nummer_2"],
    },
  },
];

// Tool executor
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "bolagsverket_check_status": {
      try {
        await tokenManager.getToken();
        return {
          status: "OK",
          message: "Anslutning till Bolagsverket fungerar",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          status: "ERROR",
          message: error instanceof Error ? error.message : "Okänt fel",
        };
      }
    }

    case "bolagsverket_get_basic_info": {
      const orgNummer = args.org_nummer as string;
      const data = (await getOrganisation(orgNummer)) as {
        organisationer?: Array<{
          organisationsidentitet?: { identitetsbeteckning?: string };
          organisationsnamn?: {
            organisationsnamnLista?: Array<{ namn?: string }>;
          };
          organisationsform?: { kod?: string; klartext?: string };
          verksamOrganisation?: { kod?: string };
          organisationsdatum?: { registreringsdatum?: string };
          verksamhetsbeskrivning?: { beskrivning?: string };
        }>;
      };
      const org = data.organisationer?.[0];

      if (!org) {
        return { error: "Företaget hittades inte" };
      }

      const namn = org.organisationsnamn?.organisationsnamnLista?.[0]?.namn;
      const aktiv = org.verksamOrganisation?.kod === "JA";

      return {
        organisationsnummer: org.organisationsidentitet?.identitetsbeteckning,
        namn: namn,
        bolagsform: org.organisationsform?.klartext,
        aktiv: aktiv,
        registreringsdatum: org.organisationsdatum?.registreringsdatum,
        verksamhet: org.verksamhetsbeskrivning?.beskrivning,
      };
    }

    case "bolagsverket_get_address": {
      const orgNummer = args.org_nummer as string;
      const data = (await getOrganisation(orgNummer)) as {
        organisationer?: Array<{
          postadressOrganisation?: {
            postadress?: {
              utdelningsadress?: string;
              postnummer?: string;
              postort?: string;
              land?: string;
              coAdress?: string;
            };
          };
        }>;
      };
      const org = data.organisationer?.[0];

      if (!org) {
        return { error: "Företaget hittades inte" };
      }

      const addr = org.postadressOrganisation?.postadress;
      return {
        adress: addr?.utdelningsadress,
        coAdress: addr?.coAdress,
        postnummer: addr?.postnummer,
        postort: addr?.postort,
        land: addr?.land,
      };
    }

    case "bolagsverket_get_nyckeltal": {
      const orgNummer = args.org_nummer as string;
      const docs = (await getDokumentlista(orgNummer)) as {
        dokument?: Array<{
          dokumentId?: string;
          filformat?: string;
          rapporteringsperiodTom?: string;
        }>;
      };

      const arsredovisningar = docs.dokument || [];

      if (arsredovisningar.length === 0) {
        return { info: "Ingen årsredovisning hittades för detta företag" };
      }

      return {
        antal_arsredovisningar: arsredovisningar.length,
        senaste_period: arsredovisningar[0]?.rapporteringsperiodTom,
        note: "Nyckeltal kräver iXBRL-parsing av årsredovisning",
      };
    }

    case "bolagsverket_list_arsredovisningar": {
      const orgNummer = args.org_nummer as string;
      const data = (await getDokumentlista(orgNummer)) as {
        dokument?: Array<{
          dokumentId?: string;
          filformat?: string;
          rapporteringsperiodTom?: string;
          registreringstidpunkt?: string;
        }>;
      };
      const arsredovisningar = (data.dokument || []).map((d) => ({
        dokumentId: d.dokumentId,
        period: d.rapporteringsperiodTom,
        registrerad: d.registreringstidpunkt,
        format: d.filformat,
      }));

      return {
        antal: arsredovisningar.length,
        arsredovisningar,
      };
    }

    case "bolagsverket_risk_analysis": {
      const orgNummer = args.org_nummer as string;
      const data = (await getOrganisation(orgNummer)) as {
        organisationer?: Array<{
          organisationsnamn?: {
            organisationsnamnLista?: Array<{ namn?: string }>;
          };
          verksamOrganisation?: { kod?: string };
          organisationsform?: { klartext?: string };
          avregistreradOrganisation?: { avregistreringsdatum?: string };
          pagaendeAvvecklingsEllerOmstruktureringsforfarande?: {
            pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista?: Array<{
              kod?: string;
              klartext?: string;
            }>;
          };
        }>;
      };
      const org = data.organisationer?.[0];

      if (!org) {
        return { error: "Företaget hittades inte" };
      }

      const warnings: string[] = [];
      let riskScore = 0;

      if (org.verksamOrganisation?.kod !== "JA") {
        warnings.push("Företaget är inte aktivt");
        riskScore += 30;
      }

      if (org.avregistreradOrganisation?.avregistreringsdatum) {
        warnings.push(
          `Avregistrerat: ${org.avregistreradOrganisation.avregistreringsdatum}`
        );
        riskScore += 50;
      }

      const procedures =
        org.pagaendeAvvecklingsEllerOmstruktureringsforfarande
          ?.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista || [];
      for (const proc of procedures) {
        warnings.push(`Pågående: ${proc.klartext || proc.kod}`);
        riskScore += 40;
      }

      if (org.organisationsform?.klartext === "Enskild näringsidkare") {
        warnings.push("Enskild firma - personligt ansvar");
        riskScore += 10;
      }

      const riskLevel =
        riskScore < 20 ? "LOW" : riskScore < 50 ? "MEDIUM" : "HIGH";

      const namn = org.organisationsnamn?.organisationsnamnLista?.[0]?.namn;

      return {
        foretag: namn,
        risk_score: riskScore,
        risk_level: riskLevel,
        warnings,
        recommendation:
          riskLevel === "LOW"
            ? "Inga uppenbara risker identifierade"
            : "Rekommenderar djupare granskning",
      };
    }

    case "bolagsverket_compare_companies": {
      const org1 = args.org_nummer_1 as string;
      const org2 = args.org_nummer_2 as string;

      type OrgResponse = {
        organisationer?: Array<{
          organisationsidentitet?: { identitetsbeteckning?: string };
          organisationsnamn?: {
            organisationsnamnLista?: Array<{ namn?: string }>;
          };
          organisationsform?: { klartext?: string };
          verksamOrganisation?: { kod?: string };
          organisationsdatum?: { registreringsdatum?: string };
        }>;
      };

      const [data1, data2] = await Promise.all([
        getOrganisation(org1) as Promise<OrgResponse>,
        getOrganisation(org2) as Promise<OrgResponse>,
      ]);

      const mapOrg = (org: OrgResponse["organisationer"]) => {
        const o = org?.[0];
        if (!o) return { error: "Ej funnet" };
        return {
          organisationsnummer: o.organisationsidentitet?.identitetsbeteckning,
          namn: o.organisationsnamn?.organisationsnamnLista?.[0]?.namn,
          bolagsform: o.organisationsform?.klartext,
          aktiv: o.verksamOrganisation?.kod === "JA",
          registreringsdatum: o.organisationsdatum?.registreringsdatum,
        };
      };

      return {
        foretag_1: mapOrg(data1.organisationer),
        foretag_2: mapOrg(data2.organisationer),
      };
    }

    default:
      return { error: `Okänt verktyg: ${name}` };
  }
}

// Create MCP Server
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "bolagsverket-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: MCP_TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await executeTool(name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Main entry for stdio mode (when run directly)
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bolagsverket MCP Server running on stdio");
}

// Only run main if this file is executed directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
