# Recording the demo GIF

The README has a placeholder for a demo GIF at the top. This guide records one with
[VHS](https://github.com/charmbracelet/vhs) from a script (a `.tape` file), so the recording is reproducible.

## 1. Install VHS

```bash
# macOS
brew install vhs
# Linux (needs ttyd and ffmpeg; see the VHS README for other options)
go install github.com/charmbracelet/vhs@latest
# or with Docker
docker run --rm -v "$PWD:/vhs" ghcr.io/charmbracelet/vhs docs/demo.tape
```

## 2. Pick a tape

Two tapes are included:

| Tape                                              | Shows                                                                                                     | Needs                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`docs/demo.tape`](demo.tape)                     | Claude Code answering "What's the cheapest flight from Lahore to London on 15 December?" with this server | Claude Code signed in, a FlightAPI key (uses about 2 credits) |
| [`docs/demo-inspector.tape`](demo-inspector.tape) | Raw tool calls through the MCP Inspector CLI (airport search, then flight prices)                         | Node.js only; a FlightAPI key for the price step              |

## 3. Prepare (for `demo.tape`)

The tape hides its setup steps, but they need your key in the environment:

```bash
export FLIGHTAPI_KEY=your_key
npm run build
# Make sure the demo question has a future date: edit the "Type" line in demo.tape if needed.
```

Do a dry run of the question once, so the answer is cached and the recording is fast. Caching only lasts for the
current server process, so set `ENABLE_FILE_CACHE=true` if you want it to survive between runs.

## 4. Record

```bash
vhs docs/demo.tape            # writes docs/demo.gif
```

Then replace the placeholder at the top of the README:

```markdown
![Demo: asking Claude for the cheapest Lahore to London flight](docs/demo.gif)
```

## Tips

- Keep the GIF under about 5 MB so it loads quickly on GitHub: lower `Set Width`, `Set Framerate`, or trim `Sleep`s.
- Never record your key: the tapes pass it via the environment inside a `Hide` block. Check the first frames of
  the GIF before publishing.
- `Set TypingSpeed 40ms` reads naturally; use `Sleep` after the question so viewers can read the answer.
