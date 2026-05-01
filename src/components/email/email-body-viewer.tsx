"use client";

import { useEffect, useRef, useState } from "react";

interface EmailBodyViewerProps {
  html?: string | null;
  text?: string | null;
  /** Initial height — auto-adjusts after iframe load */
  minHeight?: number;
  className?: string;
}

/**
 * Render an email body in a sandboxed iframe so the email's own CSS is
 * preserved without leaking into the host app, and any embedded JS is
 * blocked. Auto-resizes to fit content.
 *
 * Falls back to a styled <pre> for plain-text-only messages.
 */
export function EmailBodyViewer({
  html,
  text,
  minHeight = 200,
  className = "",
}: EmailBodyViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  // Build the doc shown in the iframe
  const srcDoc = html ? wrapHtml(html) : null;

  // Resize iframe to its content height after load
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcDoc) return;

    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const newHeight = Math.max(
          minHeight,
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0
        );
        setHeight(newHeight + 16); // padding for safety
      } catch {
        // cross-origin or sandbox can throw; ignore — keep minHeight
      }
    };

    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [srcDoc, minHeight]);

  if (!html && !text) {
    return (
      <div className={`text-sm text-slate-500 italic ${className}`}>
        (tom e-post)
      </div>
    );
  }

  if (!html) {
    return (
      <pre className={`text-sm text-slate-200 whitespace-pre-wrap font-sans ${className}`}>
        {text}
      </pre>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={srcDoc!}
      style={{ width: "100%", height: `${height}px`, border: "none", colorScheme: "normal" }}
      className={className}
      title="Email body"
    />
  );
}

/**
 * Wrap raw email HTML with safe defaults so it renders nicely inside the
 * iframe regardless of the email client that produced it.
 *  - Force readable base font + colors that work on light backgrounds
 *  - Constrain images to container width
 *  - target="_blank" on all links
 */
function wrapHtml(html: string): string {
  const baseStyles = `
    <base target="_blank">
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 12px 16px;
        background: #ffffff;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.55;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      img, video { max-width: 100% !important; height: auto !important; }
      table { max-width: 100% !important; }
      a { color: #2563eb; text-decoration: underline; }
      pre, code { white-space: pre-wrap; word-break: break-word; }
      blockquote {
        border-left: 3px solid #d1d5db;
        margin: 0 0 0.5em;
        padding-left: 12px;
        color: #4b5563;
      }
    </style>
  `;
  // If the email already has <html><head>, inject our base inside. If not, wrap.
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${baseStyles}`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyles}</head><body>${html}</body></html>`;
}
