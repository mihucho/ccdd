/**
 * 一键配置向导
 * 帮助用户快速配置通知渠道（飞书、钉钉等）
 */

require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * 询问用户输入
 */
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

/**
 * 配置飞书通知
 * @returns {Promise<{enabled: boolean, webhook_url: string}|null>}
 */
async function setupFeishu() {
    const setupFeishu = await question('❓ 是否需要配置飞书通知？(y/n): ');

    if (setupFeishu.toLowerCase() !== 'y' && setupFeishu.toLowerCase() !== 'yes') {
        console.log('ℹ️  跳过飞书配置。');
        return null;
    }

    console.log('');
    console.log('📱 飞书Webhook配置步骤：');
    console.log('1. 📲 在飞书中创建一个群组（可以只包含你自己）');
    console.log('2. ⚙️  进入群组设置 > 群机器人 > 添加机器人');
    console.log('3. 🤖 选择"自定义机器人"并点击"添加"');
    console.log('4. 📝 设置机器人名称（如：Claude Code助手）');
    console.log('5. 🔗 复制生成的Webhook地址');
    console.log('');

    await question('✅ 按回车键继续，当您已获得webhook地址...');

    const webhookUrl = await question('🔗 请粘贴您的飞书webhook地址: ');

    if (!webhookUrl || !webhookUrl.startsWith('https://open.feishu.cn')) {
        console.log('❌ 无效的webhook地址！请确保地址以 https://open.feishu.cn 开头');
        return null;
    }

    // 测试飞书通知
    console.log('🧪 测试飞书通知...');
    const { notifyTaskCompletion } = require('./feishu-notify');
    const success = await notifyTaskCompletion('配置向导测试消息', webhookUrl);

    if (success) {
        console.log('🎉 飞书通知测试成功！');
        console.log('📱 您的飞书应该已收到测试消息');
    } else {
        console.log('❌ 飞书通知测试失败，请检查webhook地址和网络连接');
    }
    console.log('');

    return { enabled: true, webhook_url: webhookUrl };
}

/**
 * 配置钉钉通知
 * @returns {Promise<{enabled: boolean, webhook_url: string, secret: string}|null>}
 */
async function setupDingtalk() {
    const setupDing = await question('❓ 是否需要配置钉钉通知？(y/n): ');

    if (setupDing.toLowerCase() !== 'y' && setupDing.toLowerCase() !== 'yes') {
        console.log('ℹ️  跳过钉钉配置。');
        return null;
    }

    console.log('');
    console.log('🔔 钉钉机器人配置步骤：');
    console.log('1. 📲 在钉钉中创建一个群组（可以只包含你自己）');
    console.log('2. ⚙️  群设置 > 智能群助手 > 添加机器人');
    console.log('3. 🤖 选择"自定义（通过Webhook接入）"');
    console.log('4. 📝 设置机器人名称（如：Claude Code助手）');
    console.log('5. 🔒 安全设置推荐选择"加签"，复制密钥');
    console.log('6. 🔗 复制生成的Webhook地址');
    console.log('');

    await question('✅ 按回车键继续，当您已获得webhook地址...');

    const webhookUrl = await question('🔗 请粘贴您的钉钉webhook地址: ');

    if (!webhookUrl || !webhookUrl.includes('oapi.dingtalk.com')) {
        console.log('❌ 无效的webhook地址！请确保地址包含 oapi.dingtalk.com');
        return null;
    }

    const secret = await question('🔒 请粘贴加签密钥（未使用加签则直接回车跳过）: ');

    // 测试钉钉通知
    console.log('🧪 测试钉钉通知...');
    const { notifyTaskCompletion } = require('./dingtalk-notify');
    const success = await notifyTaskCompletion('配置向导测试消息', webhookUrl, '', secret || '');

    if (success) {
        console.log('🎉 钉钉通知测试成功！');
        console.log('🔔 您的钉钉应该已收到测试消息');
    } else {
        console.log('❌ 钉钉通知测试失败，请检查webhook地址、密钥和网络连接');
    }
    console.log('');

    return { enabled: true, webhook_url: webhookUrl, secret: secret || '' };
}

/**
 * 配置向导主函数
 */
async function setupWizard() {
    console.log('🚀 Claude Code 任务完成提醒系统 - 配置向导');
    console.log('=' .repeat(50));
    console.log('');

    console.log('📋 这个向导将帮助您配置通知渠道，让Claude Code完成任务时能够及时提醒您。');
    console.log('');

    try {
        // 配置各渠道
        const feishuConfig = await setupFeishu();
        const dingtalkConfig = await setupDingtalk();

        if (!feishuConfig && !dingtalkConfig) {
            console.log('ℹ️  未配置任何通知渠道，您将只使用声音提醒。');
            console.log('🔧 稍后可以通过编辑 .env 文件来启用通知。');
            rl.close();
            return;
        }

        console.log('⏳ 正在保存配置...');

        // 读取现有配置
        const configPath = path.join(__dirname, 'config.json');
        let config;

        try {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            console.log('📝 创建新的配置文件...');
            config = {
                notification: {
                    type: 'feishu',
                    feishu: { enabled: false, webhook_url: '' },
                    dingtalk: { enabled: false, webhook_url: '', secret: '' },
                    sound: { enabled: true, backup: true }
                },
                app: {
                    name: 'Claude Code 任务完成提醒',
                    version: '1.2.0',
                    description: '支持飞书、钉钉、Telegram等多渠道的任务完成提醒系统'
                }
            };
        }

        // 更新飞书配置
        if (feishuConfig) {
            config.notification.feishu = feishuConfig;
        }

        // 更新钉钉配置
        if (!config.notification.dingtalk) {
            config.notification.dingtalk = { enabled: false, webhook_url: '', secret: '' };
        }
        if (dingtalkConfig) {
            config.notification.dingtalk = dingtalkConfig;
        }

        // 保存配置文件
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

        // 创建.env文件
        const envPath = path.join(__dirname, '.env');
        let envContent = '# 通知配置\nNOTIFICATION_ENABLED=true\nSOUND_ENABLED=true\n';

        if (feishuConfig) {
            envContent += `\n# 飞书Webhook配置\nFEISHU_WEBHOOK_URL=${feishuConfig.webhook_url}\n`;
        }

        if (dingtalkConfig) {
            envContent += `\n# 钉钉机器人配置\nDINGTALK_WEBHOOK_URL=${dingtalkConfig.webhook_url}\n`;
            if (dingtalkConfig.secret) {
                envContent += `DINGTALK_SECRET=${dingtalkConfig.secret}\n`;
            }
        }

        fs.writeFileSync(envPath, envContent, 'utf8');

        console.log('✅ 配置已保存到 config.json');
        console.log('✅ 环境变量已保存到 .env 文件');
        console.log('');
        console.log('🎯 配置完成！现在您可以：');
        console.log('   1. 重启Claude Code');
        console.log('   2. 正常使用Claude Code执行任务');
        console.log('   3. 任务完成时会自动收到通知');

    } catch (error) {
        console.log('❌ 配置过程中发生错误:', error.message);
    }

    rl.close();
}

// 如果直接运行此脚本
if (require.main === module) {
    setupWizard().then(() => {
        console.log('');
        console.log('👋 感谢使用！配置向导已退出。');
        process.exit(0);
    });
}

module.exports = {
    setupWizard
};
