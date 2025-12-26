import Anthropic from "@anthropic-ai/sdk";
export declare const bolagsverketTools: Anthropic.Tool[];
export declare function executeBolagsverketTool(name: string, input: Record<string, unknown>): Promise<unknown>;
