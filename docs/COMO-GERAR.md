# Gerar a Release do VaultMusic

Requer Windows x64, Node 24, npm e Windows PowerShell 5.1 ou posterior. O usuário final não precisa instalar essas ferramentas: o ZIP final já inclui o necessário.

1. Clone o repositório e execute `npm ci`.
2. Execute `npm test`. Testes que precisam do Mei original ou do pacote completo são ignorados quando os caminhos de teste não foram informados.
3. Execute `npm run audit:public`.
4. Execute `npm run package`. Os downloads são das origens oficiais e têm SHA-256 fixado. Aguarde a compactação.
5. Os artefatos estão em `dist`: `VaultMusic-0.1.0-beta.1-Windows-x64.zip` e seu `.sha256`.

O script não lê configurações da instalação pessoal, não contém token GitHub e não publica nada. Não inclua `dist`, `node_modules`, `payload`, `runtime`, perfis ou instalações geradas nos commits. Para atualizar o nome da versão, altere `package.json` e `compatibility.json` e atualize o lockfile/documentação.

O cache de montagem fica por padrão numa pasta `VaultMusic-build` do temporário do sistema. Defina `VAULTMUSIC_CACHE` para escolher outra pasta. O relatório `dist/local-build.json` contém o caminho local do estágio para testes e não deve ser anexado à Release. O script recusa substituir o ZIP de uma versão que já existe.

## Testar com seu original

Defina `VAULTMUSIC_TEST_ORIGINAL` com a pasta do Mei Music original compatível. Depois de gerar o ZIP, defina `VAULTMUSIC_TEST_PACKAGE` com o campo `stagedPackage` de `dist/local-build.json` e execute `npm test` novamente. Os testes criam uma cópia isolada em diretório temporário, verificam a preservação do original e confirmam que o serviço começa sem conta nem credenciais. Não abrem login nem alteram a Steam.

## Reconstruir o bundle derivado

O componente gerado em `src/youtube/engine` está versionado para tornar a Release repetível. Para regenerá-lo, obtenha os arquivos `dist` do pacote FreeTube 0.26.0-beta cujo `app.asar` tem SHA-256 `9a2179317202ddf6e54884d3581c3c8d063d456ca3cfcb0e03b3aba407b9569e`. O pacote oficial está no [release upstream](https://github.com/FreeTubeApp/FreeTube/releases/tag/v0.26.0-beta).

Extraia `app.asar` com a ferramenta ASAR. Outra opção é compilar as fontes completas incluídas em `upstream`, seguindo os scripts e instruções daquela versão do FreeTube. Depois execute `node scripts/prepare-engine.mjs --dist "PASTA DOS ARQUIVOS DIST"`. O script formata o bundle usando Prettier 3.6.2, remove a montagem da interface Vue e adiciona os exports da adaptação. As identidades minificadas são específicas dessa versão; uma troca de FreeTube exige revisão e testes.

O instalador extrai e altera somente os dois recursos web da cópia do Mei. Ele preserva o código nativo e a realocação ASLR. Nenhum `.exe` modificado do Mei é distribuído pelo repositório ou pelo ZIP.

## Publicar manualmente

Crie um repositório público com estes arquivos, confira o conteúdo que será enviado e publique uma tag para a versão. Na seção Releases, anexe apenas o ZIP completo e o `.sha256`; as fontes já estão no Git e dentro do pacote. Não anexe a pasta de instalação usada no seu PC. Use `docs/CONECTAR-YOUTUBE.md` como tutorial para quem baixar.

Antes de anunciar suporte sem Steam, conclua uma execução com a Steam realmente encerrada. As verificações de instalação não são uma validação de compra ou da licença do usuário: elas apenas exigem os arquivos originais conhecidos.
