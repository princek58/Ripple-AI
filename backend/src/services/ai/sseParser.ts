/**
 * Safe parser for Server-Sent Events (SSE) data streams.
 * Decodes incoming binary chunks across line/byte boundaries without corruption.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | Buffer | string>
): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  if ('getReader' in stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            yield trimmed;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          yield trimmed;
        }
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    yield buffer.trim();
  }
}
