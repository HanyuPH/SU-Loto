# PVO-SUL-001 - Protocolo de Validação Oficial da SU Loto

**Versão:** 1.0  
**Data:** 05/08/2026  
**Situação:** Oficial

## 1. Finalidade

Definir o procedimento obrigatório para criar, testar, validar, promover ou substituir uma carteira da SU Loto sem alterar a fonte oficial por hipótese, memória ou implementação isolada.

## 2. Fluxo obrigatório

Pesquisa -> Desenvolvimento -> Testes -> Validação -> Consolidação -> Avaliação constitucional -> Homologação -> Implementação oficial.

Nenhuma candidata será considerada oficial antes de completar todas as etapas.

## 3. Requisitos mínimos de integridade

1. Quantidade de jogos declarada e conferida.
2. Exatamente 15 dezenas por jogo, todas entre 01 e 25.
3. Ausência de dezenas repetidas dentro do mesmo jogo.
4. Ausência de jogos duplicados na carteira.
5. Identificador canônico único e estável.
6. Hash lógico calculado sobre ID e dezenas.
7. Comparação integral entre planilha oficial e implementações derivadas.

## 4. Validações técnicas

As análises poderão incluir histórico completo disponível, separação treino/validação, janelas móveis, auditoria de pares, trios e subconjuntos, controle de redundância, análise de sobreposição e simulação Monte Carlo.

Essas análises são evidências técnicas. Não se transformam automaticamente em filtros permanentes.

## 5. Critério de promoção

Antes do teste deverá existir um relatório que declare:

- carteira de referência;
- candidata avaliada;
- métricas utilizadas;
- período de treino e período reservado, quando aplicável;
- critérios de aprovação e rejeição;
- regras de integridade;
- resultado esperado para promoção.

A candidata somente poderá ser promovida quando superar ou atender a carteira vigente segundo os critérios definidos antes do teste e quando não introduzir perda estrutural incompatível com o objetivo do estudo.

## 6. Proteção contra sobreajuste

Frequência, atraso, repetição do concurso anterior, pares/ímpares, soma, linhas, colunas, moldura/miolo, primos, Fibonacci e sequências poderão ser usados como métricas de auditoria ou pesquisa. Não serão tratados como previsão do próximo sorteio nem como filtros obrigatórios sem homologação específica.

## 7. Classificação dos resultados

- **Oficial:** homologado e incorporado à Constituição.
- **Evidência técnica permanente:** estudo reproduzível preservado como anexo, sem força normativa isolada.
- **Experimental:** candidata, simulação ou protótipo não promovido.
- **Substituído:** versão histórica que não representa o estado vigente.
- **Pendente:** depende de decisão, validação ou documento adicional.

## 8. Homologação de uma nova carteira

A promoção exige, no mínimo:

1. relatório técnico permanente;
2. auditoria de integridade;
3. comparação com a carteira vigente;
4. decisão constitucional expressa;
5. novo manifesto de arquivos e hashes;
6. atualização da planilha oficial;
7. sincronização e auditoria do aplicativo;
8. atualização do Painel Mestre e do histórico de alterações.

## 9. Regra de segurança

Resultados históricos, cobertura e simulações não garantem premiação e não preveem o próximo concurso.
