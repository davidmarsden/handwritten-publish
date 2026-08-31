# Southall-Research destination

Markdown Hand can send a prepared `.md` file either to Micro.blog or to the private `davidmarsden/Southall-Research` newsroom repository.

## Working boundary

- **Southall-Research** is the working destination for Southall Stories drafts.
- Files are written unchanged to `drafts/<original-filename>.md` on `main`.
- Saving the same filename again updates the existing draft rather than creating a duplicate.
- Changes under `drafts/**` trigger the Southall-Research private draft-review workflow.
- **Micro.blog remains the explicit publication destination.**

Markdown Hand does not add or rewrite front matter for Southall-Research. The selected Markdown file remains the source of truth.

## Security

The public Helping Hand deployment must never expose a GitHub repository token to the browser.

The Southall-Research bridge therefore uses two separate credentials:

- `SOUTHALL_RESEARCH_GITHUB_TOKEN` — a server-side GitHub fine-grained personal access token, restricted to the single `Southall-Research` repository with **Contents: Read and write** permission. Store it only in Netlify Functions/runtime environment variables.
- `SOUTHALL_RESEARCH_WRITE_KEY` — a separate long random secret used to authorise a browser request to the private destination. This can be entered into Markdown Hand on the user's own device and is not a GitHub credential.

The server endpoint is fixed to `davidmarsden/Southall-Research`, branch `main`, and the `drafts/` directory. Client input cannot select another repository, branch or directory.

## Netlify variables

Configure both variables for the deployed Helping Hand project:

```text
SOUTHALL_RESEARCH_GITHUB_TOKEN=<fine-grained GitHub token>
SOUTHALL_RESEARCH_WRITE_KEY=<long random write key>
```

The GitHub token should be scoped as narrowly as possible:

1. Resource owner: the repository owner.
2. Repository access: **Only select repositories → Southall-Research**.
3. Repository permissions: **Contents: Read and write**.
4. No other repository permissions are required by this destination.

## Request behaviour

`POST /api/southall-research/draft`

The browser sends the write key, original `.md` filename and Markdown content. The function validates the credential and filename, checks whether `drafts/<filename>` already exists, then creates or updates that file through GitHub's Contents API.

The response returns the private GitHub file URL and whether the operation created or updated the draft.
