import { useCallback, useEffect, useRef, useState } from "react";
import { Video, Square } from "lucide-react";

interface Props {
  onRecorded: (file: File) => void;
}

const MAX_SECONDS = 60;

export default function ScreenRecorder({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const isSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== "undefined";

  const start = async () => {
    if (!isSupported) return;
    chunksRef.current = [];
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch {
      // User cancelled the screen picker or API is unavailable
      return;
    }

    streamRef.current = stream;

    // If the user stops sharing via the browser's built-in stop button
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      stop();
    });

    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `screen-recording-${Date.now()}.webm`, {
        type: "video/webm",
      });
      onRecorded(file);
      cleanup();
    };

    recorder.start(1000);
    setRecording(true);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_SECONDS) {
          stop();
          return MAX_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!isSupported) return null;

  return recording ? (
    <button
      type="button"
      onClick={stop}
      aria-label={"Stop recording, " + fmt(elapsed) + " elapsed"}
      className="flex items-center gap-2 rounded border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 transition-colors focus:outline-none focus:ring-1 focus:ring-teal-400"
    >
      <Square className="w-4 h-4" />
      Stop {fmt(elapsed)} / {fmt(MAX_SECONDS)}
    </button>
  ) : (
    <button
      type="button"
      onClick={start}
      aria-label="Record screen"
      className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors focus:outline-none focus:ring-1 focus:ring-teal-400"
    >
      <Video className="w-4 h-4" />
      Record screen
    </button>
  );
}
