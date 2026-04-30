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
  Globe,
  User,
  Eye,
  ArrowLeft,
  ExternalLink,
  Phone,
  AtSign,
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

interface CommandCenterStats {
  tasksToday: number | null;
  successRate: number | null;
  emailsToday: number | null;
  contentToday: number | null;
}

// --- Data ---

const agents: AgentInfo[] = [
  {
    id: "ceo",
    name: "Victoria CEO",
    role: "Strategisk leder & koordinator",
    color: "#06b6d4",
    status: "active",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    role: "Kampanjer & innhold",
    color: "#ec4899",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "sales",
    name: "Sales Agent",
    role: "Leads & salg",
    color: "#f59e0b",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "seo",
    name: "Victoria SEO",
    role: "SEO, Google & organisk vekst",
    color: "#10b981",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "business",
    name: "Business Agent",
    role: "Forretningsstrategi",
    color: "#8b5cf6",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "youtube",
    name: "YouTube Agent",
    role: "Video & manus",
    color: "#ef4444",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
  {
    id: "multi-domain",
    name: "Multi-Domain Expert",
    role: "Tverrfaglig koordinering",
    color: "#3b82f6",
    status: "idle",
    lastActivity: "Klar",
    tasksCompleted: 0,
  },
];

const suggestedCommands = [
  "Victoria, analyser SEO for Zen Eco Homes og deleger konkrete oppgaver til agentene",
  "Send oppfølgingsepost til alle leads i pipeline",
  "Lag en Facebook-kampanje for Soleada sine nye eiendommer",
  "Generer innhold for alle brands denne uken",
  "Analyser hvilke leads som er kaldest og lag en varmekampanje",
  "Lag lead magnet for Zen Eco Homes",
  "Send ukentlig nyhetsbrev til alle kontakter",
  "Start A/B test på Instagram-innhold for Neural Beat",
  "Vis meg status på alle brands",
];

function cleanVictoriaText(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/Ã¥/g, "å")
    .replace(/Ã¸/g, "ø")
    .replace(/Ã¦/g, "æ")
    .replace(/Ã…/g, "Å")
    .replace(/Ã˜/g, "Ø")
    .replace(/Ã†/g, "Æ")
    .replace(/Â/g, "");
}

function todayIsoStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatRelativeActivity(dateValue?: string | null) {
  if (!dateValue) return "Ingen registrert aktivitet";
  const diff = Date.now() - new Date(dateValue).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "Nylig aktivitet";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Akkurat nå";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.round(hours / 24);
  return `${days} d siden`;
}

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
    draft: "Venter på bekreftelse",
    confirmed: "Bekreftet",
    executing: "Utfører...",
    done: "Fullført",
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
        <span className="text-sm font-semibold text-white">Plan: {cleanVictoriaText(plan.title)}</span>
      </div>
      <div className="space-y-2">
        {plan.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2">
            <div className="mt-0.5">{stepIcons[step.status]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">{step.id}. {cleanVictoriaText(step.description)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Bot size={10} />
                  {cleanVictoriaText(step.agent)}
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  {systemIcons[step.system] || <Zap size={10} />}
                  {cleanVictoriaText(step.system)}
                </Badge>
                {step.result && (
                  <span className="text-[10px] text-emerald-400">{cleanVictoriaText(step.result)}</span>
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
              Kjør plan
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
          Utfører: {cleanVictoriaText(plan?.title) || "Oppgave"}
        </span>
      </div>
      {plan && (
        <div className="space-y-1.5">
          {plan.steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2">
              {stepIcons[step.status]}
              <span className={`text-sm ${step.status === "done" ? "text-slate-300" : step.status === "running" ? "text-white" : "text-slate-500"}`}>
                Steg {step.id}: {cleanVictoriaText(step.description)}
                {step.result && <span className="text-emerald-400 ml-1">- {cleanVictoriaText(step.result)}</span>}
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

// --- Chatbot types ---

interface ChatbotSession {
  id: string;
  brand_id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone: string;
  page_url: string;
  message_count: number;
  is_lead: boolean;
  created_at: string;
  updated_at: string;
  messages?: { role: string; content: string }[];
}

const CHATBOT_BRANDS = [
  { id: "all", label: "Alle", color: "#6b7280" },
  { id: "pinosoecolife", label: "Pinoso Ecolife", color: "#84cc16", domain: "pinosoecolife.com" },
  { id: "zeneco", label: "Zen Eco Homes", color: "#10b981", domain: "zenecohomes.com" },
  { id: "chatgenius", label: "ChatGenius", color: "#8b5cf6", domain: "chatgenius.com" },
  { id: "donaanna", label: "Dona Anna", color: "#f59e0b", domain: "donaanna.com" },
  { id: "freddyb", label: "Freddy Bremseth", color: "#3b82f6", domain: "freddybremseth.com" },
];

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
  const [runtimeStats, setRuntimeStats] = useState<CommandCenterStats>({
    tasksToday: null,
    successRate: null,
    emailsToday: null,
    contentToday: null,
  });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const executionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chatbot conversations state
  const [activeView, setActiveView] = useState<"victoria" | "chatbot">("victoria");
  const [chatbotSessions, setChatbotSessions] = useState<ChatbotSession[]>([]);
  const [chatbotBrandFilter, setChatbotBrandFilter] = useState("all");
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ChatbotSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

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

  const fetchRuntimeStats = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    const startOfDay = todayIsoStart();

    try {
      const [executionsResult, publicationsCount, emailCount] = await Promise.all([
        supabase
          .from("command_executions")
          .select("status, steps, created_at")
          .gte("created_at", startOfDay)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("content_publications")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay),
        supabase
          .from("email_messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "outbound")
          .gte("created_at", startOfDay),
      ]);

      const executions = executionsResult.data || [];
      let completedSteps = 0;
      const agentCounts: Record<string, number> = {};
      const agentLatest: Record<string, string> = {};

      for (const execution of executions) {
        const steps = Array.isArray(execution.steps) ? execution.steps : [];
        for (const rawStep of steps) {
          const step = rawStep as { status?: string; agent?: string };
          const done = step.status === "completed" || step.status === "done";
          if (!done) continue;
          completedSteps += 1;
          const agentId = (step.agent || "").toLowerCase().replace(/\s+/g, "-");
          const matchedAgent = agents.find(
            (agent) =>
              agentId.includes(agent.id) ||
              agent.name.toLowerCase().includes((step.agent || "").toLowerCase())
          );
          const key = matchedAgent?.id || agentId;
          if (key) {
            agentCounts[key] = (agentCounts[key] || 0) + 1;
            agentLatest[key] = execution.created_at;
          }
        }
      }

      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter((execution) =>
        ["completed", "partial", "done"].includes(execution.status)
      ).length;

      setRuntimeStats({
        tasksToday: completedSteps,
        successRate: totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : null,
        emailsToday: emailCount.error ? null : emailCount.count ?? 0,
        contentToday: publicationsCount.error ? null : publicationsCount.count ?? 0,
      });

      setAgentStatuses((previous) =>
        previous.map((agent) => ({
          ...agent,
          tasksCompleted: agentCounts[agent.id] || 0,
          lastActivity: agentCounts[agent.id] ? formatRelativeActivity(agentLatest[agent.id]) : "Ingen registrert aktivitet i dag",
        }))
      );
    } catch (err) {
      console.error("Failed to fetch command center stats:", err);
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

  // ── Chatbot session fetching ──

  const fetchChatbotSessions = useCallback(async (brand?: string) => {
    setChatbotLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (brand && brand !== "all") params.set("brand", brand);
      const res = await fetch(`/api/chatbot/sessions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setChatbotSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to fetch chatbot sessions:", err);
    }
    setChatbotLoading(false);
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    setSessionLoading(true);
    try {
      const res = await fetch(`/api/chatbot/sessions?session_id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSelectedSession(data.session);
        }
      }
    } catch (err) {
      console.error("Failed to load session:", err);
    }
    setSessionLoading(false);
  }, []);

  useEffect(() => {
    if (activeView === "chatbot") {
      fetchChatbotSessions(chatbotBrandFilter);
    }
  }, [activeView, chatbotBrandFilter, fetchChatbotSessions]);

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
    fetchRuntimeStats();
    loadConversations();
    return () => {
      if (executionTimerRef.current) clearInterval(executionTimerRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [fetchRecentActions, fetchRuntimeStats, loadConversations]);

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
        fetchRuntimeStats();
        loadConversations();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
                content:
            "Beklager, kunne ikke nå AI-systemet. Sjekk at ANTHROPIC_API_KEY er konfigurert.",
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
                content: data.response || "Plan fullført!",
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
    handleSend("Kjør");
  };

  const handleCancelPlan = () => {
    setActivePlan(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Plan avbrutt. Hva vil du gjøre i stedet?" },
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

  const statValue = (value: number | null, suffix = "") => value === null ? "–" : `${value}${suffix}`;

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
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => { setActiveView("victoria"); setSelectedSession(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeView === "victoria"
                  ? "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Crown size={12} className="inline mr-1" />
              Victoria AI
            </button>
            <button
              onClick={() => setActiveView("chatbot")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeView === "chatbot"
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Globe size={12} className="inline mr-1" />
              Chatbot-samtaler
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeView === "victoria" && (
            <>
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
            </>
          )}
          {activeView === "chatbot" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChatbotSessions(chatbotBrandFilter)}
              className="gap-1.5"
            >
              <History size={14} />
              Oppdater
            </Button>
          )}
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
        {/* Left: Chat or Chatbot Sessions */}
        <div className="flex-[3] flex flex-col min-w-0">

          {/* ═══ CHATBOT CONVERSATIONS VIEW ═══ */}
          {activeView === "chatbot" && (
            <Card className="flex-1 flex flex-col min-h-0 border-slate-700">
              <CardContent className="flex-1 overflow-y-auto p-4">
                {/* Brand filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {CHATBOT_BRANDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { setChatbotBrandFilter(b.id); setSelectedSession(null); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        chatbotBrandFilter === b.id
                          ? "text-white shadow-lg"
                          : "text-slate-400 bg-slate-800 hover:bg-slate-700"
                      }`}
                      style={chatbotBrandFilter === b.id ? { backgroundColor: b.color } : {}}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                {/* Selected session detail */}
                {selectedSession ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => setSelectedSession(null)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <ArrowLeft size={12} />
                      Tilbake til oversikt
                    </button>

                    {/* Session header */}
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <User size={14} className="text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {selectedSession.visitor_name || "Anonym besøkende"}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {CHATBOT_BRANDS.find((b) => b.id === selectedSession.brand_id)?.domain || selectedSession.brand_id}
                            </p>
                          </div>
                        </div>
                        {selectedSession.is_lead && (
                          <Badge variant="success" className="text-[10px]">Lead</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        {selectedSession.visitor_email && (
                          <span className="flex items-center gap-1"><AtSign size={10} />{selectedSession.visitor_email}</span>
                        )}
                        {selectedSession.visitor_phone && (
                          <span className="flex items-center gap-1"><Phone size={10} />{selectedSession.visitor_phone}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(selectedSession.created_at).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {selectedSession.page_url && (
                          <a href={selectedSession.page_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-slate-200">
                            <ExternalLink size={10} />
                            Side
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Messages */}
                    {sessionLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(selectedSession.messages || []).length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-8">Ingen meldinger lagret for denne samtalen</p>
                        ) : (
                          (selectedSession.messages || []).map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "items-start gap-3"}`}>
                              {msg.role !== "user" && (
                                <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Bot size={12} className="text-emerald-400" />
                                </div>
                              )}
                              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                msg.role === "user"
                                  ? "bg-slate-700 text-slate-100"
                                  : "bg-slate-800/80 text-slate-200"
                              }`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Session list */
                  <>
                    {chatbotLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-slate-400" />
                      </div>
                    ) : chatbotSessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Globe size={32} className="text-slate-600 mb-3" />
                        <p className="text-sm text-slate-400">Ingen chatbot-samtaler funnet</p>
                        <p className="text-xs text-slate-500 mt-1">Samtaler fra nettsidene dine vises her</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {chatbotSessions.map((session) => {
                          const brandInfo = CHATBOT_BRANDS.find((b) => b.id === session.brand_id);
                          return (
                            <button
                              key={session.id}
                              onClick={() => loadSessionDetail(session.id)}
                              className="w-full text-left p-3 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 hover:bg-slate-800 transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: (brandInfo?.color || "#6b7280") + "20" }}>
                                  <User size={14} style={{ color: brandInfo?.color || "#6b7280" }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-200">
                                      {session.visitor_name || "Anonym besøkende"}
                                    </span>
                                    {session.is_lead && (
                                      <Badge variant="success" className="text-[9px] px-1.5">Lead</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-[9px] px-1.5" style={{ borderColor: brandInfo?.color, color: brandInfo?.color }}>
                                      {brandInfo?.domain || session.brand_id}
                                    </Badge>
                                    <span className="text-[10px] text-slate-500">
                                      {session.message_count || 0} meldinger
                                    </span>
                                    <span className="text-[10px] text-slate-600">
                                      {new Date(session.updated_at || session.created_at).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  {session.visitor_email && (
                                    <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                      <AtSign size={8} />{session.visitor_email}
                                    </p>
                                  )}
                                </div>
                                <Eye size={14} className="text-slate-600 flex-shrink-0 mt-1" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══ VICTORIA AI VIEW ═══ */}
          {activeView === "victoria" && (
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
                    oppnå, så koordinerer jeg alle agentene for å få det gjort.
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
                        {cleanVictoriaText(msg.content)}
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
                            {cleanVictoriaText(msg.content)}
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
                      ? "Venter på at planen fullføres..."
                      : "Fortell Victoria hva du vil gjøre..."
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
                Shift+Enter for ny linje - Enter for å sende
              </p>
            </div>
          </Card>
          )}
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
              { label: "Oppgaver i dag", value: statValue(runtimeStats.tasksToday), icon: Zap, color: "text-cyan-400" },
              { label: "Vellykket", value: statValue(runtimeStats.successRate, "%"), icon: CheckCircle, color: "text-emerald-400" },
              { label: "E-poster sendt", value: statValue(runtimeStats.emailsToday), icon: Mail, color: "text-blue-400" },
              { label: "Innhold laget", value: statValue(runtimeStats.contentToday), icon: FileText, color: "text-pink-400" },
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
                  <p className="text-xs font-medium text-white mb-1">{cleanVictoriaText(activePlan.title)}</p>
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
                        ? "Utfører"
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
