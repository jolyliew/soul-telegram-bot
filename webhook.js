// api/webhook.js
// 接收 Telegram 消息，AI 分析后回复

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FINANCE_ID = process.env.FINANCE_SHEET_ID || "1nKHN5i08uaNne4PTNtXcANg5xjLkGNFTcC1nUCwetok";
const LEADS_ID = process.env.LEADS_SHEET_ID || "1RMxVG9XHmJQz01TFuP5Rn_8SK6MhDvoPXZDuKcgXEyY";

// [数据获取函数与 daily-report.js 相同，复用]
function parseCsv(text) {
  const rows=[];let row=[],field="",inQuotes=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(inQuotes){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else inQuotes=false;}else field+=c;}else if(c==='"')inQuotes=true;else if(c===','){row.push(field);field="";}else if(c==='\n'){row.push(field);rows.push(row);row=[];field="";}else if(c!=='\r')field+=c;}
  if(field||row.length){row.push(field);rows.push(row);}return rows;
}
const num=(v)=>{const n=Number(String(v||"").replace(/[,\s]/g,""));return isFinite(n)?n:0;};
function parseDate(raw){if(!raw)return null;const t=String(raw).trim();if(/^\d{4,6}(\.\d+)?$/.test(t)){const dt=new Date(Math.round((+t-25569)*86400*1000));if(!isNaN(dt.getTime()))return{y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate()};}const match=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(match)return{y:+match[3],m:+match[2],d:+match[1]};return null;}
function toISO(raw){const p=parseDate(raw);if(!p)return null;return`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;}
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function toMonthKey(raw){const p=parseDate(raw);if(!p)return null;return`${MONTHS[p.m-1]} ${p.y}`;}
function findRow(rows,label,startAt=0){for(let i=startAt;i<rows.length;i++)if((rows[i][0]||"").trim().toLowerCase()===label.toLowerCase())return rows[i];return null;}

async function fetchData() {
  const csvUrl=(id,gid)=>`https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid?`&gid=${gid}`:""}`;
  try {
    const [finRes,leadRes,salesRes]=await Promise.all([fetch(csvUrl(FINANCE_ID)),fetch(csvUrl(LEADS_ID,"0")),fetch(csvUrl(FINANCE_ID,"0"))]);
    const fin=parseCsv(await finRes.text()),leads=parseCsv(await leadRes.text()),salesRows=parseCsv(await salesRes.text());
    const header=findRow(fin,"Cash Sales- Front End & Low Ticket");
    const monthLabels=(header||[]).slice(1).map(s=>s.trim());
    const feCashRow=findRow(fin,"Total Cash Received");
    const upsellIdx=fin.findIndex(r=>(r[0]||"").trim()==="Cash Sales- Up Sell");
    const upsellCashRow=upsellIdx>=0?findRow(fin,"Total Cash Received",upsellIdx):null;
    const months=[];
    monthLabels.forEach((label,i)=>{if(!label||!/\d{4}$/.test(label))return;const frontEnd=num(feCashRow?.[i+1]),upsell=num(upsellCashRow?.[i+1]);months.push({month:label,frontEnd,upsell,total:frontEnd+upsell});});
    const withData=months.filter(m=>m.total>0);
    const latest=withData[withData.length-1]||null,prev=withData.length>1?withData[withData.length-2]:null;
    const allTimeTotal=months.reduce((s,m)=>s+m.total,0);
    const leadRows=leads.slice(1).filter(r=>(r[1]||"").trim()||(r[4]||"").trim());
    const nowMYT=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kuala_Lumpur'}));
    const thisMonthKey=`${MONTHS[nowMYT.getMonth()]} ${nowMYT.getFullYear()}`;
    const todayISO=`${nowMYT.getFullYear()}-${String(nowMYT.getMonth()+1).padStart(2,'0')}-${String(nowMYT.getDate()).padStart(2,'0')}`;
    const thisMonthLeads=leadRows.filter(r=>toMonthKey(r[0])===thisMonthKey).length;
    const todaySales=salesRows.slice(1).filter(r=>toISO(r[0])===todayISO);
    const todayRevenue=todaySales.reduce((s,r)=>s+num(r[9]),0);
    const todayLeads=leadRows.filter(r=>toISO(r[0])===todayISO).length;
    return{months,latest,prev,allTimeTotal,leadsTotal:leadRows.length,thisMonthLeads,todayRevenue,todayLeads,todayISO,thisMonthKey,error:null};
  } catch(e){return{error:e.message};}
}

async function sendTelegram(text, chatId) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId||CHAT_ID,text,parse_mode:"Markdown"})
  });
}

async function askClaude(question, data) {
  if (!ANTHROPIC_KEY) return "❌ 未配置 Claude API Key";
  const dataContext = data.error ? `数据暂时无法读取：${data.error}` : `
实时数据：
- 今日收入：RM ${data.todayRevenue.toLocaleString()}，今日新Leads：${data.todayLeads}人
- 本月(${data.thisMonthKey})：RM ${data.latest?.total?.toLocaleString()}，Leads ${data.thisMonthLeads}人
- 上月：RM ${data.prev?.total?.toLocaleString()||0}
- 历史累计：RM ${data.allTimeTotal.toLocaleString()}，总Leads：${data.leadsTotal}人
- 近6个月趋势：${data.months?.slice(-6).map(m=>`${m.month}:RM${m.total.toLocaleString()}`).join(' | ')}
  `;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:800,
        system:`你是晔涵灵魂学的AI操盘手助理。项目背景：马来西亚华人灵性教育，产品线从RM93到RM35,629。
用马来西亚华人口语，直接精准，不废话，给具体可行建议。回复限300字以内。
${dataContext}`,
        messages:[{role:"user",content:question}]
      })
    });
    const json=await res.json();
    return json.content?.[0]?.text||"❌ AI分析失败";
  } catch(e){return `❌ 出错：${e.message}`;}
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).send("Bot 运行中 ✅"); return; }

  const update = req.body;
  const message = update?.message;
  if (!message) { res.status(200).json({ok:true}); return; }

  const chatId = message.chat?.id;
  const text = message.text || "";

  // 安全验证：只响应你自己
  if (String(chatId) !== String(CHAT_ID)) {
    await sendTelegram("⚠️ 未授权", chatId);
    res.status(200).json({ok:true});
    return;
  }

  // 快捷指令
  if (text === "/start") {
    await sendTelegram(`👋 你好 Joly！

我是你的 *晔涵灵魂学 AI 指挥官* 🧠

你可以问我任何关于项目的问题：
• 「今日报告」— 查看今日数据
• 「本月业绩」— 本月收入分析  
• 「Leads 分析」— Lead 数据
• 「下一步该怎么做」— AI 策略建议
• 或者任何其他问题！

每晚 *11:59PM* 我会自动发报告给你 🌙`, chatId);
    res.status(200).json({ok:true});
    return;
  }

  if (text === "今日报告" || text === "/report") {
    await sendTelegram("⏳ 读取数据中...", chatId);
    const data = await fetchData();
    const mom = data.latest && data.prev && data.prev.total > 0
      ? ((data.latest.total-data.prev.total)/data.prev.total*100).toFixed(1) : null;
    const momText = mom !== null ? (parseFloat(mom)>=0?`📈 +${mom}%`:`📉 ${mom}%`) : "";
    const report = `📊 *今日实时报告*

💰 今日收入：RM ${data.todayRevenue.toLocaleString()}
👥 今日新 Leads：${data.todayLeads} 人

📊 ${data.thisMonthKey} 本月累计
• 总收入：RM ${(data.latest?.total||0).toLocaleString()} ${momText}
• 本月 Leads：${data.thisMonthLeads} 人

🏆 历史累计：RM ${data.allTimeTotal.toLocaleString()}`;
    await sendTelegram(report, chatId);
    res.status(200).json({ok:true});
    return;
  }

  // AI 回复所有其他问题
  await sendTelegram("⏳ 分析中...", chatId);
  const data = await fetchData();
  const reply = await askClaude(text, data);
  await sendTelegram(reply, chatId);
  res.status(200).json({ok:true});
}
