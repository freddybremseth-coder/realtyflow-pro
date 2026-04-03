"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  Mail,
  FileText,
  TrendingUp,
  Users,
  Sparkles,
  ChevronRight,
  Loader2,
  X,
  MessageSquare,
  Crown,
  Zap,
  Brain,
  Play,
  Rocket,
  ChevronDown,
  ChevronUp,
  History,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// --- Types ---

interface PlanStep {
  id: number;
  description: string;
  agent: string;
  system: string;
  status: "pending" | "running" | "done" | "error";
  result?: string;
}

interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: "draft" | "confirmed" | "executing" | "done" | "error";
}

interface Execution {
  id: string;
  planId: string;
  startedAt: number;
  completedSteps: number;
  totalSteps: number;
  elapsedSeconds: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  plan?: Plan;
  execution?: Execution;
}

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  color: string;
  status: "active" | "idle" | "busy";
  currentTask?: string;
  lastActivity: string;
  tasksCompleted: number;
}

// --- Data ---

const agents: AgentInfo[] = [
  {
    id: "ceo",
    name: "Victoria CEO",
    role: "Strategisk leder & koordinator",
    color: "#06b6d4",
    status: "active",
    lastActivity: "Akkurat n\u00e5",
    tasksCompleted: 47,
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    role: "Kampanjer & innhold",
    color: "#ec4899",
    status: "idle",
    lastActivity: "12 min siden",
    tasksCompleted: 34,
  },
  {
    id: "sales",
    name: "Sales Agent",
    role: "Leads & salg",
    color: "#f59e0b",
    status: "idle",
    lastActivity: "34 min siden",
    tasksCompleted: 28,
  },
  {
    id: "seo",
    name: "SEO Agent",
    role: "S\u00f8kemotoroptimalisering",
    color: "#10b981",
    status: "idle",
    lastActivity: "2 timer siden",
    tasksCompleted: 19,
  },
  {
    id: "business",
    name: "Business Agent",
    role: "Forretningsstrategi",
    color: "#8b5cf6",
    status: "idle",
    lastActivity: "5 timer siden",
    tasksCompleted: 15,
  },
  {
    id: "youtube",
    name: "YouTube Agent",
    role: "Video & manus",
    color: "#ef4444",
    status: "idle",
    lastActivity: "1 time siden",
    tasksCompleted: 22,
  },
  {
    id: "multi-domain",
    name: "Multi-Domain Expert",
    role: "Tverrfaglig koordinering",
    color: "#3b82f6",
    status: "idle",
    lastActivity: "20 min siden",
    tasksCompleted: 31,
  },
];

const suggestedCommands = [
  "Send oppf\u00f8lgingsepost til alle leads i pipeline",
  "Lag en Facebook-kampanje for Soleada sine nye eiendommer",
  "Generer innhold for alle brands denne uken",
  "Analyser hvilke leads som er kaldest og lag en varmekampanje",
  "Lag lead magnet for Zen Eco Homes",
  "Send ukentlig nyhetsbrev til alle kontakter",
  "Start A/B test p\u00e5 Instagram-innhold for Neural Beat",
  "Vis meg status p\u00e5 alle brands",
];

// recentActions is now loaded dynamically from Supabase (see state in component)

// --- Helper Components ---

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Crown size={14} className="text-cyan-400" />
      </div>
      <div className="bg-slate-800 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onExecute,
  onCancel,
}: {
  plan: Plan;
  onExecute: () => void;
  onCancel: () => void;
}) {
  const statusLabels: Record<string, string> = {
    draft: "Venter p\u00e5 bekreftelse",
    confirmed: "Bekreftet",
    executing: "Utf\u00f8rer...",
    done: "Fullf\u00f8rt",
    error: "Feil oppsto",
  };

  const stepIcons: Record<string, React.ReactNode> = {
    pending: <Clock size={14} className="text-slate-500" />,
    running: <Loader2 size={14} className="text-cyan-400 animate-spin" />,
    done: <CheckCircle size={14} className="text-emerald-400" />,
    error: <AlertCircle size={14} className="text-red-400" />,
  };

  const systemIcons: Record<string, React.ReactNode> = {
    CRM: <Users size={12} className="text-amber-400" />,
    "Content Studio": <FileText size={12} className="text-pink-400" />,
    "Email AI": <Mail size={12} className="text-blue-400" />,
    Analytics: <TrendingUp size={12} className="text-emerald-400" />,
    Marketing: <Sparkles size={12} className="text-purple-400" />,
    SEO: <TrendingUp size={12} className="text-green-400" />,
    YouTube: <Play size={12} className="text-red-400" />,
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-cyan-400" />
        <span className="text-sm font-semibold text-white">Plan: {plan.title}</span>
      </div>
      <div className="space-y-2">
        {plan.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2">
            <div className="mt-0.5">{stepIcons[step.status]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">{step.id}. {step.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Bot size={10} />
                  {step.agent}
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  {systemIcons[step.system] || <Zap size={10} />}
                  {step.system}
                </Badge>
                {step.result && (
                  <span className="text-[10px] text-emerald-400">{step.result}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-700">
        <span className="text-xs text-slate-400">
          Status: {statusLabels[plan.status] || plan.status}
        </span>
        {plan.status === "draft" && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onExecute} className="gap-1.5 text-xs">
              <Rocket size={12} />
              Kj\u00f8r plan
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs">
              <X size={12} />
              Avbryt
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionCard({ execution, plan }: { execution: Execution; plan?: Plan }) {
  const stepIcons: Record<string, React.ReactNode> = {
    pending: <Clock size={14} className="text-slate-500" />,
    running: <Loader2 size={14} className="text-cyan-400 animate-spin" />,
    done: <CheckCircle size={14} className="text-emerald-400" />,
    error: <AlertCircle size={14} className="text-red-400" />,
  };

  return (
    <div className="bg-slate-800/80 border border-cyan-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-cyan-400" />
        <span className="text-sm font-semibold text-white">
          Utf\u00f8rer: {plan?.title || "Oppgave"}
        </span>
      </div>
      {plan && (
        <div className="space-y-1.5">
          {plan.steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2">
              {stepIcons[step.status]}
              <span className={`text-sm ${step.status === "done" ? "text-slate-300" : step.status === "running" ? "text-white" : "text-slate-500"}`}>
                Steg {step.id}: {step.description}
                {step.result && <span className="text-emerald-400 ml-1">- {step.result}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-slate-500">
        Tid: {execution.elapsedSeconds} sekunder
      </div>
    </div>
  );
}

// --- Types for persistence ---

interface ConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived";
  updated_at: string;
  has_plan: boolean;
}

// --- Main Page ---

export default function AgentsCommandCenter() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentInfo[]>(agents);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [recentActions, setRecentActions] = useState<{label: string; time: string; status: "done" | "error"}[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const executionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch real recent actions from Supabase
  const fetchRecentActions = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      // Fetch recent command executions
      const { data: executions } = await supabase
        .from("command_executions")
        .select("plan_title, status, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(4);

      // Fetch recent content publications as fallback/supplement
      const { data: publications } = await supabase
        .from("content_publications")
        .select("title, status, created_at")
        .in("status", ["published", "scheduled", "failed"])
        .order("created_at", { ascending: false })
        .limit(4);

      const actions: {label: string; time: string; status: "done" | "error"}[] = [];

      if (executions && executions.length > 0) {
        for (const exec of executions) {
          const d = new Date(exec.created_at);
          actions.push({
            label: exec.plan_title || exec.summary || "Plan utfort",
            time: d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }),
            status: exec.status === "completed" ? "done" : "error",
          });
        }
      }

      if (publications && publications.length > 0) {
        for (const pub of publications) {
          if (actions.length >= 6) break;
          const d = new Date(pub.created_at);
          actions.push({
            label: `${pub.status === "published" ? "Publisert" : pub.status === "scheduled" ? "Planlagt" : "Feilet"}: ${pub.title || "Uten tittel"}`,
            time: d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }),
            status: pub.status === "failed" ? "error" : "done",
          });
        }
      }

      // Sort by time descending and take top 6
      setRecentActions(actions.slice(0, 6));
    } catch (err) {
      console.error("Failed to fetch recent actions:", err);
    }
  }, []);

  // ── Conversation persistence ──

  const saveConversation = useCallback(async (msgs: ChatMessage[], plan: Plan | null, convId: string | null) => {
    const supabase = getSupabase();
    if (!supabase || msgs.length === 0) return convId;

    // Derive title from first user message
    const firstUserMsg = msgs.find((m) => m.role === "user");
    const title = firstUserMsg?.content?.slice(0, 100) || "Ny samtale";

    const payload = {
      title,
      messages: JSON.parse(JSON.stringify(msgs)),
      active_plan: plan ? JSON.parse(JSON.stringify(plan)) : null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (convId) {
        await supabase.from("command_conversations").update(payload).eq("id", convId);
        return convId;
      } else {
        const { data } = await supabase.from("command_conversations").insert({ ...payload, status: "active" }).select("id").single();
        if (data?.id) {
          setConversationId(data.id);
          return data.id as string;
        }
      }
    } catch (err) {
      console.error("Failed to save conversation:", err);
    }
    return convId;
  }, []);

  const debouncedSave = useCallback((msgs: ChatMessage[], plan: Plan | null, convId: string | null) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveConversation(msgs, plan, convId);
    }, 1000);
  }, [saveConversation]);

  const loadConversations = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from("command_conversations")
        .select("id, title, status, updated_at, active_plan")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (data) {
        setConversations(data.map((c: { id: string; title: string; status: string; updated_at: string; active_plan: unknown }) => ({
          id: c.id,
          title: c.title || "Uten tittel",
          status: c.status as "active" | "archived",
          updated_at: c.updated_at,
          has_plan: !!c.active_plan,
        })));
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      const { data } = await supabase.from("command_conversations").select("*").eq("id", id).single();
      if (data) {
        setConversationId(data.id);
        setMessages(data.messages || []);
        setActivePlan(data.active_plan || null);
        setShowHistory(false);
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      await supabase.from("command_conversations").delete().eq("id", id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setActivePlan(null);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }, [conversationId]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setActivePlan(null);
    setShowHistory(false);
  }, []);

  // Auto-save when messages change
  useEffect(() => {
    if (messages.length > 0) {
      debouncedSave(messages, activePlan, conversationId);
    }
  }, [messages, activePlan, conversationId, debouncedSave]);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Cleanup timer on unmount + fetch recent actions + load conversations
  useEffect(() => {
    fetchRecentActions();
    loadConversations();
    return () => {
      if (executionTimerRef.current) clearInterval(executionTimerRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [fetchRecentActions, loadConversations]);

  const handleSend = async (overrideMessage?: string) => {
    const userMsg = (overrideMessage || input).trim();
    if (!userMsg || executing) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setThinking(true);

    // Check if this is an execution command (user confirms to run the plan)
    const isExecuteCommand = activePlan != null &&
      /^(start|kjør|kj[oø]r|sett i gang|utfør|utf[oø]r|gjør det|gj[oø]r det|ja\s*,?\s*(kjør|kj[oø]r|start|utfør)|bekreft|ok|greit|jada|ja takk|ja!?$)/i.test(userMsg);

    try {
      const res = await fetch("/api/agents/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          conversation: messages,
          execute: isExecuteCommand,
          currentPlan: activePlan,
        }),
      });

      const data = await res.json();

      // Map API status values to client-side status values
      const mapStepStatus = (st: string): PlanStep["status"] => {
        if (st === "completed") return "done";
        if (st === "failed") return "error";
        if (st === "running" || st === "done" || st === "error" || st === "pending") return st;
        return "pending";
      };
      const mapPlanStatus = (st: string): Plan["status"] => {
        if (st === "completed") return "done";
        if (st === "failed") return "error";
        if (st === "executing") return "executing";
        if (st === "confirmed" || st === "draft" || st === "done" || st === "error") return st;
        return "draft";
      };

      // Map the plan to correct client-side statuses BEFORE storing in message
      let mappedPlan: Plan | undefined;
      if (data.plan) {
        mappedPlan = {
          id: data.plan.id || `plan-${Date.now()}`,
          title: data.plan.title || "Plan",
          status: mapPlanStatus(data.plan.status || "draft"),
          steps: (data.plan.steps || []).map((s: { id?: number; description: string; agent: string; system: string; status?: string; result?: string }, idx: number) => ({
            ...s,
            id: s.id || idx + 1,
            status: mapStepStatus(s.status || "pending"),
          })),
        };
        setActivePlan(mappedPlan);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          plan: mappedPlan,
          execution: data.execution,
        },
      ]);
      if (data.execution) {
        // Execution is already complete (synchronous API). Map statuses and show results.
        const executionSteps = (data.execution.steps || []).map((s: { id?: number; description: string; agent: string; system: string; status?: string; result?: string }) => ({
          ...s,
          status: mapStepStatus(s.status || "pending"),
        }));
        const completedCount = executionSteps.filter((s: { status: string }) => s.status === "done").length;
        const executionPlanStatus: Plan["status"] =
          data.execution.status === "completed" || data.execution.status === "partial" ? "done" : "error";

        // Update the active plan with execution results
        const donePlan: Plan = {
          ...(activePlan || { id: `plan-${Date.now()}`, title: "Plan" }),
          status: executionPlanStatus,
          steps: executionSteps,
        };
        setActivePlan(donePlan);

        // Update the last message to show completed plan with results
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              plan: donePlan,
              execution: {
                id: data.execution.id || `exec-${Date.now()}`,
                planId: donePlan.id,
                startedAt: Date.now(),
                completedSteps: completedCount,
                totalSteps: executionSteps.length,
                elapsedSeconds: 0,
              },
            };
          }
          return updated;
        });

        // Also mark the original plan message as "done" so button disappears
        setMessages((prev) =>
          prev.map((m) =>
            m.plan && m.plan.status === "draft"
              ? { ...m, plan: { ...m.plan, status: "done" as const } }
              : m
          )
        );

        // Refresh recent actions and conversation list after execution
        fetchRecentActions();
        loadConversations();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Beklager, kunne ikke n\u00e5 AI-systemet. Sjekk at ANTHROPIC_API_KEY er konfigurert.",
        },
      ]);
    }
    setThinking(false);
  };

  const pollExecution = (executionId: string) => {
    let elapsed = 0;
    executionTimerRef.current = setInterval(async () => {
      elapsed += 2;
      try {
        const res = await fetch(`/api/agents/command/status?id=${executionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.done) {
            if (executionTimerRef.current) clearInterval(executionTimerRef.current);
            setExecuting(false);
            if (data.plan) setActivePlan(data.plan);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: data.response || "Plan fullf\u00f8rt!",
                plan: data.plan,
              },
            ]);
            // Update agent statuses to reflect completed work
            setAgentStatuses((prev) =>
              prev.map((a) => ({
                ...a,
                status: "idle" as const,
                currentTask: undefined,
              }))
            );
          } else if (data.plan) {
            // Update progress in last execution message
            setMessages((prev) => {
              const updated = [...prev];
              const lastExecIdx = updated.findLastIndex((m) => m.execution);
              if (lastExecIdx >= 0) {
                updated[lastExecIdx] = {
                  ...updated[lastExecIdx],
                  execution: {
                    ...updated[lastExecIdx].execution!,
                    elapsedSeconds: elapsed,
                    completedSteps: data.plan.steps.filter(
                      (s: PlanStep) => s.status === "done"
                    ).length,
                  },
                  plan: data.plan,
                };
              }
              return updated;
            });
            // Update agent statuses
            if (data.activeAgents) {
              setAgentStatuses((prev) =>
                prev.map((a) => {
                  const active = data.activeAgents.find(
                    (aa: { id: string; task: string }) => aa.id === a.id
                  );
                  return active
                    ? { ...a, status: "busy" as const, currentTask: active.task }
                    : { ...a, status: a.id === "ceo" ? "active" as const : "idle" as const, currentTask: undefined };
                })
              );
            }
          }
        }
      } catch {
        // Silently continue polling
      }

      // Safety: stop polling after 5 minutes
      if (elapsed > 300) {
        if (executionTimerRef.current) clearInterval(executionTimerRef.current);
        setExecuting(false);
      }
    }, 2000);
  };

  const handleExecutePlan = () => {
    handleSend("Kj\u00f8r");
  };

  const handleCancelPlan = () => {
    setActivePlan(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Plan avbrutt. Hva vil du gj\u00f8re i stedet?" },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const totalTasksToday = agentStatuses.reduce((sum, a) => sum + a.tasksCompleted, 0);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Brain className="text-cyan-400" size={20} />
            </div>
            AI Kommandosenter
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Snakk med Victoria - din strategiske AI-assistent
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={startNewConversation}
            className="gap-1.5"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Ny samtale</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowHistory(!showHistory); loadConversations(); }}
            className="gap-1.5"
          >
            <History size={14} />
            <span className="hidden sm:inline">Historikk</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobilePanel(!mobilePanel)}
          >
            {mobilePanel ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            <span className="ml-1.5">Agenter</span>
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Chat */}
        <div className="flex-[3] flex flex-col min-w-0">
          <Card className="flex-1 flex flex-col min-h-0 border-slate-700">
            {/* Chat Messages */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !thinking && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4">
                    <Crown size={28} className="text-cyan-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white mb-1">Hei Freddy!</h2>
                  <p className="text-sm text-slate-400 mb-6 max-w-md">
                    Jeg er Victoria, din strategiske AI-assistent. Fortell meg hva du vil
                    oppn\u00e5, s\u00e5 koordinerer jeg alle agentene for \u00e5 f\u00e5 det gjort.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                    {suggestedCommands.map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => handleSend(cmd)}
                        className="text-left text-xs text-slate-300 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors flex items-center gap-2"
                      >
                        <ChevronRight size={12} className="text-cyan-400 flex-shrink-0" />
                        <span>{cmd}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-primary-600 text-white rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Crown size={14} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                          Victoria
                        </div>
                        {msg.content && (
                          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </div>
                        )}
                        {msg.plan && (
                          <PlanCard
                            plan={msg.plan}
                            onExecute={handleExecutePlan}
                            onCancel={handleCancelPlan}
                          />
                        )}
                        {msg.execution && (
                          <ExecutionCard
                            execution={msg.execution}
                            plan={msg.plan}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {thinking && <ThinkingIndicator />}
              <div ref={chatEndRef} />
            </CardContent>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-700 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    executing
                      ? "Venter p\u00e5 at planen fullf\u00f8res..."
                      : "Fortell Victoria hva du vil gj\u00f8re..."
                  }
                  disabled={executing}
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 disabled:opacity-50 min-h-[42px] max-h-[160px]"
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || executing}
                  className="h-[42px] w-[42px] p-0 flex-shrink-0"
                >
                  {executing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                Shift+Enter for ny linje - Enter for \u00e5 sende
              </p>
            </div>
          </Card>
        </div>

        {/* Right: Agent Status Panel */}
        <div
          className={`flex-[2] flex flex-col gap-4 min-h-0 overflow-y-auto ${
            mobilePanel ? "block" : "hidden"
          } lg:flex`}
        >
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            {[
              { label: "Oppgaver i dag", value: totalTasksToday, icon: Zap, color: "text-cyan-400" },
              { label: "Vellykket", value: "98%", icon: CheckCircle, color: "text-emerald-400" },
              { label: "E-poster sendt", value: 156, icon: Mail, color: "text-blue-400" },
              { label: "Innhold generert", value: 42, icon: FileText, color: "text-pink-400" },
            ].map((stat) => (
              <Card key={stat.label} className="border-slate-700">
                <CardContent className="p-3 flex items-center gap-2.5">
                  <stat.icon size={16} className={stat.color} />
                  <div>
                    <p className="text-lg font-bold text-white leading-none">{stat.value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Agent Status List */}
          <Card className="border-slate-700 flex-shrink-0">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Agenter
                </span>
              </div>
              <div className="space-y-1">
                {agentStatuses.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-800/50 transition-colors"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          agent.status === "busy"
                            ? agent.color
                            : agent.status === "active"
                            ? agent.color
                            : "#475569",
                        boxShadow:
                          agent.status === "busy"
                            ? `0 0 8px ${agent.color}80`
                            : "none",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {agent.name}
                        </span>
                        {agent.id === "ceo" && (
                          <Crown size={10} className="text-cyan-400 flex-shrink-0" />
                        )}
                      </div>
                      {agent.currentTask ? (
                        <p className="text-[10px] text-cyan-400 truncate">{agent.currentTask}</p>
                      ) : (
                        <p className="text-[10px] text-slate-500">{agent.lastActivity}</p>
                      )}
                    </div>
                    <Badge
                      variant={
                        agent.status === "busy"
                          ? "warning"
                          : agent.status === "active"
                          ? "success"
                          : "secondary"
                      }
                      className="text-[9px] px-1.5"
                    >
                      {agent.status === "busy"
                        ? "Opptatt"
                        : agent.status === "active"
                        ? "Aktiv"
                        : "Klar"}
                    </Badge>
                    <span className="text-[10px] text-slate-600 w-6 text-right flex-shrink-0">
                      {agent.tasksCompleted}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Active Plans */}
          {activePlan && activePlan.status !== "done" && (
            <Card className="border-slate-700 flex-shrink-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Rocket size={14} className="text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Aktiv plan
                  </span>
                </div>
                <div className="bg-slate-800/50 rounded-md p-2.5">
                  <p className="text-xs font-medium text-white mb-1">{activePlan.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        activePlan.status === "executing"
                          ? "warning"
                          : activePlan.status === "draft"
                          ? "outline"
                          : "success"
                      }
                      className="text-[9px]"
                    >
                      {activePlan.status === "draft"
                        ? "Venter"
                        : activePlan.status === "executing"
                        ? "Utf\u00f8rer"
                        : activePlan.status}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {activePlan.steps.filter((s) => s.status === "done").length}/
                      {activePlan.steps.length} steg
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conversation History */}
          {showHistory && (
            <Card className="border-slate-700 flex-shrink-0">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-cyan-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Samtalehistorikk
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="h-6 w-6 p-0">
                    <X size={12} />
                  </Button>
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {conversations.length === 0 ? (
                    <p className="text-xs text-slate-500">Ingen tidligere samtaler.</p>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`flex items-start gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors group ${
                          conv.id === conversationId ? "bg-cyan-500/10 border border-cyan-500/30" : "hover:bg-slate-800/50"
                        }`}
                        onClick={() => loadConversation(conv.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-200 truncate">{conv.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500">
                              {new Date(conv.updated_at).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                            </span>
                            {conv.has_plan && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5">
                                <Rocket size={8} />
                                Plan
                              </Badge>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Actions */}
          <Card className="border-slate-700 flex-shrink-0">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Siste handlinger
                </span>
              </div>
              <div className="space-y-2">
                {recentActions.length === 0 ? (
                  <p className="text-xs text-slate-500">Ingen handlinger enna.</p>
                ) : (
                  recentActions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {action.status === "done" ? (
                        <CheckCircle size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 leading-snug">{action.label}</p>
                        <p className="text-[10px] text-slate-600">{action.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
