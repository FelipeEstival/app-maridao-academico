# Maridão — aplicativo React Native

Aplicativo Expo Router, TypeScript e React Native. Todos os dados de inicialização estão em `src/data/database.json`; `src/lib/local-database.ts` atende os fluxos dentro do processo do aplicativo. Não há API HTTP, servidor, banco remoto ou `.env`.

## Iniciar

```bash
npm ci
npx expo start
```

Na tela de login, os campos já vêm preenchidos com a conta de demonstração: `demo@maridao.local` / `MaridaoDemo2026`. A conta é carregada do JSON inicial sempre que o app inicia.

## Configurações da conta

Perfil, senha e encerramento de acesso são processados diretamente pelo adaptador JSON local. O código de confirmação de e-mail é gerado no app e exibido na tela; nenhum e-mail é enviado. O encerramento bloqueia contas com atendimentos aceitos ou em andamento e preserva seus registros locais.

## Validar

```bash
npx tsc --noEmit
npm run test:calendar
npm run test:selection
npm run test:local-data
npm run test:account
```

O JSON empacotado é somente leitura. Os dados criados durante a execução são mantidos em memória e são descartados quando o aplicativo é reiniciado; a conta de demonstração permanece disponível porque é semeada novamente pelo JSON. Use apenas dados fictícios.
