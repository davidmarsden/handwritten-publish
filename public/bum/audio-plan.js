// Pure planning helpers for BUM Hand audio processing.
// Encoding and uploading are deliberately separate: never report conversion success from a plan.
export const AUDIO_SEGMENT_MINUTES = Object.freeze([1, 2, 3, 4, 5, 10, 15]);
export const AUTO_SPLIT_THRESHOLD_SECONDS = 15 * 60;

export function planAudioSegments(durationSeconds, {
  split = true,
  segmentMinutes = 5,
  thresholdSeconds = AUTO_SPLIT_THRESHOLD_SECONDS,
} = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('Audio duration must be a positive finite number.');
  }
  if (!AUDIO_SEGMENT_MINUTES.includes(segmentMinutes)) {
    throw new RangeError('Unsupported segment length.');
  }
  if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
    throw new RangeError('Invalid splitting threshold.');
  }
  if (!split || durationSeconds <= thresholdSeconds) {
    return [{ index: 1, startSeconds: 0, durationSeconds }];
  }
  const chunkSeconds = segmentMinutes * 60;
  const count = Math.ceil(durationSeconds / chunkSeconds);
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    startSeconds: i * chunkSeconds,
    durationSeconds: Math.min(chunkSeconds, durationSeconds - i * chunkSeconds),
  }));
}

export function audioPartFilename(originalName, index, count, extension = 'mp3') {
  if (!Number.isInteger(index) || index < 1 || !Number.isInteger(count) || index > count) {
    throw new RangeError('Invalid part number.');
  }
  const stem = String(originalName).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._-]/gu, '_') || 'audio';
  return `${stem}-part-${String(index).padStart(Math.max(2, String(count).length), '0')}.${extension}`;
}
