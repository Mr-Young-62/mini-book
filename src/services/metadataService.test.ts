import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (name: string, options: unknown) => invokeMock(name, options) } },
  metadataSupabase: null,
}));

import { fetchBookMetadataByIsbn } from './metadataService';

/** Mirrors supabase-js: a non-2xx response becomes FunctionsHttpError with the Response attached. */
function httpError(status: number, body: unknown = {}) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, json: async () => body },
  };
}

describe('fetchBookMetadataByIsbn failure classification', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('maps HTTP 429 to rate_limited instead of not_found', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(429, { error: 'Terlalu banyak permintaan' }) });

    const result = await fetchBookMetadataByIsbn('9780140449136');

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('rate_limited');
    expect(result.error).toMatch(/rate limit/i);
  });

  it('maps a 5xx provider outage to provider_error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(503) });

    const result = await fetchBookMetadataByIsbn('9780000000064');

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('provider_error');
    expect(result.error).toMatch(/HTTP 503/);
  });

  it('maps a gateway timeout to timeout', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(504) });

    const result = await fetchBookMetadataByIsbn('9786029123456');

    expect(result.errorType).toBe('timeout');
  });

  it('prefers the structured errorType sent by the Edge Function', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(500, { found: false, errorType: 'timeout' }) });

    const result = await fetchBookMetadataByIsbn('9791234567896');

    expect(result.errorType).toBe('timeout');
  });

  it('reports a missing Edge Function as a provider error, not as not_found', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404) });

    const result = await fetchBookMetadataByIsbn('9780804429573');

    expect(result.errorType).toBe('provider_error');
    expect(result.error).toMatch(/book-metadata/);
  });

  it('maps a transport failure to network_error', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
        context: new TypeError('fetch failed'),
      },
    });

    const result = await fetchBookMetadataByIsbn('9780765350381');

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('network_error');
  });

  it('keeps a successful empty answer as not_found', async () => {
    invokeMock.mockResolvedValue({
      data: { found: false, isbn: '9780306406157', message: 'Book metadata not found.' },
      error: null,
    });

    const result = await fetchBookMetadataByIsbn('9780306406157');

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('not_found');
    expect(result.error).toMatch(/tidak ditemukan/i);
  });

  it('does not turn an unrecognised 200 payload into a success', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });

    const result = await fetchBookMetadataByIsbn('9780143127741');

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('not_found');
  });
});

describe('fetchBookMetadataByIsbn success', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('maps the metadata payload and caches the lookup by ISBN-13', async () => {
    invokeMock.mockResolvedValue({
      data: {
        title: 'Judul Uji',
        authors: ['Penulis Uji'],
        publisher: 'Penerbit Uji',
        publicationYear: 2021,
        isbn13: '9780306406157',
        description: 'Deskripsi uji',
        language: 'id',
        pageCount: 320,
        categories: ['Fiksi'],
        source: 'google_books',
      },
      error: null,
    });

    const first = await fetchBookMetadataByIsbn('9780306406157');
    const second = await fetchBookMetadataByIsbn('978-0-306-40615-7');

    expect(first.success).toBe(true);
    expect(first.source).toBe('google_books');
    expect(first.metadata?.title).toBe('Judul Uji');
    expect(second.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
