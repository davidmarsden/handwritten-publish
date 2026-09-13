import { DRAWING_GRADES, suggestedDrawingGrade } from '../../src/drawingGrades';

type Submission = {
  id: string;
  displayName: string;
  submittedAt: string;
  moderationStatus: string;
  score: number | null;
  grade: string | null;
  comment: string | null;
  judgedAt: string | null;
  challenge: { id: string; title: string; imageUrl: string };
  imageUrl: string;
  resultUrl: string;
};

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const loginCard = $('#login-card');
const loginForm = $('#login-form') as HTMLFormElement;
const loginStatus = $('#login-status');
const desk = $('#desk');
const deskStatus = $('#desk-status');
const entries = $('#entries');

let adminKey = localStorage.getItem('drawing-hand-admin-key') ?? '';

function setStatus(target: HTMLElement, message: string, error = false) {
  target.textContent = message;
  target.dataset.error = error ? 'true' : 'false';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));
}

function gradeOptions(selected: string | null) {
  return DRAWING_GRADES.map(({ label, min, max }) =>
    `<option value="${escapeHtml(label)}" ${selected === label ? 'selected' : ''}>${escapeHtml(label)} (${min}–${max})</option>`
  ).join('');
}

function render(submissions: Submission[]) {
  if (!submissions.length) {
    entries.innerHTML = '<div class="card empty"><h2>No drawings yet.</h2><p>When somebody submits an entry, it will appear here.</p></div>';
    return;
  }

  entries.innerHTML = submissions.map((submission, index) => {
    const judged = Boolean(submission.judgedAt);
    const score = submission.score ?? '';
    const selectedGrade = submission.grade ?? '';
    const suggested = typeof submission.score === 'number' ? suggestedDrawingGrade(submission.score) : null;
    return `<article class="card ${judged ? 'judged' : ''}" data-entry="${escapeHtml(submission.id)}">
      <div class="meta">
        <span class="pill">${judged ? 'Judged' : `Waiting #${index + 1}`}</span>
        <strong>${escapeHtml(submission.displayName)}</strong>
        <span class="note">${new Date(submission.submittedAt).toLocaleString()}</span>
      </div>
      <h2>${escapeHtml(submission.challenge.title)}</h2>
      <div class="entry-grid">
        <figure class="image-box"><figcaption>Elijah's challenge</figcaption><img src="${escapeHtml(submission.challenge.imageUrl)}" alt="Elijah's challenge drawing"></figure>
        <figure class="image-box"><figcaption>${escapeHtml(submission.displayName)}'s drawing</figcaption><img src="${escapeHtml(submission.imageUrl)}" alt="Submitted drawing by ${escapeHtml(submission.displayName)}"></figure>
      </div>
      <form class="judge-form">
        <div class="fields">
          <label>Score out of 10
            <input name="score" type="number" min="0" max="10" step="0.001" inputmode="decimal" value="${score}" required>
          </label>
          <p class="note suggestion">${suggested ? `Suggested grade: ${escapeHtml(suggested)}` : (submission.score === null ? 'Enter a score to see the suggested grade.' : 'No automatic grade for this score — Elijah chooses.')}</p>
          <label>Final grade
            <select name="grade" required>
              <option value="" ${selectedGrade ? '' : 'selected'} disabled>Choose grade</option>
              ${gradeOptions(selectedGrade)}
            </select>
          </label>
          <label>Elijah's comment (optional)
            <textarea name="comment" maxlength="280" placeholder="What did you like?">${escapeHtml(submission.comment ?? '')}</textarea>
          </label>
          <label class="check"><input name="showInGallery" type="checkbox" ${submission.moderationStatus === 'approved' ? 'checked' : ''}> <span>Allow this drawing to appear in a future public gallery</span></label>
        </div>
        <button type="submit">${judged ? 'Update result' : 'Save result'}</button>
        <a class="result-link" href="${escapeHtml(submission.resultUrl)}" target="_blank" rel="noreferrer">Open private result ↗</a>
        <p class="status form-status" aria-live="polite"></p>
      </form>
    </article>`;
  }).join('');

  for (const article of entries.querySelectorAll<HTMLElement>('[data-entry]')) {
    const form = article.querySelector<HTMLFormElement>('.judge-form')!;
    const scoreInput = form.elements.namedItem('score') as HTMLInputElement;
    const gradeSelect = form.elements.namedItem('grade') as HTMLSelectElement;
    const suggestion = article.querySelector<HTMLElement>('.suggestion')!;
    const status = article.querySelector<HTMLElement>('.form-status')!;

    scoreInput.addEventListener('input', () => {
      const score = Number(scoreInput.value);
      const grade = suggestedDrawingGrade(score);
      if (grade) {
        suggestion.textContent = `Suggested grade: ${grade}`;
        gradeSelect.value = grade;
      } else {
        suggestion.textContent = scoreInput.value ? 'No automatic grade for this score — Elijah chooses.' : 'Enter a score to see the suggested grade.';
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        submissionId: article.dataset.entry,
        score: Number(data.get('score')),
        grade: String(data.get('grade') || ''),
        comment: String(data.get('comment') || ''),
        showInGallery: data.get('showInGallery') === 'on',
      };
      setStatus(status, 'Saving Elijah’s result…');
      try {
        const response = await fetch('/api/drawing-judging', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-drawing-hand-key': adminKey,
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not save the result.');
        setStatus(status, 'Saved. The private result link now shows Elijah’s judgement.');
        article.classList.add('judged');
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : 'Could not save the result.', true);
      }
    });
  }
}

async function loadDesk() {
  if (!adminKey) return;
  setStatus(loginStatus, 'Opening desk…');
  const response = await fetch('/api/drawing-judging', {
    headers: { accept: 'application/json', 'x-drawing-hand-key': adminKey },
  });
  const payload = await response.json() as { error?: string; submissions?: Submission[] };
  if (!response.ok || !payload.submissions) throw new Error(payload.error || 'Could not open the Judging Desk.');
  localStorage.setItem('drawing-hand-admin-key', adminKey);
  loginCard.hidden = true;
  desk.hidden = false;
  setStatus(deskStatus, `${payload.submissions.filter(item => !item.judgedAt).length} drawing${payload.submissions.filter(item => !item.judgedAt).length === 1 ? '' : 's'} waiting for Elijah.`);
  render(payload.submissions);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  adminKey = String(new FormData(loginForm).get('adminKey') || '').trim();
  if (!adminKey) return;
  try {
    await loadDesk();
  } catch (error) {
    setStatus(loginStatus, error instanceof Error ? error.message : 'Could not open the Judging Desk.', true);
  }
});

if (adminKey) {
  (loginForm.elements.namedItem('adminKey') as HTMLInputElement).value = adminKey;
  loadDesk().catch(error => setStatus(loginStatus, error instanceof Error ? error.message : 'Could not open the Judging Desk.', true));
}
