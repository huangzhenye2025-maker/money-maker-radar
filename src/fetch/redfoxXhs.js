const fs = require('fs');

/**
 * 解析数量，支持 "17w+"、"1.5w" 等格式转为数字
 */
function parseCount(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    
    let valueStr = String(value).replace(/\+/g, '').replace(/,/g, '').trim().toLowerCase();
    if (valueStr.includes('w')) {
        valueStr = valueStr.replace('w', '');
        const parsed = parseFloat(valueStr);
        return isNaN(parsed) ? 0 : Math.floor(parsed * 10000);
    }
    
    const parsed = parseFloat(valueStr);
    return isNaN(parsed) ? 0 : Math.floor(parsed);
}

/**
 * 对互动数做模糊处理：5000以下保留原始数值，5000+，1w+等
 */
function fuzzyCount(value) {
    if (value == null) return '--';
    const num = parseCount(value);
    if (num <= 0) return '--';
    if (num < 5000) return String(num);
    if (num < 10000) return '5000+';
    const wan = Math.floor(num / 10000);
    return `${wan}w+`;
}

/**
 * 提取文章列表
 */
function getTopArticles(data, maxItems = 10) {
    const articles = data.articles || [];
    return articles.slice(0, maxItems);
}

/**
 * 调用接口获取小红书热门笔记数据
 */
async function fetchXhsHotNotes(keyword, { startDate = "", endDate = "", pageNum = 1, pageSize = 50, maxItems = 10 } = {}) {
    const apiKey = process.env.REDFOX_API_KEY;
    if (!apiKey) {
        throw new Error('未配置 REDFOX_API_KEY 环境变量，请在 .env 中设置您的红狐试用 API Key。');
    }

    const url = "https://redfox.hk/story/api/xhs/search/search";
    const payload = {
        keyword,
        pageNum,
        pageSize,
        startDate,
        endDate,
        source: "小红书爆款笔记洞察-Web中枢"
    };

    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP 请求失败: 状态码 ${response.status}, ${text.substring(0, 200)}`);
            }

            const data = await response.json();
            
            if (data.code !== 2000) {
                throw new Error(`API 错误: ${data.msg || '未知错误'}`);
            }

            const resultData = data.data || {};
            
            // Format the result similar to format_as_json in Python
            const topItems = getTopArticles(resultData, maxItems);
            const isFullSite = !keyword || keyword.trim() === "";
            const latestHotItems = (resultData.latestHotArticles || []).slice(0, 10);
            
            const result = topItems.map(item => {
                const noteId = item.id || '';
                const itemData = {
                    noteId,
                    title: item.title || (item.desc ? item.desc.substring(0, 50) : ''),
                    desc: item.desc || '',
                    authorId: item.authorId || '',
                    authorNickname: item.authorNickname || '',
                    authorFans: fuzzyCount(item.authorFans),
                    createTime: item.createTime || '',
                    noteLink: item.shareInfoLink || `https://www.xiaohongshu.com/explore/${noteId}`,
                    authorLink: item.authorId ? `https://www.xiaohongshu.com/user/profile/${item.authorId}` : '',
                    interactiveCount: fuzzyCount(item.interactiveCount),
                    likedCount: fuzzyCount(item.likedCount),
                    collectedCount: fuzzyCount(item.collectedCount),
                    commentsCount: fuzzyCount(item.commentsCount),
                    sharedCount: fuzzyCount(item.sharedCount),
                };
                
                if (!isFullSite) {
                    itemData.totalScore = item.totalScore || 0;
                    itemData.relevanceScore = item.relevanceScore || 0;
                    itemData.popularityScore = item.popularityScore || 0;
                    itemData.recencyScore = item.recencyScore || 0;
                }
                return itemData;
            });

            const latestHotResult = latestHotItems.map(item => {
                const noteId = item.id || '';
                return {
                    noteId,
                    title: item.title || (item.desc ? item.desc.substring(0, 50) : ''),
                    authorNickname: item.authorNickname || '',
                    authorFans: fuzzyCount(item.authorFans),
                    createTime: item.createTime || '',
                    noteLink: item.shareInfoLink || `https://www.xiaohongshu.com/explore/${noteId}`,
                    authorLink: item.authorId ? `https://www.xiaohongshu.com/user/profile/${item.authorId}` : '',
                    interactiveCount: fuzzyCount(item.interactiveCount),
                    likedCount: fuzzyCount(item.likedCount),
                    collectedCount: fuzzyCount(item.collectedCount),
                };
            });

            return {
                keyword: resultData.keyword || keyword || '',
                total: resultData.total || 0,
                pageNum: resultData.pageNum || pageNum,
                pageSize: resultData.pageSize || pageSize,
                isFullSite,
                items: result,
                latestHotArticles: latestHotResult,
                relatedSearches: resultData.relatedSearches || []
            };

        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                // Exponential backoff wait
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    throw new Error(`${lastError.message}（已尝试 ${maxRetries} 次）`);
}

module.exports = {
    fetchXhsHotNotes
};
