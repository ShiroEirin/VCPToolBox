[2026-02-04] - Nova
### Pixel Retro（Typography）：可控字体搭配提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/typography.csv :: 字体搭配：Pixel Retro

### Pixel Retro：把“字形气质”编译成信息层级——字体搭配的可控生成法

**来源**：UI UX Pro Max / typography.csv

---

【哲学本质】
字体搭配不是“好看组合”，而是信息层级的控制器：标题定调，正文承载，二者分工清晰，产品气质才稳定。
一句话：**字体是语气，层级是语法。**

【美学签名】
- 优雅之处：标题字体负责“情绪与品牌感”，正文字体负责“高吞吐阅读”
- 避开的陷阱：标题/正文都用同一种“强个性字体” → 读起来像海报；或都用无性格字体 → 产品像通用模板
- 美学原则：pixel, retro, gaming, 8-bit, nostalgic, arcade

【核心取舍】
[牺牲] 一些“花哨字体”的自由 [换取] 长内容可读性与跨页面一致性
[质变临界]：当对比/行高/字距不被当作系统变量管理时，字体搭配再好也会被实现细节毁掉

【可迁移洞察】
- 灵魂（必须保持）：标题/正文分工 + 层级比例（H1/H2/body/caption）
- 皮相（照搬有害）：具体字号（应随信息密度与设备适配）
- 迁移边界：当内容密度极高（表格/仪表盘）时，优先选择更中性的正文体系，并把风格张力放到颜色/间距/组件形状

【启发一句话】
> “字体搭配的失败，往往不是选错字，而是没把层级当成系统变量。”

【思维模型】
【Prompt Macro（Typography: Pixel Retro）】
- 画面感：pixel, retro, gaming, 8-bit, nostalgic, arcade
- 字体契约：Heading=Press Start 2P；Body=VT323
- 技术锚点：title 48/56（或 40/48）+ tracking -0.02em；body 16/24；caption 12/16
- 闸门约束：正文优先可读性（对比、行高、字重）；标题只负责“定调”，不要抢正文注意力


【落地检查（最小闸门）】
- 适用：Pixel art games, retro websites, creative portfolios
- 字体来源：https://fonts.google.com/share?selection.family=Press+Start+2P|VT323
- CSS Import：@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
- Tailwind Config：fontFamily: { pixel: ['Press Start 2P', 'cursive'], terminal: ['VT323', 'monospace'] }
- 备注：Press Start 2P is very wide/large. VT323 is better for body text.

---

**证据来源**：src/ui-ux-pro-max/data/typography.csv :: Pixel Retro 行提供 Heading/Body、导入方式与配置建议，可被直接编译为设计系统 token
Tag: UI/UX, 前端, 排版, 字体, 字体搭配, 提示词工程, 设计系统, typography:Display + Sans, pairing:Pixel Retro, heading:Press Start 2P, body:VT323, pixel, retro, 邻域:style, 邻域:color, 邻域:landing, 表达力vs可读性, 一致性vs个性化, keep:层级比例, keep:字重尺度, adapt:品牌语气, drop:字体过多
