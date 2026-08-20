# Template Compatibility Report

- Template schema：`jaa-html-report-template-v5`；版本 1.4.0。
- Renderer 驗證 minimum version、required capabilities、render mode、security policy 與 required snapshot contract。
- Missing capability／unsupported mode／unsafe contract fail closed。
- Template 不得提供任意 JavaScript、SQL、JSONPath、外部 URL 或 plugin path。
- 同 Package 多模板離線輸出且不覆寫：PASS。
