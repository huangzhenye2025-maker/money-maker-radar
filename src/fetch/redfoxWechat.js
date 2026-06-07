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
 * 格式化时间为 YYYY-MM-DD
 */
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * 自动计算默认时间范围：近 7 天
 */
function getDefaultDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return { startDate: formatDate(start), endDate: formatDate(end) };
}

/**
 * 自动计算拓展时间范围：近 30 天
 */
function getExtendedDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return { startDate: formatDate(start), endDate: formatDate(end) };
}

/**
 * 统一发起 API 请求
 */
async function fetchRedfoxApi(url, payload) {
    const apiKey = process.env.REDFOX_API_KEY;
    if (!apiKey) {
        throw new Error('未配置 REDFOX_API_KEY 环境变量，请在 .env 中设置您的红狐试用 API Key。');
    }

    let lastError = null;
    const maxRetries = 2;

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
            
            // wechat-10w-hot API 返回 200，wechat-search 返回 2000
            if (data.code !== 2000 && data.code !== 200) {
                throw new Error(`API 错误: ${data.msg || data.message || '未知错误'}`);
            }

            return data;
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    throw new Error(`${lastError.message}（已尝试 ${maxRetries} 次）`);
}

/**
 * 接口1：调用接口获取公众号爆款赛道数据（微信文章搜索）
 */
async function searchHotArticle(keyword, { startDate = "", endDate = "", maxItems = 10, autoExpand = true } = {}) {
    const url = "https://redfox.hk/story/api/gzh/search/hotArticle";
    
    if (!startDate || !endDate) {
        const range = getDefaultDateRange();
        startDate = range.startDate;
        endDate = range.endDate;
    }

    const payload = {
        keyword,
        startDate,
        endDate,
        source: "公众号爆款文章洞察-Web中枢"
    };

    let data = await fetchRedfoxApi(url, payload);
    let resultData = data.data || {};
    let articles = resultData.articles || [];

    // 如果近 7 天数据太少（不足10条），且开启了自动拓展，则扩大到 30 天
    let expanded = false;
    if (articles.length < 10 && autoExpand) {
        const extRange = getExtendedDateRange();
        payload.startDate = extRange.startDate;
        payload.endDate = extRange.endDate;
        data = await fetchRedfoxApi(url, payload);
        resultData = data.data || {};
        articles = resultData.articles || [];
        expanded = true;
    }

    // 格式化输出数据
    const topItems = articles.slice(0, maxItems);
    
    // 对文章按 totalScore 或者 interactiveCount 排序？默认由接口返回顺序或这里处理。
    
    const result = topItems.map(item => {
        return {
            noteId: item.id || '',
            title: item.title || '',
            desc: item.summary || item.desc || '',
            authorNickname: item.userName || item.authorNickname || '',
            createTime: item.publicTime || item.createTime || '',
            noteLink: item.oriUrl || '',
            coverUrl: item.imageUrl || item.picUrl || item.cover || item.coverUrl || '',
            authorId: item.accountId || '',
            authorLink: item.accountId ? `https://mp.weixin.qq.com/mp/profileExt?action=home&__biz=${item.accountId}#wechat_redirect` : '',
            interactiveCount: fuzzyCount(item.interactiveCount || item.clicksCount), // 微信可能是 clicksCount 或 interactiveCount
            readCount: fuzzyCount(item.clicksCount),
            totalScore: item.totalScore || 0
        };
    });

    return {
        keyword: keyword || '',
        items: result,
        hotTopics: (resultData.hotTopics || []).slice(0, 10),
        relatedSearches: (resultData.relatedSearches || []).slice(0, 10),
        expanded,
        dateRange: `${payload.startDate} 至 ${payload.endDate}`
    };
}

/**
 * 接口2：根据分类和时间拉取 10w+ 天花板爆款数据
 */
async function getWxDataByCategoryAndTime(category = "总排名", { startDate = "", endDate = "", autoExpand = true } = {}) {
    const url = "https://redfox.hk/story/api/cozeSkill/getWxDataByCategoryAndTime";

    if (!startDate || !endDate) {
        const range = getDefaultDateRange();
        startDate = range.startDate;
        endDate = range.endDate;
    }

    const payload = {
        type: category,
        startDate,
        endDate,
        source: "公众号10w+阅读文章推荐-Web中枢"
    };

    let data = await fetchRedfoxApi(url, payload);
    let resultData = data.data || {};
    let articles = resultData.tenWReadingRank || [];

    let expanded = false;
    if (articles.length < 10 && autoExpand) {
        const extRange = getExtendedDateRange();
        payload.startDate = extRange.startDate;
        payload.endDate = extRange.endDate;
        data = await fetchRedfoxApi(url, payload);
        resultData = data.data || {};
        articles = resultData.tenWReadingRank || [];
        expanded = true;
    }

    // 按互动数降序排序
    articles.sort((a, b) => {
        return parseCount(b.interactiveCount || b.clicksCount) - parseCount(a.interactiveCount || a.clicksCount);
    });

    const result = articles.map(item => {
        return {
            noteId: item.id || '',
            title: item.title || '',
            desc: item.summary || '',
            authorNickname: item.userName || '',
            createTime: item.publicTime || '',
            noteLink: item.oriUrl || '',
            coverUrl: item.imageUrl || item.picUrl || item.cover || item.coverUrl || '',
            authorId: item.accountId || '',
            authorLink: item.accountId ? `https://mp.weixin.qq.com/mp/profileExt?action=home&__biz=${item.accountId}#wechat_redirect` : '',
            interactiveCount: fuzzyCount(item.interactiveCount || item.clicksCount),
            readCount: fuzzyCount(item.clicksCount)
        };
    });

    return {
        category,
        items: result,
        expanded,
        dateRange: `${payload.startDate} 至 ${payload.endDate}`
    };
}

module.exports = {
    searchHotArticle,
    getWxDataByCategoryAndTime
};
