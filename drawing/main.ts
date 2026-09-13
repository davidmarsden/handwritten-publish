import { preparePhotoForMicroblog } from '../packages/publishing-core/image-optimization';

type Challenge = {
  id: string;
  title: string;
  difficulty: string | null;
  imageUrl: string;
};

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const challengeCard = $('#challenge-card');
const challengeTitle = $('#challenge-title');
const challengeDifficulty = $('#challenge-difficulty');
const challengeImage = $('#challenge-image') as HTMLImageElement;
const noChallenge = $('#no-challenge');
const submissionForm = $('#submission-form') as HTMLFormElement;
const submissionStatus = $('#submission-status');
const adminPanel = $('#admin-panel');
const adminForm = $('#admin-form') as HTMLFormElement;
const adminStatus = $('#admin-status');

let activeChallenge: Challenge | null = null;

function setStatus(target: HTMLElement, message: string, error = false) {
  target.textContent = message;
  target.dataset.error = error ? 'true' : 'false';
}

async function preparedImage(file: File): Promise<File> {
  const prepared = await preparePhotoForMicroblog(file, file.type);
  return prepared.file;
}

async function loadChallenge() {
  const response = await fetch('/api/drawing-challenges', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not load the current challenge.');
  const payload = await response.json() as { challenge: Challenge | null };
  activeChallenge = payload.challenge;

  if (!activeChallenge) {
    challengeCard.hidden = true;
    noChallenge.hidden = false;
    return;
  }

  noChallenge.hidden = true;
  challengeCard.hidden = false;
  challengeTitle.textContent = activeChallenge.title;
  challengeDifficulty.textContent = activeChallenge.difficulty ? `Difficulty: ${activeChallenge.difficulty}` : '';
  challengeDifficulty.hidden = !activeChallenge.difficulty;
  challengeImage.src = activeChallenge.imageUrl;
  challengeImage.alt = `Elijah's challenge drawing: ${activeChallenge.title}`;
}

submissionForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeChallenge) return;

  const data = new FormData(submissionForm);
  const picked = data.get('image');
  if (!(picked instanceof File) || !picked.size) {
    setStatus(submissionStatus, 'Choose a photo of your drawing first.', true);
    return;
  }

  setStatus(submissionStatus, 'Preparing your drawing…');
  try {
    const image = await preparedImage(picked);
    data.set('image', image, image.name);
    data.set('challengeId', activeChallenge.id);
    setStatus(submissionStatus, 'Sending your drawing to Elijah…');

    const response = await fetch('/api/drawing-submissions', { method: 'POST', body: data });
    const payload = await response.json() as { error?: string; submission?: { resultUrl: string } };
    if (!response.ok || !payload.submission) throw new Error(payload.error || 'Your drawing could not be submitted.');

    submissionForm.reset();
    submissionStatus.innerHTML = `Sent! Elijah can now judge your drawing. <a href="${payload.submission.resultUrl}">Keep this private result link</a>.`;
  } catch (error) {
    setStatus(submissionStatus, error instanceof Error ? error.message : 'Your drawing could not be submitted.', true);
  }
});

if (new URL(location.href).searchParams.get('admin') === '1') {
  adminPanel.hidden = false;
  const savedKey = localStorage.getItem('drawing-hand-admin-key');
  if (savedKey) (adminForm.elements.namedItem('adminKey') as HTMLInputElement).value = savedKey;
}

adminForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(adminForm);
  const adminKey = String(data.get('adminKey') || '').trim();
  const picked = data.get('image');
  if (!adminKey) {
    setStatus(adminStatus, 'Enter the Drawing Hand admin key.', true);
    return;
  }
  if (!(picked instanceof File) || !picked.size) {
    setStatus(adminStatus, "Choose Elijah's challenge picture.", true);
    return;
  }

  try {
    setStatus(adminStatus, "Preparing Elijah's picture…");
    const image = await preparedImage(picked);
    data.set('image', image, image.name);
    data.delete('adminKey');

    const response = await fetch('/api/drawing-challenges', {
      method: 'POST',
      headers: { 'x-drawing-hand-key': adminKey },
      body: data,
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'The challenge could not be published.');

    localStorage.setItem('drawing-hand-admin-key', adminKey);
    adminForm.reset();
    (adminForm.elements.namedItem('adminKey') as HTMLInputElement).value = adminKey;
    setStatus(adminStatus, 'Challenge published. It is now open for drawings.');
    await loadChallenge();
  } catch (error) {
    setStatus(adminStatus, error instanceof Error ? error.message : 'The challenge could not be published.', true);
  }
});

loadChallenge().catch(error => {
  challengeCard.hidden = true;
  noChallenge.hidden = false;
  noChallenge.textContent = error instanceof Error ? error.message : 'Could not load the current challenge.';
});
