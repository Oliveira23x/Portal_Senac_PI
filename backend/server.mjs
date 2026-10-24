import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, publicUser, verifyPassword, hashPassword, summary, now } from './database.mjs';
import { declarationPdf } from './pdf.mjs';

const ROOT = fileURLToPath(new URL('../frontend/', import.meta.url));
const fail = (status,message) => { throw Object.assign(new Error(message),{ status }); };
const digest = token => createHash('sha256').update(token).digest('hex');
const text = (value,label,max=2000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400,`${label} inválido.`);
  return value.trim();
};
const choice = (value,options,label) => options.includes(value) ? value : fail(400,`${label} inválido.`);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'Envie JSON.');
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>65536) fail(413,'Corpo muito grande.'); chunks.push(chunk); }
  try { const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value || typeof value!=='object' || Array.isArray(value)) throw Error(); return value; }
  catch { fail(400,'JSON inválido.'); }
}
export function createPortal({ dbPath=':memory:', cookieSecure=false, demo=true } = {}) {
  const db=openDatabase(dbPath,{demo});
  const dummyHash=hashPassword('invalid-account-password');
  const attempts=new Map();
  const limited = (req,kind,max=15) => {
    const key=`${kind}:${req.socket.remoteAddress}`; const t=Date.now();
    if(attempts.size>2000) for(const [key,value] of attempts) if(value.until<t) attempts.delete(key);
    let count=attempts.get(key);
    if(!count || count.until<t) { count={n:0,until:t+15*60*1000}; attempts.set(key,count); }
    if(++count.n>max) fail(429,'Muitas tentativas. Aguarde 15 minutos.');
  };
  const assigned=(uid,sid,cid)=>Boolean(db.prepare('SELECT 1 FROM assignments WHERE professor_id=? AND subject_id=? AND class_id=?').get(uid,sid,cid));
  const requireAssignment=(uid,sid,cid)=>{ text(sid,'Disciplina',40);text(cid,'Turma',40);if(!assigned(uid,sid,cid)) fail(403,'Você não leciona essa disciplina nessa turma.'); };
  const maySeeFeedback=(uid,feedback)=>Boolean(db.prepare(`SELECT 1 FROM assignments a JOIN enrollments e ON e.subject_id=a.subject_id AND e.class_id=a.class_id WHERE a.professor_id=? AND e.student_id=? AND (? IS NULL OR a.subject_id=?)`).get(uid,feedback.student_id,feedback.subject_id,feedback.subject_id));
  const role=(user,required)=>{ if(user.role!==required) fail(403,'Perfil sem permissão para esta ação.'); };
  const eventsFor=user=>user.role==='student'
    ? db.prepare(`SELECT v.*,s.name subject_name,c.name class_name FROM events v JOIN subjects s ON s.id=v.subject_id JOIN classes c ON c.id=v.class_id JOIN enrollments e ON e.subject_id=v.subject_id AND e.class_id=v.class_id WHERE e.student_id=? ORDER BY v.date,v.time`).all(user.id)
    : db.prepare(`SELECT v.*,s.name subject_name,c.name class_name FROM events v JOIN subjects s ON s.id=v.subject_id JOIN classes c ON c.id=v.class_id WHERE professor_id=? ORDER BY v.date,v.time`).all(user.id);

  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const send=(code,data)=>{ res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); };
    const cookie=(token,remember=false)=>`portal_session=${token}; HttpOnly; SameSite=Lax; Path=/${remember ? '; Max-Age=604800' : ''}${cookieSecure ? '; Secure' : ''}`;
    try {
      const url=new URL(req.url,'http://localhost'); const path=url.pathname; const method=req.method;
      if(!path.startsWith('/api/')) {
        if(method!=='GET' && method!=='HEAD') fail(405,'Método não permitido.');
        const assets={ '/':['index.html','text/html'], '/index.html':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/styles.css':['styles.css','text/css'], '/custom.css':['custom.css','text/css'] };
        if(!assets[path]) fail(404,'Arquivo não encontrado.');
        const [file,type]=assets[path]; const body=await readFile(resolve(ROOT,file));
        res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`}); res.end(method==='HEAD' ? undefined : body);return;
      }
      if(method==='GET' && path==='/api/health') return send(200,{status:'ok',demo});
      const write=['POST','PUT','PATCH','DELETE'].includes(method);
      if(write) {
        if(req.headers['x-portal-request']!=='1') fail(403,'Cabeçalho da aplicação ausente.');
        if(req.headers.origin) {
          let host;try{host=new URL(req.headers.origin).host;}catch{fail(403,'Origem inválida.');}
          if(host!==req.headers.host) fail(403,'Origem não autorizada.');
        }
      }
      if(method==='POST' && path==='/api/auth/login') {
        limited(req,'login'); const b=await readJson(req);
        const login=text(b.loginId,'Matrícula/código',80);
        const password=typeof b.password==='string' && b.password.length<=256 ? b.password : '';
        const requestedRole=choice(b.role,['student','professor'],'Perfil');
        const user=db.prepare('SELECT * FROM users WHERE login=?').get(login);
        const ok=await verifyPassword(password,user?.password_hash || dummyHash);
        if(!user || !ok || user.role!==requestedRole) fail(401,'Credenciais inválidas.');
        const token=randomBytes(32).toString('hex'), csrf=randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
        // Rotação: descarta a sessão anterior deste navegador ao fazer novo login.
        const previous=req.headers.cookie?.match(/(?:^|;\s*)portal_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if(previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
        db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token),user.id,csrf,Date.now()+(b.remember===true ? 604800000 : 28800000));
        res.setHeader('Set-Cookie',cookie(token,b.remember===true)); return send(200,{user:publicUser(user),csrfToken:csrf});
      }
      if(method==='POST' && path==='/api/auth/recovery') {
        limited(req,'recovery',5); const b=await readJson(req);
        db.prepare('INSERT INTO recovery_requests VALUES (?,?,?)').run(randomUUID(),text(b.loginId,'Matrícula/código',80),now());
        return send(202,{message:'Solicitação registrada. O envio de email ainda precisa ser integrado; procure a secretaria.'});
      }
      const token=req.headers.cookie?.match(/(?:^|;\s*)portal_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const session=token && db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token),Date.now());
      if(!session) fail(401,'Entre na sua conta para continuar.');
      const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
      if(write && req.headers['x-csrf-token']!==session.csrf) fail(403,'Sessão de formulário inválida. Recarregue a página.');
      if(method==='GET' && path==='/api/auth/me') return send(200,{user:publicUser(user),csrfToken:session.csrf});
      if(method==='POST' && path==='/api/auth/logout') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);
        res.setHeader('Set-Cookie',`${cookie('')}; Max-Age=0`);return send(200,{message:'Sessão encerrada.'});
      }
      if(method==='GET' && path==='/api/bootstrap') {
        const assignments=user.role==='professor' ? db.prepare('SELECT subject_id,class_id FROM assignments WHERE professor_id=?').all(user.id) : db.prepare('SELECT subject_id,class_id FROM enrollments WHERE student_id=?').all(user.id);
        return send(200,{user:publicUser(user),demo,subjects:db.prepare('SELECT * FROM subjects ORDER BY name').all(),classes:db.prepare('SELECT * FROM classes ORDER BY name').all(),assignments});
      }
      if(method==='GET' && path==='/api/student/summary') { role(user,'student');return send(200,summary(db,user.id)); }
      if(path==='/api/events' && method==='GET') return send(200,eventsFor(user));
      if(path==='/api/events' && method==='POST' || /^\/api\/events\/[^/]+$/.test(path) && ['PUT','DELETE'].includes(method)) {
        role(user,'professor'); const id=path.split('/')[3];
        if(id) { const event=db.prepare('SELECT * FROM events WHERE id=?').get(id);if(!event) fail(404,'Evento não encontrado.');if(event.professor_id!==user.id) fail(403,'Evento de outro professor.'); }
        if(method==='DELETE') { db.prepare('DELETE FROM events WHERE id=?').run(id);return send(200,{message:'Evento excluído.'}); }
        const b=await readJson(req); requireAssignment(user.id,text(b.subjectId,'Disciplina',40),text(b.classId,'Turma',40));
        if(!validDate(b.date) || typeof b.time!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) fail(400,'Data/horário inválidos.');
        const values=[b.subjectId,b.classId,text(b.title,'Título',150),choice(b.type,['aula','prova','trabalho','evento'],'Tipo'),b.date,b.time,text(b.location,'Local',150),typeof b.description==='string' ? b.description.trim().slice(0,2000) : ''];
        if(id) db.prepare('UPDATE events SET subject_id=?,class_id=?,title=?,type=?,date=?,time=?,location=?,description=? WHERE id=?').run(...values,id);
        else db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),user.id,...values);
        return send(id?200:201,{message:id?'Evento atualizado.':'Evento criado.'});
      }
      if(method==='GET' && path==='/api/professor/students') {
        role(user,'professor'); const sid=url.searchParams.get('subjectId'),cid=url.searchParams.get('classId');
        requireAssignment(user.id,sid,cid);
        const students=db.prepare(`SELECT u.id,u.name,u.login FROM users u JOIN enrollments e ON e.student_id=u.id WHERE e.subject_id=? AND e.class_id=? ORDER BY u.name`).all(sid,cid);
        return send(200,students.map(s=>({...summary(db,s.id).subjects.find(subject=>subject.id===sid),...s})));
      }
      if(method==='PUT' && path==='/api/professor/grades') {
        role(user,'professor'); const b=await readJson(req);requireAssignment(user.id,b.subjectId,b.classId);
        choice(b.assessment,['p1','p2','trabalho','frequencia'],'Avaliação');
        if(!Array.isArray(b.entries) || !b.entries.length || b.entries.length>100) fail(400,'Envie de 1 a 100 lançamentos.');
        if(b.assessment==='frequencia' && !validDate(b.date)) fail(400,'Selecione a data da aula.');
        const seen=new Set();
        for(const entry of b.entries) {
          if(!entry || typeof entry.studentId!=='string' || seen.has(entry.studentId)) fail(400,'Aluno inválido ou repetido.');
          seen.add(entry.studentId);
          if(!db.prepare('SELECT 1 FROM enrollments WHERE student_id=? AND subject_id=? AND class_id=?').get(entry.studentId,b.subjectId,b.classId)) fail(403,'Aluno não matriculado nessa turma/disciplina.');
          choice(entry.value,b.assessment==='frequencia' ? ['Presente','Ausente'] : ['A','PA','NA'],'Valor');
        }
        db.exec('BEGIN');try{
          for(const entry of b.entries) {
            if(b.assessment==='frequencia') db.prepare('INSERT INTO attendance VALUES (?,?,?,?,?) ON CONFLICT(student_id,subject_id,lesson_date) DO UPDATE SET present=excluded.present,updated_by=excluded.updated_by').run(entry.studentId,b.subjectId,b.date,entry.value==='Presente'?1:0,user.id);
            else db.prepare('INSERT INTO grades VALUES (?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,assessment) DO UPDATE SET concept=excluded.concept,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(entry.studentId,b.subjectId,b.assessment,entry.value,user.id,now());
          }
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        return send(200,{message:`${b.entries.length} lançamento(s) salvo(s).`});
      }
      if(path==='/api/feedback' && method==='POST') {
        role(user,'student'); const b=await readJson(req);
        if(b.subjectId && !db.prepare('SELECT 1 FROM enrollments WHERE student_id=? AND subject_id=?').get(user.id,b.subjectId)) fail(403,'Disciplina não matriculada.');
        if(b.anonymous!==undefined && typeof b.anonymous!=='boolean') fail(400,'Anonimato inválido.');
        const id=randomUUID();
        db.prepare('INSERT INTO feedback (id,student_id,subject_id,type,message,anonymous,created_at) VALUES (?,?,?,?,?,?,?)').run(id,user.id,b.subjectId||null,choice(b.type,['sugestao','reclamacao','elogio','duvida'],'Tipo'),text(b.message,'Mensagem',4000),b.anonymous?1:0,now());
        return send(201,{id,message:'Feedback enviado.'});
      }
      if(path==='/api/feedback' && method==='GET') {
        const rows=db.prepare(`SELECT f.*,u.name author,s.name subject_name FROM feedback f JOIN users u ON u.id=f.student_id LEFT JOIN subjects s ON s.id=f.subject_id ORDER BY f.created_at DESC`).all();
        return send(200,rows.filter(f=>user.role==='student' ? f.student_id===user.id : maySeeFeedback(user.id,f)).map(f=>{const {student_id,...rest}=f;return {...rest,author:f.anonymous?'Anônimo':f.author};}));
      }
      if(/^\/api\/feedback\/[^/]+$/.test(path) && method==='PATCH') {
        role(user,'professor');const id=path.split('/')[3],f=db.prepare('SELECT * FROM feedback WHERE id=?').get(id);
        if(!f) fail(404,'Feedback não encontrado.');if(!maySeeFeedback(user.id,f)) fail(403,'Feedback fora das suas turmas.');
        const b=await readJson(req),status=choice(b.status,['pendente','em-analise','respondido','resolvido'],'Status');
        const response=b.response===undefined ? f.response : text(b.response,'Resposta',4000);
        if(status==='respondido' && !response) fail(400,'Digite uma resposta.');
        db.prepare('UPDATE feedback SET status=?,response=? WHERE id=?').run(status,response,id);return send(200,{message:'Feedback atualizado.'});
      }
      if(path==='/api/jobs' && method==='GET') {
        const jobs=db.prepare('SELECT * FROM jobs ORDER BY id').all();
        return send(200,jobs.map(j=>({...j,applied:user.role==='student' && Boolean(db.prepare('SELECT 1 FROM applications WHERE student_id=? AND job_id=?').get(user.id,j.id))})));
      }
      if(/^\/api\/jobs\/[^/]+\/applications$/.test(path) && method==='POST') {
        role(user,'student');const id=path.split('/')[3];if(!db.prepare('SELECT 1 FROM jobs WHERE id=?').get(id)) fail(404,'Vaga não encontrada.');
        db.prepare('INSERT OR IGNORE INTO applications VALUES (?,?,?)').run(user.id,id,now());return send(201,{message:'Interesse registrado no portal demonstrativo. Nenhuma empresa foi contatada.'});
      }
      if(path==='/api/notifications' && method==='GET') {
        const sql=user.role==='professor' ? `SELECT n.*,j.title job_title,c.name class_name FROM notifications n JOIN jobs j ON j.id=n.job_id JOIN classes c ON c.id=n.class_id WHERE n.professor_id=? ORDER BY n.created_at DESC` : `SELECT n.*,j.title job_title,c.name class_name FROM notifications n JOIN jobs j ON j.id=n.job_id JOIN classes c ON c.id=n.class_id JOIN notification_recipients r ON r.notification_id=n.id WHERE r.student_id=? ORDER BY n.created_at DESC`;
        return send(200,db.prepare(sql).all(user.id));
      }
      if(path==='/api/notifications' && method==='POST') {
        role(user,'professor');const b=await readJson(req);
        if(!db.prepare('SELECT 1 FROM jobs WHERE id=?').get(text(b.jobId,'Vaga',50))) fail(404,'Vaga não encontrada.');
        if(!Array.isArray(b.classIds) || !b.classIds.length || b.classIds.length>20) fail(400,'Selecione as turmas.');
        const classIds=[...new Set(b.classIds)];
        for(const cid of classIds) if(typeof cid!=='string' || !db.prepare('SELECT 1 FROM assignments WHERE professor_id=? AND class_id=?').get(user.id,cid)) fail(403,'Turma não autorizada.');
        let recipients=0;const message=typeof b.message==='string'?b.message.trim().slice(0,2000):'';
        db.exec('BEGIN');try{
          for(const cid of classIds) {
            const id=randomUUID();db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?,?)').run(id,user.id,cid,b.jobId,message,now());
            const students=db.prepare(`SELECT DISTINCT e.student_id FROM enrollments e JOIN assignments a ON a.class_id=e.class_id AND a.subject_id=e.subject_id WHERE a.professor_id=? AND e.class_id=?`).all(user.id,cid);
            for(const s of students) {db.prepare('INSERT INTO notification_recipients VALUES (?,?)').run(id,s.student_id);recipients++;}
          }
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        return send(201,{message:`Aviso registrado para ${recipients} aluno(s) na aba Vagas.`,recipients});
      }
      if(path==='/api/assistant' && method==='POST') {
        role(user,'student');const b=await readJson(req),question=text(b.message,'Pergunta',1000).toLowerCase();
        const s=summary(db,user.id);let answer='Este assistente usa regras simples. Pergunte sobre notas, faltas, frequência ou a próxima prova. Créditos e outros dados ainda não estão cadastrados.';
        if(/nota|avalia|desempenho/.test(question)) answer=s.subjects.map(x=>`${x.name}: P1 ${x.grades.p1||'—'}, P2 ${x.grades.p2||'—'}, trabalho ${x.grades.trabalho||'—'}.`).join('\n');
        else if(/falta|frequ/.test(question)) answer=s.subjects.map(x=>`${x.name}: ${x.absences} falta(s) em ${x.totalLessons} aula(s); frequência ${x.frequency??'sem dados'}%.`).join('\n');
        else if(/prova|agenda|evento/.test(question)) {
          const local=new Date();const localDate=`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
          const localTime=`${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`;
          const next=eventsFor(user).find(e=>e.type==='prova' && `${e.date}T${e.time}`>=`${localDate}T${localTime}`);
          answer=next?`${next.title}: ${next.date.split('-').reverse().join('/')} às ${next.time}, ${next.location}.`:'Nenhuma próxima prova cadastrada.';
        }
        return send(200,{answer,mode:'regras'});
      }
      if(path==='/api/certificates' && method==='GET') {role(user,'student');return send(200,summary(db,user.id).subjects.filter(s=>s.completed).map(s=>({id:s.id,name:s.name,frequency:s.frequency})));}
      if(/^\/api\/certificates\/[^/]+\/pdf$/.test(path) && method==='GET') {
        role(user,'student');const s=summary(db,user.id).subjects.find(s=>s.id===path.split('/')[3] && s.completed);
        if(!s) fail(403,'A disciplina ainda não atende aos critérios demonstrativos.');
        const pdf=declarationPdf(user,s);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="declaracao-${s.id}.pdf"`});res.end(pdf);return;
      }
      fail(404,'Rota não encontrada.');
    } catch(error) {
      if(!error.status) console.error('Erro interno:',error);
      if(!res.headersSent) send(error.status||500,{error:error.status?error.message:'Erro interno do servidor.'});
      else res.end();
    }
  });
  server.requestTimeout=15000;
  return {server,db,close:()=>new Promise((resolve,reject)=>server.close(error=>{db.close();error?reject(error):resolve();}))};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  if(process.env.DEMO_MODE==='false') throw new Error('Este pacote inicia com contas de demonstração. Implemente provisionamento de usuários antes de desativar DEMO_MODE.');
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const app=createPortal({dbPath:process.env.DB_PATH||fileURLToPath(new URL('./data/portal.sqlite',import.meta.url)),cookieSecure:process.env.COOKIE_SECURE==='true'});
  app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`A porta ${port} está ocupada. Altere PORT no .env.`:error.message);process.exitCode=1;app.db.close();});
  app.server.listen(port,host,()=>console.log(`Portal Acadêmico: http://${host}:${port}\nAPI: http://${host}:${port}/api/health\nDados fictícios. Ctrl+C encerra o servidor.`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{app.close().then(()=>process.exit(0));});
}
