# Drawing Hand

**Draw it. Send it. Get graded.**

Drawing Hand is the drawing-competition app in the Helping Hand family. Elijah publishes a reference drawing, people remotely submit their own attempt, and Elijah judges each entry using his grading system.

The public surface is `/drawing/`. Elijah's private judging surface is `/drawing/judge/`, while each entrant receives an unguessable private `/drawing/result/?token=…` URL.

## Current boundary

Drawing Hand currently supports:

- a published drawing challenge with title, image and optional difficulty;
- public JPEG, PNG and WebP submissions without requiring an account;
- a display name only — no surname, age, school or other unnecessary personal information;
- private-by-default submissions;
- a private Judging Desk for Elijah protected by `DRAWING_HAND_ADMIN_KEY`;
- a score out of 10, suggested grade, optional judge comment and moderation state;
- an unguessable private result URL for each entrant;
- previewing selected challenge/submission images before upload;
- a moderated boundary: entries do not become public automatically.

Drawing Hand reuses Helping Hand infrastructure but keeps competition images as application data. They are stored through the Drawing Hand backend rather than uploaded through a participant's Micro.blog account.

## Grading

Elijah's grading scale is deliberately uneven and is product data, not a conventional school grading scale. Do not normalise or fill gaps automatically.

The app may suggest a grade for a score that falls inside a defined band, but Elijah is the judge and can override the suggestion.

## Safety boundary

Uploaded entries never become public automatically. Public visibility requires explicit approval. Drawing Hand does not need public accounts, participant passwords, email addresses, leaderboards or participant profiles.

The public form explicitly asks entrants not to include a surname, age, school or other personal details.
