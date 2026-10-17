# Wordprint

Wordprint 在你自己的電腦上把錄音轉成逐字稿，附時間戳與說話者標記；音檔不上傳任何雲端服務。可以合併多段錄音、替既有逐字稿補上說話者，或在確認姓名後改標。

## 它做什麼

- 用 Qwen3-ASR 轉錄，預設小模型 0.6B；說「用大模型」就改用 1.7B。
- 用 Qwen ForcedAligner 對時間，用 Community-1 分出說話者。
- 原始辨識文字另存一份，繁體閱讀版由 OpenCC 轉換；改姓名不必重新轉錄。
- 說話者一律先以「說話者 1、2」標示。提供線索時最多標成「可能是某某」，你確認後才算定案。

## 交給 agent 安裝

把這段交給 Codex 或 Claude Code：

```text
請把 https://github.com/kerfnotes/skills 裡的 Wordprint（skills/kerf-wordprint）安裝到目前專案。
先讀 skills/kerf-wordprint/docs/install.md，依目前使用的 agent 選擇安裝路徑，
自行完成環境檢查、模型準備與短音檔驗證，回報安裝路徑、版本及驗證結果。
```

Codex 的專案路徑是 `.agents/skills/kerf-wordprint/`；Claude Code 是 `.claude/skills/kerf-wordprint/`。安裝 skill 不會下載模型；[agent 安裝指引](docs/install.md)說明怎麼準備本機工具、模型與驗證。安裝完成後可直接說「把這個音檔轉成逐字稿」；Codex 也可用 `$kerf-wordprint`，Claude Code 可用 `/kerf-wordprint`。

## 已知限制

- 完整流程只在 Apple Silicon Mac 驗證過；Windows 的安裝路線有寫，但尚未實測。
- Windows 等使用 pyannote 的路線，Community-1 官方下載需要 Hugging Face 帳號、同意使用條件並設定 token，這一步要你本人完成；Mac 的 CoreML 路線另有模型來源。
- 結構檢查只確認時間涵蓋、文字未被改動與標記一致，不代表辨識正確；重要內容仍須回聽。
- 說話者分群是模型推測，不是身分證明。

授權：[MIT](LICENSE)。模型各有授權，見 [setup.md](references/setup.md)。
