"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
};

type Options = {
  language?: string;
  silenceMs?: number;
  onFinalText: (text: string) => void;
  onSilence?: () => void;
};

export function useLongformSpeech({ language = "nb-NO", silenceMs = 8000, onFinalText, onSilence }: Options) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalBufferRef = useRef("");

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    silenceTimerRef.current = null;
    restartTimerRef.current = null;
  }, []);

  const armSilence = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (!shouldListenRef.current) return;
      shouldListenRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      setListening(false);
      setInterim("");
      onSilence?.();
    }, silenceMs);
  }, [onSilence, silenceMs]);

  const ensureRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    const w = window as any;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const recognition: SpeechRecognitionLike = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: any) => {
      let interimText = "";
      let newFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = String(event.results[i]?.[0]?.transcript || "").trim();
        if (!text) continue;
        if (event.results[i].isFinal) newFinal += `${text} `;
        else interimText += `${text} `;
      }
      if (newFinal.trim()) {
        finalBufferRef.current += `${newFinal.trim()} `;
        onFinalText(newFinal.trim());
      }
      setInterim(interimText.trim());
      armSilence();
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error || "speech_error");
      if (code === "no-speech" || code === "aborted") return;
      setError(code === "not-allowed" ? "Mikrofontilgang er ikke tillatt." : `Talegjenkjenning: ${code}`);
      if (code === "not-allowed" || code === "service-not-allowed") shouldListenRef.current = false;
    };

    recognition.onend = () => {
      setInterim("");
      if (!shouldListenRef.current) {
        setListening(false);
        return;
      }
      // Mobile Safari/Chrome can end recognition after silence. Restart while
      // the user is still in long-form dictation mode.
      restartTimerRef.current = setTimeout(() => {
        if (!shouldListenRef.current) return;
        try { recognition.start(); } catch { /* recognizer may already be starting */ }
      }, 350);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [armSilence, language, onFinalText]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      shouldListenRef.current = false;
      clearTimers();
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
    };
  }, [clearTimers]);

  const start = useCallback(() => {
    setError("");
    const recognition = ensureRecognition();
    if (!recognition) {
      setSupported(false);
      setError("Denne nettleseren støtter ikke direkte talegjenkjenning.");
      return false;
    }
    finalBufferRef.current = "";
    shouldListenRef.current = true;
    setListening(true);
    armSilence();
    try { recognition.start(); } catch { /* already active */ }
    return true;
  }, [armSilence, ensureRecognition]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearTimers();
    setListening(false);
    setInterim("");
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
  }, [clearTimers]);

  return { supported, listening, interim, error, start, stop };
}
