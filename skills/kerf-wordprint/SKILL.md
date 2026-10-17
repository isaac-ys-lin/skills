---
name: kerf-wordprint
description: "Wordprint: transcribe local audio with Qwen, timestamps, and speaker labels; merge recordings when requested or relabel an existing transcript. Use for 音檔轉錄、逐字稿、說話者標記. Not for summarizing existing text, voice cloning, or downloading online videos."
compatibility: "Python 3.10+, ffmpeg, ffprobe, OpenCC, and locally available Qwen ASR/ForcedAligner plus a diarization backend. Apple Silicon uses MLX/CoreML; Windows uses PyTorch. Full pipeline verified on Apple Silicon macOS; the Windows route is documented but untested."
---

# Wordprint

Produce a source-preserving transcript with timestamps and anonymous or user-supplied speaker labels. Keep processing local; do not substitute a cloud service.

## 1. Resolve the request

- Accept local audio paths. Process separately unless the user requests merging; then preserve their listed order and record each source's offset. Never insert the real-world gap between recordings without a request.
- Use Qwen **0.6B** by default without asking. Use **1.7B** when the user asks for the large model or higher accuracy; one request covers all of its files. Do not inherit a previous request's choice.
- If the user asks for 1.7B after a 0.6B run has started, announce the switch, preserve completed work, and rerun into a new run directory via supported cancellation or after the current chunk. Deliver the 1.7B result and keep the earlier run as evidence. Never mix models; name hints alone do not restart ASR.
- Keep timestamps and speaker labels enabled for both sizes unless explicitly disabled. Missing names never block processing. Existing transcripts needing only labels, names, or timestamps do not rerun ASR.

## 2. Check the local runtime

Discover installed executables, model caches, platform, and accelerators; never copy paths from another user's machine. Read [setup.md](references/setup.md) only for missing dependencies, unfamiliar platforms, or model access requirements. Use an isolated environment outside the installed skill and repository.

Reuse installed backends. Identify the exact ASR, alignment, and diarization models in the run record. A missing requested model is a setup issue, not permission to silently switch models. Never accept model terms or share credentials on the user's behalf.

## 3. Transcribe, align, and label

1. Probe and hash originals, then decode each once to canonical mono 16 kHz PCM in a fresh task-local run directory. Derive each duration from decoded sample count; retain ffprobe duration and any difference as evidence. Feed this same PCM to ASR, alignment and diarization. If merging, concatenate PCM in the requested order and verify sample counts against the source sum; preserve originals and a playback copy. Compressed container duration is not the alignment clock.
2. Run Qwen 0.6B or 1.7B with the selected local backend and save raw structured output. Prefer the backend's own long-audio chunker. Save every chunk's completion/truncation state, including silence. Check that the beginning and end of every input are covered.
3. Align the **unchanged** ASR text using Qwen ForcedAligner. Reuse valid existing alignment when only labels change. On failure, preserve the raw transcript and report the missing stage; do not fabricate word times.
4. Run Community-1 or the already configured local diarization backend. Bound long-audio working memory (20-minute windows are a starting point, not a speaker boundary). For windowed results, compare multiple non-overlapping voice samples with the same embedding model before joining local speaker IDs. Keep uncertain matches separate; similarity is not identity proof or a calibrated probability. Never infer identity from file boundaries or force speaker count from a candidate name list.
5. Preserve raw turns, embedding-match evidence, and mapping decisions in the task directory. Normalize results using [run-format.md](references/run-format.md), then validate and render with the bundled helper. Split at reliable speaker changes, including within a sentence; retain unknown and overlapping speech instead of assigning an entire sentence to its majority speaker.

Prefer existing native commands/APIs over writing another inference pipeline. Apple Silicon: `mlx-qwen3-asr --model Qwen/Qwen3-ASR-0.6B --timestamps --output-format json ...`; `speech diarize ... --engine community1 --json` and `speech embed-speaker ... --engine coreml --json` when installed. Windows: official Qwen/PyTorch and pyannote APIs. Inspect installed help/API versions before invoking them. Place any run-specific conversion code in the task's work directory.

## 4. Apply optional names

- A roster is only `participant_candidates`. It does not identify which voice belongs to whom.
- An anchored hint (first question, quoted utterance, or timestamp) can support **「說話者 2｜可能是陳先生」**. Keep the evidence and `possible` status.
- Explicit user confirmation supports a `confirmed` name. Preserve the stable speaker ID beneath the display name. Do not infer names, jobs, gender, or identity from the sound of a voice.
- Name corrections update the mapping and render to a new output directory; do not rerun ASR or rewrite its text. Do not build a persistent cross-meeting voice database.

## 5. Validate and deliver

For the complete annotated workflow, run `python scripts/transcript.py validate RUN_JSON`, then `python scripts/transcript.py render RUN_JSON --output NEW_DIRECTORY`. Use the script's actual installed absolute path. If the user explicitly disables timestamps or diarization, deliver the backend's requested output and provenance instead; do not invent fields to force it through this full-workflow validator. OpenCC produces a Traditional Chinese reading copy; preserve the original ASR text separately. If OpenCC is unavailable, disclose this and use `--original-script` only for an explicitly requested original-script output.

Check source identity/order, duration coverage, truncation, alignment/text preservation, and speaker uncertainty separately. Structural checks do not establish transcription accuracy or true identity. Retain raw outputs and evidence needed to reproduce/relabel; remove only disposable audio copies created by this run.

Return links to the readable transcript and requested merged audio, selected model, duration, and material limitations. After a 0.6B run, mention in one line that 1.7B is available if accuracy matters. Keep the user-facing reply short. Do not automatically summarize, polish, publish, upload, or turn this transcript into meeting decisions.
