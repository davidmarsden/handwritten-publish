# Drawing Hand

**Draw it. Send it. Get graded.**

Drawing Hand is the drawing-competition app in the Helping Hand family. Elijah publishes a reference drawing, people remotely submit their own attempt, and Elijah judges each entry using his grading system.

The public surface is `/drawing/`.

## MVP boundary

Drawing Hand v1 will support:

- one or more drawing challenges, with one active challenge highlighted;
- a reference image and challenge title;
- public JPEG, PNG and WebP submissions without requiring an account;
- a display name only — no surname, age, school or other unnecessary personal information;
- private-by-default submissions;
- a private Judging Desk for Elijah;
- a score out of 10, suggested grade, optional judge comment and moderation state;
- an unguessable private result URL for each entrant;
- an optional moderated public gallery.

Drawing Hand should reuse the Helping Hand image-preparation primitives and established PWA patterns. Competition images are application data and must not be uploaded through a user's Micro.blog account.

## Grading

Elijah's grading scale is deliberately uneven and is product data, not a conventional school grading scale. Do not normalise or fill gaps automatically.

The app may suggest a grade for a score that falls inside a defined band, but Elijah is the judge and can override the suggestion.

## Safety boundary

Uploaded entries never become public automatically. Public gallery visibility requires explicit approval. The MVP does not need public accounts, passwords, email addresses, leaderboards or participant profiles.
