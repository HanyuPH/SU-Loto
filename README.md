# SU Loto – C2

Aplicativo web oficial derivado da carteira **SU Loto – C2**.

## Carteira
- 300 jogos oficiais da Carteira C2;
- status **Pendente**, **Registrada** e **Apostado**;
- filtros por status, sistema, grupo, jogo e dezenas;
- salvamento automático no navegador.

## Concursos e Conferência
- cadastro manual do número, data e 15 dezenas do concurso;
- validação de dezenas entre 01 e 25, sem duplicidade;
- conferência de todos os jogos ou somente dos jogos registrados/apostados;
- contagem automática de 11, 12, 13, 14 e 15 pontos;
- destaque dos melhores jogos;
- desempenho por sistema;
- lista completa de jogos conferidos, com acertos destacados;
- histórico local com edição e exclusão;
- importação de concursos por CSV;
- exportação do histórico e inclusão dos concursos no backup geral.

## Privacidade e funcionamento
- os dados ficam no `localStorage` do navegador;
- nenhuma aposta ou marcação é enviada para servidores externos;
- funcionamento offline por Service Worker;
- instalação na tela inicial do iPhone;
- exportação e importação de backup completo.

## Publicação no GitHub Pages
1. Abra **Settings** do repositório.
2. Entre em **Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch **main** e a pasta **/(root)**.
5. Toque em **Save**.

A planilha oficial continua sendo a fonte dos 300 jogos. O aplicativo é uma interface operacional derivada para consulta, marcações e conferência.
