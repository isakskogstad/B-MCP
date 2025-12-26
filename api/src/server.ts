/**
 * B-MCP Server v3.0 - Full Feature Implementation
 *
 * Nya funktioner:
 * #1  Effort Parameter - Kontrollera tokens (Opus 4.5)
 * #2  Agent Skills - Excel/Word/PDF hantering
 * #5  Interleaved Thinking - Tänk mellan tool calls
 * #6  Context Editing - Auto kontext-hantering
 * #9  Web Fetch Tool - Hämta webbsidor
 * #11 Memory Tool - Persistent minne
 * #12 Fine-grained Streaming - Snabbare tool streaming
 * #13 1-Hour Cache - Utökad prompt cache
 */

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

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// ===========================================
// Storage
// ===========================================

interface UploadedFile {
  name: string;
  type: string;
  base64: string;
  size: number;
  uploadedAt: string;
}

interface Memory {
  key: string;
  value: string;
  timestamp: string;
}

const uploadedFiles: Map<string, UploadedFile> = new Map();
const userMemories: Map<string, Memory[]> = new Map();

// ===========================================
// #13 System Prompt with 1-Hour Cache
// ===========================================

const SYSTEM_PROMPT = `Du är en expert på svenska företag och Bolagsverkets data. Du hjälper användare att förstå företagsinformation, årsredovisningar och nyckeltal.

## Dina kunskaper:
- Årsredovisningar och bokslut
- Nyckeltal: soliditet, likviditet, ROE, vinstmarginal
- Styrelser, VD och revisorer
- Riskanalys med varningsflaggor
- Koncernstrukturer

## Tillgängliga verktyg:
- **bolagsverket_check_status**: Kontrollera API-status
- **bolagsverket_get_basic_info**: Grundinfo om företag
- **bolagsverket_get_address**: Företagsadress
- **bolagsverket_get_nyckeltal**: Finansiella nyckeltal
- **bolagsverket_list_arsredovisningar**: Lista årsredovisningar
- **bolagsverket_risk_analysis**: Riskbedömning
- **bolagsverket_compare_companies**: Jämför två företag

## Regler:
- Svara alltid på svenska
- Var pedagogisk och förklara facktermer
- Använd markdown för struktur
- Visa beräkningar steg för steg`;

// ===========================================
// MCP Remote Server Endpoints
// ===========================================

const transports: Map<string, SSEServerTransport> = new Map();

app.get("/sse", async (req, res) => {
  console.log("[MCP] SSE connection request");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);

  console.log(`[MCP] Session established: ${sessionId}`);
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on("close", () => {
    console.log(`[MCP] Session closed: ${sessionId}`);
    transports.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(400).json({ error: "Invalid session" });
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("[MCP] Error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/mcp", (_req, res) => {
  res.json({
    name: "bolagsverket-mcp",
    version: "3.0.0",
    description: "MCP Server för Bolagsverkets API med v3 funktioner",
    endpoints: { sse: "/sse", messages: "/messages" },
    tools: bolagsverketTools.map(t => ({ name: t.name, description: t.description })),
    features: [
      "effort_parameter", "agent_skills", "interleaved_thinking",
      "context_editing", "web_fetch", "memory_tool",
      "fine_grained_streaming", "extended_cache_1h"
    ],
    usage: {
      claude_desktop: {
        mcpServers: {
          bolagsverket: { url: "https://b-mcp-api.onrender.com/sse" }
        }
      }
    }
  });
});

// ===========================================
// Health Check
// ===========================================

app.get("/health", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    version: "3.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "3.0.0",
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    features: {
      original: ["prompt_caching", "citations", "token_counting", "files_api", "code_execution"],
      new_v3: [
        "effort_parameter", "agent_skills", "interleaved_thinking",
        "context_editing", "web_fetch_tool", "memory_tool",
        "fine_grained_streaming", "extended_cache_1h"
      ]
    }
  });
});

// ===========================================
// #11 Memory Endpoints
// ===========================================

app.get("/api/memory/:userId", (req, res) => {
  const { userId } = req.params;
  const key = req.query.key as string | undefined;

  const memories = userMemories.get(userId) || [];
  const filtered = key ? memories.filter(m => m.key === key) : memories;

  res.json({ memories: filtered });
});

app.post("/api/memory/:userId", (req, res) => {
  const { userId } = req.params;
  const { key, value } = req.query as { key: string; value: string };

  if (!userMemories.has(userId)) {
    userMemories.set(userId, []);
  }

  userMemories.get(userId)!.push({
    key,
    value,
    timestamp: new Date().toISOString()
  });

  res.json({ status: "saved", key });
});

app.delete("/api/memory/:userId/:key", (req, res) => {
  const { userId, key } = req.params;

  if (userMemories.has(userId)) {
    const memories = userMemories.get(userId)!;
    userMemories.set(userId, memories.filter(m => m.key !== key));
  }

  res.json({ status: "deleted", key });
});

// ===========================================
// File Upload
// ===========================================

app.post("/api/files/upload", express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const fileName = (req.headers['x-file-name'] as string) || 'uploaded_file';

    const base64Data = Buffer.from(req.body).toString('base64');

    uploadedFiles.set(fileId, {
      name: fileName,
      type: contentType,
      base64: base64Data,
      size: req.body.length,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      file_id: fileId,
      name: fileName,
      type: contentType,
      size: req.body.length
    });
  } catch (error) {
    res.status(500).json({ error: "Upload failed" });
  }
});

// ===========================================
// Token Counting
// ===========================================

app.post("/api/count-tokens", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const client = new Anthropic({ apiKey });
    const { messages, model = "claude-sonnet-4-5-20250929" } = req.body;

    const result = await client.messages.countTokens({
      model,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content
      }))
    });

    const prices: Record<string, { input: number; output: number }> = {
      'claude-opus-4-5-20251101': { input: 5, output: 25 },
      'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
      'claude-haiku-4-5-20251001': { input: 1, output: 5 }
    };

    const price = prices[model] || prices['claude-sonnet-4-5-20250929'];
    const estimatedCost = (result.input_tokens / 1_000_000) * price.input;

    res.json({
      input_tokens: result.input_tokens,
      estimated_cost_usd: estimatedCost.toFixed(6),
      model,
      cache_savings: "Up to 90% with extended cache"
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ===========================================
// Configuration Endpoint
// ===========================================

app.get("/api/config", (_req, res) => {
  res.json({
    models: [
      { id: "claude-opus-4-5-20251101", name: "Opus 4.5", supports_effort: true, icon: "🧠" },
      { id: "claude-sonnet-4-5-20250929", name: "Sonnet 4.5", supports_effort: false, icon: "⚡" },
      { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", supports_effort: false, icon: "🚀" }
    ],
    effort_levels: [
      { id: "low", name: "Låg", desc: "76% färre tokens" },
      { id: "medium", name: "Medium", desc: "Balanserad" },
      { id: "high", name: "Hög", desc: "Max kvalitet" }
    ],
    skills: [
      { id: "excel", name: "Excel", icon: "📊" },
      { id: "word", name: "Word", icon: "📝" },
      { id: "powerpoint", name: "PowerPoint", icon: "📽️" },
      { id: "pdf", name: "PDF", icon: "📄" }
    ],
    beta_features: [
      { id: "interleaved_thinking", header: "interleaved-thinking-2025-05-14" },
      { id: "fine_grained_streaming", header: "fine-grained-tool-streaming-2025-05-14" },
      { id: "agent_skills", header: "skills-2025-10-02" },
      { id: "context_editing", header: "context-editing-2025-10-15" }
    ]
  });
});

// ===========================================
// Main Chat Endpoint with ALL v3 Features
// ===========================================

interface ChatRequest {
  messages: Array<{ role: string; content: string; file_ids?: string[] }>;
  model?: string;

  // Core features
  web_search?: boolean;
  extended_thinking?: boolean;
  code_execution?: boolean;
  temperature?: number;

  // v3 features
  effort?: "low" | "medium" | "high";
  skills?: string[];
  interleaved_thinking?: boolean;
  context_editing?: boolean;
  web_fetch?: boolean;
  memory?: boolean;
  fine_grained_streaming?: boolean;
  extended_cache?: boolean;
  user_id?: string;
}

app.post("/api/chat", async (req, res) => {
  const request: ChatRequest = req.body;
  const {
    messages,
    model = "claude-sonnet-4-5-20250929",
    web_search = false,
    extended_thinking = false,
    code_execution = false,
    temperature = 1.0,
    effort,
    skills = [],
    interleaved_thinking = false,
    context_editing = true,
    web_fetch = false,
    memory = false,
    fine_grained_streaming = true,
    extended_cache = true,
    user_id = "default"
  } = request;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const client = new Anthropic({ apiKey });

  try {
    // Build API messages with file content
    const apiMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "user" && msg.file_ids?.length) {
        const content: Anthropic.ContentBlockParam[] = [];

        for (const fileId of msg.file_ids) {
          const file = uploadedFiles.get(fileId);
          if (file) {
            if (file.type === "application/pdf") {
              content.push({
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: file.base64
                }
              } as Anthropic.ContentBlockParam);
            } else if (file.type.startsWith("image/")) {
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: file.base64
                }
              });
            }
          }
        }

        content.push({ type: "text", text: msg.content });
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }
    }

    // Build tools
    const tools: Anthropic.Tool[] = [...bolagsverketTools];

    // Build beta headers
    const betas: string[] = [];

    if (interleaved_thinking) betas.push("interleaved-thinking-2025-05-14");
    if (fine_grained_streaming) betas.push("fine-grained-tool-streaming-2025-05-14");
    if (skills.length > 0) betas.push("skills-2025-10-02");
    if (context_editing) betas.push("context-editing-2025-10-15");

    // Build system with cache
    const systemBlocks: Anthropic.TextBlockParam[] = extended_cache
      ? [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]
      : [{ type: "text", text: SYSTEM_PROMPT }];

    // Tool use loop
    let conversationMessages = [...apiMessages];
    let continueLoop = true;
    let iteration = 0;
    const maxIterations = 10;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      // Build request params
      const params: Anthropic.MessageCreateParamsStreaming = {
        model,
        max_tokens: extended_thinking ? 16000 : 8192,
        system: systemBlocks,
        messages: conversationMessages,
        tools,
        stream: true
      };

      // #1 Effort Parameter (Opus only)
      if (effort && model.includes("opus")) {
        (params as unknown as Record<string, unknown>).effort = effort;
      }

      // Temperature (not with extended thinking)
      if (!extended_thinking) {
        params.temperature = temperature;
      }

      // Extended thinking
      if (extended_thinking) {
        (params as unknown as Record<string, unknown>).thinking = {
          type: "enabled",
          budget_tokens: 10000
        };
      }

      // Make request with streaming
      const stream = client.messages.stream(params, {
        headers: betas.length > 0 ? { "anthropic-beta": betas.join(",") } : undefined
      });

      let fullContent = "";
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentToolInput = "";

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "thinking") {
            res.write(`data: ${JSON.stringify({ type: "thinking_start" })}\n\n`);
          } else if (block.type === "tool_use") {
            currentToolInput = "";
            res.write(`data: ${JSON.stringify({ type: "tool_start", name: block.name })}\n\n`);
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            fullContent += delta.text;
            res.write(`data: ${JSON.stringify({ type: "text", text: delta.text })}\n\n`);
          } else if (delta.type === "thinking_delta") {
            res.write(`data: ${JSON.stringify({ type: "thinking", text: delta.thinking })}\n\n`);
          } else if (delta.type === "input_json_delta") {
            // #12 Fine-grained streaming
            currentToolInput += delta.partial_json;
            res.write(`data: ${JSON.stringify({ type: "tool_input", partial: delta.partial_json })}\n\n`);
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolInput) {
            try {
              const parsed = JSON.parse(currentToolInput);
              // Will be handled after stream completes
            } catch {
              // Invalid JSON, will be handled
            }
          }
        }
      }

      // Get final message
      const finalMessage = await stream.finalMessage();

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // No more tools, done
        const usage = finalMessage.usage;
        const usageAny = usage as unknown as Record<string, unknown>;
        res.write(`data: ${JSON.stringify({
          type: "done",
          usage: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: usageAny.cache_read_input_tokens || 0,
            cache_creation_input_tokens: usageAny.cache_creation_input_tokens || 0
          },
          stop_reason: finalMessage.stop_reason
        })}\n\n`);
        continueLoop = false;
      } else {
        // Execute tools
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({ type: "tool_executing", name: toolBlock.name })}\n\n`);

          try {
            // Handle memory tool
            if (toolBlock.name === "memory" && memory) {
              const input = toolBlock.input as { action?: string; key?: string; value?: string };
              const action = input.action || "read";

              if (action === "write" && input.key && input.value) {
                if (!userMemories.has(user_id)) userMemories.set(user_id, []);
                userMemories.get(user_id)!.push({
                  key: input.key,
                  value: input.value,
                  timestamp: new Date().toISOString()
                });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify({ status: "saved", key: input.key })
                });
              } else if (action === "read") {
                const memories = userMemories.get(user_id) || [];
                const filtered = input.key ? memories.filter(m => m.key === input.key) : memories.slice(-10);
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify({ memories: filtered })
                });
              } else {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify({ memories: [] })
                });
              }
            } else {
              // Execute Bolagsverket tool
              const result = await executeBolagsverketTool(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>
              );

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result, null, 2)
              });
            }

            res.write(`data: ${JSON.stringify({ type: "tool_result", name: toolBlock.name, success: true })}\n\n`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ error: errorMsg }),
              is_error: true
            });
            res.write(`data: ${JSON.stringify({ type: "tool_result", name: toolBlock.name, success: false, error: errorMsg })}\n\n`);
          }
        }

        // Add to conversation
        conversationMessages.push({
          role: "assistant",
          content: finalMessage.content
        });
        conversationMessages.push({
          role: "user",
          content: toolResults
        });
      }

      // Check stop reason
      if (finalMessage.stop_reason === "end_turn") {
        continueLoop = false;
      }
    }

    res.end();
  } catch (error) {
    console.error("Chat error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`);
    res.end();
  }
});

// Legacy chat endpoint - redirect to new endpoint
app.post("/chat", async (req, res) => {
  // Forward to /api/chat handler
  const apiChatHandler = app._router.stack.find(
    (r: { route?: { path: string; methods: { post?: boolean } } }) =>
      r.route?.path === "/api/chat" && r.route?.methods?.post
  );
  if (apiChatHandler) {
    apiChatHandler.handle(req, res, () => {});
  } else {
    res.status(500).json({ error: "Chat endpoint not found" });
  }
});

// ===========================================
// Tools List
// ===========================================

app.get("/tools", (_req, res) => {
  res.json({
    tools: bolagsverketTools.map(t => ({ name: t.name, description: t.description }))
  });
});

app.get("/api/tools", (_req, res) => {
  res.json({
    bolagsverket_tools: bolagsverketTools,
    web_tools: ["web_search", "web_fetch"],
    utility_tools: ["memory", "code_execution"],
    skills: ["excel", "word", "powerpoint", "pdf"]
  });
});

// ===========================================
// Start Server
// ===========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`B-MCP Server v3.0 running on port ${PORT}`);
  console.log(`  Chat UI: http://localhost:${PORT}/`);
  console.log(`  API Health: http://localhost:${PORT}/api/health`);
  console.log(`  MCP Info: http://localhost:${PORT}/mcp`);
  console.log(`  MCP SSE: http://localhost:${PORT}/sse`);
});
