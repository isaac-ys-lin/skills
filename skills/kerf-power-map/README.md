# Power Map

Power Map 是職場權力局的軍師：從你真正想改變的結果出發，找出誰能拍板、利益與資訊卡在哪裡，比較幾條可行路徑的代價，最後落到先找誰、怎麼開口，以及對方回應後何時換路。第一次給出策略時，會同時畫出一張權力地圖。

## 它做什麼

- 先抓真目的：貢獻歸屬、能力評價、工作減量或關係修復，對應的打法完全不同；缺口會改變建議時才提問。
- 用《Power》《Getting to Yes》《獨裁者手冊》的機制分析局面，分清事實、你的單方描述與推測。
- 隨附 712 筆書中案例的自寫摘要，依情境索引挑出可比較的兩三個案例，說明相似處、關鍵差異，以及它改變了哪個選擇。
- 給出可直接複製的開場白、判讀對方回應的訊號與換路條件；要求時另存完整 Markdown 報告。

## 交給 agent 安裝

把這段交給 Codex 或 Claude Code：

```text
請把 https://github.com/kerfnotes/skills 裡的 Power Map（skills/kerf-power-map）安裝到目前專案。
先讀 skills/kerf-power-map/docs/install.md，依目前使用的 agent 選擇安裝路徑，
完成檢查後回報安裝路徑、來源 commit 及驗證結果。
```

Codex 的專案路徑是 `.agents/skills/kerf-power-map/`；Claude Code 是 `.claude/skills/kerf-power-map/`。不需要額外工具或模型。安裝完成後可直接描述你遇到的職場局面；Codex 也可用 `$kerf-power-map`，Claude Code 可用 `/kerf-power-map`。

## 已知限制

- 案例是依書中章節自行改寫的摘要，不是原文；書中沒寫的行動、結果與條件一律標為未知。要核對細節，請回到原書對應章節。
- 分析只根據你提供的資訊，看不到對方的想法與組織內情；建議裡的推測會標明，需要你實地查證。
- 這是策略思考的輔助，不是法律、人資或心理諮商意見。涉及勞動權益、申訴或健康時，請找專業人士。

授權：[MIT](LICENSE)。書籍資訊見 [sources.md](references/case-library/sources.md)。
