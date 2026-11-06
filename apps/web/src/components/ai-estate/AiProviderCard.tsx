'use client';

/**
 * The tenant's AI provider: one card, two homes.
 *
 * It was extracted from `SettingsView`'s Deployment & AI panel so that
 * Settings and AI Estate render the same component rather than two forms that
 * drift. What it does:
 *
 *   - shows the saved credential (provider, endpoint, model, key present,
 *     rotation age) or an honest empty state;
 *   - edits it, with the per-provider rules enforced client-side for the
 *     message and server-side for the truth;
 *   - lists the chat models the endpoint serves, both from a form that is not
 *     saved yet and from a credential that already is;
 *   - places one real completion ("Test") and reports what happened, including
 *     `unverified`, which is an air-gapped refusal rather than a failure.
 *
 * Kenari (kenari.id) is pre-filled with its OpenAI-compatible base URL, so
 * connecting it is "pick Kenari, paste a kn- key, choose a model".
 */

import { useEffect, useId, useMemo, useState } from 'react';
import useSWR from 'swr';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

import {
  ApiError,
  deploymentApi,
  type LlmCredentialUpsert,
  type LlmCredentialView,
  type LlmModelDiscoveryResult,
  type LlmWritableProvider,
} from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';

// ─── Provider catalogue ──────────────────────────────────────────────────────

export const PROVIDER_LABEL: Record<LlmProviderKey, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'azure-openai': 'Azure OpenAI',
  kenari: 'Kenari (kenari.id)',
  'local-ollama': 'Local Ollama',
  'local-vllm': 'Local vLLM',
  'local-litellm': 'Local LiteLLM',
  custom: 'Custom endpoint',
  none: 'Not configured',
};

type LlmProviderKey = LlmWritableProvider | 'none';

const WRITABLE_PROVIDERS: readonly LlmWritableProvider[] = [
  'kenari',
  'openai',
  'anthropic',
  'azure-openai',
  'local-ollama',
  'local-vllm',
  'local-litellm',
  'custom',
] as const;

const PROVIDERS_REQUIRING_BASE_URL: ReadonlySet<LlmWritableProvider> = new Set<LlmWritableProvider>([
  'local-ollama',
  'local-vllm',
  'local-litellm',
  'custom',
  'kenari',
]);

const PROVIDERS_REQUIRING_API_KEY: ReadonlySet<LlmWritableProvider> = new Set<LlmWritableProvider>([
  'openai',
  'anthropic',
  'azure-openai',
  'kenari',
]);

/** Where each provider answers and what to say about the field. */
export function providerHintFor(p: LlmWritableProvider): {
  baseUrlPlaceholder: string;
  baseUrlDefault: string;
  baseUrlHint: string;
  modelPlaceholder: string;
  keyHint: string;
  docsUrl?: string;
} {
  switch (p) {
    case 'kenari':
      return {
        baseUrlPlaceholder: 'https://kenari.id/v1',
        baseUrlDefault: 'https://kenari.id/v1',
        baseUrlHint:
          'Kenari is OpenAI-compatible. Keep the /v1 suffix — the console appends /chat/completions to it.',
        modelPlaceholder: 'e.g. deepseek-v4-flash',
        keyHint:
          'Your Kenari API key, prefix kn-. Created at kenari.id/keys and shown once — vault-encrypted before storage.',
        docsUrl: 'https://kenari.id/docs',
      };
    case 'openai':
      return {
        baseUrlPlaceholder: 'https://api.openai.com/v1',
        baseUrlDefault: '',
        baseUrlHint: 'Optional. Leave blank to use the OpenAI default endpoint.',
        modelPlaceholder: 'e.g. gpt-4o-mini',
        keyHint: 'Starts with sk-. Vault-encrypted before storage.',
      };
    case 'anthropic':
      return {
        baseUrlPlaceholder: 'https://api.anthropic.com/v1',
        baseUrlDefault: '',
        baseUrlHint: 'Optional. Leave blank to use the Anthropic default endpoint.',
        modelPlaceholder: 'e.g. claude-sonnet-5',
        keyHint: 'Starts with sk-ant-. Vault-encrypted before storage.',
      };
    case 'azure-openai':
      return {
        baseUrlPlaceholder: 'https://my-resource.openai.azure.com',
        baseUrlDefault: '',
        baseUrlHint: 'Optional override for your Azure OpenAI resource.',
        modelPlaceholder: 'deployment name',
        keyHint: 'Your Azure OpenAI key. Vault-encrypted before storage.',
      };
    case 'local-ollama':
      return {
        baseUrlPlaceholder: 'http://ollama.example.local:11434',
        baseUrlDefault: '',
        baseUrlHint: 'Point at your Ollama server (default port 11434).',
        modelPlaceholder: 'e.g. llama3.1:8b',
        keyHint: 'Optional — a default Ollama install has no auth.',
      };
    case 'local-vllm':
      return {
        baseUrlPlaceholder: 'http://vllm.example.local:8000/v1',
        baseUrlDefault: '',
        baseUrlHint: 'OpenAI-compatible vLLM endpoint, typically /v1.',
        modelPlaceholder: 'served model id',
        keyHint: 'Optional — only if your vLLM is behind auth.',
      };
    case 'local-litellm':
      return {
        baseUrlPlaceholder: 'http://litellm.example.local:4000',
        baseUrlDefault: '',
        baseUrlHint: 'LiteLLM proxy URL.',
        modelPlaceholder: 'e.g. aisoc-triage',
        keyHint: 'Optional — only if your proxy enforces a key.',
      };
    case 'custom':
    default:
      return {
        baseUrlPlaceholder: 'https://internal-llm.example.com/v1',
        baseUrlDefault: '',
        baseUrlHint: 'Any OpenAI-compatible HTTP(S) endpoint.',
        modelPlaceholder: 'model id',
        keyHint: 'Optional — depends on your proxy.',
      };
  }
}

export function extractApiDetail(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    if (err.body) {
      try {
        const parsed = JSON.parse(err.body);
        if (parsed && typeof parsed.detail === 'string') return parsed.detail;
      } catch {
        // body wasn't JSON — fall through
      }
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

function inputClass() {
  return clsx(
    'w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100',
    'placeholder:text-gray-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40',
  );
}

function StatusPill({ tone, label }: { tone: 'emerald' | 'amber' | 'red' | 'gray'; label: string }) {
  const tones = {
    emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40',
    amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
    red: 'bg-red-500/10 text-red-300 ring-red-500/40',
    gray: 'bg-gray-500/10 text-gray-400 ring-gray-500/30',
  } as const;
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ring-inset', tones[tone])}>
      {label}
    </span>
  );
}

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

// ─── The card ────────────────────────────────────────────────────────────────

export interface AiProviderCardProps {
  /** SWR key for the credential. Two call sites share one cached read. */
  swrKey?: string;
  /**
   * Called after a save, delete or test, so a host page can refresh whatever
   * else it derives from the credential (the LLM status snapshot, models).
   */
  onChanged?: () => void;
}

export function AiProviderCard({ swrKey = 'llm-credential', onChanged }: AiProviderCardProps) {
  const credential = useSWR(swrKey, () => deploymentApi.getLlmCredential(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listing, setListing] = useState(false);

  const [provider, setProvider] = useState<LlmWritableProvider>('kenari');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // A list fetched for one base URL says nothing about another, so it is shown
  // only while that base URL is still the one in the form.
  const [listed, setListed] = useState<{ baseUrl: string; result: LlmModelDiscoveryResult } | null>(null);
  // The same list, fetched from the saved credential, shown beside the saved
  // provider rather than inside the form.
  const [storedList, setStoredList] = useState<LlmModelDiscoveryResult | null>(null);

  const fieldId = useId();

  useEffect(() => {
    if (!editing) {
      setFormError(null);
      setApiKey('');
      return;
    }
    if (credential.data) {
      setProvider(credential.data.provider);
      setBaseUrl(credential.data.base_url ?? '');
      setModel(credential.data.model ?? '');
      setEnabled(credential.data.enabled);
    } else {
      setProvider('kenari');
      setBaseUrl(providerHintFor('kenari').baseUrlDefault);
      setModel('');
      setEnabled(true);
    }
    setApiKey('');
    setFormError(null);
  }, [editing, credential.data]);

  const hint = useMemo(() => providerHintFor(provider), [provider]);
  const requiresBaseUrl = PROVIDERS_REQUIRING_BASE_URL.has(provider);
  const requiresApiKey = PROVIDERS_REQUIRING_API_KEY.has(provider);
  // Only a same-provider key carries over; switching providers needs a fresh one.
  const hasExistingKey = Boolean(
    credential.data?.has_api_key && credential.data?.provider === provider,
  );

  const onProviderChange = (next: LlmWritableProvider) => {
    setProvider(next);
    const nextHint = providerHintFor(next);
    // Pre-fill the canonical endpoint when the field is empty or still holds
    // the previous provider's canonical endpoint. Typed URLs are left alone.
    const previousDefault = providerHintFor(provider).baseUrlDefault;
    if (!baseUrl.trim() || baseUrl.trim() === previousDefault) {
      setBaseUrl(nextHint.baseUrlDefault);
    }
  };

  const onSave = async () => {
    setFormError(null);
    if (requiresBaseUrl && !baseUrl.trim()) {
      setFormError(`${PROVIDER_LABEL[provider]} requires a base URL.`);
      return;
    }
    if (requiresApiKey && !apiKey.trim() && !hasExistingKey) {
      setFormError(`${PROVIDER_LABEL[provider]} requires an API key.`);
      return;
    }

    const payload: LlmCredentialUpsert = {
      provider,
      base_url: baseUrl.trim() ? baseUrl.trim() : null,
      model: model.trim() ? model.trim() : null,
      api_key: apiKey.trim() ? apiKey.trim() : null,
      enabled,
    };

    setSubmitting(true);
    try {
      await deploymentApi.upsertLlmCredential(payload);
      toast.success(credential.data ? 'AI provider updated.' : 'AI provider saved.');
      setEditing(false);
      setStoredList(null);
      await credential.mutate();
      onChanged?.();
    } catch (err) {
      const detail = extractApiDetail(err, 'Could not save the AI provider.');
      setFormError(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const onListFromForm = async () => {
    const target = baseUrl.trim();
    setListing(true);
    try {
      const result = await deploymentApi.discoverLlmModels({
        base_url: target ? target : null,
        api_key: apiKey.trim() ? apiKey.trim() : null,
      });
      setListed({ baseUrl: target, result });
      if (result.models.length === 0) toast(result.detail);
    } catch (err) {
      setListed({
        baseUrl: target,
        result: {
          outcome: 'refused',
          detail: extractApiDetail(err, 'Could not list models.'),
          models: [],
          listed: 0,
          excluded: 0,
          truncated: false,
        },
      });
    } finally {
      setListing(false);
    }
  };

  const onListStored = async () => {
    setListing(true);
    try {
      const result = await deploymentApi.discoverStoredLlmModels();
      setStoredList(result);
      if (result.models.length === 0) toast(result.detail);
    } catch (err) {
      setStoredList({
        outcome: 'refused',
        detail: extractApiDetail(err, 'Could not list models.'),
        models: [],
        listed: 0,
        excluded: 0,
        truncated: false,
      });
    } finally {
      setListing(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const result = await deploymentApi.testLlmCredential();
      const where = result.latency_ms != null ? ` in ${result.latency_ms} ms` : '';
      if (result.outcome === 'ok') {
        toast.success(`${result.detail}${where}`);
      } else if (result.outcome === 'unverified') {
        // Air-gapped: the policy refused the call. Not a red error.
        toast(result.detail);
      } else {
        toast.error(result.detail);
      }
      onChanged?.();
    } catch (err) {
      toast.error(extractApiDetail(err, 'Could not test the credential.'));
    } finally {
      setTesting(false);
    }
  };

  const onDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setSubmitting(true);
    try {
      await deploymentApi.deleteLlmCredential();
      toast.success('AI provider removed. Falling back to platform defaults.');
      setConfirmingDelete(false);
      setStoredList(null);
      await credential.mutate();
      onChanged?.();
    } catch (err) {
      toast.error(extractApiDetail(err, 'Could not remove the AI provider.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (credential.isLoading && credential.data === undefined) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  if (credential.error) {
    return (
      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-200">AI provider unavailable</p>
        <p className="mt-1 text-xs text-amber-300/70">
          {extractApiDetail(credential.error, 'Could not load the tenant LLM credential.')}
        </p>
      </section>
    );
  }

  const cred: LlmCredentialView | null = credential.data ?? null;

  // ── Saved, not editing ──────────────────────────────────────────────────
  if (cred && !editing) {
    return (
      <section className="rounded-lg border border-gray-800 bg-gray-950/40 p-5" aria-label="AI provider">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-200">AI provider</h3>
              {cred.enabled ? <StatusPill tone="emerald" label="Active" /> : <StatusPill tone="gray" label="Disabled" />}
              {cred.provider === 'kenari' ? <StatusPill tone="emerald" label="Kenari" /> : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Per-tenant override for this workspace. Triage, the copilot and summaries use it instead of the
              deployment defaults.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={onListStored}
              disabled={listing || submitting}
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            >
              {listing ? 'Listing…' : 'List models'}
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={testing || submitting}
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={submitting}
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                confirmingDelete
                  ? 'border border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                  : 'border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800',
              )}
            >
              {confirmingDelete ? 'Confirm remove' : 'Remove'}
            </button>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KeyValue label="Provider">
            <span className="text-sm text-gray-200">{PROVIDER_LABEL[cred.provider]}</span>
          </KeyValue>
          <KeyValue label="Endpoint">
            {cred.base_url ? (
              <span className="break-all font-mono text-xs text-gray-300">{cred.base_url}</span>
            ) : (
              <span className="text-xs text-gray-500">Provider default</span>
            )}
          </KeyValue>
          <KeyValue label="Model">
            {cred.model ? (
              <span className="font-mono text-xs text-gray-300">{cred.model}</span>
            ) : (
              <span className="text-xs text-gray-500">Provider default</span>
            )}
          </KeyValue>
          <KeyValue label="API key">
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 text-xs',
                cred.has_api_key ? 'text-emerald-300' : 'text-gray-400',
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  cred.has_api_key ? 'bg-emerald-400' : 'bg-gray-600',
                )}
              />
              {cred.has_api_key ? 'Set (vault-encrypted)' : 'Not set'}
            </span>
          </KeyValue>
          <KeyValue label="Last rotated">
            {cred.last_rotated_at ? (
              <span className="text-xs text-gray-300" title={cred.last_rotated_at}>
                {formatDistanceToNow(new Date(cred.last_rotated_at), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-xs text-gray-500">Never</span>
            )}
          </KeyValue>
          <KeyValue label="Updated">
            <span className="text-xs text-gray-300" title={cred.updated_at}>
              {formatDistanceToNow(new Date(cred.updated_at), { addSuffix: true })}
            </span>
          </KeyValue>
        </dl>

        {storedList ? <ModelListPanel result={storedList} current={cred.model} onPick={null} /> : null}

        {confirmingDelete ? (
          <p className="mt-4 text-xs text-amber-300/80">
            Click <span className="font-semibold">Confirm remove</span> again to delete this credential. The
            platform falls back to its own LLM defaults.
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="ml-2 underline hover:text-amber-200"
            >
              Cancel
            </button>
          </p>
        ) : null}
      </section>
    );
  }

  // ── Empty, not editing ──────────────────────────────────────────────────
  if (!cred && !editing) {
    return (
      <section className="rounded-lg border border-gray-800 bg-gray-950/40 p-5" aria-label="AI provider">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">AI provider</h3>
            <p className="mt-1 max-w-xl text-xs text-gray-500">
              No provider is connected for this workspace, so AI features use the deployment defaults. Connect
              Kenari to route triage, the copilot and summaries through kenari.id — the key is vault-encrypted
              and never returned to the browser.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-blue-500/50 bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-500/25"
          >
            Connect a provider
          </button>
        </div>
      </section>
    );
  }

  // ── Editing ─────────────────────────────────────────────────────────────
  const shownList = listed && listed.baseUrl === baseUrl.trim() ? listed.result : null;

  return (
    <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-5" aria-label="AI provider form">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-gray-200">
          {cred ? 'Edit AI provider' : 'Connect an AI provider'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          API keys are encrypted with the platform credential vault before persistence and are never returned to
          the browser.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5" htmlFor={`${fieldId}-provider`}>
          <span className="text-sm font-medium text-gray-300">Provider</span>
          <select
            id={`${fieldId}-provider`}
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as LlmWritableProvider)}
            disabled={submitting}
            className={inputClass()}
          >
            {WRITABLE_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5" htmlFor={`${fieldId}-model`}>
          <span className="text-sm font-medium text-gray-300">Model</span>
          <input
            id={`${fieldId}-model`}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={hint.modelPlaceholder}
            disabled={submitting}
            className={inputClass()}
          />
          <span className="text-xs text-gray-500">
            Leave blank for the provider default, or pick one from the list below.
          </span>
        </label>

        <label className="flex flex-col gap-1.5" htmlFor={`${fieldId}-base`}>
          <span className="text-sm font-medium text-gray-300">
            Base URL{requiresBaseUrl ? ' *' : ''}
          </span>
          <input
            id={`${fieldId}-base`}
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={hint.baseUrlPlaceholder}
            disabled={submitting}
            className={inputClass()}
          />
          <span className="text-xs text-gray-500">
            {requiresBaseUrl ? `Required. ${hint.baseUrlHint}` : `Optional. ${hint.baseUrlHint}`}
          </span>
        </label>

        <label className="flex flex-col gap-1.5" htmlFor={`${fieldId}-key`}>
          <span className="text-sm font-medium text-gray-300">
            API key{requiresApiKey && !hasExistingKey ? ' *' : ''}
          </span>
          <input
            id={`${fieldId}-key`}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasExistingKey ? 'Leave blank to keep the saved key' : 'Paste the API key'}
            disabled={submitting}
            className={inputClass()}
          />
          <span className="text-xs text-gray-500">
            {hint.keyHint}
            {hint.docsUrl ? (
              <>
                {' '}
                <a
                  href={hint.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Provider docs
                </a>
              </>
            ) : null}
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onListFromForm}
          disabled={listing || submitting}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
        >
          {listing ? 'Listing models…' : 'Fetch models'}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={submitting}
          />
          Enabled
        </label>
      </div>

      {shownList ? (
        <ModelListPanel result={shownList} current={model} onPick={(id) => setModel(id)} />
      ) : null}

      {formError ? (
        <p role="alert" className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {formError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save provider'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={submitting}
          className="rounded-md border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

// ─── Model list ──────────────────────────────────────────────────────────────

function ModelListPanel({
  result,
  current,
  onPick,
}: {
  result: LlmModelDiscoveryResult;
  current: string | null;
  /** Null when the list is read-only (the credential is already saved). */
  onPick: ((id: string) => void) | null;
}) {
  return (
    <div className="mt-4 rounded-md border border-gray-800 bg-gray-950/60 p-3">
      <p className="text-xs text-gray-400">{result.detail}</p>
      {result.models.length > 0 ? (
        <>
          <p className="mt-1 text-[11px] text-gray-500">
            {result.listed} listed, {result.excluded} not chat-capable
            {result.truncated ? ', list truncated' : ''}. Chat models keep tool calling; pick one below.
          </p>
          <ul className="mt-2 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto" aria-label="Available models">
            {result.models.map((m) => {
              const active = current === m.id;
              return (
                <li key={m.id}>
                  {onPick ? (
                    <button
                      type="button"
                      onClick={() => onPick(m.id)}
                      aria-pressed={active}
                      title={m.name ?? m.id}
                      className={clsx(
                        'rounded-md border px-2 py-1 font-mono text-[11px] transition-colors',
                        active
                          ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                          : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:text-gray-100',
                      )}
                    >
                      {m.id}
                    </button>
                  ) : (
                    <code
                      className={clsx(
                        'rounded-md border px-2 py-1 font-mono text-[11px]',
                        active
                          ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                          : 'border-gray-800 bg-gray-900 text-gray-400',
                      )}
                      title={m.name ?? m.id}
                    >
                      {m.id}
                    </code>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default AiProviderCard;
