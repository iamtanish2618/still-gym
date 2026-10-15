import {seed} from '../server/seed.mjs';
import {spawnSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
// Generate INSERT statements, then execute them through Wrangler against local D1.
const sql=[];
const quote=x=>x===null?'NULL':typeof x==='number'?String(x):`'${String(x).replaceAll("'","''")}'`;
const db={prepare(text){return {bind(...args){return {sql:text.replace(/\?/g,()=>quote(args.shift()))};},async first(){return null;}};},async batch(statements){sql.push(...statements.map(x=>x.sql+';'));}};
await seed(db,{password:process.env.DEMO_PASSWORD||'StillDemo2026!'});
await mkdir('.sites-runtime',{recursive:true});
await writeFile('.sites-runtime/seed.sql',sql.join('\n'));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','.sites-runtime/seed.sql'],{stdio:'inherit'});
process.exitCode=result.status||0;
