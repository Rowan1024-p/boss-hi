// content_scripts/sites/common.js
// 核心基类 - 负责通用的拟人化操作与配置管理

class BaseParser {
    constructor() {
        this.settings = null;
        this.filterSettings = null;
        
        // 高亮样式定义
        this.highlightStyles = {
            processing: 'background-color: #fff3e0 !important; outline: 2px dashed #ffa726 !important;',
            matched: 'background-color: #e8f5e9 !important; outline: 2px solid #4caf50 !important;',
            error: 'background-color: #ffebee !important; outline: 2px solid #f44336 !important;'
        };
    }

    // 加载配置 (仅从本地存储)
    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['keywords', 'isAndMode', 'excludeKeywords'], (result) => {
                this.settings = result;
                resolve(result);
            });
        });
    }

    setFilterSettings(settings) {
        this.filterSettings = settings;
    }

    // 智能等待函数 (带随机波动)
    // baseTime: 基准时间(ms), variance: 随机波动范围(ms)
    async sleep(baseTime = 1000, variance = 500) {
        const delay = baseTime + Math.random() * variance;
        // console.log(`[Wait] 随机等待 ${Math.round(delay)}ms`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // ==========================================
    // 核心技术：JS 拟人化点击引擎 (替代 Python 物理点击)
    // ==========================================
    async simulateHumanClick(element) {
        if (!element) return false;

        try {
            // 1. 滚动到视野内 (平滑滚动)
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(300, 200); // 等待滚动结束

            // 2. 获取元素坐标范围
            const rect = element.getBoundingClientRect();
            
            // 3. 计算元素内部的一个随机点击点 (防止每次都点正中心被识别)
            const x = rect.left + (rect.width * 0.2) + (Math.random() * rect.width * 0.6);
            const y = rect.top + (rect.height * 0.2) + (Math.random() * rect.height * 0.6);

            // 4. 构造标准事件对象 (模拟真实鼠标行为)
            const eventOptions = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                screenX: x + window.screenX, // 模拟屏幕坐标
                screenY: y + window.screenY
            };

            // 5. 触发完整的事件链
            // 许多现代框架(React/Vue)依赖 mousedown/mouseup 而不仅仅是 click
            element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
            await this.sleep(50, 50);
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            await this.sleep(80, 50); // 模拟按下的短暂亦暂停
            element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            await this.sleep(20, 20);
            element.dispatchEvent(new MouseEvent('click', eventOptions));

            return true;
        } catch (error) {
            console.error('[Click Error] 模拟点击失败:', error);
            return false;
        }
    }

    // 高亮元素
    highlightElement(element, type = 'processing') {
        if (element) {
            // 保存原有样式以便恢复
            if (!element.dataset.originalStyle) {
                element.dataset.originalStyle = element.style.cssText;
            }
            element.style.cssText += this.highlightStyles[type];
        }
    }

    // 清除高亮
    clearHighlight(element) {
        if (element && element.dataset.originalStyle) {
            element.style.cssText = element.dataset.originalStyle;
        } else if (element) {
            element.style.cssText = '';
        }
    }

    // 基础筛选逻辑
    filterCandidate(candidate) {
        if (!this.filterSettings) return true;

        // 1. 构造全文本
        const allText = [
            candidate.name,
            candidate.age,
            candidate.education,
            candidate.university,
            candidate.description,
            ...(candidate.extraInfo?.map(i => i.value) || [])
        ].join(' ').toLowerCase();

        // 2. 检查排除词 (优先级最高)
        if (this.filterSettings.excludeKeywords?.length) {
            const hasExclude = this.filterSettings.excludeKeywords.some(k => k && allText.includes(k.toLowerCase()));
            if (hasExclude) return false;
        }

        // 3. 检查包含词
        if (!this.filterSettings.keywords?.length) return true; // 无关键词则全选

        if (this.filterSettings.isAndMode) {
            // AND模式：必须包含所有关键词
            return this.filterSettings.keywords.every(k => k && allText.includes(k.toLowerCase()));
        } else {
            // OR模式：包含任一关键词即可
            return this.filterSettings.keywords.some(k => k && allText.includes(k.toLowerCase()));
        }
    }
}

// 导出供其他文件使用
window.BaseParser = BaseParser;