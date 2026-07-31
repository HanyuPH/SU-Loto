# SU Loto – C2

Aplicativo web oficial derivado da carteira **SU Loto – C2**.

## Carteira
- 300 jogos oficiais da Carteira C2;
- status **Pendente**, **Registrada** e **Apostado**;
- filtros por status, sistema, grupo, jogo e dezenas;
- salvamento automático no navegador.

## Concursos e Conferência
- cadastro manual do número, data e 15 dezenas;
- conferência de todos os 300 jogos ou somente dos jogos registrados/apostados;
- contagem automática de 11, 12, 13, 14 e 15 pontos;
- destaque dos melhores jogos e desempenho por sistema;
- histórico local, edição, exclusão, CSV e backup completo.

## Resultado oficial automático
O workflow `.github/workflows/update-lotofacil-result.yml` consulta a API oficial da CAIXA e atualiza:

- `data/ultimo-concurso.json` — resultado oficial mais recente;
- `data/concursos-oficiais.json` — histórico automático coletado pelo projeto.

O aplicativo verifica o arquivo mais recente ao abrir. Quando encontra um concurso ainda não registrado, mostra as dezenas oficiais e oferece **Registrar e conferir** sem preenchimento manual.

A rotina automática:
- executa a cada 30 minutos no período noturno;
- valida o tipo de jogo, concurso, data e as 15 dezenas entre 01 e 25;
- grava uma nova versão somente quando o resultado muda;
- pode ser executada manualmente em **Actions → Atualizar resultado oficial da Lotofácil → Run workflow**;
- aceita, na execução manual, um número de concurso específico para adicioná-lo ao histórico.

Fonte consultada:
`https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil`

## Privacidade e funcionamento
- marcações e concursos registrados ficam no `localStorage` do navegador;
- nenhuma aposta ou dado pessoal é enviado para servidores externos;
- funcionamento offline por Service Worker;
- instalação na tela inicial do iPhone;
- exportação e importação de backup completo.

## Publicação
O GitHub Pages utiliza a branch `main` e a pasta `/(root)`.

A planilha oficial continua sendo a fonte dos 300 jogos. O aplicativo é uma interface operacional derivada para consulta, marcações e conferência.
