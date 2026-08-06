# Registro de Arquivos Oficiais e Históricos — SU Loto

**Data de consolidação:** 06/08/2026  
**Constituição aplicável:** Constituição Oficial da SU Loto v1.0  
**Carteira vigente:** SU Loto - C2

Este documento classifica os arquivos analisados na consolidação do Ecossistema SU. A classificação define força normativa e uso permitido; não altera retroativamente o conteúdo dos arquivos históricos.

## 1. Arquivo oficial vigente

### SU Loto - C2.xlsx

- classificação: **fonte oficial vigente da carteira**;
- SHA-256 físico do arquivo analisado: `4e74e633bc8782aa9c3849f889d256baf698bb42f4cbb2b91b6519d532628764`;
- quantidade: 300 jogos;
- IDs canônicos: 001-300;
- jogos 001-100: Base preservada;
- jogos 101-300: Sistema Universal;
- integridade verificada: 15 dezenas distintas por jogo, universo 01-25, IDs completos e ausência de jogos duplicados;
- erros de fórmula identificados: nenhum.

### Interpretação da expressão v2.2

A expressão `v2.2`, presente internamente na planilha, identifica exclusivamente a **versão interna da composição e do plano da carteira**.

Ela não representa:

- a versão do aplicativo, que permanece **v11**;
- a versão da Constituição, que permanece **v1.0**;
- uma nova carteira diferente da C2.

A identificação oficial completa é:

> Carteira SU Loto - C2, versão interna da planilha v2.2, aplicativo estável v11 e Constituição Oficial v1.0.

## 2. Arquivo histórico incompleto

### lotofacil-download-resultados(1).csv

- classificação: **snapshot histórico incompleto e não operacional**;
- SHA-256: `c40dc6222df602c2b726a9eaa4625d31dfe8d09acee72368d185e0d20db4c4cb`;
- intervalo nominal: concursos 1-3721;
- último concurso presente: 3721, de 27/06/2026;
- quantidade de registros: 3.720;
- lacuna identificada: concurso 3046 ausente;
- duplicidades de concurso: nenhuma;
- registros com quantidade ou faixa inválida de dezenas: nenhum.

Este CSV não poderá ser utilizado como fonte operacional vigente, base integral de conferência ou substituto dos arquivos oficiais atualizados pelo workflow do repositório.

## 3. Documento histórico substituído

### 🟣 LF 4 — Painel Mestre do Projeto Lotofácil.txt

- classificação: **registro histórico substituído**;
- SHA-256: `faf144a5c73e7d614c101d86c569e0fa845b9fce402aafd558b2e9a0875202a3`;
- conteúdo preservado apenas para rastreabilidade;
- limitações: anterior à consolidação constitucional, à documentação completa do Firebase Authentication, do Cloud Firestore e da sincronização privada local-first.

Este arquivo não possui força normativa e não deverá ser utilizado para reconstruir o estado atual do projeto.

## 4. Fontes operacionais vigentes

A reconstrução e a operação atual da SU Loto deverão utilizar:

1. Constituição Oficial da SU Loto v1.0;
2. Constituição Oficial do Ecossistema SU vigente;
3. planilha `SU Loto - C2.xlsx`;
4. arquivo `VERSION`;
5. branch `main` para produção;
6. branch `beta` para desenvolvimento e validação;
7. dados oficiais mantidos pelo workflow do repositório;
8. código, testes e documentação vigente do repositório.

## 5. Regra de prevalência

Em caso de divergência, prevalecem a Constituição vigente, a planilha C2 homologada, o arquivo `VERSION` e a documentação atual do repositório. Os arquivos históricos classificados neste registro não poderão substituir essas fontes.

## 6. Estado final

- arquivos oficiais vigentes analisados: 1;
- arquivos históricos incompletos: 1;
- documentos históricos substituídos: 1;
- pendências de classificação: nenhuma;
- alteração na Carteira C2: nenhuma.
