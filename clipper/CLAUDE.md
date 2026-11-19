# yt-clipper-agent

Automatically finds and cuts the best moments from any YouTube video or live stream.

## What this project does

Given a YouTube URL the agent:
1. Detects the video type (live / ended stream / regular video)
2. Downloads transcript/subtitles and chat replay (where available)
3. Analyzes the data to find the most exciting moments
4. Downloads the video and cuts clips with ffmpeg
5. Outputs ranked clips ready to post

## Requirements

Install these before running:

```bash
# macOS
brew install yt-dlp ffmpeg

# Linux
pip install yt-dlp
sudo apt install ffmpeg

# Windows (via scoop)
scoop install yt-dlp ffmpeg
```

Then install Node deps:
```bash
npm install
```

## Project layout

```
src/
  info.js        — get video metadata via yt-dlp
  transcript.js  — download + parse VTT/SRT subtitles
  chat.js        — download + parse live chat replay
  cut.js         — cut a clip from a video with ffmpeg
  clip.js        — CLI entry point
.claude/agents/
  clipper.md     — the Claude Code agent definition
clips/           — output directory (git-ignored)
```

## Running the agent

```bash
claude  # opens Claude Code
# then type:  /clip https://youtube.com/watch?v=...
```

Or via CLI:
```bash
node src/clip.js https://youtube.com/watch?v=...
```
