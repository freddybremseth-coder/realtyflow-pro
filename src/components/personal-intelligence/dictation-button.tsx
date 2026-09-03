"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

interface DictationButtonProps {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function DictationButton({ disabled, onTranscript, onError }: DictationButtonProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    try {
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", new File([blob], `dictation.${extension}`, { type: blob.type || "audio/webm" }));
      const response = await fetch("/api/personal-intelligence/transcribe", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Transcription failed (${response.status})`);
      if (typeof body?.text === "string" && body.text.trim()) onTranscript(body.text.trim());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    if (disabled || recording || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("Nettleseren støtter ikke mikrofonopptak.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        if (blob.size > 0) void transcribe(blob);
      };
      recorder.start(250);
      setRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      onError?.(error instanceof Error ? error.message : "Mikrofontilgang feilet.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
  }

  if (transcribing) {
    return <button type="button" disabled className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500" aria-label="Transkriberer tale">
      <Loader2 size={18} className="animate-spin" />
    </button>;
  }

  if (recording) {
    return <button type="button" onClick={stopRecording} className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-700" aria-label="Stopp diktering">
      <Square size={17} fill="currentColor" />
    </button>;
  }

  return <button type="button" disabled={disabled} onClick={() => void startRecording()} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Start diktering">
    <Mic size={18} />
  </button>;
}
