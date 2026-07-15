#!/usr/bin/env bash
# ABOUTME: Runs the markdown corpus round-trip test, defaulting BLOG_CORPUS_DIR
# ABOUTME: to inspo/blog (env-var defaulting needs a real shell, not npm).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export BLOG_CORPUS_DIR="${BLOG_CORPUS_DIR:-inspo/blog}"
echo "[test:corpus] BLOG_CORPUS_DIR=$BLOG_CORPUS_DIR"

exec npx vitest run corpus
