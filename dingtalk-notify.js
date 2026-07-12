/**
 * 钉钉机器人通知脚本
 * 通过钉钉群机器人webhook发送消息，触发手机通知
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const crypto = require('crypto');

/**
 * 钉钉webhook通知类
 */
class DingtalkNotifier {
    /**
     * 构造函数
     * @param {string} webhookUrl - 钉钉机器人的webhook地址
     * @param {string} secret - 加签密钥（可选）
     */
    constructor(webhookUrl, secret = '') {
        this.webhookUrl = webhookUrl;
        this.secret = secret;
    }

    /**
     * 生成签名
     * 钉钉安全设置中的"加签"方式需要此签名
     * @returns {{timestamp: number, sign: string}} 时间戳和签名
     */
    _generateSign() {
        const timestamp = Date.now();
        const stringToSign = `${timestamp}\n${this.secret}`;
        const hmac = crypto.createHmac('sha256', this.secret);
        hmac.update(stringToSign);
        const sign = encodeURIComponent(hmac.digest('base64'));
        return { timestamp, sign };
    }

    /**
     * 获取实际请求的webhook URL（含签名参数）
     * @returns {string} 完整的webhook URL
     */
    _getSignedUrl() {
        if (!this.secret) {
            return this.webhookUrl;
        }
        const { timestamp, sign } = this._generateSign();
        const separator = this.webhookUrl.includes('?') ? '&' : '?';
        return `${this.webhookUrl}${separator}timestamp=${timestamp}&sign=${sign}`;
    }

    /**
     * 发送文本消息到钉钉
     * @param {string} message - 消息内容
     * @returns {Promise<boolean>} 发送是否成功
     */
    async sendText(message) {
        const payload = {
            msgtype: "text",
            text: {
                content: message
            }
        };

        return this._sendPayload(payload);
    }

    /**
     * 发送Markdown消息到钉钉
     * @param {string} title - 消息标题（会话列表中的展示）
     * @param {string} text - Markdown格式的消息内容
     * @returns {Promise<boolean>} 发送是否成功
     */
    async sendMarkdown(title, text) {
        const payload = {
            msgtype: "markdown",
            markdown: {
                title: title,
                text: text
            }
        };

        return this._sendPayload(payload);
    }

    /**
     * 发送链接消息到钉钉
     * @param {string} title - 消息标题
     * @param {string} text - 消息内容
     * @param {string} messageUrl - 点击消息跳转的URL
     * @param {string} picUrl - 图片URL（可选）
     * @returns {Promise<boolean>} 发送是否成功
     */
    async sendLink(title, text, messageUrl, picUrl = '') {
        const payload = {
            msgtype: "link",
            link: {
                title: title,
                text: text,
                messageUrl: messageUrl,
                picUrl: picUrl
            }
        };

        return this._sendPayload(payload);
    }

    /**
     * 发送HTTP请求到钉钉webhook
     * @param {Object} payload - 请求载荷
     * @returns {Promise<boolean>} 发送是否成功
     */
    _sendPayload(payload) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const requestUrl = this._getSignedUrl();
            const url = new URL(requestUrl);

            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const protocol = url.protocol === 'https:' ? https : http;

            const req = protocol.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        if (result.errcode === 0) {
                            console.log('✅ 钉钉通知发送成功');
                            resolve(true);
                        } else {
                            console.error('❌ 钉钉通知发送失败:', result.errmsg);
                            resolve(false);
                        }
                    } catch (error) {
                        console.error('❌ 解析钉钉响应失败:', error.message);
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ 发送钉钉请求失败:', error.message);
                resolve(false);
            });

            req.write(data);
            req.end();
        });
    }
}

/**
 * 任务完成通知函数
 * @param {string} taskInfo - 任务信息
 * @param {string} webhookUrl - 钉钉webhook地址
 * @param {string} projectName - 项目名称
 * @param {string} secret - 加签密钥
 */
async function notifyTaskCompletion(taskInfo = "Claude Code任务已完成", webhookUrl = null, projectName = "", secret = null) {
    const DINGTALK_WEBHOOK_URL = webhookUrl ||
                                 process.env.DINGTALK_WEBHOOK_URL ||
                                 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_ACCESS_TOKEN_HERE';

    if (!DINGTALK_WEBHOOK_URL || DINGTALK_WEBHOOK_URL.includes('YOUR_ACCESS_TOKEN_HERE')) {
        console.log('⚠️  请先配置钉钉webhook地址');
        console.log('📝 配置方法：');
        console.log('1. 在钉钉中创建群组');
        console.log('2. 添加自定义机器人（选择"自定义"类型）');
        console.log('3. 安全设置中选择"加签"或"自定义关键词"');
        console.log('4. 复制webhook地址');
        console.log('5. 设置环境变量 DINGTALK_WEBHOOK_URL（必填）和 DINGTALK_SECRET（加签时必填）');
        return false;
    }

    const DINGTALK_SECRET = secret || process.env.DINGTALK_SECRET || '';
    const notifier = new DingtalkNotifier(DINGTALK_WEBHOOK_URL, DINGTALK_SECRET);

    const title = projectName ? `${projectName}: ${taskInfo}` : taskInfo;
    const time = new Date().toLocaleString('zh-CN');
    const text = `### ${title}\n\n⏰ ${time}`;

    try {
        const success = await notifier.sendMarkdown(title, text);

        if (success) {
            console.log('🎉 任务完成通知已发送到钉钉！');
        } else {
            console.log('❌ 钉钉通知发送失败，请检查webhook配置');
        }

        return success;
    } catch (error) {
        console.error('❌ 发送钉钉通知时发生错误:', error.message);
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
    const webhookUrl = options.webhook || null;

    console.log('🚀 开始发送钉钉通知...');
    notifyTaskCompletion(taskInfo, webhookUrl);
}

module.exports = {
    DingtalkNotifier,
    notifyTaskCompletion
};
