"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./VoiceNoteRecorder.module.css";

const MAX_DURATION_MS = 30_000;

interface VoiceNoteRecorderProps {
  onVoiceNote: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onVoiceNote, disabled }: VoiceNoteRecorderProps) {
  const [recState, setRecState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setPermissionError(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPermissionError(true);
      return;
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setRecState("recorded");
      onVoiceNote(blob);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start(100);
    setRecState("recording");
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    autoStopRef.current = setTimeout(stopRecording, MAX_DURATION_MS);
  }, [onVoiceNote, stopRecording]);

  const discard = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setElapsed(0);
    setRecState("idle");
    onVoiceNote(null);
  }, [audioUrl, onVoiceNote]);

  const remaining = 30 - elapsed;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Voice Note (optional, max 30s)</span>

      {permissionError && (
        <p className={styles.error} role="alert">
          Microphone access denied. Please allow microphone permissions to record.
        </p>
      )}

      {recState === "idle" && (
        <button
          type="button"
          className={styles.recordBtn}
          onClick={startRecording}
          disabled={disabled}
          aria-label="Start recording voice note"
        >
          Record
        </button>
      )}

      {recState === "recording" && (
        <div className={styles.recording}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.time} aria-live="polite">{remaining}s remaining</span>
          <button
            type="button"
            className={styles.stopBtn}
            onClick={stopRecording}
            aria-label="Stop recording"
          >
            Stop
          </button>
        </div>
      )}

      {recState === "recorded" && audioUrl && (
        <div className={styles.playback}>
          <audio src={audioUrl} controls className={styles.player} aria-label="Voice note preview" />
          <button
            type="button"
            className={styles.discardBtn}
            onClick={discard}
            aria-label="Discard voice note"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
