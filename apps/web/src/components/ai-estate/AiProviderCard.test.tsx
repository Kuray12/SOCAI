/**
 * The AI provider card — the write surface for a tenant's LLM connection.
 *
 * It started life as `BYOKCard` inside Settings and was extracted so Settings
 * and AI Estate render one component. These cases pin the behaviour that
 * matters to an operator:
 *
 *   • connecting Kenari requires the two things Kenari requires (a base URL
 *     and a key), and sends both;
 *   • a saved credential is shown with the fact that a key exists and never
 *     the key itself;
 *   • Test reports an air-gapped refusal as "unverified", not as a failure;
 *   • the saved credential's own model list is one click, with nothing typed.
 *
 * SWR is mocked so each key gets controlled data; `deploymentApi` is mocked to
 * observe what would have been sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const swrData = vi.hoisted(() => new Map<string, unknown>());
const swrErrors = vi.hoisted(() => new Map<string, unknown>());

vi.mock('swr', () => ({
  __esModule: true,
  default: (key: unknown) => ({
    data: swrData.get(String(key)),
    error: swrErrors.get(String(key)),
    isLoading: false,
    mutate: async () => undefined,
  }),
}));

const api = vi.hoisted(() => ({
  upsertLlmCredential: vi.fn(),
  deleteLlmCredential: vi.fn(),
  discoverLlmModels: vi.fn(),
  discoverStoredLlmModels: vi.fn(),
  testLlmCredential: vi.fn(),
  getLlmCredential: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  __esModule: true,
  deploymentApi: api,
  ApiError: class ApiError extends Error {
    status: number;
    body: string;
    constructor(message: string, status = 500, body = '') {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastPlain = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => {
  const fn = Object.assign((m: string) => toastPlain(m), {
    success: toastSuccess,
    error: toastError,
  });
  return { __esModule: true, default: fn, toast: fn };
});

import { AiProviderCard, PROVIDER_LABEL, providerHintFor } from './AiProviderCard';
import type { LlmCredentialView } from '@/lib/api';

const KEY = 'test:llm-credential';

function credential(overrides: Partial<LlmCredentialView> = {}): LlmCredentialView {
  return {
    provider: 'kenari',
    base_url: 'https://kenari.id/v1',
    model: 'deepseek-v4-flash',
    has_api_key: true,
    enabled: true,
    settings: {},
    created_at: '2026-01-01T00:00:00Z',
    last_rotated_at: '2026-02-01T12:00:00Z',
    updated_at: '2026-02-01T12:00:00Z',
    ...overrides,
  } as LlmCredentialView;
}

function seed(data: LlmCredentialView | null, error?: unknown) {
  swrData.clear();
  swrErrors.clear();
  if (error) {
    swrErrors.set(KEY, error);
    return;
  }
  if (data) swrData.set(KEY, data);
}

async function openForm() {
  const button = await screen.findByRole('button', {
    name: /connect a provider|^edit$/i,
  });
  await userEvent.click(button);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Kenari is a first-class provider', () => {
  it('is named in the picker and pre-fills its OpenAI-compatible endpoint', async () => {
    seed(null);
    render(<AiProviderCard swrKey={KEY} />);
    await openForm();

    const select = screen.getByRole('combobox', { name: /provider/i });
    expect(select).toHaveValue('kenari');
    expect(screen.getByRole('option', { name: /kenari/i })).toBeInTheDocument();

    // The base URL is filled and keeps the /v1 suffix the runtime appends
    // /chat/completions to.
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://kenari.id/v1');
  });

  it('requires Kenari\'s key and sends exactly what the operator typed', async () => {
    api.upsertLlmCredential.mockResolvedValue(credential());
    seed(null);
    render(<AiProviderCard swrKey={KEY} />);
    await openForm();

    await userEvent.click(screen.getByRole('button', { name: /save provider/i }));
    expect(await screen.findByText(/kenari \(kenari\.id\) requires an api key/i)).toBeInTheDocument();
    expect(api.upsertLlmCredential).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/api key/i), 'kn-test-123');
    await userEvent.type(screen.getByLabelText(/^model/i), 'deepseek-v4-flash');
    await userEvent.click(screen.getByRole('button', { name: /save provider/i }));

    await waitFor(() =>
      expect(api.upsertLlmCredential).toHaveBeenCalledWith({
        provider: 'kenari',
        base_url: 'https://kenari.id/v1',
        model: 'deepseek-v4-flash',
        api_key: 'kn-test-123',
        enabled: true,
      }),
    );
  });

  it('switching away from Kenari drops its endpoint but keeps a typed one', async () => {
    seed(null);
    render(<AiProviderCard swrKey={KEY} />);
    await openForm();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'openai');
    // The Kenari default is not carried over to OpenAI.
    expect(screen.getByLabelText(/base url/i)).toHaveValue('');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'kenari');
    await userEvent.clear(screen.getByLabelText(/base url/i));
    await userEvent.type(screen.getByLabelText(/base url/i), 'https://proxy.example.com/v1');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'custom');
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://proxy.example.com/v1');
  });

  it('lists the models Kenari serves and picks the chosen id into the form', async () => {
    api.discoverLlmModels.mockResolvedValue({
      outcome: 'ok',
      detail: '2 chat model(s) of 3 listed.',
      models: [{ id: 'deepseek-v4-flash' }, { id: 'kimi-k3', name: 'Kimi K3' }],
      listed: 3,
      excluded: 1,
      truncated: false,
    });
    seed(null);
    render(<AiProviderCard swrKey={KEY} />);
    await openForm();

    await userEvent.type(screen.getByLabelText(/api key/i), 'kn-test-123');
    await userEvent.click(screen.getByRole('button', { name: /fetch models/i }));

    expect(api.discoverLlmModels).toHaveBeenCalledWith({
      base_url: 'https://kenari.id/v1',
      api_key: 'kn-test-123',
    });
    const picked = await screen.findByRole('button', { name: 'kimi-k3' });
    await userEvent.click(picked);
    expect(screen.getByLabelText(/^model/i)).toHaveValue('kimi-k3');
    expect(screen.getByText(/2 chat model\(s\) of 3 listed/)).toBeInTheDocument();
  });
});

describe('a saved credential', () => {
  it('shows that a key exists without showing the key', () => {
    seed(credential());
    render(<AiProviderCard swrKey={KEY} />);

    expect(screen.getByText('Kenari (kenari.id)')).toBeInTheDocument();
    expect(screen.getByText('https://kenari.id/v1')).toBeInTheDocument();
    expect(screen.getByText('Set (vault-encrypted)')).toBeInTheDocument();
  });

  it('lists the saved endpoint\'s models without a form', async () => {
    api.discoverStoredLlmModels.mockResolvedValue({
      outcome: 'ok',
      detail: '1 chat model(s) of 1 listed.',
      models: [{ id: 'deepseek-v4-flash' }],
      listed: 1,
      excluded: 0,
      truncated: false,
    });
    seed(credential());
    render(<AiProviderCard swrKey={KEY} />);

    await userEvent.click(screen.getByRole('button', { name: /list models/i }));

    expect(api.discoverStoredLlmModels).toHaveBeenCalledTimes(1);
    // The saved model appears in the summary and again in the list below it.
    expect(await screen.findAllByText('deepseek-v4-flash')).toHaveLength(2);
  });

  it('reports an air-gapped refusal as information, not as an error', async () => {
    api.testLlmCredential.mockResolvedValue({
      outcome: 'unverified',
      detail: 'This deployment is air-gapped, so the call was not attempted.',
      provider: 'kenari',
    });
    seed(credential());
    render(<AiProviderCard swrKey={KEY} />);

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => expect(toastPlain).toHaveBeenCalledWith(expect.stringMatching(/air-gapped/i)));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('reports a failing provider as an error', async () => {
    api.testLlmCredential.mockResolvedValue({
      outcome: 'refused',
      detail: 'The provider rejected the credential (HTTP 401). Check the key.',
      provider: 'kenari',
    });
    seed(credential());
    render(<AiProviderCard swrKey={KEY} />);

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/401/)));
  });

  it('requires two clicks to remove, and says what happens next', async () => {
    api.deleteLlmCredential.mockResolvedValue(undefined);
    seed(credential());
    render(<AiProviderCard swrKey={KEY} />);

    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(api.deleteLlmCredential).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /confirm remove/i }));

    await waitFor(() => expect(api.deleteLlmCredential).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/falling back to platform defaults/i));
  });
});

describe('the empty and failed states', () => {
  it('names Kenari as the thing to connect', () => {
    seed(null);
    render(<AiProviderCard swrKey={KEY} />);
    expect(screen.getByText(/Connect Kenari to route triage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect a provider/i })).toBeInTheDocument();
  });

  it('says the provider could not be loaded rather than pretending none is set', () => {
    seed(null, new Error('403 Forbidden'));
    render(<AiProviderCard swrKey={KEY} />);
    expect(screen.getByText(/AI provider unavailable/i)).toBeInTheDocument();
  });
});

describe('provider catalogue', () => {
  it('names every writable provider', () => {
    for (const id of [
      'kenari',
      'openai',
      'anthropic',
      'azure-openai',
      'local-ollama',
      'local-vllm',
      'local-litellm',
      'custom',
    ] as const) {
      expect(PROVIDER_LABEL[id]).toBeTruthy();
    }
    expect(PROVIDER_LABEL.kenari).toMatch(/kenari\.id/);
  });

  it('gives Kenari a default endpoint and a /v1 hint', () => {
    const hint = providerHintFor('kenari');
    expect(hint.baseUrlDefault).toBe('https://kenari.id/v1');
    expect(hint.baseUrlHint).toMatch(/\/v1/);
    expect(hint.keyHint).toMatch(/kn-/);
  });
});
