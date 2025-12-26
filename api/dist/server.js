import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import { bolagsverketTools, executeBolagsverketTool } from "./tools.js";
const app = express();
app.use(cors());
app.use(express.json());
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Chat endpoint with streaming
app.post("/chat", async (req, res) => {
    const { messages, model = "claude-opus-4-5-20250929" } = req.body;
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
                    res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
                }
            }
            // Check for tool use
            const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
            if (toolUseBlocks.length > 0) {
                // Add assistant message with tool use
                conversationMessages.push({
                    role: "assistant",
                    content: response.content,
                });
                // Execute tools and add results
                const toolResults = [];
                for (const toolUse of toolUseBlocks) {
                    if (toolUse.type === "tool_use") {
                        res.write(`data: ${JSON.stringify({ type: "tool_call", name: toolUse.name, input: toolUse.input })}\n\n`);
                        try {
                            const result = await executeBolagsverketTool(toolUse.name, toolUse.input);
                            toolResults.push({
                                type: "tool_result",
                                tool_use_id: toolUse.id,
                                content: JSON.stringify(result, null, 2),
                            });
                            res.write(`data: ${JSON.stringify({ type: "tool_result", name: toolUse.name, success: true })}\n\n`);
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : "Unknown error";
                            toolResults.push({
                                type: "tool_result",
                                tool_use_id: toolUse.id,
                                content: JSON.stringify({ error: errorMessage }),
                                is_error: true,
                            });
                            res.write(`data: ${JSON.stringify({ type: "tool_result", name: toolUse.name, success: false, error: errorMessage })}\n\n`);
                        }
                    }
                }
                // Add tool results
                conversationMessages.push({
                    role: "user",
                    content: toolResults,
                });
                // Continue the loop to get Claude's response to the tool results
            }
            else {
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
    }
    catch (error) {
        console.error("Chat error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
        res.end();
    }
});
// List available tools
app.get("/tools", (_req, res) => {
    res.json({
        tools: bolagsverketTools.map((t) => ({
            name: t.name,
            description: t.description,
        })),
    });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`B-MCP API running on port ${PORT}`);
});
