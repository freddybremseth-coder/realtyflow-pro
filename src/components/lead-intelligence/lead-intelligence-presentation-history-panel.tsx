"use client";

import { Loader2, MessageSquareText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, prettyJson } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import { shortPropertyId } from "@/components/lead-intelligence/property-match-display";

interface SafePanelError {
  correlationId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface PresentationDraftHistoryItem {
  presentationId: string;
  messageDraftId: string;
  status: "draft" | "approved" | "archived";
  messageStatus: "draft" | "approved" | "cancelled";
  subject: string;
  itemCount: number;
  messageDraftCreatedAt: string;
}

interface PresentationDraftHistoryResult {
  items: PresentationDraftHistoryItem[];
}

interface LeadIntelligencePresentationHistoryPanelProps {
  latestPresentationId: string | null;
  latestMessageDraftId: string | null;
  history: PresentationDraftHistoryResult | null;
  historyError: SafePanelError | null;
  showHistoryError: boolean;
  presentationDraftLoading: boolean;
  presentationDraftHistoryLoading: boolean;
  onLoadLatestPresentationDraft: () => void;
  onLoadPresentationDraftHistory: () => void;
  onLoadPresentationDraftById: (presentationId: string) => void;
}

export function LeadIntelligencePresentationHistoryPanel({
  latestPresentationId,
  latestMessageDraftId,
  history,
  historyError,
  showHistoryError,
  presentationDraftLoading,
  presentationDraftHistoryLoading,
  onLoadLatestPresentationDraft,
  onLoadPresentationDraftHistory,
  onLoadPresentationDraftById,
}: LeadIntelligencePresentationHistoryPanelProps) {
  return (
    <>
      {latestPresentationId && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <p className="font-semibold">Siste lagrede e-postutkast finnes</p>
          <p className="mt-1 text-xs text-emerald-100/75">
            Presentation {shortPropertyId(latestPresentationId)}
            {latestMessageDraftId ? ` · Message draft ${shortPropertyId(latestMessageDraftId)}` : ""}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={onLoadLatestPresentationDraft}
            disabled={presentationDraftLoading}
          >
            {presentationDraftLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Åpne siste e-postutkast
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-2 mt-3"
            onClick={onLoadPresentationDraftHistory}
            disabled={presentationDraftHistoryLoading}
          >
            {presentationDraftHistoryLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquareText className="mr-2 h-4 w-4" />
            )}
            Vis utkasthistorikk
          </Button>
          <p className="mt-2 text-xs text-emerald-100/70">
            Hentes read-only og vises lokalt. Det sendes fortsatt ingen e-post.
          </p>
        </div>
      )}

      {history && (
        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
          <p className="font-semibold text-slate-100">Utkasthistorikk ({history.items.length})</p>
          {history.items.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Ingen presentasjons- eller e-postutkast er lagret for denne profilen ennå.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {history.items.map((item) => (
                <div
                  key={item.presentationId}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-100">{item.subject}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Presentation {shortPropertyId(item.presentationId)} · Message draft{" "}
                        {shortPropertyId(item.messageDraftId)} · {item.itemCount} bolig(er)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Status: {item.status} · E-poststatus: {item.messageStatus} · Lagret{" "}
                        {formatDateTime(item.messageDraftCreatedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onLoadPresentationDraftById(item.presentationId)}
                      disabled={presentationDraftLoading}
                    >
                      Åpne
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Historikken henter bare metadata. Selve e-postteksten åpnes først når du trykker Åpne.
          </p>
        </div>
      )}

      {historyError && showHistoryError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          <p className="font-semibold">{historyError.code}</p>
          <p className="mt-1">{historyError.message}</p>
          {historyError.details && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
              {prettyJson(historyError.details)}
            </pre>
          )}
          <p className="mt-2 text-xs text-red-100/70">Correlation ID: {historyError.correlationId}</p>
        </div>
      )}
    </>
  );
}
