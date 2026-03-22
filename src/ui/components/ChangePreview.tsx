import { AlertTriangle, ArrowRight, Plus, Minus, Edit3, Users, Shield, Clock } from 'lucide-react';
import type { ChangePreview as ChangePreviewType, ChangeItem, BlastRadius } from '@/types/gateway';

interface ChangePreviewProps {
  preview: ChangePreviewType;
  onApprove: () => void;
  onReject: () => void;
  onSchedule?: () => void;
  tier: 'yellow' | 'red';
}

export function ChangePreview({ preview, onApprove, onReject, onSchedule, tier }: ChangePreviewProps) {
  const isRed = tier === 'red';

  return (
    <div className={`border rounded-lg overflow-hidden ${
      isRed ? 'border-red-300 dark:border-red-800' : 'border-amber-300 dark:border-amber-800'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isRed ? 'bg-red-50 dark:bg-red-950/20' : 'bg-amber-50 dark:bg-amber-950/20'
      }`}>
        <div className="flex items-center gap-2">
          <Shield className={`h-4 w-4 ${isRed ? 'text-red-500' : 'text-amber-500'}`} />
          <span className="font-medium text-sm">
            {isRed ? 'Critical Change — Requires Confirmation' : 'Change Preview — Review Before Approving'}
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          isRed
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>
          {isRed ? 'CRITICAL' : 'REVIEW'}
        </span>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b">
        <p className="text-sm">{preview.summary}</p>
      </div>

      {/* Changes diff */}
      {preview.changes.length > 0 && (
        <div className="px-4 py-3 border-b space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Changes</p>
          {preview.changes.map((change, i) => (
            <DiffLine key={i} change={change} />
          ))}
        </div>
      )}

      {/* Blast radius */}
      <BlastRadiusSection radius={preview.blastRadius} />

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="px-4 py-3 border-b space-y-1">
          {preview.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 flex items-center gap-2 bg-muted/30">
        <button
          onClick={onApprove}
          className={`flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium text-white ${
            isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isRed ? 'Confirm & Execute' : 'Approve'}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          Reject
        </button>
        {onSchedule && (
          <button
            onClick={onSchedule}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted ml-auto"
          >
            <Clock className="h-3.5 w-3.5" />
            Schedule for Later
          </button>
        )}
      </div>
    </div>
  );
}

function DiffLine({ change }: { change: ChangeItem }) {
  const icons = {
    create: { icon: Plus, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
    update: { icon: Edit3, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20' },
    delete: { icon: Minus, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20' },
  };

  const style = icons[change.action];
  const Icon = style.icon;

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded text-xs ${style.bg}`}>
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${style.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium">{change.resourceName}</span>
          <span className="text-muted-foreground">{change.field}</span>
        </div>
        {change.action === 'update' && (
          <div className="flex items-center gap-2 mt-1 font-mono">
            <span className="text-red-600 line-through">{formatValue(change.currentValue)}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-green-600">{formatValue(change.newValue)}</span>
          </div>
        )}
        {change.action === 'create' && (
          <span className="text-green-600 font-mono mt-1 block">{formatValue(change.newValue)}</span>
        )}
        {change.action === 'delete' && (
          <span className="text-red-600 font-mono mt-1 block line-through">{formatValue(change.currentValue)}</span>
        )}
      </div>
    </div>
  );
}

function BlastRadiusSection({ radius }: { radius: BlastRadius }) {
  if (radius.usersAffected === 0 && radius.resourcesAffected === 0) return null;

  return (
    <div className="px-4 py-3 border-b">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Impact Analysis</p>
      <div className="flex items-center gap-4">
        {radius.usersAffected > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{radius.usersAffected}</span>
            <span className="text-xs text-muted-foreground">user{radius.usersAffected !== 1 ? 's' : ''} affected</span>
          </div>
        )}
        {radius.resourcesAffected > 0 && (
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{radius.resourcesAffected}</span>
            <span className="text-xs text-muted-foreground">resource{radius.resourcesAffected !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      {radius.details.length > 0 && (
        <ul className="mt-2 space-y-1">
          {radius.details.map((detail, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-muted-foreground/50 mt-0.5">•</span>
              {detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
