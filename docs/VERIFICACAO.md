# Verificação desta preparação

Versão do plugin: **0.1.0-beta.1**, para o executável conhecido do Mei Music **1.1.21 / 1.1.21.0 Windows x64**.

Foram executados os cinco testes do repositório, incluindo os testes opcionais com o original e o pacote completo, sem falhas ou testes ignorados nessa execução.

Foi criada uma instalação em pasta temporária com espaços no nome. O hash do original foi conferido antes e depois. Os dois recursos da interface foram alterados na cópia e o trecho de instruções nativas permaneceu byte a byte igual. Arquivos desconhecidos são recusados, assim como um destino dentro da pasta original ou um destino já existente.

O serviço da cópia instalada foi iniciado com dados novos: `configured=false`, `linked=false`, sem permissão de escrita, histórico vazio, gostos vazios e zero curtidas importadas. Nenhum arquivo de conta/credencial existia nessa cópia. Requisições sem a chave da instalação e com origem externa foram recusadas; os módulos web do player e das recomendações foram servidos corretamente.

O motor FreeTube foi regenerado com `scripts/prepare-engine.mjs` e reproduziu o mesmo SHA-256 do componente testado anteriormente: `aceb989e8ad707b65c0726fc41e8513314375a8066ec681e6b20860dcd24acc7`.

Os recursos de vídeo, troca automática em Curtidas, barra integrada e Discord já haviam sido verificados na cópia de desenvolvimento. Essa evidência anterior não substitui uma conferência completa da primeira Release em outro computador. Não foi realizado um novo login Google para validar a instalação limpa, pois ela deve ser entregue sem conta.

A auditoria do repositório e do estágio da Release procura perfis, caminhos privados, formatos de credencial e binários do Mei. O ZIP é montado por lista de arquivos e contém o instalador e os runtimes de Node/FreeTube, sem `Mei Music.exe`, `steam_api64.dll` ou as ferramentas originais do Mei. Os downloads oficiais são conferidos por hashes fixos.

Pendente antes de anunciar compatibilidade universal: conferir a abertura com o cliente Steam totalmente encerrado e realizar o fluxo gráfico completo em outro computador Windows x64. O iniciador já abre diretamente a cópia do Mei e não contém comando para iniciar a Steam. O repositório foi preparado localmente; nenhuma publicação no GitHub foi feita nesta etapa.
