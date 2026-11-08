# Licenças e créditos

O código próprio e as adaptações deste repositório são disponibilizados sob **GNU AGPL v3 ou posterior**, conforme `LICENSE`. Essa declaração não relicencia o Mei Music original nem concede direitos sobre marcas ou outros arquivos do aplicativo original.

| Componente | Versão | Licença / origem |
| --- | --- | --- |
| FreeTube, motor derivado e auxiliares adaptados | 0.26.0-beta | AGPL-3.0-or-later, FreeTube Team e colaboradores; [projeto](https://github.com/FreeTubeApp/FreeTube/tree/v0.26.0-beta) |
| YouTube.js / youtubei.js, incluído no bundle | 18.3.0 | MIT; fontes no arquivo upstream e avisos do bundle |
| Shaka Player, incluído no bundle | 5.3.3 | Apache-2.0; fontes/avisos conforme a distribuição upstream |
| Electron e Chromium do runtime FreeTube | Pacote Windows x64 da versão acima | `LICENSE.electron.txt` e `LICENSES.chromium.html` preservados no pacote |
| Node.js | 24.22.1 Windows x64 | Licença MIT e avisos de terceiros, arquivo completo `LICENSE-node.txt` incluído no runtime |
| Prettier | 3.6.2 | MIT; arquivo de licença preservado em `node_modules/prettier` no instalador |
| Mei Music | 1.1.21 / 1.1.21.0 | Arquivos fornecidos pelo próprio usuário e sujeitos aos termos do autor; não incluídos na Release |

As alterações do FreeTube desativam a montagem da interface original, expõem os auxiliares de vídeo/rádio, adaptam transporte e execução do player e acrescentam integração local, perfil de gostos e automático. Créditos e fontes podem ser consultados em **Sobre o player** no aplicativo.

As fontes upstream completas da versão adaptada estão em `upstream/FreeTube-v0.26.0-beta-source.tar.gz`. A Release também inclui `src/youtube/engine/source.zip`, com as fontes desta adaptação e esse arquivo upstream. O instalador copia esse ZIP para o player instalado. Instruções em `docs/COMO-GERAR.md`.

Os bundles derivados contêm constantes públicas do cliente YouTube usadas pelo FreeTube original. Elas não são chaves pessoais do projeto Google de quem preparou o pacote. A revisão distingue os dois bundles conhecidos por SHA-256 e rejeita formatos de credencial inesperados em outros arquivos.

Inclua esta documentação e as licenças ao redistribuir a melhoria. A obrigação de fornecer o código correspondente é atendida pelo pacote de fontes e pelo repositório; confirme a correspondência da versão antes de publicar uma nova Release. A disponibilidade técnica do original para um usuário não constitui análise dos termos de modificação do Mei.
