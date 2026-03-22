import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Loader2 } from 'lucide-react';

export function CommandBar() {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return; // Browser doesn't support speech recognition
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

    setIsProcessing(true);
    // TODO: Send to router agent
    console.log('Command:', input);

    // Simulate processing
    setTimeout(() => {
      setIsProcessing(false);
      setInput('');
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 border border-input focus-within:border-helm-500 focus-within:ring-1 focus-within:ring-helm-500 transition-all">
      {/* Voice toggle */}
      <button
        onClick={isListening ? stopListening : startListening}
        className={`p-1.5 rounded-md transition-colors ${
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
        placeholder="Say it or type it — reset MFA, onboard a user, check compliance..."
        className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
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
  );
}
