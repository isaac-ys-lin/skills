# Phase 3：PowerPoint 與設計稿的差異

對照 [簡報樣張](../design/claude-design/Blueprint%20Deck.dc.html)、[圖表樣張](../design/claude-design/Blueprint%20Charts.dc.html) 與 [規格 v1.1](../design/spec.md)。色彩、字級與線寬仍以 [tokens](../design/tokens.json) 為準。依 Claude 回報，PowerPoint 實際開檔與匯出檢查已完成；以下保留設計差異、修正與編輯限制，剩餘實機驗收是使用者在影片彩排時操作「編輯資料」。

## 版型與字型

| 項目 | PowerPoint 的做法與原因 |
| --- | --- |
| 證據頁兩期比較 | `examples/story.json` 第 4 頁採斜率圖，取代簡報樣張的分組長條。重寫的圖表選單不包含分組長條；兩期仍用 Ordered 舊淺、新深的標記，資料與結論不變。 |
| 字型 | 設計稿優先使用 Helvetica Neue／蘋方；PPTX 的文字、原生圖表、嵌入 SVG 及 PNG 後備統一 Microsoft JhengHei（微軟正黑體），主題的 Hant 與 major／minor 東亞字型也一致，避免中文回退為新細明體。獨立 SVG／PNG 的預設字型不變。字型檔不嵌入 PPTX，接收端仍需有正黑體。 |
| 大數字字重 | 正黑體沒有設計稿使用的 300 字重；數字格及結論大數字採 regular，其餘強調文字採 bold。 |
| 排版餘量 | 正黑體的字高與字寬不同，標題行數採可用寬度的 95% 估算，來源格的水平位移採估算字寬的 1.1 倍；來源列與內文可能較設計稿早換行。大數字依欄寬縮字，步驟、比較與收尾列高不足會警告，仍需看輸出畫面判斷。 |

## 圖表與可編輯範圍

rank、line、slope、share、scatter 使用原生圖表及內嵌活頁簿；table 使用原生 PowerPoint 表格，可直接改儲存格，沒有圖表活頁簿。其餘八種圖（multiples、bridge、histogram、strip、matrix、dumbbell、funnel、heat）維持 SVG 加 PNG 後備，圖中資料須改 spec 後重新輸出。

| 項目 | PowerPoint 的做法、原因與限制 |
| --- | --- |
| 折線線寬 | 原生 line 的所有系列統一使用 `T.stroke.otherLine`，即 1.5 px（0.75 pt）。pptxgenjs 4.0.1 無法逐系列設定線寬，故未保留 SVG 重點線 3 px／其他線 1.5 px 的區別；系列顏色仍依 model。 |
| 折線直接標值 | 不放圖例；每個系列只在輸出時最後一個有值的點標「系列名稱＋值」，focus 系列另標最高點。XML 標籤連動系列名稱與數值，但索引固定：新增資料欄後不會自動移到新尾端，最高點換位置也不會重選。這些變動需重新輸出。 |
| 斜率圖 | 每列為兩期折線，線為灰色，舊、新標記分別用 Ordered 第一階與最後一階。左端標「名稱＋值」，右端標「值」；隱藏數值軸與格線，保留兩期名稱。v1 省略設計稿的增減文字，避免改了內嵌資料後，旁邊靜態增減文字仍顯示舊值。 |
| 散佈名稱 | 逐點 `c:dLbl` 的名稱是靜態 `c:tx`，位置隨資料點移動，但名稱不連動活頁簿。修改點名須重新輸出或在 PowerPoint 手動改標籤。 |
| 散佈參考線 | 原生 scatter 的 v1 省略 `refs` 參考線與文字；有指定 `refs` 時發出警告，提示改用 `native: false` 的 SVG。圖表內部繪圖區由 PowerPoint 排版，外加圖形線段難以保證在改軸或改尺寸後仍對準。 |
| 數值軸上界 | 原生 rank、line、slope 不固定 Max，交由 PowerPoint 自動決定，讓編輯後增加的數值仍可顯示；刻度間距與下界仍取 model。share 的比例範圍固定為 0～100%。自動上界可能與 SVG 的 model 上界不同。 |
| 散佈留白與上界例外 | scatter 的 x、y 軸分別判斷：只有資料點貼到 model 邊界時，該邊向外加一個 step；沒有貼邊就不另加留白。貼上界時必須明定 Max 為原上界加一個 step，確保標記不貼框，這是自動 Max 的例外；其他情況使用自動 Max。編輯後若數值超過明定的 Max，需手動調整軸界或重新輸出。 |
| 橫條數值軸位置 | rank、share 類別反轉後，設定 `catAxisCrossesAt: 'max'`，使數值軸的 `c:crosses` 為 `max`，並用 `valAxisLabelPos: 'nextTo'` 讓刻度標籤跟隨軸線，修正軸與標籤分離的位置。 |
| 「其他」填色 | 原生 share 使用 `T.fill.other.native.color` 實色；SVG 仍用斜線。這是規格第 5、9 節明定的輸出差異。 |
| 百分比資料 | 原生 share 的活頁簿保留各類別原始值，右側另加標示「比例，自動計算」的公式欄，圖表引用比例欄，讓段內標籤顯示百分比且保留原始精度。編輯資料時應改左側原始值；公式欄由各列總和重算，不應直接覆寫。新增列或類別仍需重新輸出，才能更新公式範圍與類別配色。 |
| 預估填色 | 規格指定原生預估值用 `T.fill.estimate.native.color` 實色並加「預估」標籤，SVG 用斜線。目前具有 `estimate` 的 bridge 維持 SVG 路徑，因此仍保留預估斜線；本階段沒有新增原生預估圖。 |
| 原生表格 | 文字、對齊、顏色、強調列淡底與粗體、合計上線由 model 逐格對映；使用 `tableBody`／`tableHeader` 字級。垂直對齊改用 pptxgenjs 的 `middle`，輸出合法的 `anchor="ctr"`。PowerPoint 表格與設計稿 CSS 的欄寬、內距及換行可能不同。 |
| 極小值與強制 SVG | 非零值若在顯示精度下會成為 0，原生圖改走 SVG 並警告，以保留 `<`／`>−` 標籤；也可指定 `native: false`。這兩種情況沒有可「編輯資料」的圖表活頁簿。 |
| 標籤位置 | 原生圖表的標籤位置交由 PowerPoint 排版，無法逐像素重現 SVG 的固定偏移與避碰。刻度、數字精度、顏色取 model；軸界採上述自動上界與散佈留白規則。密集標籤仍可能需要手動調整。 |

原生圖的數值標籤使用 `showSerName`／`showVal`，並在逐點 `c:dLbl` 明定 `numFmt`，避免 PowerPoint 忽略系列層級格式；數字仍隨資料更新，不寫成靜態文字。scatter 名稱是上述例外。缺值從圖表 `numCache` 與活頁簿空儲存格移除，折線使用 `displayBlanksAs: gap`；0 則保留為觀察值。改內嵌資料只能更新 PowerPoint 的圖表，無法重新執行 Blueprint 的排序、Focus 選擇、極小值判定、缺值來源列或頁面結論；需要這些規則時應改原始 spec 後重產。

## 驗收狀態與影片彩排

依 Claude 回報，PowerPoint 開檔及匯出檢查已完成，並已修正表格 anchor、逐點數字格式及橫條數值軸位置。這是 Claude 的實機回報；本次 Codex 文件更新未操作 PowerPoint、AppleScript 或 `scripts/preview.js`。

唯一剩餘的實機驗收安排在使用者的影片彩排：在 `out/native-charts.pptx`（依序為 rank、line、slope、share、scatter、table）點「編輯資料」，修改現有數字並關閉資料視窗，確認圖形與數值標籤同步更新。share 應改左側原始值，確認右側比例公式與段內百分比更新；rank、line、slope 可提高一筆數值，確認自動上界容納新值。scatter 若有明定 Max，超過上界的修改依上述例外手動調軸或重產。線尾固定索引、scatter 靜態名稱與新增資料欄限制不列為未修錯誤。

2026-10-09 本輪自動驗證（主 Agent 回報）：`npm test` 101／101 項通過，0 項略過；CLI 產生 `out/story.pptx` 無錯誤、無警告，第 4 頁是原生 slope，其餘頁沒有證據圖表。六頁 `out/native-charts.pptx` 成功產生，唯一警告為第 5 頁「原生散佈圖省略參考線；若要保留，請設定 native: false」。兩份 PPTX 的所有 chart XML 均經 jszip 讀取並通過 `xmllint --noout`；測試另有純 Node 的 XML 結構檢查。pptxgenjs 把零寫成空工作表儲存格的行為已依 model 修補。

本輪輸出讀回：rank、line、slope 的 Max 均為自動；share 的 Max 為 1（100%）；slope 的數值軸隱藏且沒有格線。原生散佈範例的 x 軸原界為 20～60，兩端都有資料點貼界，故各外推一個 10 的 step 成為 10～70，Max 明定為 70；y 軸 Min 為 20、Max 為自動。Claude 已完成的表格 anchor 與軸位置實機檢查仍有效。

最不確定的剩餘行為是 share 公式在「編輯資料」後是否立即更新圖表；需以影片彩排確認，不以 XML 結構檢查取代。
