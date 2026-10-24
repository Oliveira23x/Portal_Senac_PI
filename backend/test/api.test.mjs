import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createPortal } from '../server.mjs';
import { hashPassword } from '../database.mjs';

test('Fluxos do portal: autenticação, permissões e persistência',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'portal-test-')),dbPath=join(dir,'test.sqlite');
  let app=createPortal({dbPath});
  async function listen() {app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;}
  let base=await listen();
  async function request(path,{method='GET',body,auth,csrf=true,headers={}}={}) {
    const h={'X-Portal-Request':'1',...headers};
    if(body!==undefined)h['Content-Type']='application/json';
    if(auth){h.Cookie=auth.cookie;if(csrf)h['X-CSRF-Token']=auth.csrf;}
    const res=await fetch(base+'/api'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
    const data=res.headers.get('content-type')?.includes('application/json')?await res.json():Buffer.from(await res.arrayBuffer());
    return {status:res.status,data,headers:res.headers};
  }
  async function login(loginId,password,role) {const r=await request('/auth/login',{method:'POST',body:{loginId,password,role}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrfToken};}
  try {
    await t.test('Sem sessão, com senha incorreta ou perfil forjado não entra',async()=>{
      assert.equal((await request('/student/summary')).status,401);
      assert.equal((await request('/auth/login',{method:'POST',body:{loginId:'2024001',password:'errada',role:'student'}})).status,401);
      assert.equal((await request('/auth/login',{method:'POST',body:{loginId:'2024001',password:'senha123',role:'professor'}})).status,401);
      const res=await fetch(base+'/');assert.equal(res.status,200);assert.match(await res.text(),/Portal Acadêmico/);
      assert.equal((await fetch(base+'/backend/data/portal.sqlite')).status,404);
    });
    const student=await login('2024001','senha123','student');
    const student2=await login('2024002','senha123','student');
    let professor=await login('prof001','prof123','professor');
    const grade={subjectId:'algoritmos',classId:'turma-a',assessment:'p1',entries:[{studentId:'s1',value:'PA'}]};
    await t.test('Permissões, CSRF e validação da origem',async()=>{
      assert.equal((await request('/professor/grades',{method:'PUT',body:grade,auth:student})).status,403);
      assert.equal((await request('/professor/grades',{method:'PUT',body:grade,auth:professor,csrf:false})).status,403);
      assert.equal((await request('/professor/grades',{method:'PUT',body:grade,auth:professor,headers:{Origin:'https://outro-site.example'}})).status,403);
      assert.equal((await request('/professor/grades',{method:'PUT',body:{...grade,entries:[{studentId:'s3',value:'A'}]},auth:professor})).status,403);
      assert.equal((await request('/professor/grades',{method:'PUT',body:{...grade,entries:[{studentId:'s1',value:'Z'}]},auth:professor})).status,400);
      assert.equal((await request('/professor/grades',{method:'PUT',body:{entries:[]},auth:professor})).status,400);
      const students=await request('/professor/students?subjectId=algoritmos&classId=turma-a',{auth:professor});
      assert.equal(students.data.find(s=>s.id==='s1').name,'João Silva');
      assert.equal(students.data.some(s=>s.id==='s3'),false);
      assert.equal((await request('/professor/students?subjectId=banco&classId=turma-b',{auth:professor})).status,403);
      const both={...grade,entries:[{studentId:'s1',value:'NA'},{studentId:'s3',value:'PA'}]};
      assert.equal((await request('/professor/grades',{method:'PUT',body:both,auth:professor})).status,403);
      assert.equal(app.db.prepare("SELECT concept FROM grades WHERE student_id='s1' AND subject_id='algoritmos' AND assessment='p1'").get().concept,'A');
    });
    await t.test('Nota do professor aparece no perfil do aluno',async()=>{
      assert.equal((await request('/professor/grades',{method:'PUT',body:grade,auth:professor})).status,200);
      const data=(await request('/student/summary',{auth:student})).data;
      assert.equal(data.subjects.find(s=>s.id==='algoritmos').grades.p1,'PA');
      assert.equal(data.totalLessons,40);assert.equal(data.totalAbsences,5);
    });
    await t.test('Presença é atualizada por data, sem duplicar aulas',async()=>{
      const body={...grade,assessment:'frequencia',date:'2026-01-15',entries:[{studentId:'s1',value:'Ausente'}]};
      await request('/professor/grades',{method:'PUT',body,auth:professor});
      const first=(await request('/student/summary',{auth:student})).data;
      await request('/professor/grades',{method:'PUT',body,auth:professor});
      const second=(await request('/student/summary',{auth:student})).data;
      assert.equal(second.totalLessons,first.totalLessons);assert.equal(second.totalAbsences,first.totalAbsences);
      body.entries[0].value='Presente';await request('/professor/grades',{method:'PUT',body,auth:professor});
      assert.equal((await request('/student/summary',{auth:student})).data.totalAbsences,first.totalAbsences-1);
      assert.equal((await request('/professor/grades',{method:'PUT',body:{...body,date:'2026-02-30'},auth:professor})).status,400);
    });
    let eventId;
    await t.test('Criar, editar e excluir evento com isolamento entre professores',async()=>{
      const body={subjectId:'algoritmos',classId:'turma-a',title:'Entrega API',type:'trabalho',date:'2026-12-01',time:'19:00',location:'Laboratório',description:'Teste persistente'};
      assert.equal((await request('/events',{method:'POST',body,auth:professor})).status,201);
      const events=(await request('/events',{auth:student})).data;eventId=events.find(e=>e.title==='Entrega API').id;
      assert.equal((await request(`/events/${eventId}`,{method:'PUT',body:{...body,title:'Entrega Android'},auth:professor})).status,200);
      app.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('p2','prof002','Outro professor','professor',hashPassword('outra123'));
      const other=await login('prof002','outra123','professor');
      assert.equal((await request(`/events/${eventId}`,{method:'DELETE',auth:other})).status,403);
      assert.equal((await request(`/events/${eventId}`,{method:'DELETE',auth:student})).status,403);
      assert.equal((await request(`/events/${eventId}`,{method:'DELETE',auth:professor})).status,200);
      assert.equal((await request('/events',{auth:student})).data.some(e=>e.id===eventId),false);
    });
    await t.test('Feedback privado, anônimo no perfil do professor e com resposta persistida',async()=>{
      const r=await request('/feedback',{method:'POST',auth:student,body:{subjectId:'algoritmos',type:'duvida',message:'Como conectar <script> ao app?',anonymous:true}});
      assert.equal(r.status,201);const id=r.data.id;
      assert.equal((await request('/feedback',{auth:student2})).data.some(f=>f.id===id),false);
      const visible=(await request('/feedback',{auth:professor})).data.find(f=>f.id===id);
      assert.equal(visible.author,'Anônimo');assert.equal('student_id' in visible,false);
      const other=await login('prof002','outra123','professor');
      assert.equal((await request(`/feedback/${id}`,{method:'PATCH',auth:other,body:{status:'respondido',response:'Não autorizado'}})).status,403);
      assert.equal((await request(`/feedback/${id}`,{method:'PATCH',auth:professor,body:{status:'respondido',response:'Use a API REST.'}})).status,200);
      assert.equal((await request('/feedback',{auth:student})).data.find(f=>f.id===id).response,'Use a API REST.');
    });
    await t.test('Interesse em vaga é único; aviso chega só aos destinatários permitidos',async()=>{
      for(let i=0;i<2;i++)assert.equal((await request('/jobs/job1/applications',{method:'POST',auth:student,body:{}})).status,201);
      assert.equal(app.db.prepare("SELECT COUNT(*) n FROM applications WHERE student_id='s1'").get().n,1);
      const r=await request('/notifications',{method:'POST',auth:professor,body:{jobId:'job1',classIds:['turma-a'],message:'Veja esta oportunidade.'}});
      assert.equal(r.status,201);assert.equal(r.data.recipients,2);
      assert.equal((await request('/notifications',{auth:student})).data.length,1);
      const b=await login('2024003','senha123','student');
      assert.equal((await request('/notifications',{auth:b})).data.length,0);
    });
    await t.test('Assistente consulta dados reais e PDF exige conclusão da própria disciplina',async()=>{
      const r=await request('/assistant',{method:'POST',auth:student,body:{message:'Quais minhas notas?'}});
      assert.equal(r.data.mode,'regras');assert.match(r.data.answer,/P1 PA/);
      assert.equal((await request('/certificates/redes/pdf',{auth:student})).status,403);
      const pdf=await request('/certificates/banco/pdf',{auth:student});
      assert.equal(pdf.status,200);assert.equal(pdf.data.subarray(0,8).toString(),'%PDF-1.4');assert.match(pdf.data.toString(),/Joao Silva/);
    });
    await t.test('Banco e sessão sobrevivem ao reinício; logout invalida a sessão',async()=>{
      await app.close();app=createPortal({dbPath});base=await listen();
      assert.equal((await request('/student/summary',{auth:student})).data.subjects.find(s=>s.id==='algoritmos').grades.p1,'PA');
      assert.equal((await request('/feedback',{auth:student})).data.some(f=>f.response==='Use a API REST.'),true);
      assert.equal((await request('/auth/logout',{method:'POST',auth:professor})).status,200);
      assert.equal((await request('/auth/me',{auth:professor})).status,401);
      professor=await login('prof001','prof123','professor');assert.equal((await request('/auth/me',{auth:professor})).status,200);
    });
  } finally {await app.close();rmSync(dir,{recursive:true,force:true});}
});
