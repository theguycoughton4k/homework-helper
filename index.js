const express = require('express');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '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'
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// REMOVE X-Frame-Options and allow iframes from anywhere
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => res.send('OK'));

app.post('/s', async (req, res) => {
  const text = req.body.t || '';
  
  if (!text) {
    return res.send(makePage({ error: 'No text received' }));
  }

  try {
    const result = await solveWithAI(text);
    res.send(makePage(result));
  } catch (err) {
    console.error(err);
    res.send(makePage({ error: err.message }));
  }
});

app.post('/ask', async (req, res) => {
  res.removeHeader('X-Frame-Options');
  const { question, context } = req.body;
  
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Answer briefly and clearly.' },
        { role: 'user', content: `Context: ${context}\n\nQuestion: ${question}` }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 400
    });
    res.json({ answer: completion.choices[0]?.message?.content?.trim() });
  } catch (err) {
    res.json({ error: err.message });
  }
});

async function solveWithAI(text) {
  const completion = await groq.chat.completions.create({
    messages: [
      { 
        role: 'system', 
        content: `You are a homework solver. Find ALL questions and answer them.

FORMAT:
**Q1:** [Question text]
**Type:** [multiple choice/checkbox/sorting/fill-in/calculation/short answer]
**Answer:** [The answer]

RULES:
- MATH: Calculate! 545-304=241, 1+1=2. Numbers with spaces "5 4 5"=545
- MULTIPLE CHOICE: "B) answer text"
- CHECKBOX: List with ✓ marks
- SORTING: Numbered list 1. 2. 3.
- FILL-IN: Just the word(s)
- SHORT ANSWER: Full answer to copy

IGNORE: Navigation, menus, Submit buttons, scores, "Questions answered"`
      },
      { role: 'user', content: text }
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    max_tokens: 1500
  });

  return { 
    answer: completion.choices[0]?.message?.content?.trim() || 'No answer', 
    context: text.substring(0, 2000) 
  };
}

function makePage(result) {
  const isError = !!result.error;
  const content = result.error || result.answer || '';
  const context = (result.context || '').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\\/g, '\\\\');
  
  let formatted = content
    .replace(/\*\*Q(\d+):\*\*/g, '<div class="qn">Q$1</div>')
    .replace(/\*\*Type:\*\*/g, '<span class="tp">')
    .replace(/\*\*Answer:\*\*/g, '</span><div class="ans">')
    .replace(/\n\n/g, '</div>')
    .replace(/\n/g, '<br>')
    .replace(/✓/g, '<b style="color:#4caf50">✓</b>');

  return `<!DOCTYPE html>
<html>
<head>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#fff;font-size:13px;padding:10px}
.hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.ti{font-weight:600;font-size:12px}
.x{background:none;border:none;font-size:16px;cursor:pointer;color:#999}
.ct{max-height:300px;overflow-y:auto;line-height:1.5}
.qn{background:#e3f2fd;color:#1565c0;padding:2px 6px;border-radius:3px;font-weight:600;font-size:10px;display:inline-block;margin:8px 0 4px 0}
.qn:first-child{margin-top:0}
.tp{font-size:9px;color:#888;font-style:italic}
.ans{background:#e8f5e9;border-left:3px solid #4caf50;padding:6px 8px;margin:4px 0 6px 0;font-weight:500;border-radius:0 4px 4px 0}
.err{background:#ffebee;border-left:3px solid #f44336;padding:8px;color:#c62828}
.btn{background:#333;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-size:10px;width:100%;margin-top:6px}
.fu{margin-top:8px;padding-top:8px;border-top:1px solid #eee}
.fui{display:flex;gap:4px}
.fui input{flex:1;padding:5px;border:1px solid #ddd;border-radius:3px;font-size:10px}
.fui button{background:#1976d2;color:#fff;border:none;padding:5px 8px;border-radius:3px;cursor:pointer;font-size:10px}
.fua{margin-top:5px;background:#f5f5f5;padding:6px;border-radius:3px;font-size:11px;display:none}
</style>
</head>
<body>
<div class="hd"><span class="ti">📚 Answers</span><button class="x" onclick="parent.postMessage('close','*')">×</button></div>
<div class="ct ${isError?'err':''}">${formatted}</div>
${isError?'':`<button class="btn" onclick="copyAll()">Copy</button>
<div class="fu">
<div class="fui">
<input id="q" placeholder="Ask why? explain?" onkeydown="if(event.key==='Enter')ask()">
<button onclick="ask()">Ask</button>
</div>
<div class="fua" id="fua"></div>
</div>`}
<script>
const ctx=\`${context}\`;
const raw=\`${content.replace(/`/g,'\\`').replace(/\\/g,'\\\\')}\`;
function copyAll(){navigator.clipboard.writeText(raw.replace(/\\*\\*/g,''));document.querySelector('.btn').textContent='✓';}
async function ask(){
const q=document.getElementById('q').value;if(!q)return;
const d=document.getElementById('fua');d.style.display='block';d.textContent='...';
try{const r=await fetch('/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,context:ctx})});
const j=await r.json();d.innerHTML=j.answer||j.error;}catch(e){d.textContent=e;}}
document.onkeydown=e=>{if(e.key==='Escape')parent.postMessage('close','*')};
</script>
</body>
</html>`;
}

app.listen(PORT, () => console.log('Running on ' + PORT));
