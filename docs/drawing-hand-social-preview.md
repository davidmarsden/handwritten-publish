# Drawing Hand social preview

The public `/drawing/` page keeps the normal branded Drawing Hand Open Graph image in its static HTML as a fallback.

On Netlify, `netlify/edge-functions/drawing-social-preview.ts` rewrites the Open Graph and Twitter metadata for `/drawing` and `/drawing/` at request time. It asks the existing `/api/drawing-challenges` endpoint for the newest open challenge and uses that challenge's picture for the large social card, with the challenge title in the social title and description.

If the challenge API is unavailable or there are no open challenges, the edge function leaves the static branded card untouched. Admin and judging/result URLs are deliberately excluded so private Drawing Hand surfaces never become social previews.
