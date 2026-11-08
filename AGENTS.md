# VaultMusic

- Este repositório contém somente o plugin, patcher, fontes derivadas, documentação e montagem da Release. Não adicionar executáveis ou recursos completos do Mei Music.
- O usuário autorizou preparar este repositório. Não publicar no GitHub nem criar commits sem pedido explícito.
- Os arquivos do Mei Music devem vir da instalação original do usuário e passar pelo SHA-256 de compatibility.json. Nunca modificar o original; criar destino novo, rejeitar sobrescrita e vínculos inesperados.
- Manter o código nativo do Mei intacto. O iniciador chama diretamente o executável, sem comandos para abrir Steam. Não alegar teste com Steam encerrada sem realizá-lo.
- Cada instalação deve começar sem conta, tokens, chaves Google, histórico e cache. Gerar conexão local aleatória durante a instalação. Não imprimir connection.json nem tokens.
- Fontes em src/youtube e src/native. O componente FreeTube é AGPL; conservar licença, créditos, upstream e arquivo correspondente de fontes na Release.
- Rodar npm test e npm run audit:public antes de empacotar. Testes reais de original e pacote usam variáveis de ambiente documentadas em docs/COMO-GERAR.md. Não tocar no perfil pessoal para testes.
- dist, node_modules, payload, runtime, caches e dados de instalações não são conteúdo Git. dist/local-build.json contém caminhos de mantenedor, não anexar à Release.
- Respeitar o ambiente de trabalho do mantenedor. Caches de montagem e testes devem usar o diretório indicado por VAULTMUSIC_CACHE ou pelo temporário do processo; nunca gravar caminhos pessoais no código ou na documentação pública.
