# Conectar seu próprio YouTube

Este guia é para quem já instalou o VaultMusic e quer acessar as próprias curtidas, inscrições e playlists. Você cria seu próprio projeto Google e autoriza sua própria conta. O download do plugin começa sem conta vinculada e sem credenciais pessoais.

Os rótulos do Google podem aparecer em português ou inglês e mudar de posição. Quando houver dúvida, confira os links oficiais de cada etapa. Não compartilhe o JSON baixado, a chave da API nem a pasta `youtube/data`.

## 1. Criar o projeto

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) no navegador e entre na conta que pretende usar.
2. No seletor de projetos, na parte superior, escolha **Novo projeto / New project**.
3. Dê um nome como **Meu VaultMusic** e crie o projeto. Aguarde e selecione esse projeto no topo.
4. No campo de busca do Console, procure **YouTube Data API v3**.
5. Abra o resultado da biblioteca de APIs e clique em **Ativar / Enable**. Se aparecer **Gerenciar / Manage**, já está ativada.

Essa é a API usada para consultar vídeos e dados autorizados da conta. Veja a [introdução oficial da YouTube Data API](https://developers.google.com/youtube/data/getting-started).

## 2. Configurar o consentimento do seu projeto

1. No menu ou na busca do Console, abra **Google Auth Platform**. Se aparecer **Começar / Get started**, clique.
2. Em **Branding / Marca**, informe **Meu VaultMusic** como nome e seu próprio e-mail de suporte.
3. Em **Audience / Público-alvo**, escolha **Externo / External** para uma conta Google pessoal.
4. Preencha seu e-mail de contato e conclua a configuração solicitada pelo Google.
5. Volte a **Audience**. Com o aplicativo em **Testing / Teste**, localize **Test users / Usuários de teste**, clique em **Add users / Adicionar usuários**, informe o e-mail exato da conta que vai entrar e salve.
6. Em **Data Access / Acesso a dados**, use **Add or remove scopes / Adicionar ou remover escopos**. Procure e adicione `https://www.googleapis.com/auth/youtube.readonly`.
7. Se quiser usar o botão **Curtir na conta**, adicione também `https://www.googleapis.com/auth/youtube.force-ssl`. Essa permissão é mais ampla e será apresentada no consentimento. Ela é opcional; a leitura funciona sem ela.
8. Salve as alterações.

Referência oficial sobre [Branding, Audience e Data Access](https://developers.google.com/workspace/guides/configure-oauth-consent). Este projeto pessoal não precisa ser publicado como um serviço para outras pessoas para você testar com seu próprio usuário cadastrado.

## 3. Criar o cliente para computador

1. Em **Google Auth Platform → Clients / Clientes**, clique em **Create client / Criar cliente**.
2. Selecione **Desktop app / Aplicativo para computador**. Essa escolha é essencial: não escolha aplicativo da Web, TV ou conta de serviço.
3. Dê um nome como **VaultMusic no meu PC** e confirme a criação.
4. Abra o cliente criado e use a opção de **baixar o JSON**. Salve o arquivo em uma pasta particular do computador.
5. Não precisa abrir nem editar o JSON. O plugin o importa pelo seletor de arquivos.

O cliente de computador usa retorno local pelo navegador. A porta é escolhida na instalação; o aplicativo monta o endereço automaticamente. Não cadastre um cliente da Web para tentar digitar URLs manualmente. Fontes: [criar credenciais de aplicativo para computador](https://developers.google.com/workspace/guides/create-credentials#desktop-app) e [OAuth para desktop](https://developers.google.com/identity/protocols/oauth2/native-app).

## 4. Importar no VaultMusic

1. Abra o atalho **VaultMusic** ou `Abrir-VaultMusic.cmd`. Se outra cópia do Mei estiver aberta, feche-a primeiro, inclusive na bandeja.
2. Na barra lateral, abra **YouTube** e clique em **Configurar**.
3. Em **Credenciais OAuth do Google Cloud**, selecione o JSON da etapa anterior.
4. Pode deixar **Chave da YouTube Data API** em branco para usar a conta autorizada. A chave separada é opcional e é explicada abaixo.
5. Clique em **Salvar configuração**. Deve aparecer a indicação de que o OAuth está configurado.
6. Se adicionou `youtube.force-ssl` e quer registrar curtidas, marque **Permitir curtir vídeos pela minha conta**. Para começar apenas com leitura, deixe desmarcado.
7. Clique em **Entrar com Google**. O navegador padrão abrirá a página oficial de autorização.
8. Escolha a conta cadastrada como usuário de teste, confira o nome do seu projeto e as permissões. Conclua a autorização do seu próprio cliente. Se houver bloqueio, confira a seção de erros abaixo; o plugin não precisa da sua senha dentro do app.
9. Ao concluir, o navegador deve informar **Conta vinculada** numa página local. Volte ao Mei. A tela deve mostrar **Conta vinculada ✓**.
10. Em **Para você** ou **Mixes**, clique em **Sincronizar curtidas** e aguarde os cartões. A primeira seleção pode demorar alguns segundos.

## 5. Usar o player e o automático

Abra um vídeo ou escolha uma faixa de um mix. Abaixo do player, clique em **Automático: desligado** para mudar para **Automático: ligado**. O texto **A seguir** mostra a próxima faixa.

Pode navegar para **Tudo** ou **Curtidas**: o miniplayer mantém a reprodução e oferece **Auto / Auto ✓** para alternar a mesma preferência. A fila adicionada manualmente tem prioridade; depois seguem o mix e os vídeos relacionados. Desligar o automático não apaga a fila que você montou.

## 6. Chave de API opcional

Uma chave permite consultar dados públicos sem vincular uma conta. Ela não oferece curtidas, inscrições ou playlists privadas.

No seu projeto do Google Cloud, vá a **APIs e serviços → Credenciais → Criar credenciais → Chave de API**. Abra a chave criada, aplique a restrição de API para **YouTube Data API v3** e salve. Uma restrição de site/referrer não corresponde a este aplicativo local. Cole a chave somente no campo próprio de **Configurar** do VaultMusic e salve.

Quem já conectou o cliente OAuth pode continuar sem essa chave. As cotas pertencem ao seu projeto; outras pessoas devem criar as próprias credenciais.

## 7. Erros e manutenção

| Sintoma | O que conferir |
| --- | --- |
| `access_denied`, acesso restrito ou conta não permitida | Seu e-mail foi salvo em Audience → Test users do mesmo projeto do JSON? |
| `redirect_uri_mismatch` | O JSON é de **Desktop app**, e não de aplicativo Web? Importe o arquivo correto. |
| API desativada ou `accessNotConfigured` | Ative YouTube Data API v3 no projeto do JSON e aguarde a propagação. |
| Conta sem as curtidas esperadas | Confira qual conta/canal foi escolhido no consentimento e use Sincronizar curtidas. |
| Botão Curtir pede autorização | Adicione o escopo opcional no seu projeto e entre novamente com a opção de curtidas marcada. |
| `quotaExceeded` | A cota do projeto esgotou. Aguarde a renovação ou consulte o painel de cotas; repetir a ação não aumenta a cota. |
| `invalid_grant` ou conta desconectada dias depois | Entre novamente. Uma autorização de projeto em modo Teste para esses escopos pode expirar após sete dias. |
| Página local não abre no retorno do login | Mantenha o app e seu serviço abertos; use o iniciador correto. Veja os logs locais e o guia de problemas. |

O Google explica a expiração em modo Teste e os requisitos de produção em [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en). Não é necessário mudar para produção só para seguir este teste pessoal; isso envolve outras condições do Google.

Para revogar o acesso, use **Configurar → Desvincular e revogar acesso** ou a página [Conexões da conta Google](https://myaccount.google.com/connections). Seus tokens e o JSON importado não precisam ser enviados a quem mantém este repositório. Se for pedir suporte, remova credenciais, e-mails e endereços locais com a chave de acesso de qualquer captura ou log.
