import { useState, useRef, useEffect } from "react";
import { Paperclip, X, Loader2, AlertCircle, Sparkles, Mic } from "lucide-react";
import { createIncident, suggestDescription } from "../lib/api";
import ScreenRecorder from "./ScreenRecorder";

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechSupported = !!SpeechRecognition;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DEFAULT_AREAS = [
  "Cart & Checkout", "Payment Processing", "Product Catalog & Search",
  "Order Management", "Customer Accounts & Auth", "Inventory & Stock",
  "Fulfillment & Shipping", "Promotions & Discounts", "Admin Dashboard",
  "Storefront (General)", "API / Integrations", "Other"
];

interface Props {
  onSubmitted: (id: string) => void;
}

export default function IncidentForm({ onSubmitted }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [listening, setListening] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/incidents/config/areas`)
      .then(r => r.json())
      .then(d => setAreas(d.areas))
      .catch(() => setAreas(DEFAULT_AREAS));
  }, []);

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const suggestion = await suggestDescription(title, affectedArea);
      setDescription(suggestion);
    } catch {
      /* ignore */
    }
    setSuggesting(false);
  };

  const handleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setDescription(prev => prev ? prev + " " + transcript : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const addFiles = (newFiles: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const finalDescription = affectedArea
        ? `[Affected Area: ${affectedArea}] ${description}`
        : description;
      const res = await createIncident(
        {
          title,
          description: finalDescription,
          reporter_name: name,
          reporter_email: email,
        },
        files
      );
      onSubmitted(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit incident");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses =
    "w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-100">Report an Incident</h2>

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Your Name
          </label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className={inputClasses}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            Email
          </label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">
          Incident Title
        </label>
        <input
          required
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief description of the incident"
          className={inputClasses}
        />
        <p className="mt-1 text-xs text-gray-500">{title.length}/200</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">
          Affected Area
        </label>
        <select
          value={affectedArea}
          onChange={(e) => setAffectedArea(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Select affected area...</option>
          {areas.map(area => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-300">
            Description
          </label>
          <div className="flex items-center gap-3">
            {speechSupported && (
              <button
                type="button"
                onClick={handleVoice}
                className={`text-sm flex items-center gap-1 ${listening ? "text-red-400" : "text-orange-400 hover:text-orange-300"}`}
              >
                <Mic className="w-3 h-3" />
                {listening ? "Stop" : "Voice"}
              </button>
            )}
            <button
              type="button"
              onClick={handleSuggest}
              disabled={!title || suggesting}
              className="text-sm text-orange-400 hover:text-orange-300 disabled:text-gray-600 flex items-center gap-1"
            >
              {suggesting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {suggesting ? "Writing..." : "AI Suggest"}
            </button>
          </div>
        </div>
        <textarea
          required
          maxLength={5000}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened? Include error messages, timestamps, affected services..."
          className={inputClasses}
        />
        <p className="mt-1 text-xs text-gray-500">{description.length}/5000</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">
          Attachments
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
            Attach Files
          </button>
          <ScreenRecorder onRecorded={(file) => addFiles([file])} />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300"
              >
                <span className="truncate mr-2">
                  {file.name}{" "}
                  <span className="text-gray-500">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 rounded bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? "Submitting..." : "Submit Incident"}
      </button>
    </form>
  );
}
