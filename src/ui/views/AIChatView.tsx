import { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Loader2, Bot, User, CheckCircle, Clock, XCircle, Zap, Brain, Microscope, Ship, Trash2 } from 'lucide-react';
import { useHelmStore } from '@/lib/store';
import { executeCommand, type CommandResult } from '@/lib/engine';
import { toast } from 'sonner';
import type { AgentType } from '@/types/agents';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agent?: AgentType;
  toolName?: string;
  status?: 'success' | 'error' | 'pending';
  action?: CommandResult['action'];
}

const AGENT_LABELS: Record<AgentType, { label: string; color: string }> = {
  identity: { label: 'Identity', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  exchange: { label: 'Exchange', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
  security: { label: 'Security', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
  compliance: { label: 'Compliance', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
  device: { label: 'Device', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
  licensing: { label: 'Licensing', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20' },
  reporting: { label: 'Reporting', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
  policy: { label: 'Policy', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
};

const SUGGESTIONS = [
  'Reset MFA for a user',
  'Check secure score',
  'Run CMMC compliance assessment',
  'Show risky sign-ins',
  'List unused licenses',
  'Block a spam sender',
  'Check drift status',
  'Investigate compromised account',
  'Generate tenant health report',
  'Show noncompliant devices',
];

export function AIChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: "I'm Helm365, your AI M365 admin assistant. Tell me what you need — voice or text. I can manage users, reset MFA, check compliance, investigate security issues, optimize licenses, and more across all your tenants.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const processingMode = useHelmStore((s) => s.processingMode);
  const activeTenantName = useHelmStore((s) => s.activeTenantName);
  const activeProvider = useHelmStore((s) => s.activeProvider);

  const modeIcons = { quick: Zap, smart: Brain, deep: Microscope };
  const ModeIcon = modeIcons[processingMode];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice not supported in this browser');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results).map((r) => r[0]?.transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;
    const userMessage = input.trim();
    setInput('');
    setIsProcessing(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add thinking indicator
    const thinkingId = `thinking_${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: thinkingId,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date().toISOString(),
      status: 'pending',
    }]);

    try {
      const result = await executeCommand(userMessage);

      // Replace thinking with actual response
      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
        agent: result.agent as AgentType | undefined,
        toolName: result.action?.toolCalls?.[0]?.name,
        status: result.success ? (result.requiresApproval ? 'pending' : 'success') : 'error',
        action: result.action,
      };

      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat(assistantMsg));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat({
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
        timestamp: new Date().toISOString(),
        status: 'error',
      }));
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'system',
      content: "Chat cleared. What would you like to do?",
      timestamp: new Date().toISOString(),
    }]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-helm-500" />
          <span className="font-semibold">Helm365 Assistant</span>
          {activeTenantName && (
            <span className="text-[10px] bg-helm-100 dark:bg-helm-900/30 text-helm-700 dark:text-helm-300 px-1.5 py-0.5 rounded">
              {activeTenantName}
            </span>
          )}
          {activeProvider && (
            <span className="text-[10px] text-muted-foreground">{activeProvider}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ModeIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground capitalize">{processingMode}</span>
          <button onClick={clearChat} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Clear chat">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border focus-within:border-helm-500 focus-within:ring-1 focus-within:ring-helm-500">
          <button
            onClick={isListening ? () => { recognitionRef.current?.stop(); setIsListening(false); } : startListening}
            className={`p-1 rounded transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); } }}
            placeholder="Reset MFA for Sarah, check compliance, investigate Tom's account..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
            disabled={isProcessing}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={!input.trim() || isProcessing}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {/* Suggestion chips — show when chat is empty or idle */}
        {messages.length <= 1 && !isProcessing && (
          <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="text-[11px] px-2.5 py-1 rounded-full border text-muted-foreground hover:text-foreground hover:border-helm-500 hover:bg-helm-50 dark:hover:bg-helm-950/20 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Helm365 routes commands to specialist agents. GREEN actions auto-execute. YELLOW/RED require approval.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'system') {
    return (
      <div className="flex items-start gap-3 max-w-2xl mx-auto">
        <Ship className="h-5 w-5 text-helm-500 mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">{message.content}</p>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="bg-helm-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-lg">
          <p className="text-sm">{message.content}</p>
        </div>
        <User className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
      </div>
    );
  }

  // Assistant message
  const statusIcon = message.status === 'pending' && message.content === 'Thinking...'
    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    : message.status === 'success'
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : message.status === 'pending'
    ? <Clock className="h-4 w-4 text-amber-500" />
    : message.status === 'error'
    ? <XCircle className="h-4 w-4 text-red-500" />
    : null;

  const agentInfo = message.agent ? AGENT_LABELS[message.agent] : null;

  return (
    <div className="flex items-start gap-3">
      <Bot className="h-5 w-5 text-helm-500 mt-0.5 shrink-0" />
      <div className="flex-1 max-w-2xl space-y-1">
        {/* Agent badge + tool name */}
        {(agentInfo || message.toolName) && (
          <div className="flex items-center gap-2">
            {agentInfo && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${agentInfo.color}`}>
                {agentInfo.label}
              </span>
            )}
            {message.toolName && (
              <span className="text-[10px] text-muted-foreground font-mono">{message.toolName}</span>
            )}
            {statusIcon}
          </div>
        )}

        {/* Message content */}
        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
