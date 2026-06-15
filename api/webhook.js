// api/webhook.js
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FINANCE_ID = process.env.FINANCE_SHEET_ID || "1nKHN5i08uaNne4PTNtXcANg5xjLkGNFTcC1nUCwetok";
const LEADS_ID = process.env.LEADS_SHEET_ID || "1RMxVG9XHmJQz01TFuP5Rn_8SK6MhDvoPXZDuKcgXEyY";

// Meta Ad Account IDs
const META_ACCOUNTS = [
  { id: "act_302857089030111", name: "叶涵3.0 MY" },
  { id: "act_1153951549608625", name: "叶涵2.0 SG" },
  { id: "act_1153172972825586", name: "晔涵1.0 LT" },
];
const META_TOKEN = process.env.META_ACCESS_TOKEN;

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

// 从 Meta API 拿今日和本月 Ads Spend
async function fetchMetaSpend(todayISO, monthStart) {
  if (!META_TOKEN) return { todaySpend: null, monthSpend: null };
  try {
    let todaySpend = 0, monthSpend = 0;
    for (const acc of META_ACCOUNTS) {
      // 今日
      const todayRes = await fetch(
        `https://graph.facebook.com/v22.0/${acc.id}/insights?fields=spend&time_range={"since":"${todayISO}","until":"${todayISO}"}&access_token=${META_TOKEN}`
      );
      const todayJson = await todayRes.json();
      todaySpend += num(todayJson?.data?.[0]?.spend || 0);
      // 本月
      const monthRes = await fetch(
        `https://graph.facebook.com/v22.0/${acc.id}/insights?fields=spend&time_range={"since":"${monthStart}","until":"${todayISO}"}&access_token=${META_TOKEN}`
      );
      const monthJson = await monthRes.json();
      monthSpend += num(monthJson?.data?.[0]?.spend || 0);
    }
    return { todaySpend, monthSpend };
  } catch(e) {
    return { todaySpend: null, monthSpend: null };
  }
}

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
    const monthStart=`${nowMYT.getFullYear()}-${String(nowMYT.getMonth()+1).padStart(2,'0')}-01`;
    const dd=String(nowMYT.getDate()).padStart(2,'0');
    const mm=String(nowMYT.getMonth()+1).padStart(2,'0');
    const todayLabel=`${dd}/${mm}`;
    const thisMonthLeads=leadRows.filter(r=>toMonthKey(r[0])===thisMonthKey).length;
    const todayLeads=leadRows.filter(r=>toISO(r[0])===todayISO).length;
    const todaySales=salesRows.slice(1).filter(r=>toISO(r[0])===todayISO);
    const todayRevenue=todaySales.reduce((s,r)=>s+num(r[9]),0);
    const todayDeals=todaySales.length;
    const thisMonthSales=salesRows.slice(1).filter(r=>{const iso=toISO(r[0]);return iso&&iso.startsWith(todayISO.slice(0,7));});
    const totalMonthRevenue=thisMonthSales.reduce((s,r)=>s+num(r[9]),0);
    const totalMonthDeals=thisMonthSales.length;
    // Meta Ads Spend
    const { todaySpend, monthSpend } = await fetchMetaSpend(todayISO, monthStart);
    return{months,latest,prev,allTimeTotal,leadsTotal:leadRows.length,thisMonthLeads,todayRevenue,todayDeals,todayLeads,totalMonthRevenue,totalMonthDeals,todayISO,thisMonthKey,todayLabel,todaySpend,monthSpend,error:null};
  } catch(e){return{error:e.message};}
}

function fmt(n) { return n !== null && n !== undefined ? `RM ${Number(n).toLocaleString('en-MY', {minimumFractionDigits:2,maximumFractionDigits:2})}` : 'RM -'; }

function buildReport(data) {
  if (data.error) return `数据读取失败：${data.error}`;

  // CPL = Ads Spend / Leads
  const todayCPL = (data.todaySpend !== null && data.todayLeads > 0)
    ? `RM ${(data.todaySpend / data.todayLeads).toFixed(2)}` : 'RM -';
  const overviewCPL = (data.monthSpend !== null && data.thisMonthLeads > 0)
    ? `RM ${(data.monthSpend / data.thisMonthLeads).toFixed(2)}` : 'RM -';

  // ROAS = Sales / Ads Spend
  const todayROAS = (data.todaySpend !== null && data.todaySpend > 0 && data.todayRevenue > 0)
    ? `${(data.todayRevenue / data.todaySpend).toFixed(2)}x` : '-';
  const totalROAS = (data.monthSpend !== null && data.monthSpend > 0 && data.totalMonthRevenue > 0)
    ? `${(data.totalMonthRevenue / data.monthSpend).toFixed(2)}x` : '-';

  const todaySpendText = data.todaySpend !== null ? fmt(data.todaySpend) : 'RM - (Meta API)';
  const monthSpendText = data.monthSpend !== null ? fmt(data.monthSpend) : 'RM - (Meta API)';

  return `📅 晔涵老师 | ${data.todayLabel} Daily Report

➖➖➖➖➖

💰 Today Sales：${fmt(data.todayRevenue)}
💰 Total Sales：${fmt(data.totalMonthRevenue)}
💰 Today Done Deal：${data.todayDeals}
💰 Total Done Deal：${data.totalMonthDeals}

🔥 Today Lead：${data.todayLeads}
🔥 Total Leads：${data.thisMonthLeads}
🔥 Today CPL：${todayCPL}

⚙️ Today Ads Spend：${todaySpendText}
⚙️ Total Ads Spend：${monthSpendText}
⚙️ Overview CPL：${overviewCPL}
⚙️ Total ROAS：${totalROAS}`;
}

async function sendTelegram(text, chatId) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId||CHAT_ID, text})
  });
}

async function askClaude(question, data) {
  if (!ANTHROPIC_KEY) return buildReport(data);
  const dataContext = `
实时数据：
- 今日收入：RM ${data.todayRevenue}，今日Leads：${data.todayLeads}人，今日成交：${data.todayDeals}单
- 今日Ads Spend：${data.todaySpend !== null ? 'RM '+data.todaySpend : '无数据'}
- 本月(${data.thisMonthKey})：RM ${(data.latest?.total||0).toLocaleString()}，Leads ${data.thisMonthLeads}人，成交 ${data.totalMonthDeals}单
- 本月Ads Spend：${data.monthSpend !== null ? 'RM '+data.monthSpend : '无数据'}
- 上月：RM ${(data.prev?.total||0).toLocaleString()}
- 历史累计：RM ${data.allTimeTotal.toLocaleString()}，总Leads：${data.leadsTotal}人
  `;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:800,
        system:`你是晔涵灵魂学的AI操盘手助理。马来西亚华人灵性教育，产品线RM93到RM35,629。用马来西亚华人口语，直接精准，不废话，给具体可行建议。限300字，纯文字不用markdown。${dataContext}`,
        messages:[{role:"user",content:question}]
      })
    });
    const json=await res.json();
    return json.content?.[0]?.text||"AI分析失败，请稍后再试。";
  } catch(e){return `出错：${e.message}`;}
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).send("Bot 运行中"); return; }
  const update = req.body;
  const message = update?.message;
  if (!message) { res.status(200).json({ok:true}); return; }
  const chatId = message.chat?.id;
  const text = message.text || "";
  if (String(chatId) !== String(CHAT_ID)) {
    await sendTelegram("未授权", chatId);
    res.status(200).json({ok:true});
    return;
  }
  if (text === "/start") {
    await sendTelegram(`晔涵灵魂学 AI 指挥官 已启动 ✅\n每晚 11:59PM 自动发报告给你。`, chatId);
    res.status(200).json({ok:true});
    return;
  }
  if (["今日报告","/report","本月业绩","报告"].includes(text)) {
    await sendTelegram("读取数据中...", chatId);
    const data = await fetchData();
    await sendTelegram(buildReport(data), chatId);
    res.status(200).json({ok:true});
    return;
  }
  await sendTelegram("分析中...", chatId);
  const data = await fetchData();
  const reply = await askClaude(text, data);
  await sendTelegram(reply, chatId);
  res.status(200).json({ok:true});
}
