# VHS tape: raw MCP tool calls via the MCP Inspector CLI.  Run: vhs docs/demo-inspector.tape
# Requires: Node.js, `npm run build` done. The price step needs FLIGHTAPI_KEY exported (about 2 credits).

Output docs/demo-inspector.gif

Require node

Set Shell "bash"
Set FontSize 16
Set Width 1280
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type "export PS1='$ ' && alias call='npx -y @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call'" Enter
Type "clear" Enter
Show

Type "# 1. Find airport codes (offline, no credits)" Enter
Type "call --tool-name search_airports --tool-arg query=Lahore" Enter
Sleep 6s

Type "# 2. Cheapest flights (FlightAPI, cached for 30 min)" Enter
Type "call --tool-name search_flight_prices --tool-arg origin=LHE --tool-arg destination=LHR --tool-arg departure_date=2026-12-15" Enter
Sleep 15s

Type "# 3. What did that cost?" Enter
Type "call --tool-name get_usage" Enter
Sleep 6s
