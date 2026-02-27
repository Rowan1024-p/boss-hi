// popup/index.js - 纯净版控制台逻辑

// 状态变量
let isRunning = false;
let isDownloading = false;
let matchCount = 0;
let downloadCount = 0;

// 配置变量
let positions = [];
let currentPosition = null;
let keywords = []; // 当前岗位的关键词缓存
let excludeKeywords = [];
let isAndMode = false;
let enableSound = true;

// 默认设置
let matchLimit = 200;
let scrollDelayMin = 3;
let scrollDelayMax = 5;
let clickFrequency = 7;

// ==========================================
// 1. 初始化与事件监听
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 显示版本号
        const manifest = chrome.runtime.getManifest();
        document.getElementById('version').textContent = `v${manifest.version}`;

        // 隐藏/禁用原版HTML中不需要的元素 (手机号、排行榜等)
        hideUselessElements();

        // 加载历史日志
        await renderLogs();

        // 加载用户设置
        await loadSettings();

        // 绑定核心按钮事件
        bindCoreEvents();

        // 恢复运行状态 (如果关掉弹窗再打开)
        await restoreState();

        addLog('系统就绪，DeepSeek 引擎已加载', 'success');

    } catch (error) {
        console.error('初始化失败:', error);
        addLog(`初始化失败: ${error.message}`, 'error');
    }
});

function hideUselessElements() {
    // 隐藏手机号绑定、排行榜等无关区域
    // 注意：这里是尽量去隐藏，如果HTML结构没变，这些ID应该存在
    const idsToHide = ['ranking-list', 'phone-input', 'bind-phone'];
    idsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 尝试隐藏父级容器，让界面更清爽
            const parent = el.closest('.filter-group');
            if (parent) parent.style.display = 'none';
            else el.style.display = 'none';
        }
    });
}

function bindCoreEvents() {
    // 岗位相关
    document.getElementById('add-position')?.addEventListener('click', addPosition);
    document.getElementById('position-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addPosition(); }
    });

    // 关键词相关
    document.getElementById('add-keyword')?.addEventListener('click', addKeyword);
    document.getElementById('add-exclude-keyword')?.addEventListener('click', addExcludeKeyword);
    document.getElementById('keyword-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
    });

    // 模式切换
    document.getElementById('keywords-and-mode')?.addEventListener('change', (e) => {
        isAndMode = e.target.checked;
        saveSettings();
        notifySettingsUpdate(); // 实时通知后台
    });

    // 参数设置
    const inputs = ['match-limit', 'delay-min', 'delay-max', 'click-frequency'];
    inputs.forEach(id => {
        document.getElementById(id)?.addEventListener('change', saveSettings);
    });

    // 声音开关
    document.getElementById('enable-sound')?.addEventListener('change', (e) => {
        enableSound = e.target.checked;
        saveSettings();
    });

    // === 核心操作按钮 ===
    document.getElementById('scrollButton')?.addEventListener('click', startTask);
    document.getElementById('downloadButton')?.addEventListener('click', startDownloadTask);
    document.getElementById('stopButton')?.addEventListener('click', stopAllTasks);
}

// ==========================================
// 2. 核心任务逻辑
// ==========================================

// 开始打招呼/筛选任务
async function startTask() {
    if (!currentPosition) {
        addLog('⚠️ 请先选择或创建一个岗位', 'error');
        return;
    }

    if (isRunning) return;

    try {
        isRunning = true;
        matchCount = 0;
        updateUIState();
        
        // 刷新配置值
        matchLimit = parseInt(document.getElementById('match-limit').value) || 200;
        scrollDelayMin = parseInt(document.getElementById('delay-min').value) || 3;
        scrollDelayMax = parseInt(document.getElementById('delay-max').value) || 5;

        addLog(`任务启动: ${currentPosition.name}`, 'info');
        addLog(`策略: 本地快筛 + DeepSeek 深度阅卷`, 'info');

        // 发送指令给 content script
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'START_SCROLL',
                data: {
                    positionName: currentPosition.name, // 🔥🔥🔥 [唯一改动] 传递岗位名称 🔥🔥🔥
                    keywords: currentPosition.keywords,
                    excludeKeywords: currentPosition.excludeKeywords,
                    isAndMode: isAndMode,
                    matchLimit: matchLimit,
                    scrollDelayMin: scrollDelayMin,
                    scrollDelayMax: scrollDelayMax
                }
            }, response => {
                if (chrome.runtime.lastError) {
                    addLog('⚠️ 连接页面失败，请刷新 BOSS 直聘页面', 'error');
                    stopAllTasks();
                }
            });
        }
        
        saveState();

    } catch (error) {
        console.error(error);
        stopAllTasks();
    }
}

// 开始下载任务
async function startDownloadTask() {
    if (isDownloading) return;
    
    isDownloading = true;
    updateUIState();
    addLog('开始批量下载简历...', 'info');

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_DOWNLOAD' });
    }
    saveState();
}

// 停止所有任务
async function stopAllTasks() {
    isRunning = false;
    isDownloading = false;
    updateUIState();
    addLog('任务已停止', 'warning');

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_SCROLL' });
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_DOWNLOAD' });
    }
    
    saveState();
}

// ==========================================
// 3. 数据管理 (本地存储)
// ==========================================

async function loadSettings() {
    const data = await chrome.storage.local.get([
        'positions', 'currentPosition', 'isAndMode', 
        'matchLimit', 'enableSound', 'scrollDelayMin', 
        'scrollDelayMax', 'clickFrequency'
    ]);

    positions = data.positions || [];
    // 恢复之前的选中岗位
    if (data.currentPosition) {
        const found = positions.find(p => p.name === data.currentPosition);
        if (found) selectPosition(found);
    }

    // 恢复基础设置
    if (data.isAndMode !== undefined) document.getElementById('keywords-and-mode').checked = data.isAndMode;
    if (data.matchLimit) document.getElementById('match-limit').value = data.matchLimit;
    if (data.enableSound !== undefined) {
        enableSound = data.enableSound;
        document.getElementById('enable-sound').checked = enableSound;
    }
    if (data.scrollDelayMin) document.getElementById('delay-min').value = data.scrollDelayMin;
    if (data.scrollDelayMax) document.getElementById('delay-max').value = data.scrollDelayMax;
    
    renderPositions();
}

async function saveSettings() {
    // 实时保存当前状态到 currentPosition 对象
    if (currentPosition) {
        currentPosition.keywords = keywords;
        currentPosition.excludeKeywords = excludeKeywords;
        
        // 更新 positions 数组中的对应项
        const idx = positions.findIndex(p => p.name === currentPosition.name);
        if (idx !== -1) positions[idx] = currentPosition;
    }

    const settings = {
        positions,
        currentPosition: currentPosition?.name,
        isAndMode: document.getElementById('keywords-and-mode').checked,
        matchLimit: parseInt(document.getElementById('match-limit').value),
        enableSound: document.getElementById('enable-sound').checked,
        scrollDelayMin: parseInt(document.getElementById('delay-min').value),
        scrollDelayMax: parseInt(document.getElementById('delay-max').value),
        clickFrequency: parseInt(document.getElementById('click-frequency').value)
    };

    await chrome.storage.local.set(settings);
    // console.log('设置已保存 (Local)');
}

function notifySettingsUpdate() {
    // 实时通知 content script 更新规则
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0] && currentPosition) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'UPDATE_KEYWORDS',
                data: {
                    keywords: currentPosition.keywords,
                    excludeKeywords: currentPosition.excludeKeywords,
                    isAndMode: isAndMode
                }
            });
        }
    });
}

// ==========================================
// 4. 岗位与关键词逻辑
// ==========================================

function addPosition() {
    const input = document.getElementById('position-input');
    const name = input.value.trim();
    if (!name) return;

    if (positions.find(p => p.name === name)) {
        alert('岗位已存在');
        return;
    }

    const newPos = { name, keywords: [], excludeKeywords: [] };
    
    // 💡 智能预设：如果是特定岗位，自动填入建议关键词
    if (name.includes('运营')) newPos.keywords = ['亚马逊运营'];
    if (name.includes('供应链')) newPos.keywords = ['供应链'];
    if (name.includes('开发')) newPos.keywords = ['产品开发'];

    positions.push(newPos);
    renderPositions();
    selectPosition(newPos);
    saveSettings();
    input.value = '';
}

function selectPosition(pos) {
    currentPosition = pos;
    keywords = [...pos.keywords];
    excludeKeywords = [...pos.excludeKeywords];
    
    renderPositions();
    renderKeywords();
    renderExcludeKeywords();
    saveSettings(); // 保存当前选中的状态
}

function renderPositions() {
    const container = document.getElementById('position-list');
    container.innerHTML = '';
    
    positions.forEach(p => {
        const div = document.createElement('div');
        div.className = `position-tag ${currentPosition?.name === p.name ? 'active' : ''}`;
        div.innerHTML = `
            ${p.name} <button class="remove-btn">×</button>
        `;
        
        // 点击切换
        div.addEventListener('click', () => selectPosition(p));
        
        // 点击删除
        div.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`删除岗位 "${p.name}"?`)) {
                positions = positions.filter(item => item.name !== p.name);
                if (currentPosition?.name === p.name) currentPosition = null;
                renderPositions();
                saveSettings();
            }
        });
        container.appendChild(div);
    });
}

function addKeyword() {
    if (!currentPosition) return alert('请先选择岗位');
    const input = document.getElementById('keyword-input');
    const val = input.value.trim();
    if (val && !keywords.includes(val)) {
        keywords.push(val);
        input.value = '';
        renderKeywords();
        saveSettings();
        notifySettingsUpdate();
    }
}

function addExcludeKeyword() {
    if (!currentPosition) return alert('请先选择岗位');
    const input = document.getElementById('keyword-input');
    const val = input.value.trim();
    if (val && !excludeKeywords.includes(val)) {
        excludeKeywords.push(val);
        input.value = '';
        renderExcludeKeywords();
        saveSettings();
        notifySettingsUpdate();
    }
}

function renderKeywords() { renderTagList('keyword-list', keywords, (k) => {
    keywords = keywords.filter(item => item !== k);
    renderKeywords();
    saveSettings();
    notifySettingsUpdate();
});}

function renderExcludeKeywords() { renderTagList('exclude-keyword-list', excludeKeywords, (k) => {
    excludeKeywords = excludeKeywords.filter(item => item !== k);
    renderExcludeKeywords();
    saveSettings();
    notifySettingsUpdate();
});}

// 通用渲染标签函数
function renderTagList(containerId, list, removeCallback) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    list.forEach(text => {
        const div = document.createElement('div');
        div.className = 'keyword-tag';
        if (containerId.includes('exclude')) {
            div.style.borderColor = '#ff4444';
            div.style.color = '#ff4444';
            div.style.backgroundColor = '#ffe0e0';
        }
        div.innerHTML = `${text} <button>×</button>`;
        div.querySelector('button').addEventListener('click', () => removeCallback(text));
        container.appendChild(div);
    });
}

// ==========================================
// 5. 日志与状态保持
// ==========================================

async function addLog(msg, type = 'info') {
    const container = document.getElementById('log-container');
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    
    let color = '#00ff00';
    if (type === 'error') color = '#ff4444';
    if (type === 'warning') color = '#ffaa00';

    div.innerHTML = `<span style="color:#666">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    div.style.fontSize = '12px';
    div.style.marginBottom = '4px';
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // 简单持久化
    const logs = await loadStoredLogs();
    logs.push({ msg, type, time });
    if (logs.length > 50) logs.shift();
    chrome.storage.local.set({ 'app_logs': logs });
}

async function renderLogs() {
    const logs = await loadStoredLogs();
    const container = document.getElementById('log-container');
    container.innerHTML = ''; // 清空初始提示
    logs.forEach(l => {
        const div = document.createElement('div');
        let color = '#00ff00';
        if (l.type === 'error') color = '#ff4444';
        if (l.type === 'warning') color = '#ffaa00';
        div.innerHTML = `<span style="color:#666">[${l.time}]</span> <span style="color:${color}">${l.msg}</span>`;
        div.style.fontSize = '12px';
        div.style.marginBottom = '4px';
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

async function loadStoredLogs() {
    const res = await chrome.storage.local.get('app_logs');
    return res.app_logs || [];
}

function updateUIState() {
    const initBtns = document.getElementById('initialButtons');
    const stopBtns = document.getElementById('stopButtons');
    
    if (isRunning || isDownloading) {
        initBtns.classList.add('hidden');
        stopBtns.classList.remove('hidden');
    } else {
        initBtns.classList.remove('hidden');
        stopBtns.classList.add('hidden');
    }
}

async function saveState() {
    await chrome.storage.local.set({ isRunning, isDownloading });
}

async function restoreState() {
    const data = await chrome.storage.local.get(['isRunning', 'isDownloading']);
    isRunning = !!data.isRunning;
    isDownloading = !!data.isDownloading;
    updateUIState();
}

// 监听来自后台的消息 (打招呼成功等)
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'MATCH_SUCCESS') {
        matchCount++;
        addLog(`🎉 成功沟通: ${message.data.name}`, 'success');
        if (enableSound) playSound();
    }
    if (message.type === 'SCROLL_COMPLETE') {
        stopAllTasks();
        addLog('✅ 任务已完成', 'success');
        alert('任务完成！');
    }
});

function playSound() {
    const audio = new Audio(chrome.runtime.getURL('sounds/notification.mp3'));
    audio.volume = 0.5;
    audio.play().catch(() => {});
}