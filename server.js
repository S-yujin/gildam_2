// server.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

// 정적 파일 서빙(같은 폴더에 프런트 파일이 있을 때 편의용)
// 필요 없으면 이 줄을 제거하고 프런트는 별도 정적 서버로 호스팅하세요.
app.use(express.static(__dirname));

app.post('/api/generate', async (req, res) => {
  try{
    const { model, prompt } = req.body || {};
    if(!model || !prompt) return res.status(400).json({error:'model and prompt required'});
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = {
      contents:[{ parts:[{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };
    const r = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json','x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    });
    if(!r.ok){
      const t=await r.text();
      return res.status(500).json({error:'upstream', detail:t});
    }
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed={};
    try { parsed = JSON.parse(text); } catch { parsed={}; }
    res.json(parsed);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'proxy-failed'});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log('Proxy server on http://localhost:'+port));
