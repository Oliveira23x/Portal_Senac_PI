# Portal Acadêmico — front-end, back-end e Android

Este projeto transforma as telas de `novo_Painel2.html` em um sistema de estudo com API HTTP e persistência. Mantém a identidade azul/roxa e os perfis de estudante e professor. O HTML original foi preservado na pasta `referencia`.

O front-end é HTML + CSS + JavaScript. O back-end é Node.js 24 + SQLite. O app Android é Kotlin + WebView: ele abre o mesmo front-end dentro de um aplicativo Android. As telas ainda são web; não foram reescritas em componentes nativos.

## 1. O que cada aplicação faz

| Camada | Responsabilidade | Onde editar |
| --- | --- | --- |
| Front-end | Telas, formulários, navegação e chamadas HTTP | `frontend/index.html`, `frontend/app.js`, `frontend/custom.css` |
| Back-end / API | Login, permissões, validações e regras dos dados | `backend/server.mjs` |
| Banco de dados | Guarda usuários, matrículas, notas, presença, eventos e feedback | `backend/schema.sql`, `backend/database.mjs` |
| Android | Exibe o portal no celular, trata navegação, conexão e downloads | `android/app/src/main/java/br/com/portalacademico/app/MainActivity.kt` |

O navegador e o Android acessam a mesma API. Ao salvar uma nota no perfil de professor, o estudante vê a alteração ao abrir Desempenho ou clicar em Atualizar dados. Não há atualização automática em tempo real.

O Android Studio abre a pasta `android`. A API pode ser editada no VS Code e deve continuar executando em um terminal separado. O servidor e o banco não ficam dentro do APK.

## 2. Primeiro execute no computador

Pré-requisito: Node.js **24.x**. O banco usa o módulo `node:sqlite` dessa versão. Não é preciso instalar SQL Server, MySQL ou SQLite separadamente.

1. Extraia o ZIP. Uma sugestão de pasta no Windows é `C:\Projetos\portal-academico`.
2. Abra essa pasta no VS Code.
3. Abra Terminal > Novo terminal, dentro da pasta que contém `package.json`.
4. Confira a versão e execute:

```powershell
node --version
npm start
```

5. Abra [http://127.0.0.1:3000](http://127.0.0.1:3000).
6. Confira a API em [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health).

O servidor funciona sem `npm install`: usa os módulos nativos do Node, e o CSS já está compilado. A dependência de desenvolvimento Tailwind só é necessária para recompilar o CSS depois de adicionar novas classes.

Não abra `frontend/index.html` com duplo clique ou Live Server: as chamadas `/api` precisam do servidor Node da mesma aplicação.

### Credenciais fictícias

| Perfil | Matrícula/código | Senha |
| --- | --- | --- |
| Estudante | `2024001` | `senha123` |
| Professor | `prof001` | `prof123` |
| Segundo estudante da Turma A | `2024002` | `senha123` |
| Estudante da Turma B | `2024003` | `senha123` |

Selecione o perfil correspondente antes de entrar. O professor de exemplo leciona todas as disciplinas da Turma A e Algoritmos da Turma B. O seletor mostra somente as combinações atribuídas a ele.

Na primeira execução, o banco fictício é criado em `backend/data/portal.sqlite`. Ele permanece salvo após fechar o terminal. Use `Ctrl+C` para encerrar o servidor.

## 3. Execute no Android Studio

O projeto usa Kotlin, Android SDK 35, JDK 17, Android Gradle Plugin 8.9.2, Kotlin Gradle Plugin 2.2.10 e Gradle 8.11.1. São versões fixadas para este exemplo, não uma promessa de usar as versões mais recentes. O app atende Android 10 ou superior (API 29+).

1. Mantenha `npm start` executando no computador.
2. Abra o Android Studio.
3. Escolha **Open**, ou **File > Open**.
4. Selecione a pasta **`portal-academico/android`**. Não selecione o arquivo HTML nem a pasta principal que contém `package.json`.
5. Aguarde o Gradle Sync. A primeira sincronização precisa de internet para obter Gradle, plugins e dependências.
6. No SDK Manager, instale **Android SDK Platform 35** e **Android SDK Build-Tools 35.0.0**, se forem solicitados.
7. Em Settings > Build, Execution, Deployment > Build Tools > Gradle, escolha **JDK 17** para Gradle JDK, se necessário.
8. Abra Device Manager e crie um emulador de telefone com Android 10 ou superior. Uma imagem API 35 atende ao projeto.
9. Selecione o dispositivo, o módulo `app` e clique em **Run ▶**.
10. Faça login com as mesmas credenciais do navegador.

A URL de desenvolvimento já está definida em `android/gradle.properties`:

```properties
PORTAL_DEBUG_URL=http://10.0.2.2:3000/
```

No emulador do Android Studio, `10.0.2.2` aponta para a interface local do computador. `localhost` dentro do Android se refere ao próprio dispositivo. A API está escutando `127.0.0.1`, o que funciona com esse endereço especial do emulador.

O APK precisa de conexão com o servidor. Copiar o HTML para dentro do APK não substitui a API ou o banco. Nesta versão, as telas também são carregadas do servidor e não funcionam offline.

### Testar em um celular físico por USB

1. Ative as Opções do desenvolvedor e a Depuração USB no telefone.
2. Conecte por USB e aceite a autorização de depuração.
3. No terminal com `adb` disponível, execute:

```powershell
adb devices
adb reverse tcp:3000 tcp:3000
```

Se `adb` não estiver no PATH, no PowerShell use o caminho padrão do SDK:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:3000 tcp:3000
```

4. Altere `android/gradle.properties`:

```properties
PORTAL_DEBUG_URL=http://127.0.0.1:3000/
```

5. Faça Sync e Run escolhendo o celular conectado. Mantenha Node e USB ativos.
6. Para voltar ao emulador sem o redirecionamento USB, restaure `http://10.0.2.2:3000/`.

Se houver mais de um dispositivo, use `adb -s SERIAL reverse tcp:3000 tcp:3000`, substituindo SERIAL pelo valor de `adb devices`.

### Gerar um APK de teste

Depois do Sync no Android Studio, use a ação de Build para gerar APK, ou execute dentro de `android`:

```powershell
.\gradlew.bat assembleDebug
```

O resultado é `android/app/build/outputs/apk/debug/app-debug.apk`. Esse APK de desenvolvimento continua dependendo da URL configurada. Para outra pessoa testar sem seu computador, primeiro hospede o servidor e configure uma URL HTTPS acessível.

## 4. Teste o fluxo completo

1. No navegador, entre como professor.
2. Em **Lançar notas**, escolha Algoritmos e Programação, Turma A e Prova 1.
3. Clique em Carregar alunos, altere o conceito de João Silva e salve.
4. No app Android, entre como estudante `2024001`.
5. Abra Desempenho ou clique em Atualizar dados. Confira a nota.
6. No professor, troque Avaliação para Frequência, informe a data da aula e carregue os alunos novamente. Marque presença/ausência e salve.
7. O mesmo lançamento na mesma data atualiza a presença. Não duplica a aula. Este exemplo considera uma aula por disciplina por dia.
8. No professor, crie um evento em Gerenciar Agenda. O aluno da turma verá o evento na Agenda.
9. No aluno, envie um feedback. No professor, abra Feedbacks e responda. No aluno, reabra a aba para ver a resposta.
10. No professor, registre um aviso de vaga para uma turma. O aluno verá o aviso na aba Vagas.

## 5. Como o front-end conversa com o back-end

O formulário de login em `frontend/index.html` captura matrícula e senha. O JavaScript em `frontend/app.js` envia o JSON para a API:

```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Portal-Request': '1'
  },
  credentials: 'same-origin',
  body: JSON.stringify({
    loginId: '2024001',
    password: 'senha123',
    role: 'student'
  })
});
const { user, csrfToken } = await response.json();
```

A API verifica a senha com scrypt, cria uma sessão no banco e devolve um cookie HttpOnly. O navegador/WebView envia o cookie nas próximas requisições. O front-end guarda o token CSRF apenas na memória; em alterações, envia `X-CSRF-Token`. Ao recarregar a página, `/api/auth/me` recupera a sessão.

Esse trecho é uma explicação do código que já existe. Você não precisa colá-lo em outro lugar. O helper `api()` do projeto centraliza essas chamadas e o tratamento de erros.

No servidor, a rota de notas confere três coisas antes de escrever no banco: o perfil é professor; a disciplina e a turma estão atribuídas a ele; cada aluno está matriculado nessa combinação. Esconder um botão no front-end não substitui essas verificações.

### Exemplo de JSON para salvar uma nota

```json
{
  "subjectId": "algoritmos",
  "classId": "turma-a",
  "assessment": "p1",
  "entries": [
    { "studentId": "s1", "value": "PA" }
  ]
}
```

Esse corpo é enviado para `PUT /api/professor/grades` com a sessão de professor e o token CSRF. Conceitos aceitos: A, PA e NA. Para frequência, use `assessment: "frequencia"`, uma `date` no formato `AAAA-MM-DD` e valores Presente/Ausente.

## 6. O que já funciona e o que falta

| Recurso | Comportamento desta base |
| --- | --- |
| Login e logout | Sessão real no banco; senhas com hash; perfil conferido na API |
| Notas | Consulta do aluno e edição pelo professor, com persistência |
| Frequência | Presença por aluno/disciplina/data; percentuais calculados dos registros |
| Agenda | Criar, consultar, editar e excluir eventos; turma e professor verificados |
| Feedback | Enviar, filtrar, responder e mudar status; histórico persistido |
| Feedback anônimo | Oculta nome e identificador do aluno na resposta da API ao professor; banco mantém vínculo |
| Vagas | Cadastro fictício inicial; interesse único registrado no banco; sem envio a empresas |
| Avisos de vagas | Aviso interno para alunos das turmas autorizadas; sem push, email ou WhatsApp |
| Assistente | Respostas por regras consultando notas, frequência e próxima prova; sem modelo de IA |
| Entrevista | Roteiro local de três perguntas; sem avaliação automática e sem persistência das respostas |
| PDFs | Declaração demonstrativa personalizada; disponível nos critérios de conclusão do exemplo |
| Recuperar senha | Registra pedido; envio de email e redefinição ainda precisam ser implementados |
| Gestão administrativa | Ainda falta cadastro/edição de usuários, turmas, matrículas, professores e vagas pela interface |
| Financeiro | Não implementado |
| Publicação | Não hospedado; APK não gerado neste ambiente |

Os critérios de conclusão e os alertas de frequência são regras demonstrativas. Não representam validação institucional nem previsão de evasão. O módulo `node:sqlite` é síncrono; esta base foi desenhada para estudo e piloto local, não para carga de produção elevada.

## 7. Como alterar as telas

| Alteração desejada | Arquivo |
| --- | --- |
| Textos, formulários e estrutura das abas | `frontend/index.html` |
| Dados exibidos nos cards e ações dos botões | `frontend/app.js` |
| Cores, espaçamento e ajustes no celular | `frontend/custom.css` |
| Nova regra/rota HTTP | `backend/server.mjs` |
| Estrutura das tabelas | `backend/schema.sql` |
| Dados fictícios iniciais e consultas de desempenho | `backend/database.mjs` |
| Endereço acessado pelo Android | `android/gradle.properties` |

O CSS Tailwind já acompanha o projeto em `frontend/styles.css`, sem CDN. Para adicionar novas classes Tailwind e recompilar:

```powershell
npm ci
npm run css
```

Para mudanças somente em `custom.css`, não precisa recompilar. Atualize o navegador ou reabra o app para buscar a alteração. As telas geradas por JavaScript ficam nas funções `loadSummary`, `renderFeedback`, `renderJobs` e outras em `app.js`.

Para ver o esquema no banco, você pode abrir `backend/data/portal.sqlite` em uma ferramenta compatível com SQLite. Não edite o banco enquanto o servidor estiver escrevendo nele.

As tabelas usam `CREATE TABLE IF NOT EXISTS`; alterar o SQL não migra bancos existentes. Em desenvolvimento, crie uma migração ou, se quiser descartar os dados fictícios, pare o servidor, faça uma cópia do banco e exclua a pasta `backend/data`. Na próxima execução o seed será recriado. Mudar apenas o seed não altera um banco já criado.

## 8. Testes

Execute na pasta principal:

```powershell
npm test
```

Os testes exercitam login inválido, perfis, CSRF, origem, escopo de turma, notas compartilhadas, presença sem duplicação, agenda, anonimato, resposta a feedback, candidaturas únicas, avisos, assistente, PDFs, reinício e logout. Usam um banco temporário separado.

Consulte `docs/VALIDACAO.md` para o que foi validado nesta entrega e os limites da verificação Android.

## 9. Problemas frequentes

| Problema | Como resolver |
| --- | --- |
| `ENOENT package.json` | Entre na pasta principal `portal-academico`, que contém `package.json` |
| `node:sqlite` indisponível | Confira `node --version`; use Node 24.x |
| `EADDRINUSE` | A porta está ocupada. Encerre o servidor antigo ou configure outra PORT no `.env` e ajuste a URL do Android |
| Página sem conexão no Android | Confirme `npm start`, URL e dispositivo. Emulador usa 10.0.2.2; celular USB usa adb reverse + 127.0.0.1 |
| `ERR_CLEARTEXT_NOT_PERMITTED` | Execute a variante debug. A exceção HTTP local está em `src/debug/res/xml/network_security_config.xml`; release exige HTTPS |
| Gradle pede SDK | Instale Platform 35 e Build-Tools 35.0.0 pelo SDK Manager |
| Gradle pede Java | Configure Gradle JDK 17 no Android Studio |
| Nota não mudou no aluno | Reabra a aba ou clique em Atualizar dados; não existe sincronização em tempo real |
| Seleção de alunos sumiu | Após trocar disciplina, turma, avaliação ou data, carregue novamente para editar o contexto correto |
| Mudança no seed não apareceu | O seed só executa em banco vazio. Veja a orientação sobre migrações acima |

Para configurar `.env`, copie `.env.example` para `.env`. O padrão atende ao emulador e ao USB. Mantenha as duas URLs e portas alinhadas se fizer alterações.

## 10. Para evoluir a aplicação

Primeiro, implemente administração de usuários e matrículas para substituir as contas fixas. Em seguida, implemente o fluxo completo de recuperação de senha, auditoria de alterações e rotinas de backup. Migre o banco e a arquitetura conforme a carga e o uso real.

Para usar fora do computador, hospede Node e banco com armazenamento persistente, sirva por HTTPS, habilite `COOKIE_SECURE=true` e configure `PORTAL_RELEASE_URL` no Android. A base inicia em modo demonstrativo; `DEMO_MODE=false` bloqueia o início até você implementar provisionamento de contas. A distribuição Android também exige configuração própria de assinatura e validação no dispositivo.

Se quiser telas Android totalmente nativas no futuro, poderá criar a interface em Jetpack Compose ou XML/Views e reutilizar a API. Essa etapa requer reescrever as telas e configurar um cliente HTTP nativo com gerenciamento de sessão. O HTML não se converte automaticamente em Kotlin.

## Referências oficiais

- [Android: WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Android: endereços de rede do emulador](https://developer.android.com/studio/run/emulator-networking-address)
- [Android: configuração de segurança de rede](https://developer.android.com/privacy-and-security/security-config)
- [Android Gradle Plugin 8.9](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
- [Kotlin: compatibilidade do Gradle e AGP](https://kotlinlang.org/docs/gradle-configure-project.html)
- [Node.js 24: SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
