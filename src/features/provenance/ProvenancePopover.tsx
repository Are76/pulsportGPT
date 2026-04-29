import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, X } from 'lucide-react';
import type { ProvenanceAction, ProvenanceDescriptor } from './types';
import './provenance.css';

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  }
}

export function ProvenanceContent({
  descriptor,
  onClose,
}: {
  descriptor: ProvenanceDescriptor;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleAction = async (action: ProvenanceAction) => {
    if (action.kind === 'copy' && action.valueToCopy) {
      await copyText(action.valueToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      return;
    }
    action.onSelect?.();
    if (action.kind === 'drilldown') onClose?.();
  };

  return (
    <>
      <div className="prov-header">
        <span className="prov-label">{descriptor.label}</span>
        <strong className="prov-value">{descriptor.value}</strong>
      </div>

      <div className="prov-section">
        <div className="prov-source">
          <span className="prov-source-label">Primary source</span>
          <span className="prov-source-value">{descriptor.primarySource.label}</span>
          {descriptor.primarySource.detail ? <span className="prov-explanation">{descriptor.primarySource.detail}</span> : null}
          {descriptor.primarySource.href ? (
            <a className="prov-source-link" href={descriptor.primarySource.href} target="_blank" rel="noopener noreferrer">
              Open source <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </div>

      {descriptor.formula ? (
        <div className="prov-section">
          <span className="prov-source-label">Formula</span>
          <p className="prov-formula">{descriptor.formula}</p>
        </div>
      ) : null}

      {descriptor.inputs?.length ? (
        <div className="prov-section">
          <span className="prov-source-label">Inputs</span>
          {descriptor.inputs.map((input) => (
            <div className="prov-input" key={`${descriptor.label}-${input.label}`}>
              <span className="prov-input-label">{input.label}</span>
              <span className="prov-input-value">{input.value}</span>
              {input.source?.detail ? <span className="prov-explanation">{input.source.detail}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {descriptor.explanation ? (
        <div className="prov-section">
          <p className="prov-explanation">{descriptor.explanation}</p>
        </div>
      ) : null}

      <div className="prov-section">
        <div className="prov-actions">
          {descriptor.actions?.map((action) =>
            action.kind === 'external' && action.href ? (
              <a
                key={action.label}
                className="prov-action-button"
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {action.label} <ExternalLink size={12} />
              </a>
            ) : (
              <button
                key={action.label}
                type="button"
                className="prov-action-button"
                onClick={() => void handleAction(action)}
              >
                {action.kind === 'copy' ? <Copy size={12} /> : null}
                {action.label}
              </button>
            ),
          )}
          <button
            type="button"
            className="prov-action-button prov-close"
            onClick={onClose}
          >
            Close <X size={12} />
          </button>
        </div>
        {copied ? <span className="prov-copy">Copied.</span> : null}
      </div>
    </>
  );
}

export function ProvenanceTrigger({
  descriptor,
  children,
  className,
}: {
  descriptor: ProvenanceDescriptor;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <span className={`prov-root ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="prov-trigger"
        aria-expanded={open}
        aria-label={`Open source details for ${descriptor.label}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {children}
        <span className="prov-dot" aria-hidden="true" />
      </button>
      {open ? (
        <div className="prov-popover" role="dialog" aria-label={`${descriptor.label} provenance`}>
          <ProvenanceContent descriptor={descriptor} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </span>
  );
}
