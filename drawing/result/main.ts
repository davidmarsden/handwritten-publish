type DrawingResult = {
  displayName: string;
  status: 'waiting-for-elijah' | 'judged';
  score: number | null;
  grade: string | null;
  comment: string | null;
  judgedAt: string | null;
  challenge: { id: string; title: string; imageUrl: string };
  imageUrl: string;
};

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const headline = $('#headline');
const intro = $('#intro');
const content = $('#content');
const challengeTitle = $('#challenge-title');
const challengeImage = $('#challenge-image') as HTMLImageElement;
const entryCaption = $('#entry-caption');
const entryImage = $('#entry-image') as HTMLImageElement;
const judgement = $('#judgement');
const score = $('#score');
const grade = $('#grade');
const comment = $('#comment');

async function loadResult() {
  const token = new URL(location.href).searchParams.get('token')?.trim() ?? '';
  if (!token) throw new Error('This private result link is missing its token.');

  const response = await fetch(`/api/drawing-result?token=${encodeURIComponent(token)}`, {
    headers: { accept: 'application/json' },
  });
  const payload = await response.json() as { error?: string; result?: DrawingResult };
  if (!response.ok || !payload.result) throw new Error(payload.error || 'This result could not be found.');

  const result = payload.result;
  content.hidden = false;
  challengeTitle.textContent = result.challenge.title;
  challengeImage.src = result.challenge.imageUrl;
  challengeImage.alt = `Elijah's challenge drawing: ${result.challenge.title}`;
  entryCaption.textContent = `${result.displayName}'s drawing`;
  entryImage.src = result.imageUrl;
  entryImage.alt = `Drawing submitted by ${result.displayName}`;

  if (result.status === 'judged' && result.score !== null && result.grade) {
    headline.textContent = `Elijah has judged it!`;
    intro.textContent = `${result.displayName}, here's your Drawing Hand result.`;
    score.textContent = `${result.score}/10`;
    grade.textContent = result.grade;
    judgement.hidden = false;
    if (result.comment) {
      comment.textContent = `“${result.comment}” — Elijah`;
      comment.hidden = false;
    }
  } else {
    headline.textContent = 'Waiting for Elijah.';
    intro.textContent = 'Your drawing is safely in the Judging Desk. Keep this private link and come back after Elijah has graded it.';
    judgement.hidden = true;
  }
}

loadResult().catch(error => {
  headline.textContent = 'Result not found.';
  intro.textContent = error instanceof Error ? error.message : 'This result could not be loaded.';
  content.hidden = true;
});
