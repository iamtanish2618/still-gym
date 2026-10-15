import {bookingCode,hashToken,passwordHash,randomToken,verifyPassword} from './auth.mjs';
export class ApiError extends Error{constructor(status,code,message,fields={}){super(message);this.status=status;this.code=code;this.fields=fields;}}
const fail=(status,code,message,fields)=>{throw new ApiError(status,code,message,fields);};
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const invalid=fields=>fail(422,'VALIDATION','Please check the highlighted fields.',fields);
const id=value=>{if(!/^[1-9]\d{0,9}$/.test(value))fail(400,'INVALID_ID','Invalid identifier.');return Number(value);};
async function body(request){
 if(!request.headers.get('content-type')?.includes('application/json'))fail(400,'JSON_REQUIRED','Send a JSON request.');
 const text=await request.text();if(text.length>8192)fail(400,'BODY_TOO_LARGE','Request is too large.');
 try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{fail(400,'INVALID_JSON','Send a valid JSON object.');}
}
function dateStart(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))invalid({date:'Choose a valid date.'});
 const n=Date.parse(`${date}T00:00:00+05:30`);
 if(!Number.isFinite(n)||new Date(n+19800000).toISOString().slice(0,10)!==date)invalid({date:'Choose a valid date.'});
 return n;
}
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role});
const bookingSelect=`SELECT b.id,b.session_id,b.status,b.created_at,b.checked_in_at,s.start,s.title,
 CASE WHEN b.status='confirmed' THEN b.code ELSE NULL END AS code,
 CASE WHEN b.status='waitlisted' THEN (SELECT count(*) FROM bookings q WHERE q.session_id=b.session_id AND q.status='waitlisted' AND q.id<=b.id) ELSE NULL END AS position
 FROM bookings b JOIN sessions s ON s.id=b.session_id`;
export async function handleApi(request,db){
 try{return await dispatch(request,db);}catch(e){
  if(e instanceof ApiError)return response({error:{code:e.code,message:e.message,fields:e.fields}},e.status);
  const message=String(e?.message||'');
  const known=[['SESSION_FULL','This session is full. Join the waitlist.'],['SEATS_AVAILABLE','A mat is available. Book it directly.'],['SESSION_STARTED','This session has already started.'],['bookings.user_id, bookings.session_id','You already have a place in this session.'],['users.email','An account with this email already exists.'],['sessions.start','A session already starts at this time.']];
  for(const [needle,description]of known)if(message.includes(needle))return response({error:{code:'CONFLICT',message:description,fields:{}}},409);
  console.error('API error',e instanceof Error?e.name:'Unknown');
  return response({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.',fields:{}}},500);
 }
}
async function dispatch(request,db){
 const url=new URL(request.url),path=url.pathname.replace(/^\/api/,'').replace(/\/$/,'')||'/',method=request.method;
 if(!db)fail(500,'DATABASE_UNAVAILABLE','The database is unavailable.');
 const query=(sql,...args)=>db.prepare(sql).bind(...args);
 async function throttle(key,max){
  const now=Date.now(),bucket=Math.floor(now/60000),hash=await hashToken(key);
  const row=await query('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',`${hash}:${bucket}`,now+120000).first();
  if(row.count>max)fail(429,'RATE_LIMITED','Too many attempts. Try again in a minute.');
  await query('DELETE FROM rate_limits WHERE expires_at < ?',now).run();
 }
 async function sessionFor(user,status=200){
  const token=randomToken();await query('INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)',await hashToken(token),user.id,Date.now()+7*86400000).run();
  return response({user:publicUser(user),token},status);
 }
 if(path==='/health'&&method==='GET'){await query('SELECT 1').first();return response({status:'ok',serverTime:Date.now()});}
 if(['/auth/register','/auth/login'].includes(path)&&method==='POST'){
  const data=await body(request),email=typeof data.email==='string'?data.email.trim().toLowerCase():'',password=data.password,fields={};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fields.email='Enter a valid email address.';
  if(typeof password!=='string'||password.length<10||password.length>128)fields.password='Use between 10 and 128 characters.';
  if(Object.keys(fields).length)invalid(fields);
  await throttle(`auth:${email}`,10);
  if(request.headers.get('cf-connecting-ip'))await throttle(`ip:${request.headers.get('cf-connecting-ip')}`,50);
  if(path.endsWith('register')){
   if(data.role!==undefined)fail(403,'ROLE_FORBIDDEN','Registration only creates member accounts.');
   if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>60)invalid({name:'Use between 2 and 60 characters.'});
   const hash=await passwordHash(password);
   const user=await query("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'member') RETURNING id,name,email,role",data.name.trim(),email,hash).first();
   return sessionFor(user,201);
  }
  const user=await query('SELECT * FROM users WHERE email=?',email).first();
  const valid=user?await verifyPassword(password,user.password_hash):(await passwordHash(password),false);
  if(!valid)fail(401,'INVALID_CREDENTIALS','Email or password is incorrect.');return sessionFor(user);
 }
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)fail(401,'UNAUTHENTICATED','Please log in to continue.');
 const tokenHash=await hashToken(token);
 const user=await query('SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=? AND t.expires_at>?',tokenHash,Date.now()).first();
 if(!user)fail(401,'UNAUTHENTICATED','Your session has expired. Please log in again.');
 const admin=()=>{if(user.role!=='admin')fail(403,'FORBIDDEN','Only gym staff can do that.');};
 const member=()=>{if(user.role!=='member')fail(403,'FORBIDDEN','Use a member account to book a mat.');};
 if(path==='/auth/me'&&method==='GET')return response({user:publicUser(user)});
 if(path==='/auth/logout'&&method==='POST'){await query('DELETE FROM tokens WHERE hash=?',tokenHash).run();return response({ok:true});}
 if(path==='/sessions'&&method==='GET'){
  const date=url.searchParams.get('date'),start=date?dateStart(date):Date.now()-3600000,end=date?start+86400000:start+90*86400000;
  const result=await query(`SELECT s.*,20-(SELECT count(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed') AS remaining,
   (SELECT count(*) FROM bookings b WHERE b.session_id=s.id AND b.status='waitlisted') AS waiting,
   (SELECT b.status FROM bookings b WHERE b.session_id=s.id AND b.user_id=? AND b.status!='cancelled') AS my_status
   FROM sessions s WHERE s.start>=? AND s.start<? ORDER BY s.start LIMIT 240`,user.id,start,end).all();
  return response({sessions:result.results,serverTime:Date.now()});
 }
 if(path==='/sessions'&&method==='POST'){
  admin();const data=await body(request),start=dateStart(data.date);
  if(!Number.isInteger(data.hour)||data.hour<0||data.hour>23)invalid({hour:'Choose an hour from 00 to 23.'});
  if(data.capacity!==undefined&&data.capacity!==20)invalid({capacity:'Every session has exactly 20 mats.'});
  const at=start+data.hour*3600000;
  if(at<=Date.now())invalid({date:'Create a session in the future.'});
  if(at>Date.now()+366*86400000)invalid({date:'Choose a date within the next year.'});
  const title=data.title===undefined?'Open practice':data.title;
  if(typeof title!=='string'||title.trim().length<2||title.trim().length>48)invalid({title:'Use between 2 and 48 characters.'});
  return response({session:await query('INSERT INTO sessions(start,capacity,title) VALUES(?,20,?) RETURNING *',at,title.trim()).first()},201);
 }
 if(path==='/bookings'&&method==='GET')return response({bookings:(await query(`${bookingSelect} WHERE b.user_id=? ORDER BY s.start,b.id`,user.id).all()).results,serverTime:Date.now()});
 let match=path.match(/^\/sessions\/([^/]+)\/(book|waitlist|bookings)$/);
 if(match){
  const sessionId=id(match[1]),action=match[2];
  if(action==='bookings'){admin();if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Use GET.');}else{member();if(method!=='POST')fail(405,'METHOD_NOT_ALLOWED','Use POST.');}
  const session=await query('SELECT * FROM sessions WHERE id=?',sessionId).first();if(!session)fail(404,'NOT_FOUND','Session not found.');
  if(action==='bookings')return response({session,bookings:(await query(`SELECT b.id,b.status,b.code,b.checked_in_at,b.user_id,u.name,u.email FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.session_id=? ORDER BY b.id`,sessionId).all()).results});
  await body(request);await throttle(`booking:${user.id}`,40);
  const status=action==='book'?'confirmed':'waitlisted';
  // A database trigger checks capacity inside this atomic statement; no read/write race.
  const created=await query('INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES(?,?,?,?,?) RETURNING id',user.id,sessionId,status,bookingCode(),Date.now()).first();
  return response({booking:await query(`${bookingSelect} WHERE b.id=?`,created.id).first()},201);
 }
 match=path.match(/^\/bookings\/([^/]+)$/);
 if(match&&method==='DELETE'){
  member();const bookingId=id(match[1]),booking=await query('SELECT * FROM bookings WHERE id=?',bookingId).first();
  if(!booking||booking.user_id!==user.id)fail(404,'NOT_FOUND','Booking not found.');
  const updated=await query(`UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('confirmed','waitlisted') AND (SELECT start FROM sessions WHERE id=session_id)>? RETURNING id`,bookingId,user.id,Date.now()).first();
  if(!updated)fail(409,'CANNOT_CANCEL','This booking is already cancelled or its session has started.');return response({ok:true});
 }
 if(path==='/check-in'&&method==='POST'){
  admin();await throttle(`check-in:${user.id}`,30);const data=await body(request);
  if(typeof data.code!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(data.code.trim().toUpperCase()))invalid({code:'Enter the eight-character booking code.'});
  const code=data.code.trim().toUpperCase(),now=Date.now();
  const updated=await query(`UPDATE bookings SET checked_in_at=? WHERE code=? AND status='confirmed' AND checked_in_at IS NULL AND EXISTS (SELECT 1 FROM sessions s WHERE s.id=session_id AND s.start<=? AND s.start+3600000>?) RETURNING id`,now,code,now,now).first();
  if(!updated)fail(409,'INVALID_CHECK_IN','Code unavailable: it may be used, cancelled, incorrect, or outside its session hour.');
  return response({booking:await query('SELECT b.id,b.checked_in_at,u.name,u.email,s.title,s.start FROM bookings b JOIN users u ON u.id=b.user_id JOIN sessions s ON s.id=b.session_id WHERE b.id=?',updated.id).first()});
 }
 fail(404,'NOT_FOUND','Endpoint not found.');
}
