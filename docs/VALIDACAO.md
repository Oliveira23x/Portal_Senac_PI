# Validação da entrega

## Executado com sucesso

- `npm test` com Node 24.19.0: 10 testes contabilizados, 10 aprovados, zero falhas (um teste principal e nove cenários de integração).
- Login inválido, sessão, perfil forjado, CSRF, origem, autorização por turma/disciplina e rejeição de lançamentos inválidos.
- Gravação de notas pelo professor e leitura pelo aluno; lote inválido sem gravação parcial.
- Presença por data, correção de presença e repetição sem duplicar aulas.
- Criação, edição e exclusão de evento com conferência de propriedade e leitura na turma do aluno.
- Feedback privado, identidade oculta no anônimo, resposta autorizada e persistência.
- Interesse único em vaga, avisos somente para destinatários autorizados e resposta do assistente baseada nos dados.
- Elegibilidade e conteúdo do PDF demonstrativo.
- Fechamento e reabertura do banco, manutenção dos dados e invalidação da sessão no logout.
- Fluxos do front-end executados com jsdom 26.1.0 e servidor HTTP real no mesmo processo: login, navegação, seleção de disciplina/turma, nota compartilhada, evento compartilhado, feedback anônimo, resposta, assistente, restauração de sessão e logout. Zero erros JavaScript observados nesses fluxos.
- Teste de escape de HTML: mensagem com `<img ... onerror=...>` permaneceu texto, sem criar uma imagem no DOM.
- HTML com identificadores únicos e recursos JS/CSS locais; XML Android bem formado; sintaxe dos módulos Node e do JavaScript conferida.
- Gradle Wrapper oficial incluído; SHA-256 do JAR comparado com o valor publicado pelo Gradle, e SHA-256 da distribuição fixado nas propriedades do wrapper.

## Limites da verificação

- Os testes de DOM não renderizam a página. A aparência final, os ajustes de tela e o comportamento do teclado precisam ser conferidos no navegador e no aparelho. A tentativa de renderização Chromium não foi concluída neste ambiente.
- O ambiente não possui o SDK Android necessário. A tentativa de inicializar Gradle também encontrou uma restrição de rede. Não foi executado Gradle Sync completo, compilação Kotlin/Android, Android Lint ou emulador. Nenhum APK compilado acompanha o pacote.
- Downloads, botão Voltar, teclado e restauração de WebView precisam de teste no Android Studio e no dispositivo.
- Não foram feitos testes de carga, operação pública, publicação em loja ou integrações externas.

Esta é uma base funcional para desenvolvimento e estudo. O README apresenta execução local, testes manuais, conexão pelo emulador/USB e os módulos que ainda precisam ser implementados.
