import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { bolagsverketTools, executeBolagsverketTool } from "./tools.js";
import { createMcpServer } from "./mcp-server.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS for MCP connections
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "../public")));

// ===========================================
// MCP Endpoint for Remote Server URL
// ===========================================

// Store active transports
const transports: Map<string, SSEServerTransport> = new Map();

app.get("/sse", async (req, res) => {
  console.log("[MCP] SSE connection request received");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);

  console.log(`[MCP] SSE connection established, session: ${sessionId}`);

  // Send session ID to client
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on("close", () => {
    console.log(`[MCP] Client disconnected, session: ${sessionId}`);
    transports.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  console.log(`[MCP] Message received for session: ${sessionId}`);

  const transport = transports.get(sessionId);
  if (!transport) {
    console.error(`[MCP] No transport found for session: ${sessionId}`);
    return res.status(400).json({ error: "Invalid session" });
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("[MCP] Error handling message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// MCP Info endpoint
app.get("/mcp", (_req, res) => {
  res.json({
    name: "bolagsverket-mcp",
    version: "1.0.0",
    description: "MCP Server för Bolagsverkets Värdefulla Datamängder API",
    endpoints: {
      sse: "/sse",
      messages: "/messages",
    },
    tools: bolagsverketTools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
    usage: {
      claude_desktop: {
        mcpServers: {
          bolagsverket: {
            url: "https://b-mcp-api.onrender.com/sse"
          }
        }
      }
    }
  });
});

// ===========================================
// Health Check
// ===========================================

app.get("/health", async (_req, res) => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: `${heapUsedMB}MB`,
    endpoints: {
      chat: "/chat",
      mcp: "/mcp",
      sse: "/sse",
      tools: "/tools",
    }
  });
});

// ===========================================
// Chat endpoint with streaming (for web UI)
// ===========================================

app.post("/chat", async (req, res) => {
  const { messages, model = "claude-sonnet-4-20250514" } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey });

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let conversationMessages = [...messages];
    let continueLoop = true;

    while (continueLoop) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: `Du är en expert på svenska företagsdata och har tillgång till Bolagsverkets API.
Du kan hämta information om företag via deras organisationsnummer.

Viktiga instruktioner:
- Svara alltid på svenska
- Formatera finansiell data tydligt med tusentalsavgränsare
- Förklara vad nyckeltalen betyder för användaren
- Var hjälpsam och professionell`,
        messages: conversationMessages,
        tools: bolagsverketTools,
      });

      // Send text content
      for (const block of response.content) {
        if (block.type === "text") {
          res.write(
            `data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`
          );
        }
      }

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      if (toolUseBlocks.length > 0) {
        // Add assistant message with tool use
        conversationMessages.push({
          role: "assistant",
          content: response.content,
        });

        // Execute tools and add results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          if (toolUse.type === "tool_use") {
            res.write(
              `data: ${JSON.stringify({ type: "tool_call", name: toolUse.name, input: toolUse.input })}\n\n`
            );

            try {
              const result = await executeBolagsverketTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify(result, null, 2),
              });

              res.write(
                `data: ${JSON.stringify({ type: "tool_result", name: toolUse.name, success: true })}\n\n`
              );
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: errorMessage }),
                is_error: true,
              });

              res.write(
                `data: ${JSON.stringify({ type: "tool_result", name: toolUse.name, success: false, error: errorMessage })}\n\n`
              );
            }
          }
        }

        // Add tool results
        conversationMessages.push({
          role: "user",
          content: toolResults,
        });

        // Continue the loop to get Claude's response to the tool results
      } else {
        // No tool use, we're done
        continueLoop = false;
      }

      // Check stop reason
      if (response.stop_reason === "end_turn") {
        continueLoop = false;
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
    res.end();
  }
});

// ===========================================
// List available tools
// ===========================================

app.get("/tools", (_req, res) => {
  res.json({
    tools: bolagsverketTools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
});

// ===========================================
// Start Server
// ===========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`B-MCP Server running on port ${PORT}`);
  console.log(`  Chat UI: http://localhost:${PORT}/`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  MCP Info: http://localhost:${PORT}/mcp`);
  console.log(`  MCP SSE: http://localhost:${PORT}/sse`);
});
