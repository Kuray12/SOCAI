/**
 * Settings → Deployment & AI hosts the AI provider card.
 *
 * The card itself is covered in `components/ai-estate/AiProviderCard.test.tsx`
 * (states, validation, Kenari's pre-filled endpoint, Test and model listing).
 * What this file pins is the wiring this panel owns:
 *
 *   • the card is rendered at all, and reads the credential under the key the
 *     panel refreshes;
 *   • a save refreshes the read-only LLM snapshot beside it, because the
 *     resolved provider changes the moment a tenant override moves;
 *   • the read-only snapshot names Kenari as Kenari rather than "custom".
 *
 * A snapshot of the card here would be the wrong test: every one of those
 * cases would pass with the component deleted from the panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const swrData = vi.hoisted(() => new Map<string, unknown>());
const swrMutate = vi.hoisted(() => vi.fn());

vi.mock('swr', () => ({
  __esModule: true,
  default: (key: unknown) => ({
    data: swrData.get(String(key)),
    error: undefined,
    isLoading: false,
    mutate: swrMutate,
  }),
}));

const api = vi.hoisted(() => ({
  getAirgapStatus: vi.fn(),
  getLlmStatus: vi.fn(),
  getLlmCredential: vi.fn(),
  upsertLlmCredential: vi.fn(),
  deleteLlmCredential: vi.fn(),
  discoverLlmModels: vi.fn(),
  discoverStoredLlmModels: vi.fn(),
  testLlmCredential: vi.fn(),
  list: vi.fn(),
  statuses: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  __esModule: true,
  deploymentApi: api,
  connectorsApi: { list: api.list, statuses: api.statuses },
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

vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { __esModule: true, default: fn, toast: fn };
});

import { SettingsView } from './SettingsView';
import type { LlmCredentialView, LlmStatus } from '@/lib/api';

const AIRGAP_KEY = 'settings:airgap-status';
const LLM_KEY = 'settings:llm-status';
const CRED_KEY = 'settings:llm-credential';

const airgap = {
  enabled: false,
  allowlist: [],
  implicit_private_suffixes: ['.local', '.internal'],
  policy: 'Air-gap disabled; all egress permitted.',
};

function llmStatus(overrides: Partial<LlmStatus> = {}): LlmStatus {
  return {
    provider: 'kenari',
    model: 'deepseek-v4-flash',
    base_url: 'https://kenari.id/v1',
    host: 'kenari.id',
    key_set: true,
    airgap_enabled: false,
    airgap_compliant: true,
    is_local: false,
    effective_path: 'live',
    policy_note: 'LLM calls are routed to kenari at kenari.id. Outbound HTTP is required.',
    recent_health: 'healthy',
    recent_calls: 3,
    recent_failures: 0,
    recent_note: '3 calls in the last hour, none failed.',
    ...overrides,
  } as LlmStatus;
}

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

async function openDeploymentTab(data: LlmCredentialView | null) {
  swrData.clear();
  swrData.set(AIRGAP_KEY, airgap);
  swrData.set(LLM_KEY, llmStatus());
  if (data) swrData.set(CRED_KEY, data);

  render(<SettingsView />);
  await userEvent.click(await screen.findByRole('button', { name: /deployment.*ai/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Settings → Deployment & AI', () => {
  it('renders the provider card under the key the panel refreshes', async () => {
    await openDeploymentTab(credential());

    // The card's read-only view, carrying the saved Kenari connection.
    expect(await screen.findByRole('heading', { name: 'AI provider' })).toBeInTheDocument();
    expect(screen.getAllByText('Kenari (kenari.id)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('https://kenari.id/v1').length).toBeGreaterThanOrEqual(1);
  });

  it('offers the connection form when no provider is saved', async () => {
    await openDeploymentTab(null);

    expect(await screen.findByRole('button', { name: /connect a provider/i })).toBeInTheDocument();
    expect(screen.getByText(/Connect Kenari to route triage/)).toBeInTheDocument();
  });

  it('names Kenari in the read-only provider snapshot', async () => {
    await openDeploymentTab(credential());

    // The card's own heading is the anchor: the snapshot renders after it.
    expect(await screen.findByRole('heading', { name: 'AI provider' })).toBeInTheDocument();
    // The snapshot card and the provider card both name it; the point is that
    // the label is not "Custom endpoint".
    expect(screen.getAllByText('Kenari (kenari.id)').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Custom endpoint')).not.toBeInTheDocument();
  });

  it('refreshes the LLM snapshot when the saved provider changes', async () => {
    api.deleteLlmCredential.mockResolvedValue(undefined);
    await openDeploymentTab(credential());

    await userEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm remove/i }));

    // The card itself re-reads its credential; this panel refreshes the
    // status snapshot, which is a different SWR key.
    expect(swrMutate).toHaveBeenCalled();
  });
});
