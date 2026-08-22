/**
 * Agentic Core 1.0 — Unified Tool Layer.
 *
 * Agenter får IKKE tilfeldig databasetilgang. De handler kun gjennom
 * registrerte verktøy med Zod-schema, permission, risikoklasse og audit.
 * Hvert verktøy vurderes av policy-motoren før kjøring.
 */

import { z } from "zod";
import type { AccessPermission } from "@/lib/access-control";
import type { ActionClass, ActionContext, AutonomyDecision } from "./schemas";
import { decideAutonomy } from "./policy-engine";

export interface ToolContext {
  userId?: string;
  role?: string;
  correlationId?: string;
  /** Overstyr/utfyll autonomi-signaler for denne kjøringen. */
  action?: Partial<ActionContext>;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Satt når policy krever godkjenning/menneske i stedet for kjøring. */
  decision?: AutonomyDecision;
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Minste tilgang som kreves for å kalle verktøyet. */
  permission: AccessPermission | "AUTHENTICATED";
  /** Handlingsklassen verktøyet representerer (driver risiko/autonomi). */
  actionClass: ActionClass;
  /** Statiske risiko-egenskaper som mates inn i policy-vurderingen. */
  risk?: Partial<Pick<ActionContext, "reversibility" | "channel" | "involvesPersonalData" | "legalSensitive">>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface ToolAuditEntry {
  tool: string;
  ts: string;
  userId?: string;
  correlationId?: string;
  decisionMode?: AutonomyDecision["mode"];
  ok: boolean;
  error?: string;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition<any, any>>();
  private auditLog: ToolAuditEntry[] = [];

  register<I, O>(tool: ToolDefinition<I, O>): this {
    if (this.tools.has(tool.name)) throw new Error(`Verktøy «${tool.name}» er allerede registrert.`);
    this.tools.set(tool.name, tool as ToolDefinition<any, any>);
    return this;
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values());
  }

  /** Maskin-lesbar katalog (for agent-prompt / MCP-eksponering). */
  describe() {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
      actionClass: t.actionClass,
    }));
  }

  getAudit() {
    return [...this.auditLog];
  }

  /**
   * Validerer input, vurderer policy, og kjører kun hvis autonomien tillater
   * «live». Ellers returneres beslutningen (utkast/godkjenning/menneske) uten
   * å utføre handlingen. Alt logges til audit.
   */
  async run<I, O>(name: string, rawInput: unknown, ctx: ToolContext = {}): Promise<ToolResult<O>> {
    const tool = this.tools.get(name) as ToolDefinition<I, O> | undefined;
    if (!tool) return this.audit(name, ctx, { ok: false, error: `Ukjent verktøy «${name}».` });

    const parsed = tool.input.safeParse(rawInput);
    if (!parsed.success) {
      return this.audit(name, ctx, { ok: false, error: `Ugyldig input: ${parsed.error.issues.map((i) => i.message).join("; ")}` });
    }

    const action: ActionContext = {
      actionClass: tool.actionClass,
      agentId: ctx.role || "agent",
      reversibility: tool.risk?.reversibility,
      channel: tool.risk?.channel,
      involvesPersonalData: tool.risk?.involvesPersonalData,
      legalSensitive: tool.risk?.legalSensitive,
      ...ctx.action,
    };
    const decision = decideAutonomy(action);

    if (decision.mode !== "live") {
      // Ikke utfør — returner beslutningen så approval-gateway/agent kan håndtere den.
      return this.audit(name, ctx, { ok: true, decision }, decision);
    }

    try {
      const data = await tool.handler(parsed.data, ctx);
      return this.audit(name, ctx, { ok: true, data, decision }, decision);
    } catch (err) {
      return this.audit(name, ctx, { ok: false, error: err instanceof Error ? err.message : String(err), decision }, decision);
    }
  }

  private audit<O>(name: string, ctx: ToolContext, result: ToolResult<O>, decision?: AutonomyDecision): ToolResult<O> {
    this.auditLog.push({
      tool: name,
      ts: new Date().toISOString(),
      userId: ctx.userId,
      correlationId: ctx.correlationId,
      decisionMode: decision?.mode,
      ok: result.ok,
      error: result.error,
    });
    return result;
  }
}

export function defineTool<I, O>(tool: ToolDefinition<I, O>): ToolDefinition<I, O> {
  return tool;
}
