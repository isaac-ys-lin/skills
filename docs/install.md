# Agent 安裝指引

收到安裝 Clayprint 的請求時，由 agent 執行本流程，直到核心驗證通過或遇到具體阻礙；由 agent 操作終端機、下載與放置檔案。預設只安裝到目前專案，使用者指定其他範圍時才改變安裝位置。

## 1. 確認環境與位置

確認作業系統、目前專案根目錄、使用的 agent，以及 Git、Node、npm 是否可用。核心需求為 Node **22.7.0 以上**；版本規則以 `package.json` 的 `engines.node` 為準。Node 22.0.0 已實測無法載入 `pptxgenjs` 的 ES module，22.7.0 已通過完整測試。

| Agent | 專案內的安裝位置 |
| --- | --- |
| Codex | `.agents/skills/clayprint/` |
| Claude Code | `.claude/skills/clayprint/` |

先檢查目的地。若已是完整的 Clayprint，沿用它並重新驗證；更新版本是另一項工作。若目的地包含其他內容、失效連結或無法確認來源，保留內容並回報路徑衝突。不要直接覆寫既有 skill 或執行清理指令。

缺少或版本不足的 Node，由 agent 優先使用現有版本管理器安裝 Node 24，例如已載入 nvm 時執行 `nvm install 24`、`nvm use 24`。macOS 有 Homebrew 時可用 `brew install node`；Windows 有 winget 時可用 `winget install --id OpenJS.NodeJS.LTS --exact`。安裝後重新確認目前程序的 PATH；保留原本系統 Node，不卸載其他版本。

沒有可用套件管理器時，從 [Node.js 官方下載](https://nodejs.org/en/download)取得符合 OS／CPU 的 Node 24 binary，核對同一版官方 `SHASUMS256.txt`，解壓到使用者可寫入的工具目錄，將該版 `bin` 加入本次命令的 PATH（Windows 使用含 `node.exe` 的目錄）。由 agent 完成這些操作；工具、網路或權限受阻時回報實際錯誤及未完成步驟。

## 2. 取得完整 repo

依上一節的 agent 選好路徑，再執行對應終端機的指令。以下只適用於目的地尚未存在時；所有路徑都由 agent 換成本次專案的絕對路徑，Claude Code 將 `.agents` 換成 `.claude`。

macOS／Linux：

```sh
CLAYPRINT_PROJECT="/absolute/path/to/project"
CLAYPRINT_SKILL="$CLAYPRINT_PROJECT/.agents/skills/clayprint"
mkdir -p "$(dirname "$CLAYPRINT_SKILL")"
git clone https://github.com/kerfnotes/clayprint.git "$CLAYPRINT_SKILL"
cd "$CLAYPRINT_SKILL"
```

Windows PowerShell：

```powershell
$ClayprintProject = 'C:\absolute\path\to\project'
$ClayprintSkill = Join-Path $ClayprintProject '.agents\skills\clayprint'
New-Item -ItemType Directory -Force (Split-Path $ClayprintSkill) | Out-Null
git clone https://github.com/kerfnotes/clayprint.git $ClayprintSkill
Set-Location $ClayprintSkill
```

若缺 Git，可由 agent 下載 [main 分支 ZIP](https://github.com/kerfnotes/clayprint/archive/refs/heads/main.zip)並解壓到目的地；確認 `SKILL.md` 位於 `clayprint/` 根目錄，而不是多包一層 `clayprint-main/`。已取得完整本機副本時也可直接放入目的地。每個命令失敗就先處理原因，成功後才進下一步。

## 3. 安裝與核心驗證

在安裝後的 skill 根目錄，依序執行。沿用既有輸出目錄前，確認 `out/install-check/` 沒有使用者檔案；若有，換成另一個空的驗證目錄，並同步修改以下輸出路徑。

```sh
node -p "process.versions.node"
npm ci --engine-strict
node --test
node scripts/check-design.js
node evals/check.mjs examples/story.json evals/fixtures/example-script.md
node evals/check-report.mjs examples/report.html evals/fixtures/explain-script.md
```

`npm ci --engine-strict` 會拒絕不符合版本需求的 Node；若收到 `EBADENGINE`，回到環境檢查，選好 runtime 後重跑。其他失敗依實際錯誤處理，保留測試紀錄。套件稽核警告需回報，修復相依版本另行處理，不強制修改套件版本。

macOS／Linux 建立輸出目錄用 `mkdir -p out/install-check`；PowerShell 用 `New-Item -ItemType Directory -Force out/install-check | Out-Null`。接著執行：

```sh
node scripts/pptx.js examples/story.json out/install-check/story.pptx
node scripts/svg.js examples/rank.json out/install-check/rank.svg
node scripts/png.js out/install-check/rank.svg out/install-check/rank.png
```

核心安裝成功需同時符合：所有命令 exit code 為 0；測試有實際執行且沒有失敗；checker 回報範例為 9 頁簡報、4 節報告與 2 張圖；三個輸出檔存在且非空。檢查 PPTX 的 ZIP 內容確實有 9 個 `ppt/slides/slideN.xml`，SVG 可解析，PNG 可讀。中文字型的測試若因缺字型跳過，另列未驗項目。

## 4. 整頁預覽

核心產檔不需要 PowerPoint。整頁預覽另外需要 renderer、`pdftoppm`（Poppler）與 `ffmpeg`。先檢查已有工具，只補缺少的項目。

| 系統 | Renderer 與安裝方式 |
| --- | --- |
| macOS | 有 `/Applications/Microsoft PowerPoint.app` 時沿用 PowerPoint；其餘用 LibreOffice。Homebrew 的工具套件為 `poppler`、`ffmpeg`，renderer 為 `brew install --cask libreoffice`。 |
| Debian／Ubuntu | 使用 LibreOffice；有安裝權限時用 `apt-get install libreoffice poppler-utils ffmpeg`。 |
| Windows | 自動預覽使用 LibreOffice，單有 Windows PowerPoint 不足。用現有 winget／Scoop 查找並安裝 LibreOffice、Poppler、FFmpeg；將 `pdftoppm.exe` 與 `ffmpeg.exe` 的所在目錄加入本次命令的 PATH。 |

在可執行安裝的環境，由 agent 補齊工具後執行：

```sh
node scripts/preview.js out/install-check/story.pptx out/install-check/preview
```

確認新產生的 PDF、9 張 `page-N.png` 與 `sheet.png` 都可讀，並逐頁看圖。LibreOffice 可能替換字型，正式 PowerPoint 外觀與編輯仍分開驗收。若工具或 OS 權限阻擋預覽，核心驗證繼續完成，預覽標「受阻」並附原因；SVG／PNG 圖表不能代替整頁預覽。

## 5. 確認 agent 可使用，交付結果

從使用者專案確認 agent 能找到名稱為 `clayprint` 的 skill，並能讀取安裝位置的 `SKILL.md`、`references/layouts.md` 和 `design/tokens.json`。Codex 可明確呼叫 `$clayprint`；Claude Code 可用 `/clayprint`。`agents/openai.yaml` 是顯示與提示資料，不代替安裝路徑。

Codex 會自動偵測 skill 變更。若目前對話尚未顯示，先由 agent 直接讀取上述檔案繼續工作；可以啟動獨立驗證程序時，再確認新程序的 skill 清單。無法確認 host 已載入時，回報「檔案與產檔已驗，host 載入未驗」，不宣稱完整可用，也不為了載入而關閉使用者正在工作的對話。

交付時列出：安裝絕對路徑、來源 commit（ZIP 則列下載來源）、Node 版本、測試通過／失敗／跳過數、範例輸出路徑、預覽結果、host 載入結果與套件警告。保留必要的驗證產物與紀錄，只清理本次下載的無用暫存。

安裝位置與載入方式依 [Codex 官方文件](https://developers.openai.com/codex/skills#where-to-save-skills)及 [Claude Code 官方文件](https://code.claude.com/docs/en/skills)。
