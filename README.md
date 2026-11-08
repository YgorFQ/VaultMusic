# VaultMusic

Melhoria local para **Mei Music 1.1.21 / 1.1.21.0, Windows x64**, com YouTube integrado, player direto, sugestões pelas curtidas, mixes, reprodução automática, miniplayer e integração com a barra e o Discord do Mei.

Você precisa ter o **Mei Music original**. O download do VaultMusic não contém seu executável, a biblioteca Steamworks nem as ferramentas do Mei. O instalador confere o arquivo original e prepara uma cópia separada. Projeto não oficial; nome e identidade visual estão em preparação.

## Instalar em três passos

1. Baixe `VaultMusic-0.1.0-beta.1-Windows-x64.zip` na seção **Releases** deste repositório e extraia tudo para uma pasta. O botão verde **Code → Download ZIP** baixa as fontes e não inclui os runtimes da instalação.
2. Abra **Instalar.cmd** e selecione o `Mei Music.exe` da sua instalação original 1.1.21. Não selecione uma cópia já modificada.
3. Abra pelo atalho **VaultMusic** criado na área de trabalho. Para usar o YouTube com sua conta, siga o [tutorial completo](docs/CONECTAR-YOUTUBE.md).

A cópia será criada em `%LOCALAPPDATA%\VaultMusic\App`. Também pode abrir `Abrir-VaultMusic.cmd` nessa pasta. Não requer Node ou FreeTube instalados separadamente. O pacote inclui os runtimes necessários.

O iniciador chama o executável diretamente e não manda abrir a Steam. Os componentes Steamworks originais são preservados: esta melhoria não altera código nativo nem verificações de licença do Mei. O funcionamento com a Steam totalmente encerrada deve ser conferido na versão original utilizada; essa condição ainda não foi validada na bateria pública deste pacote.

## Compatibilidade inicial

| Mei Music original | VaultMusic | Plataforma | Verificação |
| --- | --- | --- | --- |
| 1.1.21 / 1.1.21.0 | 0.1.0-beta.1 | Windows x64 | SHA-256 do executável conhecido |

O instalador rejeita outros arquivos, inclusive variantes com o mesmo número de versão e conteúdo diferente. O hash aceito está em [compatibility.json](compatibility.json). Atualizações, outras versões e instruções de downgrade serão tratadas posteriormente. Não atualize a cópia modificada por cima usando arquivos de outra versão.

## O que funciona

- Busca de vídeos com carregamento progressivo; player direto adaptado do FreeTube.
- Curtidas, inscrições e playlists da conta mediante autorização pessoal do Google.
- Sugestões a partir de até 500 vídeos curtidos e escutas locais; explicação em cada cartão.
- Mixes como rádios do YouTube iniciadas pelas músicas do perfil, com disponibilidade conferida.
- Automático com prioridade para a fila, depois o mix e depois relacionados; controle também no miniplayer.
- Reprodução ao trocar para Tudo ou Curtidas, barra inferior integrada e atividade no Discord pelo recurso existente do Mei.

Os mixes e o feed diferem da página inicial privada da conta no YouTube. O histórico de escuta utilizado é local, não sincronizado entre computadores. Login Google da integração e sessão do player são separados. Vídeos ou rádios podem falhar quando o YouTube mudar suas respostas ou limitar a disponibilidade.

## Dados e remoção

Cada instalação gera uma chave local aleatória e começa sem conta, tokens, chaves pessoais, histórico ou gostos. As credenciais informadas pelo usuário são protegidas com DPAPI do Windows, e os dados ficam em `youtube/data` dentro da cópia instalada. Não compartilhe a pasta instalada depois de fazer login.

Para remover, desvincule a conta em **Configurar** se desejar revogar o acesso, feche a cópia inclusive na bandeja, encerre o serviço desta cópia com o procedimento em [solução de problemas](docs/SOLUCAO-DE-PROBLEMAS.md) e apague a pasta criada e o atalho. O Mei original permanece na pasta de origem.

## Código e publicação

Fontes próprias e adaptadas sob **AGPL-3.0-or-later**; [licença](LICENSE) e [créditos](THIRD-PARTY.md). O Mei Music original continua sujeito aos termos do seu autor. Exigir o arquivo original não constitui, por si só, autorização para redistribuir materiais dele.

Para gerar a Release com downloads oficiais fixados por hash, veja [COMO-GERAR.md](docs/COMO-GERAR.md). O pacote público inclui as fontes correspondentes do componente e da adaptação. Não envie a pasta instalada, contas, caches ou backups para o GitHub.
