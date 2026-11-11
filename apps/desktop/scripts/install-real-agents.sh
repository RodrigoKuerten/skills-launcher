#!/usr/bin/env bash
# Installs real agent runtimes for the Linux/macOS integration smoke. CI-only:
# this intentionally downloads large desktop packages and mutates the runner home.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$HOME/.local/bin" >>"$GITHUB_PATH"
fi

npm install -g \
  @anthropic-ai/claude-code@latest \
  @openai/codex@latest \
  @google/gemini-cli@latest \
  @github/copilot@latest \
  opencode-ai@latest

curl https://cursor.com/install -fsS | bash

if [ "$(uname -s)" = "Darwin" ]; then
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 \
    brew install --cask --no-quarantine devin-desktop
else
  sudo install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/windsurf.gpg \
    | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/windsurf-stable.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/windsurf-stable.gpg] https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/apt stable main" \
    | sudo tee /etc/apt/sources.list.d/windsurf.list >/dev/null
  sudo apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y devin-desktop
fi

for command in claude codex gemini copilot opencode cursor-agent; do
  if ! path="$(command -v "$command")"; then
    echo "missing agent executable: $command" >&2
    exit 1
  fi
  echo "$command -> $path"
  "$command" --version || true
done

if command -v devin-desktop >/dev/null 2>&1; then
  echo "devin-desktop -> $(command -v devin-desktop)"
elif [ -d /Applications/Devin.app ]; then
  echo "devin-desktop app installed at /Applications/Devin.app"
elif [ -d /usr/share/devin-desktop ]; then
  echo "devin-desktop package installed at /usr/share/devin-desktop"
else
  echo "Windsurf/Devin Desktop was not installed" >&2
  exit 1
fi
