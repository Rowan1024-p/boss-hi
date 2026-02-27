// content_scripts/index.js
// 核心入口 - 负责监听指令并调度具体的 Parser

(function () {
  console.log('[GoodHR] 核心脚本已注入');

  let currentWorker = null; // 当前正在工作的实例 (Parser 或 Downloader)

  // 检查是否在 BOSS 直聘页面
  function isBossPage() {
    return window.location.hostname.includes('zhipin.com');
  }

  // 初始化检查
  if (!isBossPage()) {
    console.log('[GoodHR] 非目标网站，脚本待机中...');
    return;
  }

  // 监听来自 Popup 的指令
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. 检查运行环境是否健康
    if (!window.BaseParser || !window.BossParser) {
      console.error('[GoodHR] 核心类未加载，请刷新页面重试');
      sendResponse({ status: 'error', message: '核心类缺失' });
      return;
    }

    console.log('[GoodHR] 收到指令:', message.action);

    (async () => {
      try {
        switch (message.action) {
          // === 自动打招呼 ===
          case 'START_SCROLL':
            if (currentWorker) currentWorker.stop = true; // 先停止之前的
            
            // 实例化打招呼机器人
            currentWorker = new window.BossParser();
            
            // 🔥🔥🔥 [唯一改动] 传递岗位名称 🔥🔥🔥
            if (message.data) {
              currentWorker.setFilterSettings({
                positionName: message.data.positionName,
                keywords: message.data.keywords,
                excludeKeywords: message.data.excludeKeywords,
                isAndMode: message.data.isAndMode,
                matchLimit: message.data.matchLimit
              });
            }
            
            sendResponse({ status: 'started' });
            // 启动循环
            await startGreetLoop(currentWorker, message.data);
            break;

          case 'STOP_SCROLL':
            if (currentWorker) {
              currentWorker.stop = true; // 设置停止标志
              currentWorker = null;
            }
            sendResponse({ status: 'stopped' });
            break;

          // === 关键词热更新 ===
          case 'UPDATE_KEYWORDS':
            if (currentWorker && currentWorker instanceof window.BossParser) {
              currentWorker.setFilterSettings(message.data);
              console.log('[GoodHR] 配置已热更新');
            }
            sendResponse({ status: 'updated' });
            break;

          // === 简历下载 ===
          case 'START_DOWNLOAD':
            if (currentWorker) currentWorker.stop();
            
            currentWorker = new window.BossResumeDownloader();
            sendResponse({ status: 'download_started' });
            await currentWorker.start();
            break;

          case 'STOP_DOWNLOAD':
            if (currentWorker && currentWorker instanceof window.BossResumeDownloader) {
              currentWorker.stop();
              currentWorker = null;
            }
            sendResponse({ status: 'stopped' });
            break;
            
          default:
            sendResponse({ status: 'unknown_action' });
        }
      } catch (error) {
        console.error('[GoodHR] 执行出错:', error);
        try {
          sendResponse({ status: 'error', message: error.message });
        } catch (e) {}
      }
    })();

    return true; // 保持异步响应通道
  });

  // === 适配 AI 的异步调度循环 (已修正并整合在主函数内部) ===
  async function startGreetLoop(parser, settings) {
    parser.stop = false;
    let matchCount = 0;
    let noNewItemsCount = 0; // 空转计数器 (防止到底后死循环)
    const matchLimit = settings.matchLimit || 200;

    console.log('[GoodHR] AI 招聘官已就位，开始阅卷...');

    while (!parser.stop) {
      try {
        // --- 第一步：寻找本页未处理的候选人 ---
        const elements = parser.findElements();
        // 过滤掉已经打过标签的 (data-processed="true")
        const newElements = elements.filter(el => !el.dataset.processed);

        // --- 第二步：如果没有新人，尝试滚动加载 ---
        if (newElements.length === 0) {
          noNewItemsCount++;
          console.log(`[System] 暂无新人，尝试滚动加载 (${noNewItemsCount}/5)...`);
          
          window.scrollBy(0, 800); 
          await parser.sleep(3000); // 给足时间加载数据

          // 如果连续 5 次滚动都没刷出新人，说明到底了
          if (noNewItemsCount >= 5) {
            alert('页面已到底或无法加载更多，任务自动结束。');
            parser.stop = true;
            chrome.runtime.sendMessage({ type: 'SCROLL_COMPLETE' });
            return;
          }
          continue; // 重新开始循环检查
        }

        // 如果找到了新人，重置空转计数器
        noNewItemsCount = 0;

        // --- 第三步：线性处理每一个候选人 ---
        for (const el of newElements) {
          if (parser.stop) break; // 允许随时通过按钮停止

          // 1. 标记为已处理 (防止重复看)
          el.dataset.processed = 'true';
          parser.highlightElement(el, 'processing');

          // 2. 核心：调用 AI 进行异步判决
          // (这个函数现在很稳，会自动处理点击详情、等待加载、分析、关闭详情)
          const isMatch = await parser.filterCandidateAsync(el);

          // 3. 根据 AI 结果决定行动
          if (isMatch) {
            // ✅ 方案一修改：AI 通过后，由 index.js 统一执行打招呼
            console.log(`[Greet Action] 准备为 AI 精选候选人打招呼...`);
            
            // 获取候选人姓名用于日志
            const nameEl = el.querySelector('.geek-name, span.name');
            const candidateName = nameEl ? nameEl.innerText.split('\n')[0].trim() : '候选人';
            
            // 🔥🔥🔥 [狙击手协议] DNA 二次验证 🔥🔥🔥
            // 由于页面可能已经滚动/刷新，需要重新定位"活体"
            console.log(`[Sniper] 准备打招呼，目标: ${candidateName}，正在进行身份校验...`);
            
            // 1. 获取当前页面所有卡片
            const freshItems = document.querySelectorAll(parser.selectors.cardItem);
            // 2. 找到名字匹配的那个"活体"
            const verifiedTarget = Array.from(freshItems).find(item => item.innerText.includes(candidateName));
            
            if (verifiedTarget) {
              console.log(`[Sniper] ✅ 身份确认无误，执行打招呼。`);
              
              // 滚动到中间，模拟人类操作
              verifiedTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await parser.sleep(1000, 500);

              // 使用 verifiedTarget (活体) 去打招呼
              const clicked = await parser.clickGreet(verifiedTarget);
              
              if (clicked) {
                parser.highlightElement(verifiedTarget, 'matched');
                matchCount++;
                
                // 更新标签显示为"已沟通"
                const currentLabel = verifiedTarget.querySelector('.goodhr-ai-label');
                if (currentLabel) {
                  currentLabel.textContent = currentLabel.textContent + ' | ✅ 已沟通';
                }
                
                // 通知 UI 更新计数
                chrome.runtime.sendMessage({
                  type: 'MATCH_SUCCESS',
                  data: { name: candidateName, clicked: true }
                });

                // 检查是否完成任务
                if (matchCount >= matchLimit) {
                  parser.stop = true;
                  alert(`🎉 任务完成！AI 已为你沟通了 ${matchCount} 位候选人。`);
                  return;
                }
                
                // 沟通后的"贤者时间" (休息久一点)
                await parser.sleep(3000, 2000);
              } else {
                console.warn(`[Sniper] ⚠️ 打招呼按钮未找到或已失效`);
              }
            } else {
              console.error(`[Sniper] ❌ 目标丢失！页面可能已刷新，找不到 ${candidateName}，跳过打招呼动作。`);
            }
            
          } else {
            // AI 没相中，移除高亮 (UI标签上已经写了淘汰原因)
            try {
              el.style.border = '';
            } catch(e) {}
          }
          
          // 处理完一个人，稍微喘口气 (拟人化间隔)
          await parser.sleep(1000, 1000);
        }

      } catch (error) {
        console.error('[Loop Error] 循环异常:', error);
        // 出错后休息一会再试，防止死循环刷报错
        await parser.sleep(5000);
      }
    }
  }

})();