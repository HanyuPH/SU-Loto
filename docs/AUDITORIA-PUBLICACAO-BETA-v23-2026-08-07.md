# Auditoria de publicação — SU Loto Beta v23

Data: 07/08/2026

Finalidade: registrar e disparar republicação controlada do ambiente Beta após divergência entre a branch `beta` validada e o conteúdo observado no GitHub Pages em `/beta/`.

Escopo:
- branch afetada: `beta`;
- produção `main`: não alterada;
- Carteira Oficial SU Loto - C2: não alterada;
- jogos, IDs, níveis e fonte canônica: não alterados.

Estado verificado antes da republicação:
- branch `beta`: commit `728b262539f1b28d7d3c4a2240d3d978655bc148`;
- `VERSION`: Beta documentada v23;
- `beta-banner.js`: `BUILD = "v23"`;
- `bootstrap.js`: importa `beta-banner.js?v=23` e registra `./service-worker.js`;
- `service-worker.js`: cache `su-loto-c2-v23-sync-v2`, com limpeza de caches antigos `su-loto-c2-beta-*` e outros caches SU Loto anteriores;
- workflow `pages-main-beta.yml` da branch `beta`: monta `main` em `/` e `beta` em `/beta/` e valida a arquitetura v23.

Este commit não altera funcionalidade. Sua finalidade operacional é gerar um evento de `push` na branch `beta` para forçar uma nova montagem e publicação do GitHub Pages a partir do estado v23 já validado.
