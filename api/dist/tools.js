// OAuth2 Token Manager
class TokenManager {
    token = null;
    expiresAt = null;
    async getToken() {
        if (this.token && this.expiresAt && this.expiresAt > new Date()) {
            return this.token;
        }
        const clientId = process.env.BOLAGSVERKET_CLIENT_ID;
        const clientSecret = process.env.BOLAGSVERKET_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error("BOLAGSVERKET_CLIENT_ID and BOLAGSVERKET_CLIENT_SECRET must be set");
        }
        const tokenUrl = "https://auth.api.bolagsverket.se/auth/realms/bolagsverket/protocol/openid-connect/token";
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });
        if (!response.ok) {
            throw new Error(`Token error: ${response.status}`);
        }
        const data = await response.json();
        this.token = data.access_token;
        this.expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
        return this.token;
    }
}
const tokenManager = new TokenManager();
const API_BASE = "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";
// API helper
async function apiRequest(endpoint, method = "GET", body) {
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
async function getOrganisation(orgNummer) {
    const cleanOrg = orgNummer.replace(/\D/g, "");
    return apiRequest("/organisationer", "POST", {
        organisationsnummer: [cleanOrg],
    });
}
// Get document list
async function getDokumentlista(orgNummer) {
    const cleanOrg = orgNummer.replace(/\D/g, "");
    return apiRequest("/dokumentlista", "POST", {
        organisationsnummer: [cleanOrg],
    });
}
// Parse iXBRL from annual report
async function parseArsredovisning(orgNummer) {
    const docs = (await getDokumentlista(orgNummer));
    const arsredovisningar = (docs.dokument || []).filter((d) => d.typ === "Årsredovisning");
    if (arsredovisningar.length === 0) {
        return { error: "Ingen årsredovisning hittades" };
    }
    const latestUrl = arsredovisningar[0]?.url;
    if (!latestUrl) {
        return { error: "Ingen URL för årsredovisning" };
    }
    const token = await tokenManager.getToken();
    const response = await fetch(latestUrl, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        return { error: `Kunde inte ladda årsredovisning: ${response.status}` };
    }
    const buffer = await response.arrayBuffer();
    // Try to find XHTML in ZIP or parse directly
    let xhtmlContent;
    try {
        // Check if it's a ZIP file
        const bytes = new Uint8Array(buffer);
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            // It's a ZIP - for now, return that we need to parse it
            // In production, you'd use a ZIP library
            return {
                info: "ZIP-fil mottagen",
                note: "iXBRL-parsing kräver server-side ZIP-hantering"
            };
        }
        else {
            xhtmlContent = new TextDecoder().decode(buffer);
        }
    }
    catch {
        xhtmlContent = new TextDecoder().decode(buffer);
    }
    // Extract key figures from iXBRL
    const nyckeltal = {};
    // Common iXBRL patterns
    const patterns = {
        omsattning: /se-gen-base:Nettoomsattning[^>]*>([^<]+)</i,
        resultat: /se-gen-base:AretsResultat[^>]*>([^<]+)</i,
        egetKapital: /se-gen-base:EgetKapitalSkulder[^>]*>([^<]+)</i,
        anstallda: /se-gen-base:MedelantaletAnstallda[^>]*>([^<]+)</i,
    };
    for (const [key, pattern] of Object.entries(patterns)) {
        const match = xhtmlContent.match(pattern);
        if (match) {
            const value = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
            if (!isNaN(value)) {
                nyckeltal[key] = value;
            }
        }
    }
    return nyckeltal;
}
// Tool definitions
export const bolagsverketTools = [
    {
        name: "bolagsverket_check_status",
        description: "Kontrollera API-status och anslutning till Bolagsverket",
        input_schema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "bolagsverket_get_basic_info",
        description: "Hämta grundläggande företagsinformation: namn, bolagsform, status, registreringsdatum",
        input_schema: {
            type: "object",
            properties: {
                org_nummer: {
                    type: "string",
                    description: "Organisationsnummer (10 siffror, med eller utan bindestreck)",
                },
            },
            required: ["org_nummer"],
        },
    },
    {
        name: "bolagsverket_get_address",
        description: "Hämta företagets postadress och säte",
        input_schema: {
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
        description: "Hämta finansiella nyckeltal från senaste årsredovisningen: omsättning, resultat, soliditet etc",
        input_schema: {
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
        input_schema: {
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
        description: "Genomför en riskanalys av företaget baserat på tillgänglig data",
        input_schema: {
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
        input_schema: {
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
export async function executeBolagsverketTool(name, input) {
    switch (name) {
        case "bolagsverket_check_status": {
            try {
                await tokenManager.getToken();
                return {
                    status: "OK",
                    message: "Anslutning till Bolagsverket fungerar",
                    timestamp: new Date().toISOString(),
                };
            }
            catch (error) {
                return {
                    status: "ERROR",
                    message: error instanceof Error ? error.message : "Okänt fel",
                };
            }
        }
        case "bolagsverket_get_basic_info": {
            const orgNummer = input.org_nummer;
            const data = (await getOrganisation(orgNummer));
            const org = data.organisationer?.[0];
            if (!org) {
                return { error: "Företaget hittades inte" };
            }
            return {
                organisationsnummer: org.organisationsnummer,
                namn: org.namn,
                bolagsform: org.foretagsform,
                status: org.status,
                registreringsdatum: org.registreringsdatum,
                sate: org.sate,
            };
        }
        case "bolagsverket_get_address": {
            const orgNummer = input.org_nummer;
            const data = (await getOrganisation(orgNummer));
            const org = data.organisationer?.[0];
            if (!org) {
                return { error: "Företaget hittades inte" };
            }
            return {
                postadress: org.postadress,
                sate: org.sate,
            };
        }
        case "bolagsverket_get_nyckeltal": {
            const orgNummer = input.org_nummer;
            return parseArsredovisning(orgNummer);
        }
        case "bolagsverket_list_arsredovisningar": {
            const orgNummer = input.org_nummer;
            const data = (await getDokumentlista(orgNummer));
            const arsredovisningar = (data.dokument || [])
                .filter((d) => d.typ === "Årsredovisning")
                .map((d) => ({
                period: d.rapporteringsperiodTom,
                registrerad: d.registreringstidpunkt,
            }));
            return {
                antal: arsredovisningar.length,
                arsredovisningar,
            };
        }
        case "bolagsverket_risk_analysis": {
            const orgNummer = input.org_nummer;
            const data = (await getOrganisation(orgNummer));
            const org = data.organisationer?.[0];
            if (!org) {
                return { error: "Företaget hittades inte" };
            }
            const warnings = [];
            let riskScore = 0;
            // Check status
            if (org.status !== "Aktivt" && org.status !== "Registrerat") {
                warnings.push(`Status: ${org.status}`);
                riskScore += 30;
            }
            // Check company type
            if (org.foretagsform === "Enskild näringsidkare") {
                warnings.push("Enskild firma - personligt ansvar");
                riskScore += 10;
            }
            const riskLevel = riskScore < 20 ? "LOW" : riskScore < 50 ? "MEDIUM" : "HIGH";
            return {
                foretag: org.namn,
                risk_score: riskScore,
                risk_level: riskLevel,
                warnings,
                recommendation: riskLevel === "LOW"
                    ? "Inga uppenbara risker identifierade"
                    : "Rekommenderar djupare granskning",
            };
        }
        case "bolagsverket_compare_companies": {
            const org1 = input.org_nummer_1;
            const org2 = input.org_nummer_2;
            const [data1, data2] = await Promise.all([
                getOrganisation(org1),
                getOrganisation(org2),
            ]);
            const company1 = data1.organisationer?.[0];
            const company2 = data2.organisationer?.[0];
            return {
                foretag_1: company1 || { error: "Ej funnet" },
                foretag_2: company2 || { error: "Ej funnet" },
            };
        }
        default:
            return { error: `Okänt verktyg: ${name}` };
    }
}
