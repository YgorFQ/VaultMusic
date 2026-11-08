# Instalação e problemas comuns

## O instalador pede a versão 1.1.21

Selecione o executável original, e não uma cópia já modificada. Esta versão verifica o SHA-256 exato listado em `compatibility.json`. Ter o mesmo número de versão não garante que dois arquivos sejam iguais. Nenhum arquivo de uma versão desconhecida é modificado.

## Pasta de destino já existe

O instalador recusa sobrescrever uma instalação existente para preservar seus dados. Use o atalho atual. Para outra cópia, desenvolvedores podem usar `runtime/node.exe installer/install.mjs --source "PASTA ORIGINAL" --destination "PASTA NOVA"`. A nova pasta deve ficar fora da original. Atualização e migração automáticas ainda não foram implementadas.

## Abri o ZIP de código e não há runtime

Use o arquivo `VaultMusic-...-Windows-x64.zip` anexado à **Release**. Extraia todo o ZIP. O download automático **Source code (zip)** e **Code → Download ZIP** contêm fontes; quem os usa precisa seguir `COMO-GERAR.md`.

O `Instalar.cmd` usa uma opção de execução do PowerShell somente no processo do instalador. Ele não altera a política global do Windows. Não é necessário instalar Node manualmente para usar a Release completa.

## O aplicativo não aparece

Confira a bandeja do Windows. O botão de fechar do Mei pode deixar o processo aberto. Feche a outra instância do Mei antes de abrir a modificada. O iniciador não fecha outros aplicativos nem inicia o cliente Steam por comando.

Se o Windows apresentar um bloqueio, não altere suas proteções para testar. Esta primeira versão não tem uma assinatura de publicação própria; forneça o texto do erro e o hash do pacote para análise.

## Serviço local e registros

Abra sempre `Abrir-VaultMusic.cmd`. O serviço fica somente em `127.0.0.1`, numa porta reservada na instalação, e exige a chave gerada para essa cópia. Os registros ficam em `youtube/data/inicializacao.log` e `youtube/data/servico.log`.

O serviço pode continuar em segundo plano após fechar a janela. Para desligá-lo sem afetar outros programas, abra o Gerenciador de Tarefas, guia **Detalhes**, habilite a coluna **Linha de comando**, encontre o `node.exe` cuja linha contém o caminho exato desta cópia e termina em `youtube\server.mjs` e encerre somente esse processo. O auxiliar FreeTube usado por esse serviço não é o aplicativo FreeTube do usuário. Não encerre todos os processos Node, WebView ou FreeTube de uma vez. Se não tiver certeza, reiniciar o Windows também encerra o serviço da sessão.

Para testar o serviço sem abrir a janela, um mantenedor pode executar `youtube/node.exe youtube/start.mjs --diagnostico`. Não publique o conteúdo de `connection.json`: ele contém a chave local da instalação.

## Dados e privacidade

`youtube/data` contém o perfil desta cópia: credenciais protegidas pelo Windows, histórico local, metadados de curtidas, cookies/cache do player e dados da interface. A biblioteca original não é importada automaticamente. Não envie a pasta instalada como pacote para outra pessoa.

O repositório e o ZIP da Release contêm o plugin sem login. A instalação só copia arquivos de distribuição conhecidos do Mei original; não copia seus perfis pessoais.

## Steam

O atalho do VaultMusic abre diretamente o executável da cópia. A DLL e o código Steamworks do original permanecem presentes. Ainda precisamos concluir a conferência específica com a Steam totalmente encerrada antes de anunciar isso como requisito dispensado para todos. Não há emulador Steam, alteração de licença ou autenticação adicional de propriedade nesta melhoria: possuir o arquivo original compatível é o requisito técnico de instalação.

## Vídeo indisponível

A reprodução depende do YouTube. A integração de conta não transfere a sessão Google para o player. Vídeos privados, restritos por idade ou indisponíveis podem exigir o site oficial. Problemas do motor e mudanças do serviço podem exigir uma nova versão do plugin.
