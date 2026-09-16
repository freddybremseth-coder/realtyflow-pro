# Nexus agent audit notes — 2026-09-16

Verified during advisor routing work:

- AgentOrchestrator exposes eight specialist capabilities: marketing, sales, SEO, business, multi-domain, YouTube, CEO and scheduling.
- EmailAgent (Elena Email AI) is worker-owned by the Communications/email processing path rather than the generic AgentOrchestrator.
- Nexus AI should route work to existing agents, automations, missions and review surfaces rather than create parallel execution paths.
- The legacy Agent Command dashboard still reads `command_executions`; production activity has moved to durable `agent_runs` and Automation Registry workers. Agent Fleet observability must therefore be modernized separately.
