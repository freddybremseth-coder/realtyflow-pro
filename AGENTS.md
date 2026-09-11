# RealtyFlow Pro — agent concurrency rules

This repository may be edited by more than one ChatGPT/Codex session at the same time. Treat `main` as a moving integration branch.

## Required Git workflow

1. Never make application/code/config changes directly on `main`.
2. Before creating a work branch, fetch/read the current `main` tip and create the branch from that exact SHA.
3. Use a dedicated branch and PR for every change.
4. Before merging, fetch/read `main` again and compare it with the PR head.
5. If `main` advanced after the branch was created, do not blindly merge. Refresh/rebase/recreate the branch from current `main`, especially if changed files overlap.
6. Require relevant CI and Vercel checks to be green before merge.
7. After merge, verify the production Vercel deployment is green before reporting the change as live.
8. If a PR is replaced by a refreshed/rebased PR, close the stale PR as superseded.

## Parallel-session safety

- Do not force-push or reset `main`.
- Do not overwrite another session's branch.
- Do not assume a PR is safe merely because GitHub says it is mergeable; verify it contains the current `main` tip.
- Respect the `Main Freshness Guard`. A stale freshness result means the PR must be refreshed before merge.
- If another PR moves `main` while your checks are running, re-check freshness before merging.

These rules are intended to prevent parallel sessions from silently dropping or reverting each other's work.
