export function playerErrorMessage(code){
 const messages={
  2:'O player recebeu um identificador de vídeo inválido.',
  5:'O player encontrou uma falha técnica de reprodução. Tente novamente; se continuar, abra no YouTube.',
  100:'O vídeo não está disponível para o player: pode ter sido removido ou definido como privado.',
  101:'Este vídeo existe, mas sua reprodução em players de outros aplicativos foi bloqueada pelo YouTube ou pelos responsáveis pelo conteúdo. Use “Abrir no YouTube”.',
  150:'Este vídeo existe, mas sua reprodução em players de outros aplicativos foi bloqueada pelo YouTube ou pelos responsáveis pelo conteúdo. Use “Abrir no YouTube”.',
  153:'O YouTube recusou a identificação do aplicativo. É uma falha de integração, não uma indicação de que o vídeo foi excluído.'
 };
 return (messages[code]||'O YouTube não conseguiu reproduzir este vídeo aqui. Tente novamente ou abra no YouTube.')+(Number.isInteger(code)?` (Código ${code})`:'');
}
