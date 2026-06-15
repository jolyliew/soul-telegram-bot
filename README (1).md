# 晔涵灵魂学 · Telegram 指挥官 Bot
## 部署说明（一步一步跟着做）

---

## 你会得到什么

✅ 每晚 11:59PM 自动收到当日报告（Telegram）
✅ 随时发消息问数据，AI 直接回复
✅ 完全免费运行（Vercel 免费层）

---

## 第一步：上传代码到 GitHub

1. 去 github.com 新建一个 **私人 repo**，名字：`soul-telegram-bot`
2. 把这个文件夹里的所有文件上传进去

文件结构：
```
soul-telegram-bot/
├── api/
│   ├── daily-report.js
│   └── webhook.js
├── vercel.json
└── README.md
```

---

## 第二步：部署到 Vercel

1. 去 vercel.com，用 GitHub 账号登录
2. 点 "New Project" → 选择 `soul-telegram-bot`
3. 点 Deploy（不用改任何设置）

---

## 第三步：设置环境变量（重要！）

在 Vercel 项目 → Settings → Environment Variables，添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `TELEGRAM_BOT_TOKEN` | `8378314979:AAHtfIkK7Z9torqbaumlVU95S93u-7DgG1I` |
| `TELEGRAM_CHAT_ID` | `2006771912` |
| `ANTHROPIC_API_KEY` | 你的 Claude API Key |
| `CRON_SECRET` | 随便写一串密码，例如：`soulacademy2025` |
| `FINANCE_SHEET_ID` | `1nKHN5i08uaNne4PTNtXcANg5xjLkGNFTcC1nUCwetok` |
| `LEADS_SHEET_ID` | `1RMxVG9XHmJQz01TFuP5Rn_8SK6MhDvoPXZDuKcgXEyY` |

设置完后点 **Redeploy**。

---

## 第四步：设置 Telegram Webhook

部署完成后，Vercel 会给你一个网址，例如：
`https://soul-telegram-bot-xxx.vercel.app`

在浏览器打开这个链接（替换成你的网址）：
```
https://api.telegram.org/bot8378314979:AAHtfIkK7Z9torqbaumlVU95S93u-7DgG1I/setWebhook?url=https://你的vercel网址/api/webhook
```

看到 `{"ok":true}` 就成功了。

---

## 第五步：测试

1. 打开 Telegram，找到你的 Bot
2. 发送 `/start`，Bot 应该回复欢迎消息
3. 发送 `今日报告`，Bot 会读取数据回复

---

## Cron Job 时间说明

`vercel.json` 里设置的是 `"59 15 * * *"`
= UTC 15:59 = MYT 23:59（每晚 11:59PM 马来西亚时间）✅

---

## 你可以问 Bot 的问题例子

- 今日报告
- 本月业绩怎样？
- 跟上月比差多少？
- Leads 来了多少？
- 现在最大的问题是什么？
- 明天该做什么？
- 哪个产品卖得最好？

---

## 需要 Claude API Key？

去 console.anthropic.com 注册，充值 USD 5（约 RM 22），可以用几个月。
