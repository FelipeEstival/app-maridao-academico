# Arquitetura local

O aplicativo Expo/React Native usa `apps/mobile-sdk57/src/data/database.json` como fonte inicial única. O JSON reúne metadados, catálogos, coleções de dados e a conta cliente de demonstração `demo@maridao.local` / `MaridaoDemo2026`. A camada `apps/mobile-sdk57/src/lib/local-database.ts` executa cadastro, autenticação de demonstração, solicitações, propostas, progresso de atendimento, mensagens e avaliações diretamente no processo do app; ela não abre conexões de rede.

O arquivo JSON incluído no bundle é somente leitura. Para manter o projeto sem dependências nativas de persistência, as alterações são feitas em uma cópia em memória e se perdem ao reiniciar o app; a conta demo volta a ser carregada do JSON. O fluxo serve para protótipos e demonstrações com dados fictícios, não para contas ou informações pessoais reais.

Para iniciar, acesse `apps/mobile-sdk57`, execute `npm ci` e depois `npx expo start`. Não é necessário `.env`, API, servidor ou banco remoto.
