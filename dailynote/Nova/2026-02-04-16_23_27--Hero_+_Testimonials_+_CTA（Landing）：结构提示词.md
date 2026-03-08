[2026-02-04] - Nova
### Hero + Testimonials + CTA（Landing）：结构提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/landing.csv :: Landing 结构：Hero + Testimonials + CTA

### Hero + Testimonials + CTA：把页面当“决策路径”——Landing 结构提示词的可控生成法

**来源**：UI UX Pro Max / landing.csv

---

【哲学本质】
Landing 的本质是把用户从“好奇”带到“行动”的路径设计：每个 Section 必须回答一个决策问题。
一句话：**页面不是叙事板，是决策引导。**

【美学签名】
- 优雅之处：结构清晰、节奏有主次，CTA 像路标而不是广告
- 避开的陷阱：堆模块（看起来完整）但没有决策逻辑（用户不知道下一步）
- 美学原则：一眼能懂（主张清晰）+ 一步能做（CTA 明确）

【核心取舍】
[牺牲] 一些长篇叙事与细枝末节 [换取] 更快的理解与更高的转化概率
[质变临界]：当证明材料不具体（无来源/无数字/无细节）时，“信任结构”会变成空洞装饰

【可迁移洞察】
- 灵魂（必须保持）：Section 顺序 = 决策顺序（先价值，再证据，再行动）
- 皮相（照搬有害）：固定模块名（应随产品形态调整）
- 迁移边界：当产品是高客单/长销售周期时，结构要更偏“信任与对比”，而不是强推 CTA

【启发一句话】
> “结构的意义，是让用户不用思考就知道该相信什么、该点哪里。”

【思维模型】
【Prompt Macro（Landing: Hero + Testimonials + CTA）】
- 结构契约：1. Hero, 2. Problem statement, 3. Solution overview, 4. Testimonials carousel, 5. CTA
- CTA 位置：Hero (sticky) + Post-testimonials
- 颜色策略：Hero: Brand color. Testimonials: Light bg #F5F5F5. Quotes: Italic, muted color #666. CTA: Vibrant
- 转化锚点：Social proof before CTA. Use 3-5 testimonials. Include photo + name + role. CTA after social proof.


【邻域联动（建议一起检索）】
- style：选择承载情绪的风格（但别压过信息层级）
- typography：用层级与节奏支撑结构
- color：用 CTA 色与状态色建立行动路径

---

**证据来源**：src/ui-ux-pro-max/data/landing.csv :: Hero + Testimonials + CTA 行提供 Section/CTA/Color/Conversion 字段，可被直接编译成结构提示词
Tag: UI/UX, 前端, 落地结构, Landing, 转化设计, 信息架构, 提示词工程, landing:Hero + Testimonials + CTA, hero, testimonials, 邻域:style, 邻域:color, 邻域:typography, 叙事vs转化, 信息密度vs清晰度, keep:Section顺序, keep:CTA路径, adapt:行业证据, drop:长篇自嗨文案
