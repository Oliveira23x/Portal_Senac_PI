import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const actual = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const publicUser = ({ id, login, name, role }) => ({ id, login, name, role });
export const now = () => new Date().toISOString();
export function openDatabase(path, { demo = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  if (demo && !db.prepare('SELECT id FROM users LIMIT 1').get()) seed(db);
  return db;
}
function seed(db) {
  db.exec('BEGIN');
  try {
    const user = db.prepare('INSERT INTO users VALUES (?,?,?,?,?)');
    for (const [id,login,name,role,password] of [
      ['s1','2024001','João Silva','student','senha123'],
      ['s2','2024002','Ana Oliveira','student','senha123'],
      ['s3','2024003','Bruno Santos','student','senha123'],
      ['p1','prof001','Prof. Maria Santos','professor','prof123']
    ]) user.run(id,login,name,role,hashPassword(password));
    const names = { algoritmos:'Algoritmos e Programação', banco:'Banco de Dados', engenharia:'Engenharia de Software', redes:'Redes de Computadores' };
    db.prepare('INSERT INTO classes VALUES (?,?)').run('turma-a','Turma A — Manhã');
    db.prepare('INSERT INTO classes VALUES (?,?)').run('turma-b','Turma B — Noite');
    for (const [id,name] of Object.entries(names)) {
      db.prepare('INSERT INTO subjects VALUES (?,?)').run(id,name);
      db.prepare('INSERT INTO assignments VALUES (?,?,?)').run('p1',id,'turma-a');
      if (id === 'algoritmos') db.prepare('INSERT INTO assignments VALUES (?,?,?)').run('p1',id,'turma-b');
      for (const sid of ['s1','s2','s3']) {
        db.prepare('INSERT INTO enrollments VALUES (?,?,?)').run(sid,id,sid === 's3' ? 'turma-b' : 'turma-a');
        for (const assessment of ['p1','p2','trabalho']) {
          if (id === 'redes' && assessment !== 'p1') continue;
          const concept = id === 'engenharia' || (sid === 's2' && assessment === 'p1') ? 'PA' : 'A';
          db.prepare('INSERT INTO grades VALUES (?,?,?,?,?,?)').run(sid,id,assessment,concept,'p1',now());
        }
        for (let day=1;day<=10;day++) {
          const date = new Date(); date.setDate(date.getDate()-day);
          // Datas de aula são datas civis da instituição (sem conversão de fuso).
          const d = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
          const absent = id === 'redes' ? day <= 2 : day === 1;
          db.prepare('INSERT INTO attendance VALUES (?,?,?,?,?)').run(sid,id,d,absent ? 0 : 1,'p1');
        }
      }
    }
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)').run('ev-demo','p1','redes','turma-a','Prova de Redes de Computadores','prova',date,'14:00','Sala 201','Evento fictício para testar a agenda.');
    const insertJob = db.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?)');
    insertJob.run('job1','Desenvolvedor Frontend','TechCorp (fictícia)','Remoto','Estágio','Frontend','R$ 1.200','Pratique interfaces web com HTML, CSS e JavaScript.','HTML, CSS e JavaScript','Mentoria e auxílio de estudos');
    insertJob.run('job2','Analista de Dados','DataInsights (fictícia)','Presencial','Estágio','Dados','R$ 1.000','Pratique SQL e análise de dados.','SQL e Python básico','Auxílio de transporte');
    insertJob.run('job3','Suporte Técnico','InfraTech (fictícia)','Híbrido','Estágio','Suporte','R$ 800','Atendimento e manutenção de sistemas.','Informática e comunicação','Treinamentos');
    insertJob.run('job4','Desenvolvedor Android','AppMakers (fictícia)','Remoto','Júnior','Mobile','R$ 1.400','Pratique desenvolvimento Android.','Kotlin básico','Mentoria técnica');
    db.prepare('INSERT INTO feedback (id,student_id,subject_id,type,message,anonymous,created_at) VALUES (?,?,?,?,?,?,?)').run('fb-demo','s1','algoritmos','sugestao','Podemos praticar mais exercícios de API?',0,now());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function summary(db, studentId) {
  const subjects = db.prepare(`SELECT s.id,s.name,e.class_id FROM enrollments e JOIN subjects s ON s.id=e.subject_id WHERE e.student_id=? ORDER BY s.name`).all(studentId).map(s => {
    const grades = Object.fromEntries(db.prepare('SELECT assessment,concept FROM grades WHERE student_id=? AND subject_id=?').all(studentId,s.id).map(g => [g.assessment,g.concept]));
    const a = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(1-present),0) AS absences FROM attendance WHERE student_id=? AND subject_id=?').get(studentId,s.id);
    const frequency = a.total ? Math.round((a.total-a.absences)/a.total*100) : null;
    const completed = ['p1','p2','trabalho'].every(key => grades[key] === 'A') && frequency !== null && frequency >= 75;
    return { ...s, grades, totalLessons:a.total, absences:a.absences, frequency, completed };
  });
  return { subjects, totalSubjects:subjects.length, completedSubjects:subjects.filter(s=>s.completed).length, totalAbsences:subjects.reduce((n,s)=>n+s.absences,0), totalLessons:subjects.reduce((n,s)=>n+s.totalLessons,0) };
}
