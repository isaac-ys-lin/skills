# 圖表選單：先決定要回答的問題

把下列 spec 放進證據頁的 `visual`；版面結構見 [layouts.md](layouts.md)。這些是輸入欄位，`core.prepare()` 產生的 `axis`、`missing`、`warnings`、`text` 等結果不用自己填。範例數字都是虛構示意；製作簡報時以文字稿為準。

## 共通欄位與輸出

- `kind`：下列圖種名稱；各圖的資料欄位必填，其他欄位除特別註明外可省略。
- `digits`：顯示小數位數，預設 `0`；原始資料仍保留精度。
- `better`：`higher` 或 `lower`，預設 `higher`；控制支援增減的圖表之增減標籤色，不改動正負號。
- `unit`、`period`、`source`：獨立 SVG 的來源列。放進簡報後，每頁來源列改讀頁面的 `sources`，請另填 `sources.source`、`sources.unit`、`sources.period`。
- 數值用 JSON 數字，缺值用 `null`，0 照常保留。缺值會自動列入證據頁來源列；文字稿沒有可畫數字時，選非圖表版型。
- 原生：`rank`、`line`、`slope`、`share`、`scatter` 是 PowerPoint 圖表，`table` 是 PowerPoint 表格。其餘為 SVG，簡報內附 PNG 後備。原生圖可加 `native: false` 改用 SVG；極小非零值若會顯示成 0，也會自動改 SVG 並警告。
- 同類別整份簡報維持同色。`share` 超過可用類別色數的類別會合併為「其他」；無 `focus` 的多系列 `line` 超出可用色數者改用灰色，但不合併資料。可用色數取 `categoryRules.maxCategorical` 與 `categorical` 長度的較小值；預設為四色。看警告與預覽再決定是否調整。

獨立圖表預覽指令（從 skill 根目錄執行）：

```sh
mkdir -p out
node scripts/svg.js examples/rank.json out/rank.svg
node scripts/png.js out/rank.svg out/rank.png
```

要預覽自己的圖，另存該頁 `visual` 為圖表 JSON，再把指令的輸入換成該檔。SVG 不包含整張投影片的排版，也不能代表 PowerPoint 原生圖已驗收。原生圖的編輯限制見 [設計差異](../docs/design-diff.md)。

## 哪個最多、差距多大？

### 排名長條 `rank`

用於同一指標的類別高低比較；預設由大到小排序，適合找出首要對象。

- 欄位：`rows: [{label, value}]`；選用 `focus`（類別名稱）、`sort: false`（保留輸入順序）。`value` 可為數字或 `null`；缺值的整列不畫，列名只列入來源缺值說明，SVG 與原生圖相同。
- 輸出：原生圖表。
- 常見錯誤：拿不同單位的數字排名；`focus` 拼字與 `label` 不一致；把缺值補成 0。負值可畫，長條仍以 0 為基準。
- 最小範例：`{"kind":"rank","rows":[{"label":"甲","value":12},{"label":"乙","value":8}],"focus":"甲"}`。完整檔：[examples/rank.json](../examples/rank.json)。

### 啞鈴 `dumbbell`

用於逐項比較前後差距，尤其是等待時間、成本等越低越好的指標。

- 欄位：`periods: [舊期名稱, 新期名稱]`（恰好兩個）、`rows: [{label, values: [舊值, 新值]}]`；選用 `xLabel`（省略時用 `unit`）、`better`、`digits`。值可為 `null`；缺一端時保留列名與有效端點，不畫連線或差額，兩端皆缺值則略去整列。
- 輸出：SVG。
- 常見錯誤：把新舊順序倒過來；下降代表改善卻沿用 `better: "higher"`；把百分比的百分點差誤寫成成長率。此圖的差額是新值減舊值，沒有 `mode` 欄位。
- 最小範例：`{"kind":"dumbbell","periods":["調整前","調整後"],"better":"lower","rows":[{"label":"甲","values":[12,8]}]}`。完整檔：[examples/dumbbell.json](../examples/dumbbell.json)。

## 隨時間怎麼變、各組是否走同一方向？

### 折線 `line`

用於連續、等距時間點的趨勢；先說明轉折或持續變化，再選一條重點線。

- 欄位：`x: [標籤, ...]`（至少兩點）、`series: [{name, values: [...]}]`；選用 `focus`（系列名稱）。每條 `values` 長度須等於 `x`，缺值用 `null`；保留該類別位置、缺點處斷線，不補成 0 或跨點連線，SVG 與原生圖相同。整條皆缺值時不畫線或線尾標籤；來源列以「系列名／類別」列明缺口。
- 輸出：原生圖表。
- 常見錯誤：把不等距日期當等距點；缺值連成完整趨勢；新增資料欄後以為末點標籤會自動移位。資料增刪或重點位置改變時，重產簡報。
- 最小範例：`{"kind":"line","x":["上期","本期"],"series":[{"name":"甲","values":[8,12]}]}`。完整檔：[examples/line.json](../examples/line.json)。

### 小倍數折線 `multiples`

用於多個對象各自的走勢比較；所有小圖共用縱軸，避免各自放大造成錯覺。

- 欄位：`x`、`series` 與 `line` 相同；各格都使用重點色，`focus` 不生效。`null` 保留類別位置並斷線；整條皆缺值仍保留該小圖的格位、系列名與座標格線，不畫資料線或末值。
- 輸出：SVG。
- 常見錯誤：各系列時間點不同；格數過多。超過六格會警告，應看圖決定分頁或精簡。
- 最小範例：`{"kind":"multiples","x":["上期","本期"],"series":[{"name":"甲","values":[8,12]},{"name":"乙","values":[10,9]}]}`。完整檔：[examples/multiples.json](../examples/multiples.json)。

### 斜率圖 `slope`

用於恰好兩期的變化方向與相對位置；中間過程不在這張圖的主張範圍。

- 欄位：`periods: [舊期名稱, 新期名稱]`（恰好兩個）、`rows: [{label, values: [舊值, 新值]}]`；選用 `digits`、`better`。值可為 `null`；缺一端只畫有效端點與數值、不連線，兩期皆缺值則略去整列，SVG 與原生圖相同。列名標在前期端點；前期缺值時，圖內不顯示列名，可由來源缺值說明核對。SVG 差額也僅在兩端皆有值時顯示。
- 輸出：原生圖表；原生版本標兩端值，省略 SVG 版本的差額文字。
- 常見錯誤：用兩端數字推論中間穩定成長；項目太多導致交叉與標籤重疊；把 `periods` 寫成共通欄位 `period`。
- 最小範例：`{"kind":"slope","periods":["上期","本期"],"rows":[{"label":"甲","values":[8,12]},{"label":"乙","values":[10,9]}]}`。完整檔：[examples/slope.json](../examples/slope.json)。

## 整體由什麼組成、增減從哪裡來？

### 百分比堆疊長條 `share`

用於比較各組的組成比例。輸入可用人數、件數或已算出的百分數，每列都會按自己的總和換算比例。

- 欄位：`categories: [類別名稱, ...]`、`rows: [{label, values: [...]}]`；每列長度與 `categories` 相同，數字非負，允許 `null`。任一類別缺值就略去整列，避免把剩餘類別誤算成完整的 100%；SVG 與原生圖相同。
- 輸出：原生圖表；原生「其他」為灰色實底，SVG 為斜線。
- 常見錯誤：用比例長條推論總量；某類缺值時仍把其餘類當成 100%。有缺值的整列會略去並列明來源缺口；全 0 的列留空並警告。類別超過設計層的可用色數會合併，不能靠新增顏色保留所有類別。
- 最小範例：`{"kind":"share","categories":["甲","乙"],"rows":[{"label":"本期","values":[30,70]}]}`。完整檔：[examples/share.json](../examples/share.json)。

### 瀑布 `bridge`

用於從期初到期末的加減拆解，解釋總數為何改變。

- 欄位：`steps: [{label, value, total?, estimate?}]`（至少兩步）；`total: true` 表示總額並重設累計，其餘是帶正負號的增減；`estimate: true` 用斜線標預估。選用 `better`、`digits`。`value: null` 會略去整個步驟及標籤，保留其餘步驟計算，但警告後續累計可能不對。
- 輸出：SVG。
- 常見錯誤：把總額當差額；把支出減少誤寫成負貢獻；期末數字與累計不合卻忽略原因。缺值會跳過該步並警告後續累計可能不對，需在來源列說明。`estimate` 只標示預估，數字仍須有來源。
- 最小範例：`{"kind":"bridge","steps":[{"label":"期初","value":10,"total":true},{"label":"增加","value":3},{"label":"期末","value":13,"total":true}]}`。完整檔：[examples/bridge.json](../examples/bridge.json)。

## 資料分布如何、集中或分散在哪裡？

### 直方圖 `histogram`

用於已分組的數值分布；適合回答大多落在哪個區間。

- 欄位：`bins: [{from, to, value}]`；`from` 為數字，`to` 為數字或 `null`（最後一組無上限），`value` 為數字或 `null`。`value: null` 保留該組位置與組界刻度，不畫長條或值標籤；`to: null` 是無上限，並非缺值。選用 `focus`（目標組的 `from` 數字，預設選最高組）、`suffix`（值標籤尾碼）、`xLabel`、`refs: [{x, label}]`。
- 輸出：SVG。
- 常見錯誤：把原始觀測陣列直接當 `bins`；把區間當字串；組界沒有接上；以不同寬度的組比較頻數。現有畫法每組等寬，應使用等距分組，無上限的末組要在來源列說明。
- 最小範例：`{"kind":"histogram","bins":[{"from":0,"to":5,"value":8},{"from":5,"to":10,"value":12}]}`。完整檔：[examples/histogram.json](../examples/histogram.json)。

### 點狀分布 `strip`

用於比較各組原始觀測與中位數，保留組內差異。

- 欄位：`groups: [{label, values: [...]}]`；選用 `focus`（組名）、`digits`。值可為 `null`；缺值點不畫，中位數只用有效數值計算，整組皆缺值則連組名一起略去。來源列記錄各組缺值筆數。
- 輸出：SVG。
- 常見錯誤：輸入平均值卻聲稱展示個別觀測；用樣本數差異很大的組做未交代的比較。重複值的點會重疊，不能靠可見點數直接數樣本。
- 最小範例：`{"kind":"strip","groups":[{"label":"甲","values":[3,5,8]},{"label":"乙","values":[4,6,9]}]}`。完整檔：[examples/strip.json](../examples/strip.json)。

### 熱度格 `heat`

用於兩個分類維度的強弱分布，例如時段與區域；找集中處或空白處。

- 欄位：`rowLabels`、`colLabels`、`values`（列數 × 欄數的長方形陣列）；選用 `legendUnit`、`digits`。有效值須非負，缺值用 `null`；該格保留空白，不畫色塊或數字，列名與欄名仍保留，整列皆缺值也不刪列。
- 輸出：SVG。
- 常見錯誤：列欄轉置；填負值；將空值塗成最低階。色階從 0 到最大值等寬分箱，階數取 `heatmap.steps` 與 `ordered` 長度的較小值（預設五階），不能把它解讀為分位數或跨圖固定門檻。
- 最小範例：`{"kind":"heat","rowLabels":["甲","乙"],"colLabels":["早","晚"],"values":[[2,5],[0,null]]}`。完整檔：[examples/heat.json](../examples/heat.json)。

## 兩個指標有何關係、該先做哪一項？

### 散佈 `scatter`

用於每個對象同時有兩個數值的關係與異常點；相關性本身不表示因果。

- 欄位：`points: [{label, x, y}]`；選用 `focus`（點名）、`xLabel`、`yLabel`、`suffix`（縱軸刻度尾碼）、`refs: [{x?, y?, label}]`。座標可為 `null`，缺任一軸的點及其標籤都略去，SVG 與原生圖相同；每條參考線選一個軸。
- 輸出：原生圖表；`refs` 在原生版省略並警告，需要參考線時設 `native: false`。SVG 顯示 `xLabel` 與縱軸數值，沒有另畫 `yLabel` 標題，可把縱軸意義放入來源單位。
- 常見錯誤：憑印象補座標；把兩個不同族群混在一起推論關係；以為 PowerPoint 的點名會跟著活頁簿改名。點名標籤要重產或手動改。
- 最小範例：`{"kind":"scatter","points":[{"label":"甲","x":3,"y":8},{"label":"乙","x":7,"y":4}],"xLabel":"工時","yLabel":"件數"}`。完整檔：[examples/scatter.json](../examples/scatter.json)。

### 2×2 矩陣 `matrix`

用於已有兩軸評估值與分類門檻的優先順序；質性提案若沒有數值評估，改用 `compare`。

- 欄位：`points: [{label, x, y}]`；選用 `xLabel`、`yLabel`、`domain: [最小值, 最大值]`（同時套用兩軸）、`split: {x, y}`（省略時各取軸範圍中點）、`quadrants: {topLeft, topRight, bottomLeft, bottomRight}`（象限文字）、`priority`（上述四個象限鍵之一）。座標可為 `null`，缺任一軸的點及其標籤都略去，不參與象限判定。
- 輸出：SVG。
- 常見錯誤：為了排出象限而發明分數；以為可以分別指定 `xDomain` 與 `yDomain`；點在分割線上時任意改原始數字。應核對來源門檻並說明歸類，警告不要求硬改資料。
- 最小範例：`{"kind":"matrix","domain":[0,10],"split":{"x":5,"y":5},"priority":"topLeft","points":[{"label":"甲","x":2,"y":8},{"label":"乙","x":8,"y":3}]}`。完整檔：[examples/matrix.json](../examples/matrix.json)。

## 流程在哪一步流失？

### 漏斗 `funnel`

用於同一批對象逐階段留下的數量，呈現主要流失點。只有步驟名稱、沒有數量的流程應改用非圖表版型。

- 欄位：`steps: [{label, value}]`（至少兩步）；選用 `focus`（步驟名稱）。數字非負，允許 `null`；缺值步驟保留列名與空位，不畫長條或數字，也不跨過缺值步驟計算轉換率。相鄰兩步都有值且前一步大於 0 時自動計算轉換率，預設強調最低轉換率的步驟。
- 輸出：SVG。
- 常見錯誤：各步驟不是同一批人或同一口徑；把每階段流失量當成留下的數量；前一步為 0 卻聲稱轉換率有意義。後一步較大會警告，先查分母與定義。
- 最小範例：`{"kind":"funnel","steps":[{"label":"送件","value":100},{"label":"完成","value":70}]}`。完整檔：[examples/funnel.json](../examples/funnel.json)。

## 需要逐格查數字或文字？

### 表格 `table`

用於精確讀值、不同單位並列，或來源只有分類文字而沒有可畫數字的情況。

- 欄位：`columns: [{name, type?, digits?, suffix?, better?}]`、`rows: [[儲存格, ...], ...]`；選用 `total: [儲存格, ...]`、`emphasis`（首欄符合此值的列強調）。每列與 `total` 格數須等於欄數。
- `type`：`text`、`number` 或 `delta`。省略時依內容推斷，明寫較容易核對；`number` 與 `delta` 儲存格須是數字或 `null`，`text` 可放文字或 `null`。任何型別的 `null` 都保留空白格，並自動以「列名／欄名」列入來源缺值說明，SVG 與原生表格相同。`delta` 只格式化已提供的差額，`total` 只顯示已提供的合計，都不代算。
- 輸出：原生 PowerPoint 表格，直接編輯儲存格，沒有圖表活頁簿。
- 常見錯誤：格數不一致；用加上千分位的字串填數值欄；以為 `total` 自動相加。純文字表格可用於無數字文字稿，但若只是比較方案，`compare` 通常更直接。
- 最小範例：`{"kind":"table","columns":[{"name":"項目","type":"text"},{"name":"件數","type":"number"}],"rows":[["甲",12],["乙",8]]}`。完整檔：[examples/table.json](../examples/table.json)。
