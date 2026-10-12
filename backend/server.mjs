import {createServer} from 'node:http';

const port=Number(process.env.PORT||8787);
const apiKey=process.env.AI_API_KEY||'';
const base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
const model=process.env.AI_MODEL||'gpt-4.1-mini';

function reply(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':process.env.ALLOWED_ORIGIN||'http://127.0.0.1:4173','access-control-allow-headers':'content-type'});res.end(JSON.stringify(data))}
function promptFor(body){return `You are assisting a UX researcher. Analyse only the supplied research sources. Never invent a fact, quotation, participant, motivation, count, or source. Return strict JSON with keys observations and patterns. Each observation must have sourceId, dimension (Goal|Action|Motivation|Constraint|Problem|Need|Decision-making), text, excerpt copied exactly from source content, and evidenceType (Direct observation|Interpretation). Patterns may only refer to observation IDs if those IDs are provided; because IDs are assigned after validation, return patterns as an empty array in this MVP. Unknown information must remain unknown. Research:\n${JSON.stringify(body.sources)}`}

createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':process.env.ALLOWED_ORIGIN||'http://127.0.0.1:4173','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type'});return res.end()}
  if(req.method!=='POST'||new URL(req.url,'http://localhost').pathname!=='/api/analyze')return reply(res,404,{error:'Not found'});
  if(!apiKey)return reply(res,503,{error:'AI_API_KEY is not configured on the backend. No analysis was performed.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2_000_000)return reply(res,413,{error:'Request is too large'})}
  try{
    const body=JSON.parse(raw);if(!Array.isArray(body.sources)||!body.sources.length)return reply(res,400,{error:'No research sources supplied'});
    const upstream=await fetch(`${base}/responses`,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,input:promptFor(body),text:{format:{type:'json_schema',name:'research_analysis',strict:true,schema:{type:'object',additionalProperties:false,properties:{observations:{type:'array',items:{type:'object',additionalProperties:false,properties:{sourceId:{type:'string'},dimension:{type:'string'},text:{type:'string'},excerpt:{type:'string'},evidenceType:{type:'string'}},required:['sourceId','dimension','text','excerpt','evidenceType']}},patterns:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},observationIds:{type:'array',items:{type:'string'}}},required:['title','summary','observationIds']}}},required:['observations','patterns']}}}})});
    const data=await upstream.json();if(!upstream.ok)return reply(res,502,{error:data.error?.message||'AI provider request failed'});
    const text=data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;if(!text)return reply(res,502,{error:'AI provider returned no structured output'});
    const parsed=JSON.parse(text);return reply(res,200,parsed);
  }catch(error){return reply(res,500,{error:`Analysis failed: ${error.message}. No findings were saved.`})}
}).listen(port,()=>console.log(`Persona Builder analysis backend: http://127.0.0.1:${port}`));
