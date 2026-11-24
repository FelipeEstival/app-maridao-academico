# Maridão — aplicativo local

Aplicativo React Native com Expo Router para conectar clientes e prestadores de serviços em Palmas–TO. O projeto foi simplificado para executar sem API, servidor, PostgreSQL, credenciais ou configuração de rede.

## Fonte de dados

O arquivo `apps/mobile-sdk57/src/data/database.json` é o único JSON inicial do aplicativo. Ele contém os metadados, o catálogo de serviços e especialidades, as 380 localidades, as regiões de atendimento e as coleções vazias para contas, solicitações, propostas, avaliações, mensagens e protocolos.

A camada `apps/mobile-sdk57/src/lib/local-database.ts` lê esse JSON ao iniciar o aplicativo e executa as operações localmente, sem `fetch` e sem tráfego para um servidor. Para manter o pacote do aplicativo imutável, as alterações realizadas durante o uso são mantidas em memória; ao fechar completamente ou reiniciar o aplicativo, cadastros e demais alterações são descartados e o estado inicial do JSON é carregado novamente. Esta versão serve para desenvolvimento e demonstração, não para armazenar dados reais ou sensíveis.

## Executar

Requisitos: Node.js compatível com o Expo do projeto e npm.

```bash
cd apps/mobile-sdk57
npm ci
npx expo start
```

Use Expo Go ou um emulador compatível com as dependências instaladas. Para iniciar diretamente na plataforma disponível:

```bash
npm run android
npm run ios
npm run web
```

Não é necessário criar arquivo `.env`, iniciar serviço ou instalar/configurar um banco de dados.

## Verificações

```bash
cd apps/mobile-sdk57
npx tsc --noEmit
npm run test:calendar
npm run test:selection
npm run test:local-data
```

## Limites do modo JSON local

As contas são criadas somente na memória da execução atual. Para entrar, cadastre primeiro um cliente ou prestador; não há usuários de demonstração incluídos no JSON. A recuperação de senha não envia e-mail: o código local é exibido na própria tela. Não use documentos, senhas ou informações pessoais reais, pois este modo não oferece persistência ou proteção de um serviço de produção.
