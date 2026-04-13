"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, Download, Youtube, Play, Square, Music, Video } from "lucide-react";

const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uData;
varying vec2 vUv;

float glow(float d, float str, float thickness) {
    return thickness / pow(d, str);
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    float bass = texture2D(uData, vec2(0.05, 0.0)).r;
    float mid  = texture2D(uData, vec2(0.4, 0.0)).r;
    float high = texture2D(uData, vec2(0.8, 0.0)).r;

    vec3 skyTop = vec3(0.05, 0.02, 0.1);
    vec3 skyMid = vec3(0.4, 0.1, 0.2);
    vec3 skyLow = vec3(0.8, 0.3, 0.1);

    vec3 skyColor = mix(skyLow, skyMid, smoothstep(0.0, 0.7, uv.y));
    skyColor = mix(skyColor, skyTop, smoothstep(0.6, 1.2, uv.y));

    float sunY = 0.45 + sin(uTime * 0.1) * 0.02;
    vec2 sunPos = vec2(0.0, sunY);
    float distToSun = length(p - sunPos);

    float sunMask = smoothstep(0.35, 0.34, distToSun);
    vec3 sunColor = mix(vec3(1.0, 0.9, 0.4), vec3(1.0, 0.5, 0.1), distToSun * 2.5);
    float sunGlow = glow(distToSun, 1.2, 0.08) * (1.0 + bass * 0.2);

    float horizon = 0.4;
    vec3 finalColor = skyColor;

    if (uv.y < horizon) {
        float depth = (horizon - uv.y) / horizon;
        float wave = sin(p.x * 10.0 + uTime * 0.5) * 0.02 * depth;
        wave += sin(p.x * 25.0 - uTime * 0.8) * 0.01 * bass;

        float distToReflect = abs(p.x) + wave * 5.0;
        float reflection = smoothstep(0.4, 0.0, distToReflect) * (1.0 - depth);
        reflection *= (0.5 + bass * 0.5);

        vec3 waterBase = mix(vec3(0.1, 0.05, 0.15), vec3(0.4, 0.15, 0.1), reflection);
        vec3 glitter = vec3(1.0, 0.8, 0.4) * pow(reflection, 3.0) * 1.5;

        finalColor = waterBase + glitter;
        finalColor *= smoothstep(-0.2, 0.8, uv.y);
    } else {
        finalColor += sunColor * sunMask;
        finalColor += vec3(1.0, 0.6, 0.2) * sunGlow;
        finalColor += 0.05 * sin(p.x * 2.0 + uTime * 0.2) * (1.0 - uv.y);
    }

    for(int i = 0; i < 15; i++) {
        float f = float(i);
        float t = uTime * 0.2 + f * 12.45;
        vec2 partPos = vec2(
            sin(t + f) * 1.2,
            fract(t * 0.5 + f * 0.3) * 2.0 - 1.0
        );
        float size = 0.002 + high * 0.008;
        float distToPart = length(p - partPos);
        float pGlow = glow(distToPart, 1.5, size);
        vec3 pColor = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.3, 0.1), fract(f * 0.5));
        finalColor += pColor * pGlow * smoothstep(0.1, 0.5, uv.y);
    }

    float vignette = smoothstep(1.5, 0.5, length(p));
    finalColor *= vignette;
    finalColor += (hash(uv + uTime) - 0.5) * 0.03;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export default function ShaderRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataTexRef = useRef<WebGLTexture | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState("");
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [youtubeTitle, setYoutubeTitle] = useState("The Grain of Memory - Acoustic Tribute");
  const [youtubeDesc, setYoutubeDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ videoId: string; url: string } | null>(null);

  // Init WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) { setStatus("WebGL ikke støttet i denne nettleseren"); return; }
    glRef.current = gl;

    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, VERTEX_SHADER);
    gl.compileShader(vert);

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, FRAGMENT_SHADER);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      setStatus("Shader-feil: " + gl.getShaderInfoLog(frag));
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    programRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "aPosition");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    // Audio data texture (256px × 1px)
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(256));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    dataTexRef.current = tex;

    setStatus("Klar — last opp MP3 for å starte");

    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const render = useCallback((time: number) => {
    const gl = glRef.current;
    const prog = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;

    const t = (time - startTimeRef.current) / 1000;
    setElapsed(Math.floor(t));

    // Update audio texture
    if (analyserRef.current && dataTexRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      gl.bindTexture(gl.TEXTURE_2D, dataTexRef.current);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Math.min(256, data.length), 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, data.slice(0, 256));
    }

    gl.uniform2f(gl.getUniformLocation(prog, "uResolution"), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(prog, "uTime"), t);
    gl.uniform1i(gl.getUniformLocation(prog, "uData"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animFrameRef.current = requestAnimationFrame(render);
  }, []);

  const loadAudio = async (file: File) => {
    setStatus("Laster inn lyd...");
    const arrayBuf = await file.arrayBuffer();
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const buf = await ctx.decodeAudioData(arrayBuf);
    setAudioBuffer(buf);
    setDuration(Math.floor(buf.duration));

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    setStatus(`Klar (${Math.floor(buf.duration)}s) — trykk Spill av / Ta opp`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setYoutubeTitle(file.name.replace(/\.[^.]+$/, ""));
    await loadAudio(file);
  };

  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buf = audioBuffer;
    const analyser = analyserRef.current;
    if (!ctx || !buf || !analyser) return;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    source.start();
    source.onended = () => { setIsPlaying(false); setIsRecording(false); };
    audioSourceRef.current = source;
  }, [audioBuffer]);

  const play = useCallback(() => {
    startPlayback();
    setIsPlaying(true);
    startTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(render);
  }, [startPlayback, render]);

  const stop = useCallback(() => {
    audioSourceRef.current?.stop();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setIsRecording(false);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = audioCtxRef.current;
    const buf = audioBuffer;
    const analyser = analyserRef.current;
    if (!canvas || !ctx || !buf || !analyser) return;

    chunksRef.current = [];
    setRecordedBlob(null);

    // Capture canvas stream
    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);

    // Add audio to stream
    const dest = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(analyser);
    analyser.connect(dest);
    analyser.connect(ctx.destination);
    source.start();
    audioSourceRef.current = source;

    dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    const recorder = new MediaRecorder(canvasStream, { mimeType: "video/webm;codecs=vp9,opus" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setStatus(`Opptak ferdig! ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      setIsRecording(false);
      setIsPlaying(false);
    };
    recorder.start(100);
    mediaRecorderRef.current = recorder;

    source.onended = () => { recorder.stop(); };

    setIsPlaying(true);
    setIsRecording(true);
    startTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(render);
    setStatus("Tar opp... (stopper automatisk når sangen er ferdig)");
  }, [audioBuffer, render]);

  const downloadRecording = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${youtubeTitle || "sunset-tribute"}.webm`;
    a.click();
  };

  const uploadToYouTube = async () => {
    if (!recordedBlob || !youtubeTitle) return;
    setUploading(true);
    setStatus("Laster opp til YouTube...");
    try {
      const formData = new FormData();
      formData.append("file", new File([recordedBlob], "video.webm", { type: "video/webm" }));
      formData.append("title", youtubeTitle);
      formData.append("description", youtubeDesc || `${youtubeTitle}\n\nEt kjærlig minne.\n\n#tribute #acoustic #memory`);
      formData.append("tags", "tribute,acoustic,memory,music");
      formData.append("privacyStatus", "public");
      formData.append("brandId", "remasterfreddy");

      const res = await fetch("/api/youtube", { method: "POST", body: formData });
      const data = await res.json();
      if (data.videoId) {
        setUploadResult({ videoId: data.videoId, url: data.youtubeUrl || `https://youtube.com/watch?v=${data.videoId}` });
        setStatus("Video publisert på YouTube!");
      } else {
        setStatus("Feil: " + (data.error || "Ukjent feil"));
      }
    } catch (err) {
      setStatus("Feil: " + (err instanceof Error ? err.message : "Ukjent"));
    }
    setUploading(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Video className="text-orange-400" size={20} />
          </div>
          Solnedgang Music Video
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Live WebGL-animasjon med audio-reaktiv solnedgang — reagerer på bass, mid og høye frekvenser i sanntid
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Canvas preview */}
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full aspect-video rounded-xl border border-slate-700 bg-black"
          />

          {/* Progress */}
          {(isPlaying || elapsed > 0) && duration > 0 && (
            <div className="space-y-1">
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-orange-500 to-red-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min((elapsed / duration) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{fmt(elapsed)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            {!isPlaying ? (
              <>
                <Button onClick={play} disabled={!audioBuffer} variant="ghost" className="flex-1 text-slate-300">
                  <Play size={14} className="mr-2" /> Forhåndsvis
                </Button>
                <Button
                  onClick={startRecording}
                  disabled={!audioBuffer || isRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  <Video size={14} className="mr-2" />
                  {isRecording ? "Tar opp..." : "Ta opp video"}
                </Button>
              </>
            ) : (
              <Button onClick={stop} variant="outline" className="flex-1 border-red-500 text-red-400">
                <Square size={14} className="mr-2" /> Stopp
              </Button>
            )}
          </div>
        </div>

        {/* Controls panel */}
        <div className="space-y-4">
          {/* Audio upload */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Music size={14} className="text-blue-400" /> Last opp musikk
              </h3>
              <label className="block">
                <div className="w-full h-16 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center cursor-pointer hover:border-orange-500/50 transition-colors">
                  {audioFile ? (
                    <span className="text-sm text-slate-300">{audioFile.name}</span>
                  ) : (
                    <span className="text-sm text-slate-500">Klikk for å velge MP3</span>
                  )}
                </div>
                <input type="file" accept="audio/mp3,audio/mpeg,audio/wav" onChange={handleFileChange} className="hidden" />
              </label>
              {status && (
                <p className={`text-xs ${status.startsWith("Feil") ? "text-red-400" : "text-slate-400"}`}>
                  {status}
                </p>
              )}
            </CardContent>
          </Card>

          {/* YouTube metadata */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Youtube size={14} className="text-red-400" /> YouTube-info
              </h3>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tittel</label>
                <input
                  value={youtubeTitle}
                  onChange={e => setYoutubeTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  placeholder="Videotittel..."
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Beskrivelse</label>
                <textarea
                  value={youtubeDesc}
                  onChange={e => setYoutubeDesc(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none"
                  placeholder="Et kjærlig minne..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {recordedBlob && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-400">Opptak klart!</h3>
                <div className="flex gap-2">
                  <Button onClick={downloadRecording} variant="outline" className="flex-1">
                    <Download size={14} className="mr-2" /> Last ned
                  </Button>
                  <Button
                    onClick={uploadToYouTube}
                    disabled={uploading || !youtubeTitle}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    {uploading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Youtube size={14} className="mr-2" />}
                    Last opp YouTube
                  </Button>
                </div>
                {uploadResult && (
                  <a href={uploadResult.url} target="_blank" rel="noopener noreferrer"
                    className="block text-xs text-emerald-400 hover:underline truncate">
                    ✅ {uploadResult.url}
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardContent className="p-4">
          <p className="text-xs text-orange-300 font-medium mb-1">Slik fungerer det</p>
          <p className="text-xs text-slate-400">
            WebGL-shaderen rendres live i nettleseren og reagerer på lyden i sanntid — solen pulserer med bass,
            vannet bølger med rytmen, og gnistene danser med høye frekvenser. Klikk &quot;Ta opp video&quot; for å starte
            et opptak som synkroniseres med musikken og er klart for YouTube-opplasting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
