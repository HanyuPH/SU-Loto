# SU Loto - C2

Aplicativo web oficial derivado da carteira **SU Loto - C2**.

## Versões documentadas

- versão estável do aplicativo: **v11**;
- branch estável: `main`;
- beta mais recente documentada: **v22** (`5e0310d59d57c3e20a8eac1a6fe1d0c26257845d`);
- branch Beta ativa: `beta`;
- arquivo de registro: `VERSION`.

A expressão **v2.2** existente na planilha identifica somente a versão interna da composição e do plano da carteira. Ela não substitui a versão do aplicativo v11, a Constituição v1.0 nem a identificação da carteira C2.

## Carteira

- 300 jogos oficiais da Carteira C2;
- versão interna da planilha: **v2.2**;
- SHA-256 físico da planilha analisada: `4e74e633bc8782aa9c3849f889d256baf698bb42f4cbb2b91b6519d532628764`;
- IDs oficiais canônicos: **001-300**;
- jogos 001-100: **Base preservada**;
- jogos 101-300: **Sistema Universal**;
- hash lógico da carteira: `f0b2f643ed525d0db2591e9dfbc53758fdc980bb891fdeb61740f077633c758a`;
- status **Pendente**, **Registrada** e **Apostado**;
- filtros por status, sistema, grupo, jogo e dezenas;
- salvamento automático no navegador.

A planilha oficial continua sendo a fonte dos 300 jogos. O aplicativo é uma interface operacional derivada para consulta, marcações e conferência.

A classificação dos arquivos oficiais, históricos e substituídos está registrada em `docs/REGISTRO-ARQUIVOS-OFICIAIS.md`.

## Níveis oficiais de orçamento

Os níveis são prefixos aninhados da ordem canônica e estão registrados em `data/niveis-oficiais.json`:

- Essencial: IDs 001-050;
- Recomendado: IDs 001-100;
- Intermediário: IDs 001-150;
- Ampliado: IDs 001-200;
- Completo: IDs 001-300.

Um nível maior contém integralmente todos os jogos dos níveis menores.

## Concursos e Conferência

- cadastro manual do número, data e 15 dezenas;
- conferência de todos os 300 jogos ou somente dos jogos registrados/apostados;
- contagem automática de 11, 12, 13, 14 e 15 pontos;
- destaque dos melhores jogos e desempenho por sistema;
- histórico local, edição, exclusão, CSV e backup completo.

## Resultado oficial automático

O workflow `.github/workflows/update-lotofacil-result.yml` consulta a API oficial da CAIXA e atualiza, na mesma execução:

- `data/ultimo-concurso.json` - resultado oficial mais recente;
- `data/concursos-oficiais.json` - histórico operacional coletado pelo projeto;
- `data/concursos-oficiais.csv` - exportação CSV sincronizada com o JSON.

O CSV local antigo, encerrado no concurso 3721 e sem o concurso 3046, permanece apenas como arquivo histórico incompleto e não é fonte operacional vigente.

O aplicativo verifica o arquivo mais recente ao abrir. Quando encontra um concurso ainda não registrado, mostra as dezenas oficiais e oferece **Registrar e conferir** sem preenchimento manual.

A rotina automática:

- executa a cada 30 minutos no período noturno;
- valida o tipo de jogo, concurso, data e as 15 dezenas entre 01 e 25;
- grava uma nova versão somente quando o resultado muda;
- gera JSON e CSV a partir da mesma coleção de resultados;
- pode ser executada manualmente em **Actions -> Atualizar resultado oficial da Lotofácil -> Run workflow**;
- aceita, na execução manual, um número de concurso específico para adicioná-lo ao histórico.

Fonte consultada:
`https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil`

## Conta, privacidade e sincronização

O aplicativo adota funcionamento **local-first**:

- marcações e concursos são mantidos no `localStorage` para uso imediato e funcionamento offline;
- o backup manual completo permanece disponível e não é substituído pela nuvem;
- sem autenticação, os dados operacionais permanecem apenas no navegador utilizado.

Quando o usuário entra com a mesma conta utilizada no Ecossistema SU:

- a autenticação é processada pelo Firebase Authentication;
- status dos jogos e concursos são sincronizados com o Cloud Firestore;
- os dados são gravados na árvore privada `users/{uid}/suLoto/C2`;
- o aplicativo registra identificadores e nomes de dispositivos para apoiar a sincronização;
- listeners em tempo real atualizam os dispositivos conectados à mesma conta;
- alterações feitas offline permanecem localmente até a reconexão.

As regras do Firestore autorizam leitura e gravação somente ao usuário autenticado cujo `uid` corresponda ao caminho acessado. O aplicativo não envia a carteira oficial nem apostas para serviços publicitários. Credenciais não são armazenadas pelo código do aplicativo.

## PWA e funcionamento offline

- funcionamento offline por Service Worker;
- instalação na tela inicial do iPhone;
- interface responsiva;
- cache local dos arquivos essenciais;
- exportação e importação de backup completo.

## Governança documental

- Constituição Oficial da SU Loto: v1.0, homologada em 06/08/2026;
- protocolo de validação: `docs/PVO-SUL-001.md`;
- estado constitucional: `docs/STATUS-CONSTITUCIONAL.md`;
- registro dos arquivos analisados: `docs/REGISTRO-ARQUIVOS-OFICIAIS.md`;
- o Notion não integra a fonte oficial nem é necessário para reconstrução;
- estudos Analytics, Coverage, Monte Carlo, validação real e auditoria são anexos técnicos de evidência, sem força normativa isolada;
- candidatas C3, Projeto Fênix, módulos +50/+100/+200 e versões históricas permanecem experimentais ou substituídas.

## Publicação

O GitHub Pages utiliza a branch `main` e a pasta `/(root)`.
