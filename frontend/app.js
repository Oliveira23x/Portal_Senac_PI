'use strict';
// A interface envia HTTP para /api. Nenhuma senha é validada no navegador.
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {user:null,csrf:'',boot:null,jobs:[],events:[],feedback:[],students:[],gradeContext:null,editingEvent:null,noticeJob:null,practice:0,practiceAnswers:[]};
let selectedUserType='student', activeTab='';
const buttonClass='px-4 py-2 bg-blue-600 text-white rounded-lg text-sm';
const empty = text => `<p class="empty">${esc(text)}</p>`;
const names = {A:'Atendido',PA:'Parcialmente atendido',NA:'Não atendido',pendente:'Pendente',respondido:'Respondido','em-analise':'Em análise',resolvido:'Resolvido',sugestao:'Sugestão',reclamacao:'Reclamação',elogio:'Elogio',duvida:'Dúvida'};
const subjectName = id => state.boot?.subjects.find(s=>s.id===id)?.name || 'Geral';
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateLabel = date => date?.slice(0,10).split('-').reverse().join('/') || '';

async function api(path,{method='GET',body}={}) {
  const headers={'X-Portal-Request':'1'};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(state.csrf) headers['X-CSRF-Token']=state.csrf;
  let response;
  try { response=await fetch(`/api${path}`,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)}); }
  catch { throw Error('Não foi possível conectar ao servidor. Confira se npm start continua aberto.'); }
  const data=await response.json();
  if(!response.ok) {
    if(response.status===401 && state.user && path!=='/auth/login') showLogin();
    const error=Error(data.error||'Falha ao executar a operação.');error.status=response.status;throw error;
  }
  return data;
}
function notify(message,type='success') {
  const node=document.createElement('div');
  node.className=`notification ${type==='error'?'bg-red-600':type==='info'?'bg-blue-600':'bg-green-600'} text-white px-4 py-3 rounded-lg shadow-lg mb-3 flex gap-3 items-center`;
  const span=document.createElement('span');span.textContent=message;
  const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Fechar aviso');close.onclick=()=>node.remove();
  node.append(span,close);$('notification-container').append(node);setTimeout(()=>node.remove(),6500);
}
async function guard(fn) {try {await fn();} catch(error) {notify(error.message,'error');console.error(error);}}
async function busy(button,fn) { if(button.disabled)return;button.disabled=true;try{return await fn();}finally{button.disabled=false;} }
function selectUserType(type) {
  selectedUserType=type;
  for(const kind of ['student','professor']) {
    $(`${kind}-type-btn`).classList.toggle('bg-blue-50',kind===type);
    $(`${kind}-type-btn`).classList.toggle('border-blue-500',kind===type);
    $(`${kind}-type-btn`).setAttribute('aria-pressed',String(kind===type));
  }
  $('login-label').textContent=type==='student'?'Matrícula':'Código do professor';
  $('login-id').placeholder=type==='student'?'Digite sua matrícula':'Digite seu código';
}
function togglePassword() {const field=$('password');field.type=field.type==='password'?'text':'password';}
function fillDemoCredentials(type) {selectUserType(type);$('login-id').value=type==='student'?'2024001':'prof001';$('password').value=type==='student'?'senha123':'prof123';}
function showForgotPassword() {$('forgot-password-modal').classList.add('show');$('forgot-id').focus();}
function closeForgotPassword() {$('forgot-password-modal').classList.remove('show');}
function showLogin() {
  state.user=null;state.csrf='';state.boot=null;state.gradeContext=null;state.editingEvent=null;activeTab='';
  state.jobs=[];state.feedback=[];state.events=[];state.students=[];
  state.practice=0;state.practiceAnswers=[];state.noticeJob=null;
  $('practice-section').classList.add('hidden');$('practice-answer').value='';
  document.querySelectorAll('.modal.show').forEach(e=>e.classList.remove('show'));
  $('portal-page').style.display='none';$('login-page').style.display='block';$('password').value='';
  $('students-list').innerHTML=empty('Selecione uma disciplina e turma.');$('save-section').style.display='none';
  // Nenhum estado acadêmico é usado como prova de autenticação.
  sessionStorage.removeItem('userData');localStorage.removeItem('userData');
}
async function logout() {await api('/auth/logout',{method:'POST'});showLogin();notify('Sessão encerrada.');}
function options(element,items,placeholder,previous=element.value) {
  element.innerHTML=`<option value="">${esc(placeholder)}</option>`+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  if(items.some(x=>x.id===previous))element.value=previous;
}
function fillClasses(subjectId,targetId) {
  const allowed=new Set(state.boot.assignments.filter(a=>a.subject_id===subjectId).map(a=>a.class_id));
  options($(targetId),state.boot.classes.filter(c=>allowed.has(c.id)),'Selecione uma turma');
}
async function enterPortal(auth) {
  state.user=auth.user;state.csrf=auth.csrfToken;
  state.boot=await api('/bootstrap');
  const professor=state.user.role==='professor';
  $('user-name').textContent=state.user.name;
  $('user-id').textContent=`${professor?'Código':'Matrícula'}: ${state.user.login}`;
  $('user-avatar').textContent=state.user.name.replace('Prof. ','').split(' ').slice(0,2).map(x=>x[0]).join('');
  $('student-tabs').style.display=professor?'none':'flex';$('professor-tabs').style.display=professor?'flex':'none';
  const ids=new Set(state.boot.assignments.map(a=>a.subject_id));
  const subjects=state.boot.subjects.filter(s=>ids.has(s.id));
  for(const id of ['professor-subject','event-subject','feedback-subject','feedback-filter-subject'])options($(id),subjects,id==='feedback-filter-subject'?'Todas as disciplinas':'Selecione uma disciplina');
  fillClasses($('professor-subject').value,'professor-class');fillClasses($('event-subject').value,'event-class');
  $('lesson-date').value=localDate();
  $('chat-container').textContent='Pergunte sobre suas notas, frequência ou próxima prova. Assistente com regras, sem IA generativa.';
  $('event-form').reset();$('cancel-event-edit').classList.add('hidden');
  $('event-form').querySelector('[type="submit"]').textContent='Criar evento';
  $('feedback-form').reset();
  $('login-page').style.display='none';$('portal-page').style.display='block';
  await showTab(professor?'professor-desempenho':'desempenho');
}
async function showTab(id) {
  if(!state.user)return;
  const professor=id.startsWith('professor-');
  if(professor!==(state.user.role==='professor'))return;
  document.querySelectorAll('.tab-content').forEach(e=>e.classList.toggle('active',e.id===id));
  document.querySelectorAll('.tab-btn').forEach(button=>{
    const selected=button.getAttribute('onclick')===`showTab('${id}')`;
    button.classList.toggle('border-blue-600',selected);button.classList.toggle('text-blue-600',selected);button.classList.toggle('text-gray-500',!selected);
    button.setAttribute('aria-current',selected?'page':'false');
  });
  activeTab=id;await refreshTab(id);
}
async function refreshTab(id) {
  if(id==='desempenho')await loadSummary();
  if(id==='agenda'||id==='professor-agenda')await loadEvents();
  if(id==='vagas'||id==='professor-vagas')await loadJobs();
  if(id==='feedback'||id==='professor-feedback')await loadFeedback();
  if(id==='certificados')await loadCertificates();
}
async function loadSummary() {
  const data=await api('/student/summary');
  const stats=[['Disciplinas matriculadas',data.totalSubjects],['Concluídas no exemplo',data.completedSubjects],['Faltas registradas',`${data.totalAbsences} / ${data.totalLessons} aulas`]];
  $('summary-cards').innerHTML=stats.map(([name,value])=>`<div class="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500"><p class="text-sm text-gray-600">${esc(name)}</p><p class="text-3xl font-bold text-blue-600 mt-2">${esc(value)}</p></div>`).join('');
  $('subject-cards').innerHTML=data.subjects.map(s=>`<article class="grade-card bg-gray-50 border rounded-xl p-4"><h4 class="font-semibold text-gray-900 mb-3">${esc(s.name)}</h4><p class="text-sm text-gray-600">P1: ${esc(s.grades.p1||'—')} · P2: ${esc(s.grades.p2||'—')} · Trabalho: ${esc(s.grades.trabalho||'—')}</p><p class="text-sm mt-2">Frequência: <strong>${s.frequency===null?'Sem aulas':s.frequency+'%'}</strong> · Faltas: ${s.absences}/${s.totalLessons}</p><p class="text-xs text-gray-500 mt-2">A = Atendido · PA = Parcialmente atendido · NA = Não atendido</p></article>`).join('')||empty('Nenhuma disciplina cadastrada.');
  $('attendance-alerts').innerHTML=data.subjects.filter(s=>s.frequency!==null&&s.frequency<=80).map(s=>`<div class="p-4 rounded-lg bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800">Atenção à frequência em ${esc(s.name)}: ${s.frequency}%. O limite demonstrativo de faltas é 25%.</div>`).join('');
}
async function loadEvents() {
  const events=await api('/events');state.events=events;
  const professor=state.user.role==='professor';
  $(professor?'professor-events':'student-events').innerHTML=events.map(e=>`<article class="p-4 bg-blue-50 border border-blue-100 rounded-xl"><p class="text-xs text-blue-700 mb-1">${esc(e.type)} · ${esc(e.class_name)}</p><h4 class="font-semibold">${esc(e.title)}</h4><p class="text-sm text-gray-600 mt-1">${dateLabel(e.date)} às ${esc(e.time)} · ${esc(e.location)}</p><p class="text-sm text-gray-600">${esc(e.subject_name)}</p><p class="text-sm mt-2 feedback-message">${esc(e.description)}</p>${professor?`<div class="flex gap-3 mt-3"><button data-action="edit-event" data-id="${esc(e.id)}" class="text-sm text-blue-700 underline">Editar</button><button data-action="delete-event" data-id="${esc(e.id)}" class="text-sm text-red-700 underline">Excluir</button></div>`:''}</article>`).join('')||empty('Nenhum evento cadastrado.');
}
function editEvent(id) {
  const e=state.events.find(e=>e.id===id);if(!e)return;
  state.editingEvent=id;
  const values={type:e.type,title:e.title,subject:e.subject_id,date:e.date,time:e.time,location:e.location,description:e.description};
  for(const [key,value] of Object.entries(values))$(`event-${key}`).value=value;
  fillClasses(e.subject_id,'event-class');$('event-class').value=e.class_id;
  $('event-form').querySelector('[type="submit"]').textContent='Salvar edição';$('cancel-event-edit').classList.remove('hidden');$('event-title').focus();
}
function cancelEventEdit() {state.editingEvent=null;$('event-form').reset();$('event-form').querySelector('[type="submit"]').textContent='Criar evento';$('cancel-event-edit').classList.add('hidden');fillClasses($('event-subject').value,'event-class');}
async function deleteEvent(id) {if(confirm('Excluir este evento da agenda?')){const r=await api(`/events/${encodeURIComponent(id)}`,{method:'DELETE'});if(state.editingEvent===id)cancelEventEdit();notify(r.message);await loadEvents();}}
function invalidateGradeList() {state.gradeContext=null;state.students=[];$('students-list').innerHTML=empty('Clique em Carregar alunos para esta seleção.');$('save-section').style.display='none';}
async function loadStudents() {
  const subjectId=$('professor-subject').value,classId=$('professor-class').value,assessment=$('assessment-type').value,date=$('lesson-date').value;
  if(!subjectId||!classId)throw Error('Selecione disciplina e turma.');
  const context={subjectId,classId,assessment,date};state.gradeContext=null;$('save-section').style.display='none';
  const students=await api(`/professor/students?${new URLSearchParams({subjectId,classId})}`);
  // Ignora uma resposta atrasada caso o usuário já tenha mudado a seleção.
  if(subjectId!==$('professor-subject').value||classId!==$('professor-class').value||assessment!==$('assessment-type').value||date!==$('lesson-date').value)return;
  state.students=students;state.gradeContext=context;
  const values=assessment==='frequencia'?['Presente','Ausente']:['A','PA','NA'];
  $('students-list').innerHTML=students.map(s=>{const original=assessment==='frequencia'?'':s.grades[assessment]||'';return `<div class="grade-row bg-gray-50"><div><h4 class="font-medium">${esc(s.name)}</h4><p class="text-sm text-gray-600">Matrícula ${esc(s.login)} · Frequência ${s.frequency??'—'}%</p></div><div><label for="grade-${esc(s.id)}" class="block text-xs text-gray-600 mb-1">${assessment==='frequencia'?'Presença na data selecionada':`Atual: ${original||'Não lançado'}`}</label><select id="grade-${esc(s.id)}" data-student-id="${esc(s.id)}" data-original="${esc(original)}" class="w-full border rounded-lg px-3 py-2"><option value="">Selecione</option>${values.map(v=>`<option value="${v}" ${v===original?'selected':''}>${v}${names[v]?' — '+names[v]:''}</option>`).join('')}</select></div></div>`;}).join('')||empty('Nenhum aluno nessa turma/disciplina.');
  $('students-count').textContent=students.length;$('save-section').style.display=students.length?'block':'none';
}
async function saveGrades() {
  if(!state.gradeContext)throw Error('Carregue os alunos primeiro.');
  const entries=Array.from($('students-list').querySelectorAll('[data-student-id]')).filter(e=>e.value&&e.value!==e.dataset.original).map(e=>({studentId:e.dataset.studentId,value:e.value}));
  if(!entries.length){notify('Nenhuma alteração para salvar.','info');return;}
  await busy($('save-section').querySelector('button'),async()=>{
    const r=await api('/professor/grades',{method:'PUT',body:{...state.gradeContext,entries}});notify(r.message);await loadStudents();
  });
}
async function loadFeedback() {state.feedback=await api('/feedback');renderFeedback();}
function renderFeedback() {
  const professor=state.user.role==='professor';let rows=state.feedback;
  if(professor) {
    rows=rows.filter(f=>(!$('feedback-filter-subject').value||f.subject_id===$('feedback-filter-subject').value)&&(!$('feedback-filter-type').value||f.type===$('feedback-filter-type').value)&&(!$('feedback-filter-status').value||f.status===$('feedback-filter-status').value));
    $('feedback-stats').textContent=`${rows.length} mensagem(ns) no filtro · ${state.feedback.length} no total`;
  }
  $(professor?'professor-feedback-list':'own-feedback').innerHTML=rows.map(f=>`<article class="bg-gray-50 border rounded-xl p-4"><div class="flex flex-wrap justify-between gap-2 text-xs text-gray-600 mb-2"><span>${esc(names[f.type])} · ${esc(f.subject_name||'Geral')}</span><span>${dateLabel(f.created_at)}</span></div>${professor?`<p class="font-medium mb-2">${esc(f.author)}</p>`:''}<p class="feedback-message text-sm">${esc(f.message)}</p><p class="text-xs text-blue-700 mt-3">${esc(names[f.status]||f.status)}</p>${f.response?`<div class="mt-3 p-3 bg-white border rounded-lg"><p class="text-xs font-medium mb-1">Resposta do professor</p><p class="text-sm feedback-message">${esc(f.response)}</p></div>`:''}${professor?`<div class="flex flex-wrap gap-3 mt-3"><button data-action="reply-feedback" data-id="${esc(f.id)}" class="text-sm text-blue-700 underline">Responder</button><button data-action="analyze-feedback" data-id="${esc(f.id)}" class="text-sm text-yellow-800 underline">Em análise</button><button data-action="resolve-feedback" data-id="${esc(f.id)}" class="text-sm text-green-700 underline">Resolvido</button></div>`:''}</article>`).join('')||empty('Nenhum feedback encontrado.');
}
function clearFilters() {for(const id of ['feedback-filter-subject','feedback-filter-type','feedback-filter-status'])$(id).value='';renderFeedback();}
async function changeFeedback(id,status) {
  const body={status};
  if(status==='respondido'){const response=prompt('Resposta ao aluno:');if(!response?.trim())return;body.response=response;}
  const r=await api(`/feedback/${encodeURIComponent(id)}`,{method:'PATCH',body});notify(r.message);await loadFeedback();
}
async function loadJobs() {
  const jobs=await api('/jobs');state.jobs=jobs;renderJobs();
  const notifications=await api('/notifications');
  $(state.user.role==='professor'?'notification-history':'student-notifications').innerHTML=notifications.map(n=>`<article class="p-3 border rounded-lg bg-blue-50"><p class="font-medium">${esc(n.job_title)}</p><p class="text-xs text-gray-600">${esc(n.class_name)} · ${dateLabel(n.created_at)}</p><p class="text-sm feedback-message mt-2">${esc(n.message||'Confira os detalhes da vaga abaixo.')}</p></article>`).join('')||empty('Nenhum aviso registrado.');
}
function renderJobs() {
  const professor=state.user.role==='professor',query=$('job-search').value.toLowerCase();
  const jobs=state.jobs.filter(j=>professor||`${j.title} ${j.company} ${j.mode}`.toLowerCase().includes(query));
  $(professor?'professor-jobs':'jobs-list').innerHTML=jobs.map(j=>`<article class="bg-white rounded-xl shadow-md border-t-4 border-blue-500 p-6"><p class="text-xs text-blue-600 mb-2">${esc(j.type)} · ${esc(j.mode)} · Fictícia</p><h3 class="text-lg font-semibold">${esc(j.title)}</h3><p class="text-sm text-gray-600">${esc(j.company)}</p><p class="font-medium mt-3">${esc(j.salary)}</p><p class="text-sm text-gray-600 my-3">${esc(j.description)}</p><div class="flex flex-wrap gap-3"><button data-action="job-details" data-id="${j.id}" class="text-sm text-blue-700 underline">Ver detalhes</button><button data-action="${professor?'notify-job':'apply-job'}" data-id="${j.id}" class="${buttonClass}" ${j.applied?'disabled':''}>${professor?'Avisar turmas':j.applied?'Interesse registrado':'Registrar interesse'}</button></div></article>`).join('')||empty('Nenhuma vaga encontrada.');
}
function jobDetails(id) {
  const j=state.jobs.find(j=>j.id===id);if(!j)return;
  $('details-body').innerHTML=`<h3 class="text-2xl font-semibold">${esc(j.title)}</h3><p>${esc(j.company)} · ${esc(j.mode)}</p><p>${esc(j.description)}</p><div><h4 class="font-medium">Requisitos</h4><p class="text-sm text-gray-600">${esc(j.requirements)}</p></div><div><h4 class="font-medium">Benefícios</h4><p class="text-sm text-gray-600">${esc(j.benefits)}</p></div><p class="text-sm text-blue-700">Vaga fictícia para estudo. Nenhuma candidatura é enviada a empresas.</p>`;$('details-modal').classList.add('show');
}
function selectNoticeJob(id) {
  state.noticeJob=id;$('notice-form').reset();$('notice-job').textContent=state.jobs.find(j=>j.id===id)?.title||'';
  const allowed=new Set(state.boot.assignments.map(a=>a.class_id));
  $('notice-classes').innerHTML=state.boot.classes.filter(c=>allowed.has(c.id)).map(c=>`<label class="flex items-center gap-3"><input name="notice-class" type="checkbox" value="${esc(c.id)}"><span>${esc(c.name)}</span></label>`).join('');$('notice-modal').classList.add('show');
}
async function loadCertificates() {
  const rows=await api('/certificates');
  $('certificates-list').innerHTML=rows.map(s=>`<div class="p-4 bg-green-50 border rounded-xl"><h4 class="font-medium">${esc(s.name)}</h4><p class="text-sm text-gray-600 my-2">Frequência: ${s.frequency}%</p><a class="inline-block ${buttonClass}" href="/api/certificates/${encodeURIComponent(s.id)}/pdf" download="declaracao-${esc(s.id)}.pdf">Baixar declaração em PDF</a></div>`).join('')||empty('Nenhuma disciplina atende aos critérios demonstrativos neste momento.');
}
function addMessage(message,sender) {const node=document.createElement('div');node.className=`chat-message p-3 rounded-lg mb-3 text-sm ${sender==='user'?'bg-blue-600 text-white ml-6':'bg-white border mr-6'}`;node.textContent=message;$('chat-container').append(node);$('chat-container').scrollTop=$('chat-container').scrollHeight;}
async function sendMessage(event) {
  event.preventDefault();const message=$('chat-input').value.trim();if(!message)return;
  await busy($('chat-form').querySelector('button'),async()=>{addMessage(message,'user');$('chat-input').value='';const r=await api('/assistant',{method:'POST',body:{message}});addMessage(r.answer,'assistant');});
}
async function quickQuestion(question) {$('chat-input').value=question;await sendMessage({preventDefault(){}});}
const practiceQuestions=['Conte sobre um projeto que você desenvolveu. Qual problema ele resolveu?','Como você organiza o front-end, o back-end e o banco de dados de um aplicativo?','Descreva um erro difícil que você resolveu e como encontrou a causa.'];
function showPractice() {$('practice-section').classList.remove('hidden');$('practice-question').textContent=practiceQuestions[state.practice];$('practice-answer').value=state.practiceAnswers[state.practice]||'';$('practice-progress').textContent=`Pergunta ${state.practice+1} de ${practiceQuestions.length}. As respostas ficam somente nesta sessão e não são avaliadas.`;$('practice-next').textContent=state.practice===practiceQuestions.length-1?'Concluir prática':'Próxima pergunta';}

document.addEventListener('DOMContentLoaded',()=>{
  // Limpa o antigo login fictício do protótipo. A sessão válida é um cookie HttpOnly.
  localStorage.removeItem('userData');sessionStorage.removeItem('userData');selectUserType('student');
  $('login-form').addEventListener('submit',event=>{event.preventDefault();guard(()=>busy($('login-btn'),async()=>{
    $('login-text').textContent='Entrando...';
    try{const auth=await api('/auth/login',{method:'POST',body:{loginId:$('login-id').value.trim(),password:$('password').value,role:selectedUserType,remember:$('remember-me').checked}});$('password').value='';await enterPortal(auth);}
    finally{$('login-text').textContent='Entrar';}
  }));});
  $('forgot-form').addEventListener('submit',e=>{e.preventDefault();guard(()=>busy(e.submitter,async()=>{const r=await api('/auth/recovery',{method:'POST',body:{loginId:$('forgot-id').value.trim()}});notify(r.message,'info');closeForgotPassword();$('forgot-form').reset();}));});
  $('feedback-form').addEventListener('submit',e=>{e.preventDefault();guard(()=>busy(e.submitter,async()=>{
    const r=await api('/feedback',{method:'POST',body:{type:$('feedback-type').value,subjectId:$('feedback-subject').value,message:$('feedback-message').value,anonymous:$('feedback-anonymous').checked}});notify(r.message);$('feedback-form').reset();await loadFeedback();
  }));});
  $('event-form').addEventListener('submit',e=>{e.preventDefault();guard(()=>busy(e.submitter,async()=>{
    const body={};for(const key of ['type','title','date','time','location','description'])body[key]=$(`event-${key}`).value;
    body.subjectId=$('event-subject').value;body.classId=$('event-class').value;
    const r=await api(state.editingEvent?`/events/${encodeURIComponent(state.editingEvent)}`:'/events',{method:state.editingEvent?'PUT':'POST',body});notify(r.message);cancelEventEdit();await loadEvents();
  }));});
  $('notice-form').addEventListener('submit',e=>{e.preventDefault();guard(()=>busy(e.submitter,async()=>{
    const classIds=Array.from(document.querySelectorAll('[name="notice-class"]:checked')).map(c=>c.value);if(!classIds.length)throw Error('Selecione pelo menos uma turma.');
    const r=await api('/notifications',{method:'POST',body:{jobId:state.noticeJob,classIds,message:$('notice-message').value}});notify(r.message);$('notice-modal').classList.remove('show');await loadJobs();
  }));});
  $('chat-form').addEventListener('submit',e=>guard(()=>sendMessage(e)));
  $('cancel-event-edit').addEventListener('click',cancelEventEdit);
  $('event-subject').addEventListener('change',()=>fillClasses($('event-subject').value,'event-class'));
  $('professor-subject').addEventListener('change',()=>{fillClasses($('professor-subject').value,'professor-class');invalidateGradeList();});
  for(const id of ['professor-class','assessment-type','lesson-date'])$(id).addEventListener('change',invalidateGradeList);
  for(const id of ['feedback-filter-subject','feedback-filter-type','feedback-filter-status'])$(id).addEventListener('change',renderFeedback);
  $('job-search').addEventListener('input',renderJobs);
  $('refresh-data').addEventListener('click',()=>guard(async()=>{if(activeTab==='professor-desempenho'&&state.gradeContext)await loadStudents();else await refreshTab(activeTab);notify('Dados atualizados.');}));
  $('practice-button').addEventListener('click',()=>{state.practice=0;state.practiceAnswers=[];showPractice();});
  $('practice-next').addEventListener('click',()=>{state.practiceAnswers[state.practice]=$('practice-answer').value;if(state.practice<practiceQuestions.length-1){state.practice++;showPractice();}else{$('practice-section').classList.add('hidden');notify('Prática concluída. Revise se suas respostas explicam o problema, sua ação e o resultado.','info');}});
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-action]');if(!button)return;
    const {action,id,target}=button.dataset;
    guard(async()=>{
      if(action==='close-modal')$(target).classList.remove('show');
      if(action==='edit-event')editEvent(id);
      if(action==='delete-event')await deleteEvent(id);
      if(action==='reply-feedback')await changeFeedback(id,'respondido');
      if(action==='analyze-feedback')await changeFeedback(id,'em-analise');
      if(action==='resolve-feedback')await changeFeedback(id,'resolvido');
      if(action==='job-details')jobDetails(id);
      if(action==='notify-job')selectNoticeJob(id);
      if(action==='apply-job')await busy(button,async()=>{const r=await api(`/jobs/${encodeURIComponent(id)}/applications`,{method:'POST',body:{}});notify(r.message);await loadJobs();});
    });
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));});
  guard(async()=>{try{await enterPortal(await api('/auth/me'));}catch(error){if(error.status!==401)throw error;}});
});
// Handlers do HTML de origem: erros assíncronos são exibidos ao usuário.
for(const [name,fn] of Object.entries({selectUserType,togglePassword,fillDemoCredentials,showForgotPassword,closeForgotPassword,logout,showTab,quickQuestion,loadStudents,saveGrades,clearFilters}))window[name]=(...args)=>guard(()=>fn(...args));
