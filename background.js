// background.js (V5.0 专用配套后台)

// ==========================================
// 🔑 你的 API KEY 配置区 (在此处填入)
// ==========================================
const DEEPSEEK_API_KEY = 'sk-5f959ac3d43b409a840964f65d0defc9'; // <--- 确认这里是你的真实Key
const API_URL = 'https://api.deepseek.com/chat/completions';

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // 🔍 这里的暗号必须和你发的 boss.js 一致！
    if (message.action === 'ANALYZE_CANDIDATE') {
        
        // 调用 DeepSeek API
        callDeepSeek(message.data)
            .then(result => sendResponse({ status: 'success', data: result }))
            .catch(error => sendResponse({ status: 'error', message: error.message }));
        
        return true; // 保持异步通道开启
    }

    // 简历下载日志
    if (message.type === 'RESUME_DOWNLOADED') {
        console.log('简历下载记录:', message.data);
    }
});

// DeepSeek API 调用逻辑
async function callDeepSeek(payload) {
    // 这里的参数名必须和 boss.js 发过来的一致 (systemPrompt, userContent)
    const { systemPrompt, userContent } = payload;

    if (!DEEPSEEK_API_KEY) {
        throw new Error('API Key 未配置');
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                response_format: { type: "json_object" }, 
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;
        
        // 清洗 Markdown
        content = content.replace(/```json\n?|```/g, '').trim();
        
        try {
            return JSON.parse(content);
        } catch (e) {
            console.error('JSON解析失败:', content);
            return { score: 0, reason: "AI返回格式错误", action: "REJECT" };
        }
    } catch (error) {
        console.error('DeepSeek 请求失败:', error);
        throw error;
    }
}