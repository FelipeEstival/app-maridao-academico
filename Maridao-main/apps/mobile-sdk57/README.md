# Maridão — aplicativo React Native

Aplicativo Expo Router, TypeScript e React Native. Todos os dados de inicialização estão em `src/data/database.json`; `src/lib/local-database.ts` atende os fluxos dentro do processo do aplicativo. Não há API HTTP, servidor, banco remoto ou `.env`.

## Iniciar

```bash
npm ci
npx expo start
```

Na tela de login, os campos já vêm preenchidos com a conta de demonstração: `demo@maridao.local` / `MaridaoDemo2026`. A conta é carregada do JSON inicial sempre que o app inicia.

## Validar

```bash
npx tsc --noEmit
npm run test:calendar
npm run test:selection
npm run test:local-data
```

O JSON empacotado é somente leitura. Os dados criados durante a execução são mantidos em memória e são descartados quando o aplicativo é reiniciado; a conta de demonstração permanece disponível porque é semeada novamente pelo JSON. Use apenas dados fictícios.
