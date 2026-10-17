# Local setup

Detect the OS/architecture and reuse working tools. Have the agent perform routine setup within its authorization; ask the human only for account/terms/credential steps it cannot complete. Install into an isolated environment, not the skill folder. Never print tokens or put them in command arguments, run JSON, or Git.

| Machine | ASR / alignment | Speakers |
| --- | --- | --- |
| Apple Silicon Mac | `mlx-qwen3-asr`, Qwen 0.6B / 1.7B and ForcedAligner 0.6B | Existing `speech` Community-1 CoreML, or pyannote |
| Windows x64 + NVIDIA | Official Qwen / Transformers with a compatible CUDA PyTorch build | pyannote Community-1, CUDA when available |
| Windows x64 CPU | Official Qwen / Transformers CPU path; test suitable dtype, expect slower runs | pyannote CPU |
| Intel Mac / Windows ARM | Check current upstream support first; neither MLX nor x64 instructions establish support | Do not claim untested compatibility |

macOS prerequisites: native ARM Python and Homebrew, `ffmpeg`/`ffprobe`, OpenCC CLI; install `mlx-qwen3-asr` in an isolated Python environment. If using `speech`, the current runtime requires macOS 15+ and native ARM Homebrew; follow its upstream README's tap/install instructions. Inspect installed versions/help before using optional features.

Windows prerequisites: Python (3.12 is a starting point), a venv, FFmpeg and OpenCC, plus mutually compatible PyTorch, Qwen/Transformers, and pyannote packages. OpenCC must provide the **CLI executable and `s2twp.json` data**; Python bindings alone do not satisfy the renderer. Verify a short conversion and pass `--opencc` with the executable path if it is absent from PATH. Use native PowerShell commands, Python paths, and argument arrays; do not require bash, `caffeinate`, `/opt/homebrew`, or WSL. TorchCodec's Windows decoding requires FFmpeg shared libraries, not just `ffmpeg.exe`. Follow the upstream torch/torchcodec version matrix. Do not require FlashAttention or vLLM for ordinary file transcription.

Use the official model card matching the installed backend: MLX uses `Qwen/Qwen3-ASR-{0.6B,1.7B}`; current native Transformers also provides `-hf` variants. Record exact model IDs/revisions, not just “Qwen”. Download only the selected ASR size plus needed aligner/diarizer. Inspect download size and available storage; model weight size is not total RAM/VRAM required. Reuse cache and run offline after setup. Missing download/access must remain a setup failure, not an empty successful transcript.

Qwen models and the MLX implementation are Apache-2.0. Community-1 is CC-BY-4.0: its official Hugging Face download requires an account, acceptance of access conditions, and an access token. This is separate from the paid pyannoteAI service, which is not required. Mac's CoreML conversion has its own upstream model card and attribution. Download from the named upstream; do not bundle weights or bypass access conditions. Never accept terms on the user's behalf.

## Verify before claiming support

Run a short local sample through decode, ASR, alignment, diarization, rendering, then offline reload. Record versions, OS/architecture, selected device and exact models. Test Unicode/spaced paths. Separate “upstream offers packages”, “install/import passed”, and “this full pipeline passed on this machine”. The bundled renderer is portable; Windows inference is not proven by Mac tests. No fixed RAM minimum or speed promise without measurement.

If the model loads but acceleration fails, report it and test the explicitly chosen supported CPU route. If a stage remains unavailable, keep completed artifacts and name the missing capability; do not upload audio or silently omit speaker/timing output.

Upstream references (consult only the applicable branch):

- [Qwen models, Transformers and alignment](https://github.com/QwenLM/Qwen3-ASR)
- [MLX installation](https://github.com/moona3k/mlx-qwen3-asr#installation)
- [Mac speech runtime](https://github.com/soniqo/speech-swift#homebrew)
- [CoreML Community-1 model and license](https://huggingface.co/aufklarer/Pyannote-Community-1-CoreML)
- [PyTorch platform selector](https://pytorch.org/get-started/locally/)
- [OpenCC command-line installation](https://github.com/BYVoid/OpenCC#installation)
- [TorchCodec compatibility](https://github.com/pytorch/torchcodec)
- [Community-1 setup and offline use](https://huggingface.co/pyannote/speaker-diarization-community-1)
