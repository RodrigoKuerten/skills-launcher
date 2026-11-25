# MCP server

The desktop binary doubles as a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so agents
can search the catalog and install skills. Run it with `--mcp`. No window opens, and the desktop app may stay open.

## Setup

Binary path of an installed app:

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\Skills Launcher\skills-launcher.exe` |
| macOS | `/Applications/Skills Launcher.app/Contents/MacOS/skills-launcher` |
| Linux (`.deb`) | `/usr/bin/skills-launcher` |

Claude Code (PowerShell):

```powershell
claude mcp add --scope user skills-launcher -- "$env:LOCALAPPDATA\Skills Launcher\skills-launcher.exe" --mcp
```

Clients configured with JSON (use the full path; variables are not expanded by every client):

```json
{
  "mcpServers": {
    "skills-launcher": {
      "command": "/usr/bin/skills-launcher",
      "args": ["--mcp"]
    }
  }
}
```

## Tools

| Tool | Writes | Purpose |
|---|---|---|
| `search_skills` | no | Search by text, category and agent |
| `get_skill` | no | Provenance, findings, installations and readme |
| `list_categories` | no | Category slugs |
| `list_agents` | no | Detected agents and skills folders |
| `list_installations` | no | Installed skills |
| `list_updates` | no | Installations with a newer safe version |
| `install_skill` | yes | Install the latest version into detected agents |
| `update_installation` | yes | Update one installation, with backup |

Managing sources, syncing, uninstalling and rollback stay in the desktop app. Sync sources there first: a new
installation has an empty catalog.

## Security

- High-risk, critical and quarantined versions cannot be installed. MCP has no override.
- Search omits quarantined skills. Name, author, summary and readme of blocked or high-risk skills are withheld.
  Repository URL, license, version label and finding file paths are still returned, and `list_installations` names
  what is already installed.
- Other skill text is untrusted third-party content. Scans are heuristics, so review what an agent installs.
- Any process that can start the binary can call these tools. Keep your MCP client's approval prompt enabled for
  `install_skill` and `update_installation`: an installed skill changes how an agent behaves.
- The server opens no network port.
- The UI does not live-refresh after an MCP install; reopen the page to see it.
