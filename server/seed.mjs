import {passwordHash,bookingCode} from './auth.mjs';
// Demo data is explicit and opt-in. No runtime schema changes, automatic reseeding,
// public admin-registration route, or destructive reset.
export async function seed(db,{password='StillDemo2026!',now=Date.now()}={}){
 if(await db.prepare('SELECT id FROM users LIMIT 1').first())throw Error('Database already contains accounts; refusing to overwrite.');
 const hash=await passwordHash(password),statements=[];
 const users=[['Studio admin','admin@still.demo','admin'],['Aanya Shah','aanya@still.demo','member'],['Kabir Mehta','kabir@still.demo','member'],...Array.from({length:20},(_,i)=>[`Demo Member ${i+1}`,`member${i+1}@still.demo`,'member'])];
 users.forEach(([name,email,role],i)=>statements.push(db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').bind(i+1,name,email,hash,role)));
 const today=Math.floor((now+19800000)/86400000)*86400000-19800000;
 const currentHour=Math.floor((now+19800000)/3600000)*3600000-19800000;
 const starts=[];
 // The first future slot is temporarily used for an active-session demo booking.
 starts.push(currentHour+3600000);
 for(let d=1;d<=5;d++)for(const hour of [7,9,12,17,19])starts.push(today+d*86400000+hour*3600000);
 const names=['Open practice','Morning movement','Strength & stretch','Midday reset','Evening flow','Unwind'];
 starts.forEach((start,i)=>statements.push(db.prepare('INSERT INTO sessions(id,start,title,capacity) VALUES(?,?,?,20)').bind(i+1,start,names[i%names.length])));
 let seq=0;
 const add=(user,session)=>statements.push(db.prepare("INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES(?,?,'confirmed',?,?)").bind(user,session,bookingCode(),now+seq++));
 add(2,1);add(2,2);add(3,3);
 for(let i=0;i<20;i++)add(i+4,4);
 for(let i=0;i<12;i++)add(i+4,2);
 for(let i=0;i<7;i++)add(i+4,3);
 // Seed-only transition creates a currently running session for check-in review.
 statements.push(db.prepare('UPDATE sessions SET start=? WHERE id=1').bind(currentHour));
 await db.batch(statements);
 return {users:users.length,sessions:starts.length};
}
