import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Loader2, CheckCircle, XCircle, Clock, Zap, Brain, Microscope } from 'lucide-react';
import { executeCommand, type CommandResult } from '@/lib/engine';
import { useHelmStore } from '@/lib/store';
import { toast } from 'sonner';

export function CommandBar() {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const processingMode = useHelmStore((s) => s.processingMode);

  const modeIcons = { quick: Zap, smart: Brain, deep: Microscope };
  const ModeIcon = modeIcons[processingMode];

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice input not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript)
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;

    const command = input.trim();
    setIsProcessing(true);
    setLastResult(null);

    try {
      const result = await executeCommand(command);
      setLastResult(result);

      if (result.success) {
        if (result.requiresApproval) {
          toast.info(`Pending approval: ${command}`, {
            description: `Routed to ${result.agent} agent. Check Operations to approve.`,
            icon: <Clock className="h-4 w-4" />,
          });
        } else {
          toast.success(`Command executed`, {
            description: result.message,
            icon: <CheckCircle className="h-4 w-4" />,
          });
        }
      } else {
        toast.error('Command failed', {
          description: result.message,
          icon: <XCircle className="h-4 w-4" />,
        });
      }
    } catch (err) {
      toast.error('Unexpected error', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      setIsProcessing(false);
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 border border-input focus-within:border-helm-500 focus-within:ring-1 focus-within:ring-helm-500 transition-all">
        {/* Processing mode indicator */}
        <ModeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        {/* Voice toggle */}
        <button
          onClick={isListening ? stopListening : startListening}
          className={`p-1 rounded-md transition-colors ${
            isListening
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
              : 'text-muted-foreground hover:text-foreground hover:bg-background'
          }`}
          title={isListening ? 'Stop listening' : 'Start voice command'}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          data-command-input=""
          placeholder="Say it or type it — reset MFA, onboard a user, check compliance..."
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />

        {/* Submit */}
        <button
          onClick={() => void handleSubmit()}
          disabled={!input.trim() || isProcessing}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>

        {/* Keyboard shortcut hint */}
        {!input && (
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground bg-background rounded border font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Last result inline feedback */}
      {lastResult && (
        <div className={`flex items-center gap-2 px-3 py-1 text-xs rounded ${
          lastResult.success
            ? lastResult.requiresApproval
              ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/20'
              : 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/20'
            : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/20'
        }`}>
          {lastResult.success ? (
            lastResult.requiresApproval ? (
              <Clock className="h-3 w-3 shrink-0" />
            ) : (
              <CheckCircle className="h-3 w-3 shrink-0" />
            )
          ) : (
            <XCircle className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{lastResult.message}</span>
          {lastResult.agent && (
            <span className="shrink-0 text-[10px] opacity-70">via {lastResult.agent}</span>
          )}
        </div>
      )}
    </div>
  );
}
