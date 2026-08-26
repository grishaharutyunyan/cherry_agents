#!/bin/sh
# Runs once per container start, before the worker process. Configures git/gh so the build
# (M3), retry (M4), and finalize (M5) phases can commit/push/open PRs against the bind-mounted
# game_backend/game-frontend checkouts — see README.md "Git & GitHub access (M3/M5)".
set -e

if [ -n "$GAME_BACKEND_PATH" ]; then
  git config --global --add safe.directory "$GAME_BACKEND_PATH"
fi
if [ -n "$GAME_FRONTEND_PATH" ]; then
  git config --global --add safe.directory "$GAME_FRONTEND_PATH"
fi

git config --global user.name "${GIT_AUTHOR_NAME:-cherry-agents-bot}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-cherry-agents-bot@users.noreply.github.com}"

# GH_TOKEN (read automatically by `gh`) also becomes the git push credential: rewrite SSH-style
# GitHub remotes to HTTPS, then let `gh` install itself as the HTTPS credential helper.
if [ -n "$GH_TOKEN" ]; then
  git config --global url."https://github.com/".insteadOf "git@github.com:"
  gh auth setup-git
fi

exec "$@"
