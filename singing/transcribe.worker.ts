// Pitch tracking a two-minute recording is heavy, so it runs here rather than on the page.
import { transcribeMelody } from '../src/singing';

self.onmessage = (event: MessageEvent<Float32Array>) => {
  self.postMessage(transcribeMelody(event.data));
};
