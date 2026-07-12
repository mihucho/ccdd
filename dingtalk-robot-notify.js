/**
 * 钉钉企业内部机器人通知脚本
 * 通过钉钉开放平台 API 发送消息，支持单聊和群聊
 * 与 dingtalk-notify.js（Webhook方式）不同，此模块使用企业应用机器人 API，支持双向交互
 */

require('dotenv').config();
const https = require('https');

/**
 * 钉钉企业机器人通知类
 */
class DingtalkRobotNotifier {
    /**
     * 构造函数
     * @param {Object} config - 机器人配置
     * @param {string} config.appKey - 企业内部应用的 AppKey
     * @param {string} config.appSecret - 企业内部应用的 AppSecret
     * @param {string} [config.robotCode] - 机器人编码，默认与 appKey 相同
     * @param {string[]} [config.userIds] - 单聊通知的目标用户 ID 列表
     * @param {string} [config.conversationId] - 群聊的 openConversationId
     */
    constructor(config) {
        this.appKey = config.appKey;
        this.appSecret = config.appSecret;
        this.robotCode = config.robotCode || config.appKey;
        this.userIds = config.userIds || [];
        this.conversationId = config.conversationId || '';
        this._accessToken = null;
        this._tokenExpiry = 0;
    }

    /**
     * 获取 access_token（自动缓存，2小时有效期，提前5分钟刷新）
     * @returns {Promise<string>} access_token
     */
    async getAccessToken() {
        if (this._accessToken && Date.now() < this._tokenExpiry) {
            return this._accessToken;
        }

        const payload = {
            appKey: this.appKey,
            appSecret: this.appSecret
        };

        const result = await this._request('POST', 'api.dingtalk.com', '/v1.0/oauth2/accessToken', payload);

        if (result && result.accessToken) {
            this._accessToken = result.accessToken;
            // 提前5分钟刷新，有效期7200秒
            this._tokenExpiry = Date.now() + (result.expireIn - 300) * 1000;
            console.log('✅ 钉钉 access_token 获取成功');
            return this._accessToken;
        }

        throw new Error('获取钉钉 access_token 失败: ' + JSON.stringify(result));
    }

    /**
     * 发送单聊消息（批量发送给指定用户）
     * @param {string} msgKey - 消息类型 key
     * @param {Object} msgParam - 消息参数对象
     * @param {string[]} [userIds] - 目标用户ID列表，不传则使用构造函数中的配置
     * @returns {Promise<boolean>} 发送是否成功
     */
    async sendToUsers(msgKey, msgParam, userIds = null) {
        const targetUserIds = userIds || this.userIds;
        if (!targetUserIds || targetUserIds.length === 0) {
            console.error('❌ 未指定目标用户ID');
            return false;
        }

        const accessToken = await this.getAccessToken();

        const payload = {
            robotCode: this.robotCode,
            userIds: targetUserIds,
            msgKey: msgKey,
            msgParam: JSON.stringify(msgParam)
        };

        const result = await this._request(
            'POST',
            'api.dingtalk.com',
            '/v1.0/robot/oToMessages/batchSend',
            payload,
            { 'x-acs-dingtalk-access-token': accessToken }
        );

        if (result && result.processQueryKey) {
            console.log('✅ 钉钉单聊消息发送成功');
            return true;
        }

        console.error('❌ 钉钉单聊消息发送失败:', JSON.stringify(result));
        return false;
    }

    /**
     * 发送群聊消息
     * @param {string} msgKey - 消息类型 key
     * @param {Object} msgParam - 消息参数对象
     * @param {string} [conversationId] - 群会话ID，不传则使用构造函数中的配置
     * @returns {Promise<boolean>} 发送是否成功
     */
    async sendToGroup(msgKey, msgParam, conversationId = null) {
        const targetConversationId = conversationId || this.conversationId;
        if (!targetConversationId) {
            console.error('❌ 未指定群会话ID（openConversationId）');
            return false;
        }

        const accessToken = await this.getAccessToken();

        const payload = {
            robotCode: this.robotCode,
            openConversationId: targetConversationId,
            msgKey: msgKey,
            msgParam: JSON.stringify(msgParam)
        };

        const result = await this._request(
            'POST',
            'api.dingtalk.com',
            '/v1.0/robot/groupMessages/send',
            payload,
            { 'x-acs-dingtalk-access-token': accessToken }
        );

        if (result && result.processQueryKey) {
            console.log('✅ 钉钉群聊消息发送成功');
            return true;
        }

        console.error('❌ 钉钉群聊消息发送失败:', JSON.stringify(result));
        return false;
    }

    /**
     * 发送文本消息
     * @param {string} content - 消息内容
     * @returns {Promise<boolean>}
     */
    async sendText(content) {
        return this._sendMessage('sampleText', { content });
    }

    /**
     * 发送 Markdown 消息
     * @param {string} title - 消息标题
     * @param {string} text - Markdown 格式内容
     * @returns {Promise<boolean>}
     */
    async sendMarkdown(title, text) {
        return this._sendMessage('sampleMarkdown', { title, text });
    }

    /**
     * 发送链接消息
     * @param {string} title - 消息标题
     * @param {string} text - 消息描述
     * @param {string} messageUrl - 跳转URL
     * @param {string} [picUrl] - 图片URL
     * @returns {Promise<boolean>}
     */
    async sendLink(title, text, messageUrl, picUrl = '') {
        return this._sendMessage('sampleLink', { title, text, messageUrl, picUrl });
    }

    /**
     * 发送 ActionCard 消息
     * @param {string} title - 卡片标题
     * @param {string} text - 卡片内容（支持Markdown）
     * @param {string} singleTitle - 按钮文字
     * @param {string} singleURL - 按钮跳转URL
     * @returns {Promise<boolean>}
     */
    async sendActionCard(title, text, singleTitle, singleURL) {
        return this._sendMessage('sampleActionCard', { title, text, singleTitle, singleURL });
    }

    /**
     * 统一发送消息（自动选择单聊或群聊）
     * @param {string} msgKey - 消息类型
     * @param {Object} msgParam - 消息参数
     * @returns {Promise<boolean>}
     */
    async _sendMessage(msgKey, msgParam) {
        const results = [];

        // 有配置用户ID时发送单聊
        if (this.userIds.length > 0) {
            results.push(await this.sendToUsers(msgKey, msgParam));
        }

        // 有配置群会话ID时发送群聊
        if (this.conversationId) {
            results.push(await this.sendToGroup(msgKey, msgParam));
        }

        if (results.length === 0) {
            console.error('❌ 未配置任何消息目标（userIds 或 conversationId）');
            return false;
        }

        return results.some(r => r === true);
    }

    /**
     * 发送 HTTPS 请求
     * @param {string} method - HTTP 方法
     * @param {string} hostname - 主机名
     * @param {string} path - 请求路径
     * @param {Object} payload - 请求体
     * @param {Object} [extraHeaders] - 额外请求头
     * @returns {Promise<Object>} 响应数据
     */
    _request(method, hostname, path, payload, extraHeaders = {}) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);

            const options = {
                hostname,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    ...extraHeaders
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (error) {
                        console.error('❌ 解析钉钉响应失败:', error.message);
                        resolve(null);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ 发送钉钉请求失败:', error.message);
                resolve(null);
            });

            req.write(data);
            req.end();
        });
    }
}

/**
 * 任务完成通知函数
 * @param {string} taskInfo - 任务信息
 * @param {string} projectName - 项目名称
 * @param {Object} robotConfig - 机器人配置
 */
async function notifyTaskCompletion(taskInfo = "Claude Code任务已完成", projectName = "", robotConfig = null) {
    const config = robotConfig || {
        appKey: process.env.DINGTALK_ROBOT_APP_KEY || '',
        appSecret: process.env.DINGTALK_ROBOT_APP_SECRET || '',
        robotCode: process.env.DINGTALK_ROBOT_CODE || process.env.DINGTALK_ROBOT_APP_KEY || '',
        userIds: (process.env.DINGTALK_ROBOT_USER_IDS || '').split(',').filter(id => id.trim()),
        conversationId: process.env.DINGTALK_ROBOT_CONVERSATION_ID || ''
    };

    if (!config.appKey || !config.appSecret) {
        console.log('⚠️  请先配置钉钉企业机器人');
        console.log('📝 配置方法：');
        console.log('1. 在钉钉开放平台创建企业内部应用');
        console.log('2. 在应用中开启机器人能力');
        console.log('3. 获取 AppKey 和 AppSecret');
        console.log('4. 设置环境变量 DINGTALK_ROBOT_APP_KEY 和 DINGTALK_ROBOT_APP_SECRET');
        console.log('5. 设置 DINGTALK_ROBOT_USER_IDS（单聊）或 DINGTALK_ROBOT_CONVERSATION_ID（群聊）');
        return false;
    }

    if (config.userIds.length === 0 && !config.conversationId) {
        console.log('⚠️  请至少配置一个消息目标：');
        console.log('  - DINGTALK_ROBOT_USER_IDS：发送单聊消息的目标用户ID（逗号分隔）');
        console.log('  - DINGTALK_ROBOT_CONVERSATION_ID：发送群聊消息的群会话ID');
        return false;
    }

    const notifier = new DingtalkRobotNotifier(config);

    const title = projectName ? `${projectName}: ${taskInfo}` : taskInfo;
    const time = new Date().toLocaleString('zh-CN');
    const text = `### ${title}\n\n⏰ ${time}`;

    try {
        const success = await notifier.sendMarkdown(title, text);

        if (success) {
            console.log('🎉 任务完成通知已通过钉钉机器人发送！');
        } else {
            console.log('❌ 钉钉机器人通知发送失败，请检查配置');
        }

        return success;
    } catch (error) {
        console.error('❌ 发送钉钉机器人通知时发生错误:', error.message);
        return false;
    }
}

/**
 * 获取命令行参数
 */
function getCommandLineArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
            options[key] = value;
            if (value !== true) i++;
        }
    }

    return options;
}

// 如果直接运行此脚本
if (require.main === module) {
    const options = getCommandLineArgs();
    const taskInfo = options.message || options.task || "Claude Code任务已完成";

    console.log('🚀 开始通过钉钉机器人发送通知...');
    notifyTaskCompletion(taskInfo);
}

module.exports = {
    DingtalkRobotNotifier,
    notifyTaskCompletion
};
