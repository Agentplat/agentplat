import { digestControlJsonV1, utf8ByteLength } from './canonical.js';
import type {
  ControlStreamChunkV1,
  ControlStreamV1,
  InferenceControlLimitsV1,
  StreamWindowV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertSafeInteger,
  assertString,
  deepFreeze,
} from './validation.js';

export function validateControlStreamV1(value: unknown): ControlStreamV1 {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'streamId',
      'runId',
      'generation',
      'nextSequence',
      'releasedThroughSequence',
      'receivedBytes',
      'releasedBytes',
      'finalDigest',
      'status',
    ],
    'control stream',
  );
  const stream = value as unknown as ControlStreamV1;
  if (stream.schemaVersion !== 1)
    throw new TypeError('stream_sequence_invalid');
  assertString(stream.streamId, 'streamId');
  assertString(stream.runId, 'runId');
  assertSafeInteger(stream.generation, 'generation', 1);
  assertSafeInteger(stream.nextSequence, 'nextSequence');
  assertSafeInteger(
    stream.releasedThroughSequence,
    'releasedThroughSequence',
    -1,
  );
  assertSafeInteger(stream.receivedBytes, 'receivedBytes');
  assertSafeInteger(stream.releasedBytes, 'releasedBytes');
  if (stream.releasedBytes > stream.receivedBytes)
    throw new TypeError('stream_sequence_invalid');
  if (stream.finalDigest !== null)
    assertDigest(stream.finalDigest, 'finalDigest');
  assertOneOf(
    stream.status,
    ['open', 'completed', 'cancelled', 'failed'],
    'stream status',
  );
  return deepFreeze(structuredClone(stream));
}

export function validateControlStreamChunkV1(
  value: unknown,
  limits: InferenceControlLimitsV1,
): ControlStreamChunkV1 {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'chunkId',
      'streamId',
      'generation',
      'sequence',
      'fromByte',
      'throughByteExclusive',
      'utf8Bytes',
      'content',
      'contentDigest',
    ],
    'control stream chunk',
  );
  const chunk = value as unknown as ControlStreamChunkV1;
  if (chunk.schemaVersion !== 1) throw new TypeError('stream_sequence_invalid');
  assertString(chunk.chunkId, 'chunkId');
  assertString(chunk.streamId, 'streamId');
  assertSafeInteger(chunk.generation, 'generation', 1);
  assertSafeInteger(chunk.sequence, 'sequence');
  assertSafeInteger(chunk.fromByte, 'fromByte');
  assertSafeInteger(chunk.throughByteExclusive, 'throughByteExclusive', 1);
  assertSafeInteger(chunk.utf8Bytes, 'utf8Bytes', 1);
  assertString(chunk.content, 'content');
  assertDigest(chunk.contentDigest, 'contentDigest');
  const bytes = utf8ByteLength(chunk.content);
  if (
    bytes !== chunk.utf8Bytes ||
    chunk.throughByteExclusive !== chunk.fromByte + bytes ||
    bytes > limits.maxOutputChunkBytes ||
    chunk.contentDigest !==
      digestControlJsonV1('assessment-target', chunk.content)
  )
    throw new TypeError('stream_content_mismatch');
  return deepFreeze(structuredClone(chunk));
}

export function createStreamWindowV1(
  stream: ControlStreamV1,
  chunks: readonly ControlStreamChunkV1[],
): StreamWindowV1 {
  if (
    chunks.length < 1 ||
    chunks.some(
      (chunk, index) =>
        chunk.streamId !== stream.streamId ||
        chunk.generation !== stream.generation ||
        (index > 0 &&
          (chunk.sequence !== chunks[index - 1]!.sequence + 1 ||
            chunk.fromByte !== chunks[index - 1]!.throughByteExclusive)),
    )
  )
    throw new TypeError('stream_sequence_invalid');
  const first = chunks[0]!;
  const last = chunks[chunks.length - 1]!;
  const material = {
    schemaVersion: 1 as const,
    streamId: stream.streamId,
    generation: stream.generation,
    fromSequence: first.sequence,
    throughSequence: last.sequence,
    fromByte: first.fromByte,
    throughByteExclusive: last.throughByteExclusive,
    utf8Bytes: last.throughByteExclusive - first.fromByte,
    chunkDigests: chunks.map((chunk) => chunk.contentDigest),
  };
  return deepFreeze({
    ...material,
    windowDigest: digestControlJsonV1('stream-window', material),
  });
}
