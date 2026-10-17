# VHS tape: Claude Code + travel-mcp-server.  Run: vhs docs/demo.tape
# Requires: Claude Code (`claude`) signed in, FLIGHTAPI_KEY exported, `npm run build` done.

Output docs/demo.gif

Require claude
Require node

Set Shell "bash"
Set FontSize 18
Set Width 1280
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Framerate 24

# --- Setup (not recorded) ---------------------------------------------------
Hide
Type "export PS1='$ ' && cd $(mktemp -d)" Enter
Type `claude mcp add --scope project --transport stdio --env FLIGHTAPI_KEY="$FLIGHTAPI_KEY" travel -- npx -y mcp-server-travel >/dev/null` Enter
Sleep 2s
Type "clear" Enter
Show

# --- Recording --------------------------------------------------------------
Type "# A travel MCP server, live flight data, your own API key" Enter
Sleep 1s
Type `claude "What's the cheapest flight from Lahore to London on 15 December?"`
Sleep 500ms
Enter

# Approve the tool calls when Claude Code asks (Enter selects "Yes").
Sleep 6s
Enter
Sleep 6s
Enter
Sleep 18s

Sleep 4s
