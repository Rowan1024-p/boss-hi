// content_scripts/sites/boss.js
// V16.8 Final Integrated - V16.4底座 + 供应链Prompt + 僵尸任务击杀锁(融合版)

// 🔥🔥🔥 [植入1] 全局黑板 (Global Variable) 🔥🔥🔥
// 这是一个全局变量，就像全班唯一的"发言权"，防止多线程乱跳
if (typeof window.GoodHR_Active_Target === 'undefined') {
    window.GoodHR_Active_Target = null;
}

// 🔥🔥🔥 [新增] 第一道防线：DOM 物理锁 (彻底根除重复注入) 🔥🔥🔥
if (document.body.getAttribute('data-goodhr-running') === 'true') {
    // 如果发现标记，说明已经有一个实例在跑了，当前这个脚本直接退出
    throw new Error("GoodHR Duplicate Instance Blocked"); 
}
// 打上标记，宣示主权
document.body.setAttribute('data-goodhr-running', 'true');


if (typeof BaseParser === 'undefined') {
    window.BaseParser = class BaseParser {
     constructor() { this.stop = false; }
     async simulateHumanClick(el) { 
      if(!el) return false;
      el.scrollIntoView({behavior:'smooth', block:'center'});
      await new Promise(r => setTimeout(r, 500));
      el.click();
      return true;
     }
     sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
     highlightElement(el, status) {
      try { el.style.border = status === 'processing' ? "3px dashed #1a73e8" : "3px solid #00c853"; } catch(e) {}
     }
    };
}

// ==========================================
// 📝 核心大脑：专家级量化 Prompt (供应链已更新)
// ==========================================

// 🔥🔥🔥 [修改1/3] 简化JSON输出,去掉matched_position字段 🔥🔥🔥
const JSON_INSTRUCTION = `
必须且只能输出合法的 JSON 字符串，格式如下：
{ 
    "score": 88, // 必须根据评分细则严格计算总分
    "reason": "评价(指出扣分点和加分点,30字内)", 
    "action": "PASS" // 只有完全合适才输出 PASS，否则一律输出 REJECT
}`;

// 🔥🔥🔥 [修改2/3] 按岗位分类的评分标准 🔥🔥🔥
const POSITION_STANDARDS = {
  "亚马逊运营主管": `
【岗位：亚马逊运营主管 (Amazon Operation Supervisor)】
总分 100 分。
1. 硬性门槛 (20分):
   - 学历: 大专及以上得 10 分; 大专以下得 0 分。
   - 语言: 英语CET-4及以上得 10 分; 无证书得 0 分。
2. 品类与价格 (40分) - [核心筛选区]:
   - 🔥 核心匹配 (35-40分): 工具、工业类、庭院(Garden)、户外(Outdoor)、五金材质产品、汽配。
   - 🟡 一般匹配 (15-20分): 只要不是核心类目，也不是黑名单类目，归为此类。
   - ☠ 黑名单 (0分+熔断): 服装、成人用品、3C (手机壳/数据线/电子产品)、美妆、箱包。
   - 💰 客单价: 熟悉 $30-$100 美金区间的优先。
3. 业绩与技能 (30分):
   - 必须是"精品"模式。
   - 有 0-1 打造爆款经验，或管理团队业绩突出 (25-30分)。
   - 只有定性描述但无数据 (10-15分)。
   - 铺货模式/无数据支撑 = 低分 (0-5分)。
4. 综合素质 (10分): 稳定性强，逻辑清晰。
【⛔ 熔断机制】
如果候选人核心经历全是"成人用品/手机壳/数据线"或"服装"，直接打分低于 50 分，并在 reason 中注明"黑名单品类"。
`,

  "供应链负责人": `
【岗位：供应链负责人 (Supply Chain Head)】
总分 100 分。
0. 🔥 [首要前置校验] - (职业轨迹强熔断):
   - **指令**：请务必检查候选人最近两份工作的【核心职责范围】。
   - **⛔ 单一职能熔断**：如果候选人的履历表现出明显的"单一职能"特征，即**只做过【仓库/仓储】**，或者**只做过【物流/货代】**，或者**只做过【单纯的采购执行】**，而缺乏对供应链整体（计划、流转、成本控制）的统筹经验，**直接判定【不合格】，Action必须为 REJECT，总分强制低于 40 分。**
   - **⛔ 运营转岗熔断**：如果最近两份工作中，有任意一份是"亚马逊运营（销售/Sales）"、"推广"、"客服"等非供应链岗位，视为职业规划不清晰，**直接 REJECT**。

1. 硬性门槛 (20分) - [一票否决]:
   - 行业背景: **必须有"跨境电商"行业经验**。如果只有"传统行业/传统外贸/内贸工厂"经验，直接 0 分 (PASS)。
   - 学历: 大专及以上得 10 分; 本科得 15 分。
2. 管理能力 (40分):
   - 制度流程: 简历体现"流程制定"、"SOP梳理"、"制度搭建"经验 (10-20分)。
   - 团队管理: 有带团队经验，体现管理动作 (10-20分)。
3. 业务能力 (30分):
   - 核心品类: 熟悉五金/家具/工具类目供应链优先 (匹配度高给 25-30，一般给 15-20)。
   - 降本增效: 有具体的采购降本数据、库存周转率优化数据。
4. 稳定性 (10分): 拒绝频繁跳槽 (半年一跳扣完，3年以上满分)。
`,

  "亚马逊产品开发主管": `
【岗位：亚马逊产品开发总监/主管】
总分 100 分。
1. 硬性门槛 (15分):
   - 学历: 本科/硕士=5; 大专=3; 大专以下=0。
   - 年限: >5年=10; 3-5年=7-9; 1-3年=3-6; <1年=0。
2. 品类匹配度 (30分):
   - 🔥 完美锚点 (26-30分): 五金、户外装置、园林工具、电动工具、工业品 (中小件、重材质)。
   - 🟡 中性锚点 (15-20分): 汽配 (小件)、家居收纳 (小件)。
   - 🛑 负面锚点 (0-10分): 大件家具、沙发、床垫、健身器材。
   - ☠ 冲突锚点 (0-5分): 服装、美妆、快消品。
3. 专业技能 (25分):
   - 重点考察对"私模、FOB成本、材质工艺"的理解。
   - 如果候选人只懂"公模拿货"或"一件代发"，此项低分。
4. 业绩结果 (20分):
   - 有具体爆款数据 (Top 10 / 日销百单) = 18-20分。
   - 只有定性描述 = 5-10分。
   - 无数据 = 0-5分。
5. 综合素质 (10分): 稳定性 > 2年得高分。
【💣 运营模式排雷】
1. 强调"超大件/高客单价($100+)"，扣 10-15 分。
2. 提及"日上架50款/泛铺"，扣 20 分。
`
};

// 🔥🔥🔥 [修改3/3] 根据岗位生成Prompt的函数 🔥🔥🔥
function generatePromptForPosition(positionName) {
  const standard = POSITION_STANDARDS[positionName];
  
  if (standard) {
    return `你是一名资深跨境电商招聘总监。请严格按照以下【评分表】评估候选人简历。

${standard}

${JSON_INSTRUCTION}`;
  } else {
    // 通用评分标准
    return `你是一名资深跨境电商招聘总监。请评估候选人是否适合【${positionName}】岗位。

评分标准 (总分100分):
1. 学历与经验 (20分): 大专以上学历,3年以上相关经验
2. 行业匹配度 (30分): 有跨境电商或相关行业经验
3. 技能与业绩 (30分): 具备岗位所需核心技能,有业绩数据支撑
4. 稳定性 (20分): 工作稳定性好,无频繁跳槽

【评分要求】
- 分数 >= 60 且各项基本达标才能 PASS
- 有明显不符合项必须 REJECT

${JSON_INSTRUCTION}`;
  }
}

class BossParser extends window.BaseParser {
    constructor() {
     super();
     this.selectors = {
      cardItem: `div[data-geek], .candidate-card-wrap, .geek-item-wrap, [role="listitem"]`.replace(/\s+/g, ' ').trim(),
      // 🔥 修正：只认 geek-name，不认 col-1，防止抓到工资
      name: '.geek-name, span.name', 
      detailContainer: `.geek-sub-job-content, .resume-content, .geek-detail-box, .boss-popup__content, .dialog-content`.replace(/\s+/g, ' ').trim(),
      detailGreetBtn: '.btn-greet, .btn-primary, .op-btns .btn, .btn-startchat',
      closeBtn: '.boss-popup__close, .dialog-close, .icon-close',
      activeStatus: '.job-status-text, .widget-online-text, .online-status'
     };
     this.localRules = { maxAge: 35, minEdu: '大专', blacklist: /(外包|兼职|暑假工|劳务)/ };
     this.lastResumeFingerprint = ""; 
     
     // 🔥🔥🔥 [新增] 用户指定的岗位名称 🔥🔥🔥
     this.userSelectedPosition = "";
     
     // 🔥🔥🔥 [保留] 内存记忆结构，防止用户重复运行冲突 🔥🔥🔥
     if (!window.GoodHR_Processed_Names) {
      window.GoodHR_Processed_Names = new Set();
     }
     this.processedNames = window.GoodHR_Processed_Names;
    }

    // 🔥🔥🔥 [新增] 接收配置的方法 🔥🔥🔥
    setFilterSettings(config) {
      if (config && config.positionName) {
        this.userSelectedPosition = config.positionName;
        console.log(`[Config] 已设置目标岗位: ${this.userSelectedPosition}`);
      }
    }

    findElements() {
     let items = document.querySelectorAll(this.selectors.cardItem);
     return Array.from(items).filter(el => {
      // 基础过滤
      if (el.innerText.length < 10 || el.offsetParent === null) return false;
      // 标签过滤 (页面未刷新时有效)
      if (el.hasAttribute('data-goodhr-done')) return false;
      return true;
     });
    }

    // ==========================================
    // 深度阅读与分析流程 (V14逻辑: 暴力重试 + 精准名字)
    // ==========================================
    async filterCandidateAsync(element) {
     // 1. 获取名字 (锁定目标 DNA)
     let name = "候选人";
     const nameEl = element.querySelector(this.selectors.name);
     if (nameEl) name = nameEl.innerText.split('\n')[0].trim();

     // 🔥🔥🔥 [植入2] 抢麦逻辑 (Set Lock) 🔥🔥🔥
     window.GoodHR_Active_Target = name; // 抢夺令牌
     console.log(`[Target Lock] 🔒 锁定目标: ${name}。旧任务全部作废！`);

     // 🔥🔥🔥 内存查重 🔥🔥🔥
     if (this.processedNames.has(name)) {
      console.log(`⏩ [Memory Skip] ${name} 已存在于内存记录中，跳过。`);
      this.markProcessed(element, name); 
      return false;
     }

     console.log(`\n------------------\n[Deep Read] 正在分析: ${name}`);

     try {
      // 2. 活跃度检查
      const activeText = element.querySelector(this.selectors.activeStatus)?.textContent || "";
      const validStatus = ['刚刚', '今日', '3日内', '在线'];
      if (activeText && !validStatus.some(s => activeText.includes(s))) {
       this.addStatusLabel(element, `❌ 不活跃: ${activeText}`, '#9e9e9e');
       this.markProcessed(element, name);
       return false;
      }

      // 3. 清理环境
      await this.closeDetailView();
      await this.sleep(300);

      // 4. 🔥 点击动作 (暴力重试版) 🔥
      const clickTarget = element.querySelector('.geek-name, .name') || element;
      await this.simulateHumanClick(clickTarget);

      // 5. 🔥 等待加载 + 自动补刀 🔥
      const detailText = await this.waitForFreshDetailWithRetry(clickTarget);

      if (!detailText) {
       console.warn(`[Deep Read] 弹窗未响应，跳过`);
       this.lastResumeFingerprint = ""; 
       this.markProcessed(element, name);
       return false;
      }

      this.lastResumeFingerprint = detailText.substring(0, 100);

      // 6. 呼叫 AI
      this.addStatusLabel(element, '🤖 正在量化算分...', '#2196f3');
      
      // 🔥🔥🔥 [关键改动] 使用用户指定的岗位,不再让AI自动识别 🔥🔥🔥
      const targetPosition = this.userSelectedPosition || "通用岗位";
      console.log(`[AI] 使用岗位JD: ${targetPosition}`);
      
      const aiResult = await this.callAI(detailText.substring(0, 15000), targetPosition);

      // 🔥🔥🔥 [植入3] 安检门 (Check Lock) 🔥🔥🔥
      // 如果黑板上写的是"王五"，但我手里拿的是"李四"的简历
      if (window.GoodHR_Active_Target !== name) {
       console.error(`[Zombie Kill] 🧟‍♂️ 僵尸任务击杀！令牌是 ${window.GoodHR_Active_Target}，但我是 ${name}。停止行动！`);
       return false; // 强制自杀，停止运行
      }

      // 7. 结果处理
      // 🔥🔥🔥 [绝对白名单] 分数>=60 且 Action==PASS 且 无黑名单 🔥🔥🔥
      const isPassingScore = aiResult.score >= 60;
      const actionNormalized = (aiResult.action || "").toUpperCase().trim();
      const isActionPass = actionNormalized === 'PASS';
      const isCleanReason = !aiResult.reason.includes('黑名单') && !aiResult.reason.includes('熔断') && !aiResult.reason.includes('单一职能');

      if (isPassingScore && isActionPass && isCleanReason) {
       const color = aiResult.score >= 80 ? '#4caf50' : '#ff9800';
       // 🔥🔥🔥 [改动] 显示目标岗位而不是AI识别的岗位 🔥🔥🔥
       this.addStatusLabel(element, `✅ [${targetPosition}] ${aiResult.score}分: ${aiResult.reason}`, color);
       
       // ✅ 方案一修改：删除这里的打招呼逻辑，只返回 true
       // 打招呼动作统一由 index.js 的 startGreetLoop 执行
       console.log(`[AI Judge] ✅ 候选人 ${name} 通过筛选 (${aiResult.score}分)，等待打招呼...`);
       
       this.markProcessed(element, name); // 🔥 处理完，记入内存
       return true; // 返回 true 表示通过筛选
       
      } else {
       let rejectReason = aiResult.reason;
       if (isPassingScore && !isActionPass) rejectReason = `(AI建议拒绝) ${rejectReason}`;
       this.addStatusLabel(element, `❌ ${rejectReason}`, '#9e9e9e');
       this.markProcessed(element, name);
       return false;
      }

     } catch (error) {
      console.error('[Deep Read Error]', error);
      this.addStatusLabel(element, '⚠ 脚本出错', '#f44336');
      this.markProcessed(element, name);
      return false;
     } finally {
      await this.closeDetailView();
      await this.sleep(500); 
     }
    }

    // 🔥 V14.0 核心函数：带重试的等待
    async waitForFreshDetailWithRetry(clickTarget) {
     let retry = 0;
     const maxRetries = 20; // 10秒总超时
     
     while (retry < maxRetries) {
      const container = document.querySelector(this.selectors.detailContainer);
      
      // 检查弹窗是否出来了
      if (container && container.innerText.length > 50 && container.offsetParent !== null) {
       const currentText = container.innerText;
       const currentFingerprint = currentText.substring(0, 100);
       
       if (currentFingerprint !== this.lastResumeFingerprint) {
        return currentText; // 成功！
       }
      }

      // 🔥 关键点：如果等了 3秒 (6次) 还没动静，再点一次！
      if (retry === 6) {
       console.log("👉 弹窗未响应，尝试【补刀点击】...");
       await this.simulateHumanClick(clickTarget);
      }

      await this.sleep(500);
      retry++;
     }
     return null; 
    }

    getFullResumeText() {
     const detailBox = document.querySelector(this.selectors.detailContainer);
     const MAX_LENGTH = 15000; 
     if (detailBox) return detailBox.innerText.replace(/\s+/g, ' ').trim().substring(0, MAX_LENGTH);
     return document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, MAX_LENGTH);
    }

    async closeDetailView() {
     const closeBtn = document.querySelector(this.selectors.closeBtn);
     if (closeBtn) {
      closeBtn.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
     }
    }

    async clickGreet(element) {
     const detailBox = document.querySelector(this.selectors.detailContainer);
     let btn = null;
     if (detailBox) btn = detailBox.querySelector('.btn-startchat, .btn-greet');
     if (!btn) btn = element.querySelector('.btn-greet, .btn-startchat');

     if (btn && !btn.disabled) {
      if (['继续', '查看', '去聊天'].some(t => btn.innerText.includes(t))) return false;

      console.log("💬 自动打招呼...");
      await this.simulateHumanClick(btn);
      await this.sleep(1000);
      
      const dialogConfirm = document.querySelector('.dialog-footer .btn-sure, .dialog-footer .btn-primary');
      if (dialogConfirm && !dialogConfirm.innerText.includes('查看')) {
       await this.simulateHumanClick(dialogConfirm);
      }
      await this.sleep(500);
      const closeIcon = document.querySelector('.greet-success-dialog .icon-close');
      if(closeIcon) closeIcon.click();
      return true;
     }
     return false;
    }

    addStatusLabel(element, text, bgColor) {
     try {
      const old = element.querySelector('.goodhr-ai-label');
      if (old) old.remove();
      let label = document.createElement('div');
      label.className = 'goodhr-ai-label';
      // 🔥🔥🔥 [写入] Z-Index 核弹：99 -> 999999，且增加防鼠标遮挡 🔥🔥🔥
      label.style.cssText = `position: absolute; top: 0; right: 0; padding: 4px 8px; font-size: 12px; color: white; border-bottom-left-radius: 8px; z-index: 999999; font-weight: bold; pointer-events: none; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`;
      label.style.backgroundColor = bgColor;
      label.textContent = text;
      
      // 确保定位正确
      if (getComputedStyle(element).position === 'static') {
       element.style.position = 'relative';
      }
      element.appendChild(label);
     } catch(e) {}
    }

    // 🔥 修改：标记处理时，同时写入 DOM 和 内存 🔥
    markProcessed(element, name) {
     element.setAttribute('data-goodhr-done', 'true');
     if (name) this.processedNames.add(name);
    }

    // 🔥🔥🔥 [改动] callAI 接收岗位参数并生成对应Prompt 🔥🔥🔥
    async callAI(text, positionName) {
     return new Promise((resolve) => {
      const systemPrompt = generatePromptForPosition(positionName);
      
      chrome.runtime.sendMessage({
       action: 'ANALYZE_CANDIDATE',
       data: { systemPrompt: systemPrompt, userContent: `候选人简历内容：\n${text}` }
      }, (response) => {
       if (!response || response.status !== 'success') {
        resolve({ score: 0, reason: "AI未响应", action: "REJECT" });
       } else {
        resolve(response.data);
       }
      });
     });
    }
}

// 🔥🔥🔥 [保留] V14原版的下载器，完全未动 🔥🔥🔥
class BossResumeDownloader extends window.BaseParser {
    constructor() {
     super();
     this.isRunning = false;
     this.selectors = { candidateItem: '[role="listitem"], .geek-item-wrap', resumeBtn: '.btn.resume-btn-file, .btn-get-resume', closeDialog: '.boss-popup__close' };
    }
    async start() {
     if (this.isRunning) return;
     this.isRunning = true;
     console.log('[Downloader] 开始下载...');
     await this.processNext();
    }
    stop() { this.isRunning = false; }
    
    async processNext() {
     if (!this.isRunning) return;
     const items = document.querySelectorAll(`${this.selectors.candidateItem}:not([data-processed="true"])`);
     if (items.length === 0) { this.stop(); return; }
     const currentItem = items[0];
     try {
      this.highlightElement(currentItem, 'processing');
      currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.simulateHumanClick(currentItem);
      await this.sleep(2000, 1000); 
      const resumeBtn = await this.waitForElement(this.selectors.resumeBtn, 3000);
      if (resumeBtn) {
       await this.simulateHumanClick(resumeBtn);
       chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOADED', data: { time: new Date().toISOString() } });
       const closeBtn = document.querySelector(this.selectors.closeDialog);
       if (closeBtn) await this.simulateHumanClick(closeBtn);
      }
      currentItem.setAttribute('data-processed', 'true');
      this.highlightElement(currentItem, 'matched');
     } catch (e) {
      console.error(e);
      currentItem.setAttribute('data-processed', 'error');
     }
     await this.sleep(3000, 2000);
     await this.processNext();
    }

    async waitForElement(selector, timeout) {
     const start = Date.now();
     while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise(r => setTimeout(r, 200));
     }
     return null;
    }
}

window.BossParser = BossParser;
window.BossResumeDownloader = BossResumeDownloader;