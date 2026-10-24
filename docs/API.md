# API do Portal Acadêmico

Base local: `http://127.0.0.1:3000/api`. Todas as respostas, exceto o PDF, usam JSON. Nas falhas, a API retorna `{ "error": "mensagem" }`.

## Autenticação

`POST /auth/login` recebe `{ "loginId": "prof001", "password": "prof123", "role": "professor", "remember": false }`. Envie `Content-Type: application/json` e `X-Portal-Request: 1`.

A resposta contém `{ "user": {...}, "csrfToken": "..." }` e define o cookie `portal_session`, HttpOnly e SameSite=Lax. Preserve o cookie. Todas as alterações autenticadas exigem `X-Portal-Request: 1` e `X-CSRF-Token` com o token da sessão. Requisições do front-end usam a mesma origem; não há CORS aberto.

O login normal expira em oito horas no servidor e usa cookie de sessão. Lembrar-me usa sete dias no cookie e no servidor. O token da sessão é aleatório e apenas seu hash fica na tabela `sessions`. A senha é armazenada como hash scrypt com salt. As credenciais publicadas no README são contas fictícias desta base.

## Rotas

| Método | Rota | Perfil | Função / corpo principal |
| --- | --- | --- | --- |
| GET | `/health` | Público | Estado da API |
| POST | `/auth/login` | Público | Login descrito acima |
| GET | `/auth/me` | Autenticado | Usuário e token CSRF da sessão |
| POST | `/auth/logout` | Autenticado | Invalida a sessão |
| POST | `/auth/recovery` | Público | `{loginId}`; apenas registra pedido, sem email |
| GET | `/bootstrap` | Autenticado | Usuário, disciplinas, turmas e seus vínculos |
| GET | `/student/summary` | Estudante | Notas, aulas, faltas e frequência do próprio aluno |
| GET | `/professor/students?subjectId=algoritmos&classId=turma-a` | Professor | Alunos da combinação autorizada |
| PUT | `/professor/grades` | Professor | `{subjectId,classId,assessment,date?,entries:[{studentId,value}]}` |
| GET | `/events` | Autenticado | Eventos das matrículas do aluno ou criados pelo professor |
| POST | `/events` | Professor | `{subjectId,classId,title,type,date,time,location,description}` |
| PUT | `/events/:id` | Professor autor | Mesmo corpo da criação |
| DELETE | `/events/:id` | Professor autor | Exclui o evento |
| GET | `/feedback` | Autenticado | Próprios feedbacks ou feedbacks das turmas/disciplinas autorizadas |
| POST | `/feedback` | Estudante | `{type,subjectId?,message,anonymous}` |
| PATCH | `/feedback/:id` | Professor autorizado | `{status,response?}` |
| GET | `/jobs` | Autenticado | Vagas fictícias e interesse registrado pelo aluno |
| POST | `/jobs/:id/applications` | Estudante | Interesse único por aluno/vaga; sem envio externo |
| GET | `/notifications` | Autenticado | Avisos criados pelo professor ou destinados ao aluno |
| POST | `/notifications` | Professor | `{jobId,classIds:["turma-a"],message}` |
| POST | `/assistant` | Estudante | `{message}`; responde por regras, com dados do próprio aluno |
| GET | `/certificates` | Estudante | Disciplinas do próprio aluno elegíveis à declaração demonstrativa |
| GET | `/certificates/:subjectId/pdf` | Estudante | PDF personalizado, condicionado aos critérios do exemplo |

Conceitos: `A`, `PA`, `NA`. Avaliações: `p1`, `p2`, `trabalho`, `frequencia`. Para frequência, `date` é obrigatória e o valor é `Presente` ou `Ausente`. Cada disciplina possui no máximo um registro de aula por data neste exemplo.

Tipos de evento: `aula`, `prova`, `trabalho`, `evento`. Data: `AAAA-MM-DD`. Hora: `HH:mm`. Datas/horas são horários civis da instituição, sem conversão de fuso; execute o servidor com o fuso da instituição para referências relativas como a próxima prova.

Tipos de feedback: `sugestao`, `reclamacao`, `elogio`, `duvida`. Status: `pendente`, `em-analise`, `respondido`, `resolvido`. Para respondido, uma resposta é obrigatória. O anonimato é perante o professor; o vínculo do autor permanece no banco.

## Erros principais

| Código | Significado |
| --- | --- |
| 400 | Campo ou formato inválido |
| 401 | Sem sessão ou credenciais inválidas |
| 403 | Perfil/escopo sem permissão, CSRF inválido ou origem divergente |
| 404 | Recurso/rota não encontrado |
| 413 | Corpo maior que 64 KiB |
| 415 | Corpo sem Content-Type application/json |
| 429 | Limite temporário de tentativas de login/recuperação |

Não envie `studentId` em consultas de aluno: a API deriva a identidade da sessão. No lançamento do professor, `studentId` é necessário e validado contra a matrícula na turma/disciplina. Queries SQLite usam parâmetros.
